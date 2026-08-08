/* ============================================================================
   ACT II signature — "THE SPIRE": a vertical AI campus the viewer descends
   past for the whole act. One persistent fixed canvas behind the DOM
   sections: instanced megacity, DNA data-helix, GPU traffic streaks, drones,
   sky-lane rings, cloud decks (with breakthrough whiteouts), altitude-graded
   fog/sky, and a camera that slow-orbits the spire from crown to street.

   Coexistence contract (see CLAUDE.md): Act I is untouched. This canvas is
   IntersectionObserver-gated (mounts only once the descent is near), pauses
   its frameloop whenever an opaque section (the Portal) owns the viewport,
   and reads scroll through the scrollState singleton — zero React
   re-renders per frame.
   ========================================================================== */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Color, MathUtils, Vector3 } from 'three'
import { buildCity, camPose, CITY, type CityTier } from './city'
import { scrollState } from './scrollState'

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const FOG_TOP = new Color('#0a1226')
const FOG_MID = new Color('#14253d')
const FOG_LOW = new Color('#2b1a10')

const smooth01 = (x: number) => {
  const t = MathUtils.clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

function CityScene({ tier }: { tier: CityTier }) {
  const assets = useMemo(() => buildCity(tier), [tier])
  useEffect(() => () => assets.dispose(), [assets])

  const disp = useRef(0) // damped displayed descent
  const camPos = useRef(new Vector3())
  const camLook = useRef(new Vector3())
  const fogCur = useRef(new Color('#0a1226'))
  const fogTarget = useRef(new Color())
  const accentTarget = useRef(new Color('#27f2c0'))
  const lastChapter = useRef(0)
  const pulseBoost = useRef(0)
  const camera = useThree((s) => s.camera)

  // start the eye at the crown so mount never flashes the wrong altitude
  useEffect(() => {
    camPose(scrollState.descent, camPos.current, camLook.current, 0, 0)
    disp.current = scrollState.descent
    camera.position.copy(camPos.current)
    camera.lookAt(camLook.current)
  }, [camera])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const sh = assets.shared
    const isReduced = reduced()

    // ambient time always flows — the city never reads as dead
    sh.uTime.value += dt

    // camera: damp toward the scroll-driven descent (snap under reduced motion)
    const d = MathUtils.clamp(scrollState.descent, 0, 1)
    disp.current = isReduced ? d : MathUtils.damp(disp.current, d, 7, dt)
    camPose(disp.current, camPos.current, camLook.current, scrollState.pointerX, scrollState.pointerY)
    camera.position.copy(camPos.current)
    camera.lookAt(camLook.current)

    // altitude grading: fog colour + density, sky, ground beacons
    const alt = 1 - (camera.position.y - CITY.CAM_END) / (CITY.CAM_TOP - CITY.CAM_END)
    sh.uAlt.value = MathUtils.clamp(alt, 0, 1)
    if (alt < 0.55) fogTarget.current.copy(FOG_TOP).lerp(FOG_MID, alt / 0.55)
    else fogTarget.current.copy(FOG_MID).lerp(FOG_LOW, (alt - 0.55) / 0.45)
    // the division accent breathes into the atmosphere
    accentTarget.current.set(scrollState.divisionColor)
    sh.uAccent.value.lerp(accentTarget.current, isReduced ? 1 : 1 - Math.pow(0.002, dt))
    fogTarget.current.lerp(sh.uAccent.value, 0.1)
    fogCur.current.lerp(fogTarget.current, isReduced ? 1 : 1 - Math.pow(0.001, dt))
    sh.uFogColor.value.copy(fogCur.current)

    // cloud decks: fade each plane as the eye nears it; whiteout on crossing
    let veil = 0
    let cloudNearFog = 0
    for (const { mat, y } of assets.cloudMats) {
      const dy = Math.abs(camera.position.y - y)
      mat.uniforms.uNear.value = smooth01((dy - 10) / 40)
      if (y > 100) {
        // only true cloud decks (not the street haze) drive the whiteout
        veil = Math.max(veil, Math.exp(-Math.pow((camera.position.y - y) / 15, 2)))
        cloudNearFog = Math.max(cloudNearFog, Math.exp(-Math.pow((camera.position.y - y) / 32, 2)))
      }
    }
    sh.uVeil.value = veil * 0.82
    // skip the fullscreen veil pass entirely while it's invisible
    assets.veil.visible = sh.uVeil.value > 0.001
    sh.uFogDensity.value = 0.0026 + alt * 0.0009 + cloudNearFog * 0.004

    // the DNA pulse: always travelling down; surges when a chapter is crossed
    if (scrollState.chapter !== lastChapter.current) {
      lastChapter.current = scrollState.chapter
      pulseBoost.current = 1
    }
    pulseBoost.current = Math.max(0, pulseBoost.current - dt * 0.5)
    sh.uPulse.value -= dt * (0.1 + pulseBoost.current * 0.55)
    if (sh.uPulse.value < -0.15) sh.uPulse.value = 1.15

    // slow helix rotation + sky follows the eye
    assets.helixGroup.rotation.y += dt * 0.1
    assets.sky.position.copy(camera.position)
  })

  return <primitive object={assets.group} />
}

