import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import { useStore } from '../store/store'
import { Filmstrip } from './Filmstrip'
import { Dive } from './Dive'
import { WorkReel } from './WorkReel'
import { Portal } from './Portal'
import { SplitReveal, useStaggerReveal } from './kinetic'
import './act2.css'

gsap.registerPlugin(ScrollTrigger)

/**
 * ACT II + III — "The Descent". Lives vertically BELOW the Act I immersive hero.
 * Purely additive: Act I (the fixed WebGL experience) is never modified. A Lenis
 * smooth-scroller drives the document; it is told to IGNORE wheel/touch over Act
 * I's `.canvas`, so Act I's carousel keeps its own wheel. Crossing the first
 * viewport adds `body.in-act2`, which fades Act I back to a living backdrop.
 *
 * Act II = the kinetic capability Filmstrip + the living-loop / stack / metrics.
 * Act III = the "Signals Shipped" WorkReel + the Portal finale.
 */
export function DownwardWorld({ webgl = true }: { webgl?: boolean }) {
  const lenisRef = useRef<Lenis | null>(null)
  const scope = useRef<HTMLDivElement>(null)

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

  // --- pointer parallax feed for all the 3D --------------------------------
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      scrollState.pointerX = (e.clientX / window.innerWidth) * 2 - 1
      scrollState.pointerY = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // --- boot failsafe -------------------------------------------------------
  // Act I clears its preloader from inside the intro, which only fires once
  // three's GLOBAL loading manager reports done (drei useProgress). If that ever
  // edge-cases out (manager state never settles on a given browser), the site
  // would hang on the preloader. This additive net forces the ignited/loaded
  // state after a grace period so boot can never get stuck. No Act I files touched.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = useStore.getState()
      if (!s.loaded) {
        s.setIntro(1)
        s.setSection('work')
        s.setLoaded(true)
      }
    }, 7000)
    return () => window.clearTimeout(t)
  }, [])

  // --- stagger-reveal the supporting (non-canvas) blocks -------------------
  useStaggerReveal(scope, '.kreveal')

  const descend = () => lenisRef.current?.scrollTo('#descent', { duration: 1.6 })
  const ascend = () => lenisRef.current?.scrollTo(0, { duration: 1.6 })

  return (
    <div className="act2-root" ref={scope}>
      {/* drifting colour aurora — fixed, lives behind every Act II/III section */}
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
          <p className="kicker kreveal">{ACT2.threshold.kicker}</p>
          <SplitReveal as="h2" className="k-head k-xl" start="top 85%">
            {ACT2.threshold.title.join(' ')}
          </SplitReveal>
          <p className="lede kreveal">{ACT2.threshold.sub}</p>
        </section>

        {/* ---- ACT II · KINETIC CAPABILITY FILMSTRIP ---- */}
        <Filmstrip webgl={webgl} />

        {/* ---- THE LIVING LOOP ---- */}
        <section className="a2 loop">
          <div className="loop-head">
            <p className="kicker kreveal">{ACT2.loop.kicker}</p>
            <SplitReveal as="h2" className="k-head k-sm">
              {ACT2.loop.title}
            </SplitReveal>
          </div>
          <div className="loop-grid">
            {ACT2.loop.steps.map((s) => (
              <article className="loop-step glass kreveal" key={s.no}>
                <span className="ls-no">{s.no}</span>
                <h3 className="ls-title">{s.title}</h3>
                <p className="ls-body">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---- THE STACK ---- */}
        <section className="a2 stack">
          <div className="stack-head">
            <p className="kicker kreveal">{ACT2.stack.kicker}</p>
            <SplitReveal as="h2" className="k-head k-sm">
              {ACT2.stack.title}
            </SplitReveal>
          </div>
          <div className="stack-grid">
            {ACT2.stack.groups.map((g) => (
              <div className="stack-group kreveal" key={g.label}>
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
              <div className="metric kreveal" key={m.l}>
                <span className="m-v">{m.v}</span>
                <span className="m-l">{m.l}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- THE DIVE · scroll-scrubbed Seedance plunge into the screen ---- */}
        <Dive />

        {/* ---- ACT III · SIGNALS SHIPPED (work reel) ---- */}
        <WorkReel webgl={webgl} />
      </main>

      {/* ---- ACT III · THE PORTAL (finale + footer) ---- */}
      <Portal webgl={webgl} />
    </div>
  )
}
