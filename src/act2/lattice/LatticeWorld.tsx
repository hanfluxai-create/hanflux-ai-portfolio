/* ============================================================================
   ACT II signature · "THE LATTICE".
   One persistent fixed canvas behind every Act II section: a forward flight
   through a living Matrix. Volumetric code rain, a neural web with packets
   racing its links, a neon grid floor, and one hero construct per station
   (voice core, agent crystal, flow graph, data crystal ... the singularity
   that hands off to the Portal).

   Page scroll → scrollState.track (stations, written by DownwardWorld) → the
   rig damps it, flies the camera, regrades the world to the chapter accent,
   and feeds scroll velocity into the rain, the FOV and the lens.

   Coexistence contract (see CLAUDE.md): Act I untouched. The canvas mounts
   only once Act II is near (IntersectionObserver), renders nothing while the
   visitor is still at the Act I surface, and pauses while the opaque Portal
   owns the viewport. Scroll arrives through the scrollState singleton: zero
   React re-renders per frame.
   ========================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { ChromaticAberrationEffect } from 'postprocessing'
import { Color, FogExp2, MathUtils, PerspectiveCamera, Vector2, Vector3 } from 'three'
import { scrollState } from '../scrollState'
import { LATTICE, stationZ, worldState, worldUniforms, type LatticeTier } from './shared'
import { Rain } from './Rain'
import { Web } from './Web'
import { Floor, Sky } from './Floor'
import { Constructs } from './constructs'

const VOID = new Color('#010805')
const BASE_FOV = 62

// dev verification: jump the damped camera straight to the scroll target
let snapNext = false

const reducedQuery =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null

function Rig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const pos = useRef(new Vector3())
  const look = useRef(new Vector3())
  const tmp = useRef(new Vector3())
  const accentTarget = useRef(new Color())
  const fogCol = useRef(new Color())
  const disp = useRef(scrollState.track)
  const vel = useRef(0)
  const roll = useRef(0)

  // dev-only handle for verification (draw calls, programs, camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __lattice?: unknown }
    w.__lattice = {
      gl,
      scene,
      camera,
      worldState,
      worldUniforms,
      snap: () => {
        snapNext = true
      },
    }
    return () => {
      delete w.__lattice
    }
  }, [gl, scene, camera])

  // fog the built-in materials share with our custom shaders
  useEffect(() => {
    const fog = new FogExp2(VOID.clone(), worldUniforms.uFogDensity.value)
    scene.fog = fog
    scene.background = fog.color
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const U = worldUniforms
    const reduced = !!reducedQuery?.matches
    worldState.reduced = reduced

    // ambient clock: always flowing, slowed under reduced motion
    worldState.time += dt * (reduced ? 0.25 : 1)
    U.uTime.value = worldState.time

    // damped flight along the track
    const target = MathUtils.clamp(scrollState.track, 0, LATTICE.STATIONS)
    const prev = disp.current
    const snapped = snapNext
    snapNext = false
    disp.current = reduced || snapped ? target : MathUtils.damp(disp.current, target, 3.4, dt)
    const t = disp.current
    const rawVel = snapped ? 0 : (t - prev) / Math.max(dt, 1e-4)
    vel.current = snapped ? 0 : MathUtils.damp(vel.current, rawVel, 6, dt)
    const speed = Math.min(Math.abs(vel.current), 3)
    worldState.track = t
    worldState.vel = vel.current
    U.uTrack.value = t
    U.uVel.value = speed
    U.uFlow.value += dt * (1 + speed * 1.8) * (reduced ? 0.25 : 1)
    U.uDpr.value = state.viewport.dpr
    U.uRes.value.set(state.size.width, state.size.height)

    // camera pose: forward flight with a slow drift, pointer parallax
    const aspect = state.size.width / Math.max(1, state.size.height)
    worldState.aspect = aspect
    const portrait = aspect < 0.9
    const D = portrait ? 25 : LATTICE.D
    const z = -t * LATTICE.SP + D
    const wob = reduced ? 0 : 1
    const sx = Math.sin(t * 1.3 + worldState.time * 0.12) * 1.3 * wob
    const sy = 1.7 + Math.sin(t * 0.9 + 1 + worldState.time * 0.17) * 0.55 * wob
    pos.current.set(sx + scrollState.pointerX * 1.1, sy - scrollState.pointerY * 0.7, z)
    look.current.set(sx * 0.35, sy * 0.6 - 0.3, z - 40)

    // at a division station, swing the gaze onto its construct (it sits right
    // of the path; desktop keeps it right of centre for the copy, portrait
    // centres it above the copy)
    const k = Math.round(t)
    if (k >= 1 && k <= 6) {
      const w = Math.exp(-Math.pow((t - k) / 0.62, 2))
      tmp.current.set(portrait ? LATTICE.SIDE_X : 2.6, portrait ? -2.2 : 1, stationZ(k))
      look.current.lerp(tmp.current, w)
    }
    camera.position.copy(pos.current)
    camera.lookAt(look.current)
    roll.current = MathUtils.damp(roll.current, (Math.sin(t * 0.7) * 0.03 - vel.current * 0.02) * wob, 4, dt)
    camera.rotateZ(roll.current)

    // warp: FOV opens with velocity
    const fov = BASE_FOV + (portrait ? 8 : 0) + speed * 5 * wob
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = MathUtils.damp(camera.fov, fov, 5, dt)
      camera.updateProjectionMatrix()
    }

    // chapter accent breathes through the whole world
    accentTarget.current.set(scrollState.divisionColor)
    U.uAccent.value.lerp(accentTarget.current, reduced ? 1 : 1 - Math.pow(0.004, dt))
    fogCol.current.copy(VOID).lerp(U.uAccent.value, 0.012)
    U.uFogColor.value.copy(fogCol.current)
    // thin the haze on the final approach so the singularity reads from afar
    const density = 0.0105 - MathUtils.smoothstep(t, 10.2, 11.8) * 0.0048
    U.uFogDensity.value = density
    const fog = scene.fog as FogExp2 | null
    if (fog) {
      fog.color.copy(fogCol.current)
      fog.density = density
    }
  }, -1)

  return null
}

const CA_BASE = new Vector2(0.0005, 0.0003)

function PostFX({ tier }: { tier: LatticeTier }) {
  // built by hand + <primitive>: the wrapped <ChromaticAberration> JSON-stringifies
  // its props, and under React 19 `ref` is a prop (circular → throws)
  const ca = useMemo(
    () =>
      new ChromaticAberrationEffect({
        offset: CA_BASE.clone(),
        radialModulation: true,
        modulationOffset: 0.35,
      }),
    [],
  )
  useEffect(() => () => ca.dispose(), [ca])
  useFrame(() => {
    // the lens smears as you fly: aberration scales with scroll velocity
    const k = 1 + worldUniforms.uVel.value * 2.2
    ca.offset.set(CA_BASE.x * k, CA_BASE.y * k)
  })
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.0} luminanceThreshold={0.5} luminanceSmoothing={0.4} radius={0.68} />
      {tier === 'desktop' ? <primitive object={ca} dispose={null} /> : <></>}
      {tier === 'desktop' ? <Noise premultiply opacity={0.35} /> : <></>}
      <Vignette eskil={false} offset={0.24} darkness={0.82} />
    </EffectComposer>
  )
}

export function LatticeWorld({ webgl = true }: { webgl?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [covered, setCovered] = useState(false)
  const [above, setAbove] = useState(true)
  const tier: LatticeTier = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.innerWidth < 760 || matchMedia('(hover: none)').matches)
        ? 'mobile'
        : 'desktop',
    [],
  )
  const [dpr, setDpr] = useState<number | [number, number]>(tier === 'mobile' ? [1, 1.25] : [1, 1.5])

  // mount gate: build the world once Act II is near, then keep it warm
  useEffect(() => {
    if (!webgl) return
    const target = document.querySelector('main.act2')
    if (!target) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setMounted(true)
      },
      { rootMargin: '120% 0px 120% 0px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [webgl])

  // render gates, checked once per animation frame (state changes only on a
  // boundary crossing):
  //  · above: still at the Act I surface (--lattice = 0) → nothing to draw.
  //    Read from scrollState, which Lenis writes in the same frame loop, so
  //    there's no scroll-event ordering race that could strand it.
  //  · covered: the Portal fills the viewport AND its feathered top band
  //    (24vh, see act2.css) has left the screen → pause beneath it.
  useEffect(() => {
    if (!mounted) return
    const portal = document.querySelector<HTMLElement>('.portal')
    let a = scrollState.inAct2 <= 0
    let c = false
    setAbove(a)
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const na = scrollState.inAct2 <= 0
      if (na !== a) {
        a = na
        setAbove(na)
      }
      if (portal) {
        const vh = window.innerHeight
        const r = portal.getBoundingClientRect()
        const nc = r.top < -vh * 0.25 && r.bottom > vh
        if (nc !== c) {
          c = nc
          setCovered(nc)
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mounted])

  if (!webgl) return null

  return (
    <div className={`lattice-fix${covered ? ' is-covered' : ''}`} aria-hidden="true">
      {mounted && (
        <Canvas
          gl={{ alpha: false, antialias: false, stencil: false, powerPreference: 'high-performance' }}
          dpr={dpr}
          flat
          camera={{ fov: BASE_FOV, near: 0.3, far: 1300, position: [0, 1.7, LATTICE.D] }}
          frameloop={covered || above ? 'never' : 'always'}
        >
          <PerformanceMonitor onDecline={() => setDpr(1)} flipflops={2} />
          <Rig />
          <Sky />
          <Floor />
          <Rain tier={tier} />
          <Web tier={tier} />
          <Constructs tier={tier} />
          <PostFX tier={tier} />
        </Canvas>
      )}
    </div>
  )
}
