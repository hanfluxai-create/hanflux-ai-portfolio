/* ============================================================================
   ACT III finale · "THE PORTAL".
   A full-screen fbm-tunnel shader the viewer falls into, with kinetic type and a
   single magnetic contact CTA — the closing spectacle. uProgress opens the portal
   as the section scrolls in (scrollState.portalProgress); pointer parallaxes the
   eye. Canvas is gated; the tunnel is one fill-rate-bound pass, so DPR is capped.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { type Mesh } from 'three'
import { ACT3 } from './content3'
import { scrollState } from './scrollState'
import { SplitReveal, Magnetic } from './kinetic'
import { CONTACT } from './contact'
import { bookingProps } from './cal'
import './shaders' // registers <portalMaterial> + types

gsap.registerPlugin(ScrollTrigger)

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function Tunnel() {
  const mesh = useRef<Mesh>(null)
  const mat = useRef<any>(null)
  const { viewport, size } = useThree()

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    if (mesh.current) mesh.current.scale.set(viewport.width, viewport.height, 1)
    const m = mat.current
    if (!m) return
    const isReduced = reduced()
    // tunnel always animates so the finale is alive on every device
    m.uTime += dt
    m.uAspect = size.width / size.height
    m.uPointer.set(scrollState.pointerX, scrollState.pointerY)
    if (isReduced) {
      m.uProgress = scrollState.portalProgress
    } else {
      m.uProgress += (Math.max(0.001, scrollState.portalProgress) - m.uProgress) * 0.05
    }
  })

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[1, 1]} />
      <portalMaterial ref={mat} />
    </mesh>
  )
}

function TunnelCanvas() {
  return (
    <Canvas
      gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
      dpr={[1, 1.25]}
      camera={{ position: [0, 0, 2], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Tunnel />
    </Canvas>
  )
}

/** a tiny month grid with one lit day: the slot you are about to pick */
export function CalGlyph() {
  return (
    <svg className="cal-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="13.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect className="cal-glyph-day" x="11.2" y="10.6" width="3.6" height="3.6" rx="0.9" />
    </svg>
  )
}

export function Portal({ webgl = true }: { webgl?: boolean }) {
  const section = useRef<HTMLElement>(null)
  const [live, setLive] = useState(false)

  // drive portalProgress from scroll (opens as the section crosses the viewport)
  useEffect(() => {
    const el = section.current
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'center center',
      scrub: true,
      onUpdate: (self) => {
        scrollState.portalProgress = self.progress
      },
    })
    return () => st.kill()
  }, [])

  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setLive(webgl && e.isIntersecting),
      { rootMargin: '20% 0px 10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  const { kicker, title, body, button, email, socials } = ACT3.portal

  return (
    <section
      className="portal"
      ref={section}
      id="contact"
      data-division="end of line"
      data-accent="#27F2C0"
    >
      <div className="portal-canvas" aria-hidden="true">
        {live ? <TunnelCanvas /> : <div className="portal-fallback" />}
      </div>
      {/* the tunnel's hot core blows out near-white at full uProgress — this
          keeps the closing line legible right at the climax instead of
          washing out against it */}
      <div className="portal-scrim" aria-hidden="true" />

      <div className="portal-ui">
        <p className="kicker">{kicker}</p>
        <SplitReveal as="h2" className="portal-title" start="top 88%" stagger={0.022}>
          {title.join(' ')}
        </SplitReveal>
        <p className="portal-body">{body}</p>

        <Magnetic as="a" className="portal-cta" strength={0.45} {...bookingProps}>
          <CalGlyph />
          <span>{button}</span>
          <span className="portal-cta-ring" aria-hidden="true" />
        </Magnetic>
        <p className="portal-cta-note">{CONTACT.booking.note}</p>

        <address className="portal-contact">
          <a className="portal-email" href={`mailto:${email}`} data-hover>
            {email}
          </a>
          <span className="portal-phones">
            {CONTACT.phones.map((ph) => (
              <a key={ph.href} className="portal-phone" href={ph.href} data-hover>
                {ph.label}
              </a>
            ))}
          </span>
        </address>

        <ul className="portal-socials">
          {socials.map((s) => (
            <li key={s.label}>
              <a href={s.href} data-hover target="_blank" rel="noreferrer noopener">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <footer className="portal-foot">
        <span>Hanflux AI</span>
        <span>the autonomous layer</span>
        <span>© 2026</span>
      </footer>
    </section>
  )
}
