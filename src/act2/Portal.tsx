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
    <section className="portal" ref={section} id="contact">
      <div className="portal-canvas" aria-hidden="true">
        {live ? <TunnelCanvas /> : <div className="portal-fallback" />}
      </div>

      <div className="portal-ui">
        <p className="kicker">{kicker}</p>
        <SplitReveal as="h2" className="portal-title" start="top 88%" stagger={0.022}>
          {title.join(' ')}
        </SplitReveal>
        <p className="portal-body">{body}</p>

        <Magnetic as="a" className="portal-cta" href={`mailto:${email}`} strength={0.45}>
          <span>{button}</span>
          <span className="portal-cta-ring" aria-hidden="true" />
        </Magnetic>

        <a className="portal-email" href={`mailto:${email}`} data-hover>
          {email}
        </a>

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
