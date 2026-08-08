import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import { useStore } from '../store/store'
import { heroNav } from './heroNav'
import { CAPABILITIES } from '../config/content'
import { CityWorld } from './CityWorld'
import { Filmstrip } from './Filmstrip'
import { Portal } from './Portal'
import { SplitReveal, useStaggerReveal } from './kinetic'
import './act2.css'

gsap.registerPlugin(ScrollTrigger)

const CARDS = CAPABILITIES.length // Act I carousel card count → hero scroll length
const prefersReduce = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * ACT II + III — "THE SPIRE". Lives vertically BELOW the Act I immersive hero.
 * Purely additive: Act I (the fixed WebGL experience) is never modified. A Lenis
 * smooth-scroller drives the document; crossing the first viewport adds
 * `body.in-act2`, fades Act I back, and fades in the persistent CityWorld
 * canvas — a vertical megacity the camera descends past for the entire act,
 * while these DOM sections ride on top as glass HUD panels.
 *
 * The descent is one continuous thread: scrollState.descent (0 crown → 1
 * street) drives the city camera, the descent HUD, and the DNA rail.
 */
export function DownwardWorld({ webgl = true }: { webgl?: boolean }) {
  const lenisRef = useRef<Lenis | null>(null)
  const scope = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const depthRef = useRef<HTMLSpanElement>(null)
  const hudDivRef = useRef<HTMLSpanElement>(null)
  const railDotRef = useRef<HTMLSpanElement>(null)
  const lastPct = useRef(-1)

  // --- Lenis smooth scroll + GSAP ScrollTrigger sync -----------------------
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({
      lerp: reduce ? 1 : 0.09,
      smoothWheel: !reduce,
      wheelMultiplier: 1,
      autoRaf: false,
      // page scroll now drives BOTH the Act I carousel (via the hero region) and the
      // descent, so Lenis must NOT ignore the canvas any more — only the chat
      // navigator (its scrollable reply log must keep its own wheel).
      prevent: (node) => !!node?.closest?.('.chatnav'),
    })
    lenisRef.current = lenis

    lenis.on('scroll', ScrollTrigger.update)
    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    // page scroll → Act I capability carousel (pinned hero). The Act I canvas is
    // position:fixed, so it stays in view while the tall hero region scrolls past,
    // stepping one card at a time. Carousel reads heroNav.index in its useFrame.
    heroNav.driven = true
    let heroST: ScrollTrigger | null = null
    if (heroRef.current) {
      heroST = ScrollTrigger.create({
        trigger: heroRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          heroNav.index = self.progress * (CARDS - 1)
        },
      })
    }

    // fade Act I back as the hero region ends and the descent begins
    let inAct2 = false
    const onScroll = ({ scroll }: { scroll: number }) => {
      const vh = window.innerHeight
      const heroH = heroRef.current?.offsetHeight ?? vh
      const past = scroll > heroH - vh * 0.9
      scrollState.inAct2 = Math.min(1, Math.max(0, (scroll - (heroH - vh)) / vh))
      if (past !== inAct2) {
        inAct2 = past
        document.body.classList.toggle('in-act2', past)
      }
      // the descent: one continuous 0→1 from the crown (end of the hero) to
      // street level (document bottom). Drives the city camera + the HUD.
      const start = Math.max(0, heroH - vh)
      const total = document.body.scrollHeight - vh - start
      const p = total > 0 ? Math.min(1, Math.max(0, (scroll - start) / total)) : 0
      scrollState.descent = p
      // city canvas fade-in across the first descent viewport
      document.body.style.setProperty('--city', String(Math.min(1, scrollState.inAct2 * 1.4)))

      // HUD: descent percentage + division label + DNA rail dot
      const pct = Math.round(p * 100)
      if (pct !== lastPct.current) {
        lastPct.current = pct
        if (depthRef.current) depthRef.current.textContent = `${pct}%`
      }
      if (hudDivRef.current && hudDivRef.current.textContent !== scrollState.hudLabel) {
        hudDivRef.current.textContent = scrollState.hudLabel
      }
      if (railDotRef.current) railDotRef.current.style.top = `${(p * 100).toFixed(2)}%`
    }
    lenis.on('scroll', onScroll)

    return () => {
      heroST?.kill()
      heroNav.driven = false
      gsap.ticker.remove(onTick)
      lenis.off('scroll', ScrollTrigger.update)
      lenis.destroy()
      document.body.classList.remove('in-act2')
      document.body.style.removeProperty('--city')
      lenisRef.current = null
    }
  }, [])

  // --- chapter tracking: which section owns the viewport centre ------------
  // Writes scrollState.chapter (helix pulse surges on change), the HUD label,
  // and each chapter's accent so the whole city regrades per section.
  useEffect(() => {
    const root = scope.current
    if (!root) return
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-division]'))
    if (!sections.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          scrollState.chapter = sections.indexOf(el)
          scrollState.hudLabel = el.dataset.division ?? scrollState.hudLabel
          // paint the label here too: the scroll handler only runs while Lenis
          // is emitting, so a label set at rest would otherwise lag a section
          if (hudDivRef.current && hudDivRef.current.textContent !== scrollState.hudLabel) {
            hudDivRef.current.textContent = scrollState.hudLabel
          }
          if (el.dataset.accent) scrollState.divisionColor = el.dataset.accent
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
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

  // --- keyboard a11y: arrows step the pinned hero one card at a time --------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const hero = heroRef.current
      const lenis = lenisRef.current
      if (!hero || !lenis) return
      const maxScroll = Math.max(0, hero.offsetHeight - window.innerHeight)
      if (window.scrollY > maxScroll + 4) return // past the hero → normal Act II scroll
      const step = maxScroll / Math.max(1, CARDS - 1)
      const idx = Math.round(window.scrollY / step)
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        lenis.scrollTo(
          Math.min(maxScroll, (idx + 1) * step),
          prefersReduce() ? { immediate: true } : { duration: 0.9 },
        )
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        lenis.scrollTo(
          Math.max(0, (idx - 1) * step),
          prefersReduce() ? { immediate: true } : { duration: 0.9 },
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- stagger-reveal the supporting (non-canvas) blocks -------------------
  useStaggerReveal(scope, '.kreveal')

  // reduced motion: jump, don't fly — `immediate` (not duration:0, which Lenis
  // treats as falsy and still lerps over several frames)
  const descend = () =>
    lenisRef.current?.scrollTo('#descent', prefersReduce() ? { immediate: true } : { duration: 1.6 })
  const ascend = () =>
    lenisRef.current?.scrollTo(0, prefersReduce() ? { immediate: true } : { duration: 1.6 })

  return (
    <div className="act2-root" ref={scope}>
      {/* drifting colour aurora — fixed, the no-WebGL floor under everything */}
      <div className="act2-aurora" aria-hidden="true" />

      {/* THE SPIRE — the persistent megacity descent behind every section */}
      <CityWorld webgl={webgl} />

      {/* the Spire HUD: descent progress, division, DNA progress rail */}
      <div className="spire-hud" aria-hidden="true">
        <div className="hud-floor">
          <span className="hud-floor-no" ref={depthRef}>
            0%
          </span>
          <span className="hud-floor-label">DOWN</span>
        </div>
        <div className="hud-meta">
          <span className="hud-division" ref={hudDivRef}>
            THE CROWN
          </span>
        </div>
        <div className="hud-rail">
          <svg className="hud-helix" viewBox="0 0 24 300" preserveAspectRatio="none">
            <path d="M6 0 C 20 25, 20 50, 6 75 C -8 100, -8 125, 6 150 C 20 175, 20 200, 6 225 C -8 250, -8 275, 6 300" />
            <path d="M18 0 C 4 25, 4 50, 18 75 C 32 100, 32 125, 18 150 C 4 175, 4 200, 18 225 C 32 250, 32 275, 18 300" />
          </svg>
          <span className="hud-dot" ref={railDotRef} />
        </div>
      </div>

      {/* PINNED HERO: a tall pass-through region over the fixed Act I canvas.
          Scrolling through it steps the capability carousel one card at a time
          (heroNav.index), then releases into the descent. pointer-events:none so
          card clicks/hover still reach Act I; the descend cue stays clickable. */}
      <div
        className="hero-scroll"
        ref={heroRef}
        aria-hidden="true"
        style={{ height: `${100 + (CARDS - 1) * 82}vh` }}
      />

      {/* the descend cue is position:fixed, so it lives OUTSIDE the aria-hidden
          hero region — a focusable control inside aria-hidden is a WCAG failure */}
      <button
        className="descend"
        onClick={descend}
        data-hover
        aria-label="Begin the descent"
      >
        <span className="descend-label">{ACT2.threshold.cue}</span>
        <span className="descend-arrow" />
      </button>

      {/* persistent ascend control (only visible once in Act II) */}
      <button className="ascend" onClick={ascend} data-hover aria-label="Back to the surface">
        <span className="ascend-arrow" />
        <span>surface</span>
      </button>

      <main className="act2">
        {/* ---- THE CROWN · threshold ---- */}
        <section
          className="a2 threshold"
          id="descent"
          data-division="THE CROWN"
          data-accent="#27F2C0"
        >
          <p className="kicker kreveal">{ACT2.threshold.kicker}</p>
          <SplitReveal as="h2" className="k-head k-xl" start="top 85%">
            {ACT2.threshold.title.join(' ')}
          </SplitReveal>
          <p className="lede kreveal">{ACT2.threshold.sub}</p>
        </section>

        {/* ---- THE DIVISIONS · pinned filmstrip over the city ---- */}
        <Filmstrip />

        {/* ---- THE BUILD LOOP ---- */}
        <section className="a2 loop" data-division="THE BUILD LOOP" data-accent="#4EA8FF">
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

        {/* ---- THE BUILD LOG ---- */}
        <section className="a2 buildlog" data-division="THE BUILD LOG" data-accent="#7C5CFF">
          <div className="buildlog-head">
            <p className="kicker kreveal">{ACT2.buildLog.kicker}</p>
            <SplitReveal as="h2" className="k-head k-sm">
              {ACT2.buildLog.title}
            </SplitReveal>
            <p className="lede kreveal">{ACT2.buildLog.sub}</p>
          </div>
          <ul className="buildlog-list">
            {ACT2.buildLog.entries.map((e) => (
              <li className={`bl-row bl-${e.tag} kreveal`} key={e.title}>
                <span className="bl-tag">{e.tag === 'both' ? 'CLAUDE + N8N' : e.tag}</span>
                <span className="bl-title">{e.title}</span>
                <span className="bl-body">{e.body}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- THE STACK ---- */}
        <section className="a2 stack" data-division="THE STACK" data-accent="#FFB36B">
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
        <section className="a2 metrics" data-division="PROOF BAND" data-accent="#27F2C0">
          <div className="metrics-row">
            {ACT2.metrics.map((m) => (
              <div className="metric kreveal" key={m.l}>
                <span className="m-v">{m.v}</span>
                <span className="m-l">{m.l}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- WAYS IN · transparent fixed-fee tiers + trust strip ---- */}
        <section className="a2 engage" data-division="WAYS IN" data-accent="#9AE6FF">
          <div className="engage-head">
            <p className="kicker kreveal">{ACT2.engage.kicker}</p>
            <SplitReveal as="h2" className="k-head k-sm">
              {ACT2.engage.title}
            </SplitReveal>
            <p className="lede kreveal">{ACT2.engage.sub}</p>
          </div>
          <div className="engage-tiers">
            {ACT2.engage.tiers.map((t) => (
              <article className="tier glass kreveal" key={t.no}>
                <span className="tier-no">{t.no}</span>
                <div className="tier-top">
                  <h3 className="tier-name">{t.name}</h3>
                  <span className="tier-window">{t.window}</span>
                </div>
                <span className="tier-price">{t.price}</span>
                <p className="tier-body">{t.body}</p>
              </article>
            ))}
          </div>
          <div className="engage-retainer glass kreveal">
            <span className="er-name">{ACT2.engage.retainer.name}</span>
            <span className="er-price">{ACT2.engage.retainer.price}</span>
            <p className="er-body">{ACT2.engage.retainer.body}</p>
          </div>
          <div className="trust-head kreveal">
            <p className="kicker">{ACT2.trust.kicker}</p>
          </div>
          <ul className="trust-strip">
            {ACT2.trust.items.map((t) => (
              <li className="trust-item kreveal" key={t.title}>
                <strong>{t.title}</strong>
                <span>{t.body}</span>
              </li>
            ))}
          </ul>
        </section>

      </main>

      {/* ---- ACT III · STREET LEVEL (portal finale + footer) ---- */}
      <Portal webgl={webgl} />
    </div>
  )
}