export function CityWorld({ webgl = true }: { webgl?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [covered, setCovered] = useState(false)
  const [above, setAbove] = useState(true) // still up at the Act I surface → canvas is at opacity 0
  const tier: CityTier = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.innerWidth < 760 || matchMedia('(hover: none)').matches)
        ? 'mobile'
        : 'desktop',
    [],
  )

  // mount gate: build the city only once the descent is near the viewport
  useEffect(() => {
    if (!webgl) return
    const target = document.querySelector('main.act2')
    if (!target) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setMounted(true) // build once, keep warm
      },
      { rootMargin: '120% 0px 120% 0px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [webgl])

  // above gate: while the visitor is still up at the Act I surface the canvas
  // sits at opacity 0 (--city = 0) — don't burn GPU rendering an invisible city
  // on top of Act I's own always-running pipeline. Mirrors the exact condition
  // that drives --city; setState only on boundary crossings.
  useEffect(() => {
    if (!mounted) return
    let cur = scrollState.inAct2 > 0
    setAbove(!cur)
    const check = () => {
      const now = scrollState.inAct2 > 0
      if (now !== cur) {
        cur = now
        setAbove(!now)
      }
    }
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [mounted])

  // pause gate: when an opaque full-screen section owns the viewport, stop
  // rendering the city underneath it (the Portal canvas)
  useEffect(() => {
    if (!mounted) return
    const els = document.querySelectorAll('.portal')
    if (!els.length) return
    const covering = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        const vh = window.innerHeight
        for (const e of entries) {
          if (e.intersectionRect.height > vh * 0.85) covering.add(e.target)
          else covering.delete(e.target)
        }
        setCovered(covering.size > 0)
      },
      { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [mounted])

  if (!webgl) return null

  return (
    <div className={`city-fix${covered ? ' is-covered' : ''}`} aria-hidden="true">
      {mounted && (
        <Canvas
          gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
          dpr={tier === 'mobile' ? [1, 1.25] : [1, 1.5]}
          camera={{ fov: 55, near: 0.5, far: 2600, position: [0, CITY.CAM_TOP, CITY.ORBIT_R] }}
          frameloop={covered || above ? 'never' : 'always'}
        >
          <CityScene tier={tier} />
          {/* multisampling 0: the scene is additive bloom-dominated glow — the
              composer's default 8x MSAA buffer would be pure bandwidth waste */}
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.5} luminanceSmoothing={0.8} />
            <Vignette eskil={false} offset={0.22} darkness={0.72} />
          </EffectComposer>
        </Canvas>
      )}
    </div>
  )
}
