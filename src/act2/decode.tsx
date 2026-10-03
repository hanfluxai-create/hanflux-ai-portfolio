/* ============================================================================
   Lattice typography primitives.
   <Decode>: a headline that resolves out of cycling glyphs, character by
   character, the way text surfaces out of the rain. The real characters stay
   in the DOM (transparent) and own the layout, so nothing reflows while it
   scrambles: each char's stand-in glyph is painted on top via ::after
   (attr(data-g)). Screen readers get the plain string via aria-label.
   <TermLines>: terminal lines that type themselves out once, in sequence.
   Both honour prefers-reduced-motion (final state, instantly).
   ========================================================================== */
import { Fragment, createElement, useEffect, useMemo, useRef, useState, type ElementType } from 'react'

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>/'
const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** fire once when the element is meaningfully on screen */
function useOnceVisible<T extends Element>(ref: { current: T | null }, threshold = 0.3) {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen, threshold])
  return seen
}

export function Decode({
  children,
  as = 'h2',
  className,
  play,
  stagger = 34,
  scramble = 420,
}: {
  children: string
  as?: ElementType
  className?: string
  /** controlled trigger; when omitted the decode runs once on first sight */
  play?: boolean | number
  stagger?: number
  scramble?: number
}) {
  const ref = useRef<HTMLElement>(null)
  const seen = useOnceVisible(ref)
  const active = play === undefined ? seen : play !== false
  const words = useMemo(() => children.split(' '), [children])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chars = Array.from(el.querySelectorAll<HTMLElement>('.dc'))
    // uncontrolled + not seen yet: sit as glyph noise, so the reveal is noise →
    // text (never text → noise → text)
    if (!active && play === undefined && !reduced()) {
      chars.forEach((c) => {
        c.classList.remove('on')
        c.setAttribute('data-g', GLYPHS[(Math.random() * GLYPHS.length) | 0])
      })
      return
    }
    if (!active || reduced()) {
      chars.forEach((c) => {
        c.removeAttribute('data-g')
        c.classList.add('on')
      })
      return
    }
    chars.forEach((c) => {
      c.classList.remove('on')
      c.setAttribute('data-g', GLYPHS[(Math.random() * GLYPHS.length) | 0])
    })
    const t0 = performance.now()
    const due = chars.map((_, i) => i * stagger + scramble + Math.random() * 180)
    let raf = 0
    let last = 0
    const step = (now: number) => {
      const t = now - t0
      const swap = now - last > 48
      if (swap) last = now
      let pending = 0
      chars.forEach((c, i) => {
        if (c.classList.contains('on')) return
        if (t >= due[i]) {
          c.removeAttribute('data-g')
          c.classList.add('on')
        } else {
          pending++
          if (swap && t > i * stagger * 0.35) c.setAttribute('data-g', GLYPHS[(Math.random() * GLYPHS.length) | 0])
        }
      })
      if (pending) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, play, stagger, scramble, children])

  // the plain string lives in a visually hidden span (aria-label is ignored on
  // generic elements like <span>); the glyph spans are presentation only
  return createElement(
    as,
    { ref, className: `decode ${className ?? ''}` },
    <span className="sr-only">{children}</span>,
    words.map((w, wi) => (
      <Fragment key={wi}>
        <span className="dw" aria-hidden="true">
          {Array.from(w).map((ch, ci) => (
            <span className="dc" key={ci}>
              {ch}
            </span>
          ))}
        </span>
        {wi < words.length - 1 ? ' ' : null}
      </Fragment>
    )),
  )
}

export function TermLines({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useOnceVisible(ref, 0.2)
  const [out, setOut] = useState<string[]>(() => lines.map(() => ''))
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!seen) return
    if (reduced()) {
      setOut(lines)
      setDone(true)
      return
    }
    let li = 0
    let ci = 0
    let timer = 0
    const tick = () => {
      if (li >= lines.length) {
        setDone(true)
        return
      }
      ci++
      // snapshot: the updater runs later, after li/ci have moved on
      const row = li
      const text = lines[li].slice(0, ci)
      setOut((prev) => {
        const next = prev.slice()
        next[row] = text
        return next
      })
      if (ci >= lines[li].length) {
        li++
        ci = 0
        timer = window.setTimeout(tick, 260)
      } else {
        timer = window.setTimeout(tick, 18 + Math.random() * 30)
      }
    }
    timer = window.setTimeout(tick, 200)
    return () => window.clearTimeout(timer)
  }, [seen, lines])

  return (
    <div className={`term ${className ?? ''}`} ref={ref}>
      <span className="sr-only">{lines.join('. ')}</span>
      {out.map((l, i) => (
        <p
          className="term-line"
          key={i}
          aria-hidden="true"
          data-empty={l.length === 0}
          data-live={!done && l.length > 0 && l.length < lines[i].length}
        >
          <span className="term-prompt">{'>'}</span> {l}
        </p>
      ))}
      <span className={`term-cursor${done ? ' idle' : ''}`} aria-hidden="true" />
    </div>
  )
}
