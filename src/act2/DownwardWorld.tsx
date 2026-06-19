import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import { GlassGallery } from './GlassGallery'
import './act2.css'

gsap.registerPlugin(ScrollTrigger)

/**
 * ACT II — "The Descent". Lives vertically BELOW the Act I immersive hero.
 * Purely additive: Act I (the fixed WebGL experience) is never modified. A
 * Lenis smooth-scroller drives the document; it is told to IGNORE wheel/touch
 * over Act I's `.canvas`, so Act I's carousel keeps its own wheel behaviour.
 * Crossing the first viewport adds `body.in-act2`, which fades Act I back.
 */
export function DownwardWorld({ webgl = true }: { webgl?: boolean }) {
  const [galleryLive, setGalleryLive] = useState(false)
  const [active, setActive] = useState(0)
  const lenisRef = useRef<Lenis | null>(null)
  const gallerySection = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  // --- Lenis smooth scroll + GSAP ScrollTrigger sync -----------------------
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({
      lerp: reduce ? 1 : 0.09,
      smoothWheel: !reduce,
      wheelMultiplier: 1,
      autoRaf: false,
      // let Act I's canvas keep its own wheel/drag (the 3D carousel)
      prevent: (node) =>
        node?.classList?.contains('canvas') || !!node?.closest?.('.canvas, .chat-panel'),
    })
    lenisRef.current = lenis

    lenis.on('scroll', ScrollTrigger.update)
    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    // cross-the-threshold → fade Act I back, reveal Act II
    let inAct2 = false
    const onScroll = ({ scroll }: { scroll: number }) => {
      const past = scroll > window.innerHeight * 0.45
      scrollState.inAct2 = Math.min(1, scroll / window.innerHeight)
      if (past !== inAct2) {
        inAct2 = past
        document.body.classList.toggle('in-act2', past)
      }
    }
    lenis.on('scroll', onScroll)

    return () => {
      gsap.ticker.remove(onTick)
      lenis.off('scroll', ScrollTrigger.update)
      lenis.destroy()
      document.body.classList.remove('in-act2')
      lenisRef.current = null
    }
  }, [])

  // --- drive the glass gallery from scroll + reveal sections ----------------
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (gallerySection.current) {
        ScrollTrigger.create({
          trigger: gallerySection.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          onUpdate: (self) => {
            scrollState.galleryProgress = self.progress
            const i = Math.round(self.progress * (ACT2.capabilities.length - 1))
            setActive((prev) => (prev === i ? prev : i))
          },
        })
      }
      // cheap, robust reveals
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.fromTo(
          el,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 82%', once: true },
          },
        )
      })
    })
    return () => ctx.revert()
  }, [])

  // --- pointer parallax feed for the 3D ------------------------------------
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      scrollState.pointerX = (e.clientX / window.innerWidth) * 2 - 1
      scrollState.pointerY = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // --- mount the heavy canvas only while the gallery is near the viewport ---
  useEffect(() => {
    const el = gallerySection.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setGalleryLive(webgl && e.isIntersecting),
      { rootMargin: '40% 0px 40% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  const descend = () => lenisRef.current?.scrollTo('#descent', { duration: 1.6 })
  const ascend = () => lenisRef.current?.scrollTo(0, { duration: 1.6 })

  const cap = ACT2.capabilities[active]

  return (
    <div className="act2-root">
      {/* drifting colour aurora — fixed, lives behind every Act II section */}
      <div className="act2-aurora" aria-hidden="true" />

      {/* first viewport: Act I shows through; only the descend cue is clickable */}
      <div className="act2-spacer" aria-hidden="true">
        <button className="descend" onClick={descend} data-hover aria-label="Descend to what we build">
          <span className="descend-label">{ACT2.threshold.cue}</span>
          <span className="descend-arrow" />
        </button>
      </div>

      {/* persistent ascend control (only visible once in Act II) */}
      <button className="ascend" onClick={ascend} data-hover aria-label="Back to the surface">
        <span className="ascend-arrow" />
        <span>surface</span>
      </button>

      <main className="act2">
        {/* ---- THRESHOLD ---- */}
        <section className="a2 threshold" id="descent">
          <p className="kicker reveal">{ACT2.threshold.kicker}</p>
          <h2 className="display reveal">
            {ACT2.threshold.title.map((l, i) => (
              <span key={i} className="display-line">
                {l}
              </span>
            ))}
          </h2>
          <p className="lede reveal">{ACT2.threshold.sub}</p>
        </section>

        {/* ---- ARSENAL / GLASS GALLERY (tall, sticky stage) ---- */}
        <section className="a2 arsenal" ref={gallerySection}>
          <div className="gallery-stage" ref={stage}>
            <div className="gallery-canvas">{galleryLive && <GlassGallery />}</div>

            <div className="gallery-ui">
              <div className="gallery-head reveal">
                <p className="kicker">{ACT2.arsenal.kicker}</p>
                <h2 className="display sm">{ACT2.arsenal.title}</h2>
              </div>

              <div className="gallery-active" key={cap.id}>
                <span className="ga-no">{cap.no}</span>
                <span className="ga-tag">{cap.tag}</span>
                <h3 className="ga-title">{cap.title}</h3>
                <p className="ga-blurb">{cap.blurb}</p>
                <ul className="ga-bullets">
                  {cap.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>

              <ol className="gallery-legend" aria-label="capabilities">
                {ACT2.capabilities.map((c, i) => (
                  <li key={c.id}>
                    <button
                      className="leg"
                      data-on={i === active}
                      data-hover
                      onClick={() =>
                        lenisRef.current?.scrollTo(gallerySection.current!, {
                          offset:
                            (gallerySection.current!.offsetHeight - window.innerHeight) *
                            (i / (ACT2.capabilities.length - 1)),
                          duration: 1.1,
                        })
                      }
                    >
                      <span className="leg-no">{c.no}</span>
                      <span className="leg-title">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---- THE LIVING LOOP ---- */}
        <section className="a2 loop">
          <div className="loop-head reveal">
            <p className="kicker">{ACT2.loop.kicker}</p>
            <h2 className="display sm">{ACT2.loop.title}</h2>
          </div>
          <div className="loop-grid">
            {ACT2.loop.steps.map((s) => (
              <article className="loop-step glass reveal" key={s.no}>
                <span className="ls-no">{s.no}</span>
                <h3 className="ls-title">{s.title}</h3>
                <p className="ls-body">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- THE STACK ---- */}
        <section className="a2 stack">
          <div className="stack-head reveal">
            <p className="kicker">{ACT2.stack.kicker}</p>
            <h2 className="display sm">{ACT2.stack.title}</h2>
          </div>
          <div className="stack-grid">
            {ACT2.stack.groups.map((g) => (
              <div className="stack-group reveal" key={g.label}>
                <span className="sg-label">{g.label}</span>
                <ul className="sg-items">
                  {g.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ---- METRICS ---- */}
        <section className="a2 metrics">
          <div className="metrics-row">
            {ACT2.metrics.map((m) => (
              <div className="metric reveal" key={m.l}>
                <span className="m-v">{m.v}</span>
                <span className="m-l">{m.l}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section className="a2 cta">
          <p className="kicker reveal">{ACT2.cta.kicker}</p>
          <h2 className="display reveal">
            {ACT2.cta.title.map((l, i) => (
              <span key={i} className="display-line">
                {l}
              </span>
            ))}
          </h2>
          <p className="lede reveal">{ACT2.cta.body}</p>
          <a className="cta-btn glass reveal" href={`mailto:${ACT2.cta.email}`} data-hover>
            {ACT2.cta.button}
            <span className="cta-arrow" />
          </a>
          <a className="cta-email reveal" href={`mailto:${ACT2.cta.email}`} data-hover>
            {ACT2.cta.email}
          </a>
        </section>

        <footer className="a2-foot">
          <span>Hanflux AI</span>
          <span>the autonomous layer</span>
        </footer>
      </main>
    </div>
  )
}
