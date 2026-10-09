import { useEffect, useRef } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import { useStore } from '../store/store'
import { heroNav } from './heroNav'
import { CAPABILITIES } from '../config/content'
import { LatticeWorld } from './lattice/LatticeWorld'
import { LATTICE } from './lattice/shared'
import { Divisions } from './Divisions'
import { Portal, CalGlyph } from './Portal'
import { bookingProps, preloadCal } from './cal'
import { CONTACT } from './contact'
import { Magnetic } from './kinetic'
import { Decode, TermLines } from './decode'
import './act2.css'

gsap.registerPlugin(ScrollTrigger)

// Lattice display faces: Doto (dot-matrix readouts) + Martian Mono (terminal
// lines). Injected here so Act I's boot path (index.html/index.css) stays untouched.
if (typeof document !== 'undefined' && !document.getElementById('lattice-fonts')) {
  const link = document.createElement('link')
  link.id = 'lattice-fonts'
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Doto:wght@500;800;900&family=Martian+Mono:wdth,wght@87.5,300..600&display=swap'
  document.head.appendChild(link)
}

const CARDS = CAPABILITIES.length // Act I carousel card count → hero scroll length
const prefersReduce = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** document-absolute top, immune to in-flight reveal transforms */
const absTop = (el: HTMLElement) => {
  let y = 0
  let n: HTMLElement | null = el
  while (n) {
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return y
}

type Anchor = [scroll: number, station: number]

/**
 * ACT II + III · "THE LATTICE". Lives vertically BELOW the Act I immersive hero.
 * Purely additive: Act I (the fixed WebGL experience) is never modified. A Lenis
 * smooth-scroller drives the document; crossing the first viewport adds
 * `body.in-act2`, fades Act I back, and fades in the persistent LatticeWorld
 * canvas: a forward flight through a living Matrix, while these DOM sections
 * ride on top as holographic readouts.
 *
 * Scroll is mapped onto stations (scrollState.track, 0..12) through anchors
 * measured from the real layout: each section owns a station, so the camera
 * arrives at a construct exactly when its copy owns the viewport.
 */
export function DownwardWorld({ webgl = true }: { webgl?: boolean }) {
  const lenisRef = useRef<Lenis | null>(null)
  const scope = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const hudDivRef = useRef<HTMLSpanElement>(null)
  const anchors = useRef<Anchor[]>([])
  const lastPct = useRef(-1)

  // --- Lenis smooth scroll + GSAP ScrollTrigger sync -----------------------
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({
      lerp: reduce ? 1 : 0.09,
      smoothWheel: !reduce,
      wheelMultiplier: 1,
      autoRaf: false,
      // page scroll drives BOTH the Act I carousel (via the hero region) and the
      // flight, so Lenis must not ignore the canvas; only the chat navigator
      // (its scrollable reply log keeps its own wheel).
      // the Cal.com booking modal scrolls itself; never scroll the page under it
      prevent: (node) => !!node?.closest?.('.chatnav, cal-modal-box'),
    })
    lenisRef.current = lenis
    // dev-only handle for deterministic scroll jumps while verifying
    if (import.meta.env.DEV) (window as unknown as { __lenis?: Lenis }).__lenis = lenis

    lenis.on('scroll', ScrollTrigger.update)
    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)

    // page scroll → Act I capability carousel (pinned hero). Carousel reads
    // heroNav.index in its useFrame.
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

    // --- scroll → station anchors, measured from the live layout -----------
    const measure = () => {
      const root = scope.current
      const hero = heroRef.current
      if (!root || !hero) return
      const vh = window.innerHeight
      const A: Anchor[] = [[Math.max(0, hero.offsetHeight - vh), 0]]
      const div = root.querySelector<HTMLElement>('.divisions')
      if (div) {
        A.push([absTop(div), 1])
        A.push([absTop(div) + div.offsetHeight - vh, 6])
      }
      const centre = (sel: string, st: number) => {
        const el = root.querySelector<HTMLElement>(sel)
        if (el) A.push([absTop(el) + el.offsetHeight / 2 - vh / 2, st])
      }
      centre('.loop', 7)
      centre('.buildlog', 8)
      centre('.stack', 9)
      centre('.metrics', 10)
      centre('.engage', 11)
      // the open approach: most of the last stretch, so the light lands before the Portal
      centre('.approach', 11.6)
      const portal = root.querySelector<HTMLElement>('.portal')
      if (portal) A.push([absTop(portal), LATTICE.STATIONS])
      A.sort((a, b) => a[1] - b[1])
      // enforce strictly increasing scroll so the interpolation never divides by 0
      for (let i = 1; i < A.length; i++) if (A[i][0] <= A[i - 1][0]) A[i][0] = A[i - 1][0] + 1
      anchors.current = A
      // anchors moved: re-derive track/HUD now, not on the next wheel tick
      sync()
    }
    const trackAt = (y: number) => {
      const A = anchors.current
      if (!A.length) return 0
      if (y <= A[0][0]) return A[0][1]
      for (let i = 1; i < A.length; i++) {
        if (y <= A[i][0]) {
          const [y0, s0] = A[i - 1]
          const [y1, s1] = A[i]
          return s0 + ((y - y0) / (y1 - y0)) * (s1 - s0)
        }
      }
      return A[A.length - 1][1]
    }
    // fade Act I back as the hero region ends and the flight begins
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
      const track = trackAt(scroll)
      scrollState.track = track
      // legacy 0..1 descent kept for any reader (Portal + older chrome)
      scrollState.descent = track / LATTICE.STATIONS
      document.body.style.setProperty('--lattice', String(Math.min(1, scrollState.inAct2 * 1.4)))

      // HUD: honest flight progress + the station label + the station rail
      const pct = Math.round((track / LATTICE.STATIONS) * 100)
      if (pct !== lastPct.current) {
        lastPct.current = pct
        if (pctRef.current) pctRef.current.textContent = String(pct).padStart(2, '0')
      }
      hudRef.current?.style.setProperty('--trk', track.toFixed(3))
    }
    lenis.on('scroll', onScroll)
    // Lenis never emits on construction: derive everything once now (covers a
    // reload that restores the scroll position deep inside Act II)
    function sync() {
      onScroll({ scroll: window.scrollY })
    }

    measure()
    ScrollTrigger.addEventListener('refresh', measure)
    window.addEventListener('resize', measure)
    // any later layout shift (web fonts swapping in, late reveals) re-measures:
    // ScrollTrigger.refresh() fires 'refresh' → measure() → sync()
    let roRaf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roRaf)
      roRaf = requestAnimationFrame(() => ScrollTrigger.refresh())
    })
    if (scope.current) ro.observe(scope.current)
    document.fonts?.ready.then(() => ScrollTrigger.refresh())

    // the station label has several writers (chapter observer, the divisions
    // strip); paint whatever is current once per tick so ordering never matters
    const paintLabel = () => {
      const el = hudDivRef.current
      if (el && el.textContent !== scrollState.hudLabel) el.textContent = scrollState.hudLabel
    }
    gsap.ticker.add(paintLabel)

    return () => {
      heroST?.kill()
      heroNav.driven = false
      gsap.ticker.remove(paintLabel)
      ro.disconnect()
      cancelAnimationFrame(roRaf)
      ScrollTrigger.removeEventListener('refresh', measure)
      window.removeEventListener('resize', measure)
      gsap.ticker.remove(onTick)
      lenis.off('scroll', ScrollTrigger.update)
      lenis.destroy()
      document.body.classList.remove('in-act2')
      document.body.style.removeProperty('--lattice')
      lenisRef.current = null
    }
  }, [])

  // --- chapter tracking: which section owns the viewport centre ------------
  // Writes scrollState.chapter, the HUD label, and each chapter's accent so the
  // whole Lattice regrades per section.
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
  // three's GLOBAL loading manager reports done. If that ever edge-cases out the
  // site would hang on the preloader; this additive net forces the loaded state
  // after a grace period. No Act I files touched.
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
        // past the last card, the next step is the Lattice itself
        const next = idx >= CARDS - 1 ? '#lattice' : Math.min(maxScroll, (idx + 1) * step)
        lenis.scrollTo(next, prefersReduce() ? { immediate: true } : { duration: 0.9 })
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

  // --- booking: warm the Cal embed on idle; the dock yields to the Portal CTA --
  useEffect(() => {
    preloadCal()
    const portal = document.getElementById('contact')
    if (!portal) return
    const io = new IntersectionObserver(
      ([e]) => document.body.classList.toggle('portal-in', e.isIntersecting),
      { threshold: 0.25 },
    )
    io.observe(portal)
    return () => {
      io.disconnect()
      document.body.classList.remove('portal-in')
    }
  }, [])

  // --- one orchestrated "print" per block: rows type in as a block arrives --
  useEffect(() => {
    const root = scope.current
    if (!root) return
    const blocks = root.querySelectorAll<HTMLElement>('[data-print]')
    if (prefersReduce()) {
      blocks.forEach((b) => b.classList.add('printed'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('printed')
            io.unobserve(e.target)
          }
        }
      },
      // threshold 0 + a bottom inset: blocks taller than the viewport (the
      // terminal on phones) must still trigger
      { threshold: 0, rootMargin: '0px 0px -14% 0px' },
    )
    blocks.forEach((b) => io.observe(b))
    return () => io.disconnect()
  }, [])

  // reduced motion: jump, don't fly — `immediate` (not duration:0, which Lenis
  // treats as falsy and still lerps over several frames)
  const jackIn = () =>
    lenisRef.current?.scrollTo('#lattice', prefersReduce() ? { immediate: true } : { duration: 1.6 })
  const surface = () =>
    lenisRef.current?.scrollTo(0, prefersReduce() ? { immediate: true } : { duration: 1.6 })

  const H = ACT2.hud
  const RAIL = [
    H.threshold,
    ...ACT2.capabilities.map((c) => c.title),
    H.loop,
    H.buildLog,
    H.stack,
    H.metrics,
    H.engage,
    'end of line',
  ]

  return (
    <div className="act2-root" ref={scope}>
      {/* drifting phosphor aurora: the no-WebGL floor under everything */}
      <div className="act2-aurora" aria-hidden="true" />

      {/* THE LATTICE: the persistent Matrix flight behind every section */}
      <LatticeWorld webgl={webgl} />

      {/* HUD: flight progress, current station, the station rail */}
      <div className="lx-hud" ref={hudRef} aria-hidden="true">
        <div className="lx-read">
          <span className="lx-pct" ref={pctRef}>
            00
          </span>
          <span className="lx-pct-unit">%</span>
        </div>
        <span className="lx-where">
          <i>{'>'}</i> <span ref={hudDivRef}>{H.threshold}</span>
        </span>
        <ol className="lx-rail">
          {RAIL.map((label, i) => (
            <li key={label} style={{ ['--i' as string]: i }} />
          ))}
        </ol>
      </div>

      {/* PINNED HERO: a tall pass-through region over the fixed Act I canvas.
          Scrolling through it steps the capability carousel one card at a time
          (heroNav.index), then releases into the Lattice. pointer-events:none so
          card clicks/hover still reach Act I; the jack-in cue stays clickable. */}
      <div
        className="hero-scroll"
        ref={heroRef}
        aria-hidden="true"
        style={{ height: `${100 + (CARDS - 1) * 82}vh` }}
      />

      {/* the cue is position:fixed, so it lives OUTSIDE the aria-hidden hero
          region (a focusable control inside aria-hidden is a WCAG failure) */}
      <button className="descend" onClick={jackIn} data-hover aria-label="Jack in: fly into the Lattice">
        <span className="descend-label">{ACT2.threshold.cue}</span>
        <span className="descend-arrow" />
      </button>

      {/* persistent booking dock (Act II only; steps aside while the Portal's own CTA is on screen) */}
      <a className="book-dock" data-hover aria-label={`${CONTACT.booking.button} (opens a scheduler)`} {...bookingProps}>
        <span className="book-dock-dot" aria-hidden="true" />
        <CalGlyph />
        <span>{CONTACT.booking.short}</span>
      </a>

      {/* persistent back-to-top control (only visible once in Act II) */}
      <button className="ascend" onClick={surface} data-hover aria-label="Back to the top">
        <span className="ascend-arrow" />
        <span>top</span>
      </button>

      <main className="act2">
        {/* ---- UPLINK · threshold ---- */}
        <section
          className="a2 threshold"
          id="lattice"
          data-division={H.threshold}
          data-accent="#27F2C0"
        >
          <p className="lx-prompt">{ACT2.threshold.kicker}</p>
          <Decode as="h2" className="lx-head lx-xl" stagger={42} scramble={520}>
            {ACT2.threshold.title.join(' ')}
          </Decode>
          <p className="lx-lede">{ACT2.threshold.sub}</p>
          <TermLines className="threshold-boot" lines={ACT2.threshold.boot} />
        </section>

        {/* ---- THE DIVISIONS · six stations, six constructs ---- */}
        <Divisions />

        {/* ---- THE BUILD LOOP · the camera flies through the loop gate ---- */}
        <section className="a2 loop" data-division={H.loop} data-accent="#4EA8FF">
          <div className="loop-head">
            <p className="lx-prompt">{ACT2.loop.kicker}</p>
            <Decode as="h2" className="lx-head lx-md">
              {ACT2.loop.title}
            </Decode>
          </div>
          <ol className="loop-pipe" data-print>
            {ACT2.loop.steps.map((s, i) => (
              <li className="lp-step" key={s.no} style={{ ['--d' as string]: i }}>
                <span className="lp-node" aria-hidden="true" />
                <h3 className="lp-title">
                  <span className="lp-no">{s.no}</span>
                  {s.title}
                </h3>
                <p className="lp-body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- THE BUILD LOG · a live terminal ---- */}
        <section className="a2 buildlog" data-division={H.buildLog} data-accent="#27F2C0">
          <div className="buildlog-head">
            <Decode as="h2" className="lx-head lx-md">
              {ACT2.buildLog.title}
            </Decode>
            <p className="lx-lede">{ACT2.buildLog.sub}</p>
          </div>
          <div className="term-win holo" data-print>
            <div className="tw-bar">
              <span className="tw-path">hanflux@lattice ~ % {ACT2.buildLog.kicker}</span>
              <span className="tw-live">live</span>
            </div>
            <ul className="tw-log">
              {ACT2.buildLog.entries.map((e, i) => (
                <li className={`tw-row tw-${e.tag}`} key={e.title} style={{ ['--d' as string]: i }}>
                  <span className="tw-tag">[{e.tag === 'both' ? 'claude+n8n' : e.tag}]</span>
                  <span className="tw-title">{e.title}</span>
                  <span className="tw-body">{e.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- THE STACK · as a dependency tree ---- */}
        <section className="a2 stack" data-division={H.stack} data-accent="#FFB36B">
          <div className="stack-head">
            <p className="lx-prompt">{ACT2.stack.kicker}</p>
            <Decode as="h2" className="lx-head lx-md">
              {ACT2.stack.title}
            </Decode>
          </div>
          <div className="tree holo" data-print>
            <p className="tree-root">hanflux/</p>
            <div className="tree-grid">
              {ACT2.stack.groups.map((g, gi) => (
                <div className="tree-branch" key={g.label} style={{ ['--d' as string]: gi }}>
                  <p className="tree-label">
                    <span className="tree-glyph">{gi === ACT2.stack.groups.length - 1 ? '└──' : '├──'}</span>
                    {g.label.toLowerCase()}/
                  </p>
                  <ul>
                    {g.items.map((it, ii) => (
                      <li key={it}>
                        <span className="tree-glyph">{ii === g.items.length - 1 ? '└─' : '├─'}</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- PROOF · four numbers between the monoliths ---- */}
        <section className="a2 metrics" data-division={H.metrics} data-accent="#27F2C0">
          <div className="metrics-row" data-print>
            {ACT2.metrics.map((m, i) => (
              <div className="metric" key={m.l} style={{ ['--d' as string]: i }}>
                <Decode as="span" className="m-v" stagger={70} scramble={600}>
                  {m.v}
                </Decode>
                <span className="m-l">{m.l}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- WAYS IN · three gates, fixed fees ---- */}
        <section className="a2 engage" data-division={H.engage} data-accent="#9AE6FF">
          <div className="engage-head">
            <p className="lx-prompt">{ACT2.engage.kicker}</p>
            <Decode as="h2" className="lx-head lx-md">
              {ACT2.engage.title}
            </Decode>
            <p className="lx-lede">{ACT2.engage.sub}</p>
          </div>
          <div className="gates" data-print>
            {ACT2.engage.tiers.map((t, i) => (
              <article className="gate holo" key={t.no} style={{ ['--d' as string]: i }}>
                <span className="gate-bars" aria-hidden="true">
                  {Array.from({ length: i + 1 }, (_, k) => (
                    <i key={k} />
                  ))}
                </span>
                <h3 className="gate-name">{t.name}</h3>
                <span className="gate-window">{t.window}</span>
                <span className="gate-price">{t.price}</span>
                <p className="gate-body">{t.body}</p>
              </article>
            ))}
          </div>
          <div className="retainer holo">
            <span className="rt-pulse" aria-hidden="true" />
            <span className="rt-name">{ACT2.engage.retainer.name}</span>
            <span className="rt-price">{ACT2.engage.retainer.price}</span>
            <p className="rt-body">{ACT2.engage.retainer.body}</p>
          </div>
          <div className="engage-book">
            <div className="engage-book-copy">
              <p className="engage-book-line">{ACT2.engage.book.line}</p>
              <p className="engage-book-sub">{ACT2.engage.book.sub}</p>
            </div>
            <Magnetic as="a" className="book-btn" strength={0.3} {...bookingProps}>
              <CalGlyph />
              <span>{CONTACT.booking.button}</span>
            </Magnetic>
          </div>
          <div className="fineprint" data-print>
            <p className="lx-prompt">{ACT2.trust.kicker}</p>
            <ul>
              {ACT2.trust.items.map((t, i) => (
                <li key={t.title} style={{ ['--d' as string]: i }}>
                  <span className="fp-ok" aria-hidden="true">
                    [ok]
                  </span>
                  <strong>{t.title}</strong>
                  <span>{t.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {/* ---- the approach: open space where the singularity rushes in ---- */}
        <section className="approach" aria-hidden="true" data-division="end of line" data-accent="#4CF0FF" />
      </main>

      {/* ---- ACT III · END OF LINE (the light at the end: portal + footer) ---- */}
      <Portal webgl={webgl} />
    </div>
  )
}
