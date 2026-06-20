/* ============================================================================
   ACT II centerpiece — "THE ARSENAL" as a pinned, horizontally-scrubbed
   kinetic filmstrip. One full-bleed flow-shader backdrop morphs its hue through
   each capability while a track of giant parallax numerals + kinetic type slides
   across. GPU-cheap (single shader pass); crisp DOM typography over it.

   Self-contained: owns its ScrollTrigger (pin via CSS sticky + scrub), writes
   scrollState for the canvas, and gates the canvas with IntersectionObserver so
   only one extra heavy canvas is ever live.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Color, type Mesh } from 'three'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import './shaders' // registers <flowFieldMaterial> + types

gsap.registerPlugin(ScrollTrigger)

const CAPS = ACT2.capabilities
const ACCENT = ['#7c5cff', '#27f2c0', '#ff3d7f'] // uColorC cycle
const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// precompute each capability's colour triad ONCE (no per-frame hex parsing)
const CAP_COLORS = CAPS.map((c, i) => ({
  a: new Color(c.a),
  b: new Color(c.b),
  c: new Color(ACCENT[i % ACCENT.length]),
}))

/* --- the single full-viewport flow plane (hue lerps to active capability) -- */
function FlowPlane() {
  const mesh = useRef<Mesh>(null)
  const mat = useRef<any>(null)
  const { viewport } = useThree()

  // working colours we lerp every frame (clones — never mutate CAP_COLORS)
  const cur = useRef({
    a: CAP_COLORS[0].a.clone(),
    b: CAP_COLORS[0].b.clone(),
    c: CAP_COLORS[0].c.clone(),
  })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    if (mesh.current) mesh.current.scale.set(viewport.width, viewport.height, 1)
    const m = mat.current
    if (!m) return
    const isReduced = reduced()

    // fractional active index across the rail
    const f = scrollState.galleryProgress * (CAPS.length - 1)
    const i = Math.max(0, Math.min(CAPS.length - 1, Math.round(f)))
    const tgt = CAP_COLORS[i]

    const k = isReduced ? 1 : 1 - Math.pow(0.0015, dt) // frame-rate-independent lerp
    cur.current.a.lerp(tgt.a, k)
    cur.current.b.lerp(tgt.b, k)
    cur.current.c.lerp(tgt.c, k)

    // reduced-motion: freeze the flowing noise (CSS media query can't reach WebGL)
    if (!isReduced) m.uTime += dt
    m.uColorA.copy(cur.current.a)
    m.uColorB.copy(cur.current.b)
    m.uColorC.copy(cur.current.c)
    m.uPointer.set(scrollState.pointerX, scrollState.pointerY)
    // focus brightens near the centre of a panel, dims in the gaps
    const frac = Math.abs(f - Math.round(f))
    m.uIntensity += ((1 - frac * 1.3) - m.uIntensity) * (isReduced ? 1 : 0.08)
    m.uReveal += (Math.min(1, scrollState.inAct2 * 1.5) - m.uReveal) * (isReduced ? 1 : 0.06)
  })

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[1, 1]} />
      <flowFieldMaterial ref={mat} transparent depthWrite={false} />
    </mesh>
  )
}

function FlowCanvas() {
  return (
    <Canvas
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 2], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <FlowPlane />
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.35} luminanceSmoothing={0.85} />
      </EffectComposer>
    </Canvas>
  )
}

/* --- the filmstrip ------------------------------------------------------- */
export function Filmstrip({ webgl = true }: { webgl?: boolean }) {
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)
  const [live, setLive] = useState(false)

  // pin (CSS sticky) + horizontal scrub
  useEffect(() => {
    const sec = section.current
    const trk = track.current
    if (!sec || !trk) return
    const N = CAPS.length
    const setX = gsap.quickSetter(trk, 'x', 'px')

    const st = ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress
        scrollState.galleryProgress = p
        setX(-p * (N - 1) * window.innerWidth)
        const f = p * (N - 1)
        // per-panel depth parallax + focus fade
        panels.current.forEach((el, i) => {
          if (!el) return
          const off = i - f
          const ad = Math.abs(off)
          el.style.setProperty('--off', String(off))
          el.style.setProperty('--foc', String(Math.max(0, 1 - ad * 1.25)))
        })
        const i = Math.max(0, Math.min(N - 1, Math.round(f)))
        setActive((prev) => (prev === i ? prev : i))
      },
    })
    return () => st.kill()
  }, [])

  // gate the canvas to near-view only
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setLive(webgl && e.isIntersecting),
      { rootMargin: '30% 0px 30% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  return (
    <section className="filmstrip" ref={section} aria-label="What we build">
      <div className="film-stage">
        <div className="film-canvas" aria-hidden="true">
          {live && <FlowCanvas />}
        </div>

        <div className="film-track" ref={track}>
          {CAPS.map((c, i) => (
            <article
              className="film-panel"
              key={c.id}
              ref={(el) => {
                panels.current[i] = el
              }}
              data-on={i === active}
            >
              <span className="film-numeral" aria-hidden="true">
                {c.no}
              </span>
              <div className="film-copy">
                <span className="film-tag">{c.tag}</span>
                <h3 className="film-title">{c.title}</h3>
                <p className="film-blurb">{c.blurb}</p>
                <ul className="film-bullets">
                  {c.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        {/* progress index */}
        <div className="film-index" aria-hidden="true">
          <span className="film-index-no">
            {CAPS[active].no}
            <i>/ {String(CAPS.length).padStart(2, '0')}</i>
          </span>
          <div className="film-rail">
            <span
              className="film-rail-fill"
              style={{ width: `${(active / (CAPS.length - 1)) * 100}%` }}
            />
          </div>
          <span className="film-index-label">{CAPS[active].title}</span>
        </div>
      </div>
    </section>
  )
}
