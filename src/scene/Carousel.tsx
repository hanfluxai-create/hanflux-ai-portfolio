import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGesture } from '@use-gesture/react'
import * as THREE from 'three'
import { CONFIG } from '../config/config'
import { CAPABILITIES } from '../config/content'
import { useStore } from '../store/store'
import { makeCardTexture } from '../lib/cardTexture'
import {
  DISSOLVE_VERT,
  DISSOLVE_FRAG,
  buildDissolveGeometry,
  dissolvePointSize,
} from '../shaders/dissolve'

const COLS = 120
const ROWS = 76
const DISSOLVE_SPAN = 0.82 // index-units from center over which a card dissolves
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const damp = (cur: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-lambda * dt))

/**
 * 3D capability carousel. Cards lie along a shallow arc driven by a single
 * damped scroll scalar (drag + wheel + inertia + snap). Each card is a
 * particle-dissolve plane whose uProgress is its distance from center, so
 * cards disperse into particles as they leave center and reform as they
 * arrive — the signature transition. Click a card to focus/expand it.
 */
export function Carousel() {
  const C = CONFIG.carousel
  const { gl, viewport } = useThree()
  const last = CAPABILITIES.length - 1

  const groups = useRef<(THREE.Group | null)[]>([])
  const mats = useRef<(THREE.ShaderMaterial | null)[]>([])
  const hovered = useRef<number | null>(null)

  const scroll = useRef(0)
  const target = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)

  const setSelected = useStore((s) => s.setSelected)
  const setSection = useStore((s) => s.setSection)
  const setActiveIndex = useStore((s) => s.setActiveIndex)

  // one shared point-grid geometry across cards (read-only attributes)
  const geometry = useMemo(
    () => buildDissolveGeometry(COLS, ROWS, C.planeW, C.planeH),
    [C.planeW, C.planeH],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  // regenerate textures once web fonts are ready so card type renders crisply
  const [texVersion, setTexVersion] = useState(0)
  useEffect(() => {
    let alive = true
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => {
      if (alive) setTexVersion((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [])

  const textures = useMemo(
    () => CAPABILITIES.map((c, i) => makeCardTexture(c, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texVersion],
  )
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures])

  const dpr = Math.min(viewport.dpr ?? 1, 2)
  const uniformsArr = useMemo(
    () =>
      textures.map((tex) => ({
        uTexture: { value: tex },
        uProgress: { value: 1 },
        uSize: { value: dissolvePointSize(C.planeW, C.planeH, COLS, ROWS) },
        uPointScale: { value: 300.0 },
        uPixelRatio: { value: dpr },
        uAdditive: { value: 0.3 },
      })),
    [textures, C.planeW, C.planeH, dpr],
  )

  // ---- drag + wheel on the canvas DOM element (NOT on meshes) ----
  useGesture(
    {
      onDragStart: () => {
        dragging.current = true
        velocity.current = 0
      },
      onDrag: ({ delta: [dx], down }) => {
        target.current = clamp(target.current - dx * C.dragSpeed, 0, last)
        velocity.current = -dx * C.dragSpeed
        dragging.current = down
      },
      onDragEnd: ({ velocity: [vx], direction: [dirx] }) => {
        dragging.current = false
        target.current = clamp(target.current - dirx * vx * 0.9, 0, last)
      },
      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault?.()
        dragging.current = false
        target.current = clamp(target.current + dy * C.wheelSpeed, 0, last)
      },
    },
    {
      target: gl.domElement,
      drag: { filterTaps: true, pointer: { touch: true } },
      wheel: { eventOptions: { passive: false } },
      eventOptions: { passive: false },
    },
  )

  const onOver = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hovered.current = i
    gl.domElement.style.cursor = 'pointer'
  }
  const onOut = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (hovered.current === i) hovered.current = null
    gl.domElement.style.cursor = ''
  }
  const onClick = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const sel = useStore.getState().selected
    if (sel === i) {
      setSelected(null)
      return
    }
    setSelected(i)
    setSection('work')
    target.current = i // recenter
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const selected = useStore.getState().selected

    // inertia + snap when not dragging and nothing focused
    if (!dragging.current) {
      if (Math.abs(velocity.current) > 0.0005 && selected === null) {
        target.current = clamp(target.current + velocity.current, 0, last)
        velocity.current *= 0.92
      } else {
        velocity.current = 0
        target.current = Math.round(target.current)
      }
    }
    scroll.current = damp(scroll.current, target.current, C.damp, dt)

    const idx = clamp(Math.round(scroll.current), 0, last)
    if (idx !== useStore.getState().activeIndex) setActiveIndex(idx)

    for (let i = 0; i <= last; i++) {
      const g = groups.current[i]
      const mat = mats.current[i]
      if (!g) continue
      const o = i - scroll.current
      const isFocused = selected === i
      const isHover = hovered.current === i && selected === null

      const tx = isFocused ? 0 : o * C.gap
      const tz = isFocused ? C.focusZ : -Math.abs(o) * C.arc * C.gap
      const yaw = isFocused ? 0 : -o * C.yawPerStep
      const baseScale = isFocused ? 1.18 : isHover ? C.hoverScale : 1

      g.position.x = damp(g.position.x, tx, C.damp, dt)
      g.position.y = damp(g.position.y, 0, C.damp, dt)
      g.position.z = damp(g.position.z, tz, C.damp, dt)
      g.rotation.y = damp(g.rotation.y, yaw, C.damp, dt)
      const s = damp(g.scale.x, baseScale, C.damp, dt)
      g.scale.setScalar(s)

      // cull far cards from the draw (still cheap to keep them mounted)
      g.visible = isFocused || Math.abs(o) < 2.4

      if (mat) {
        const prog = isFocused ? 0 : clamp((Math.abs(o) - 0.1) / DISSOLVE_SPAN, 0, 1)
        mat.uniforms.uProgress.value = damp(mat.uniforms.uProgress.value, prog, C.damp * 1.4, dt)
      }
    }
  })

  return (
    <group>
      {CAPABILITIES.map((cap, i) => (
        <group key={cap.id} ref={(el) => { groups.current[i] = el }}>
          <points geometry={geometry} raycast={() => null}>
            <shaderMaterial
              ref={(el) => { mats.current[i] = el as THREE.ShaderMaterial | null }}
              vertexShader={DISSOLVE_VERT}
              fragmentShader={DISSOLVE_FRAG}
              uniforms={uniformsArr[i]}
              transparent
              depthWrite={false}
              depthTest
              blending={THREE.NormalBlending}
              toneMapped={false}
            />
          </points>
          {/* invisible raycast target for hover / click */}
          <mesh onPointerOver={onOver(i)} onPointerOut={onOut(i)} onClick={onClick(i)}>
            <planeGeometry args={[C.planeW, C.planeH]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
