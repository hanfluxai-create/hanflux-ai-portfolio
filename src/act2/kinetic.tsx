/* ============================================================================
   Kinetic typography + magnetic interaction primitives.
   GSAP SplitText (free in 3.15) shatters headings into lines/chars that
   reassemble on scroll — the Active-Theory typographic signature. All motion
   honours prefers-reduced-motion. DOM-only; no canvas. Additive to Act I.
   ========================================================================== */
import {
  createElement,
  useEffect,
  useRef,
  type ElementType,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText)

const reduced = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A heading whose characters rise + rotate in, line by line, when it scrolls
 * into view. `as` picks the tag (h2/h3/span…). `start` tunes the trigger.
 */
export function SplitReveal({
  children,
  as = 'h2',
  className,
  start = 'top 84%',
  stagger = 0.018,
  duration = 0.9,
  y = '110%',
  once = true,
}: {
  children: ReactNode
  as?: ElementType
  className?: string
  start?: string
  stagger?: number
  duration?: number
  y?: string
  once?: boolean
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // make the heading visible up-front — if SplitText ever throws, the text is
    // still shown (chars animate from hidden, the element itself never hides).
    el.style.opacity = '1'
    if (reduced()) return

    let split: SplitText | null = null
    const ctx = gsap.context(() => {
      split = new SplitText(el, {
        type: 'lines,chars',
        linesClass: 'kline',
        charsClass: 'kchar',
        autoSplit: true, // re-split when the display font swaps in
      })
      gsap.set(el, { opacity: 1 })
      gsap.from(split.chars, {
        yPercent: parseFloat(y),
        rotateX: -70,
        opacity: 0,
        transformOrigin: '50% 100% -20px',
        duration,
        ease: 'power3.out',
        stagger,
        scrollTrigger: { trigger: el, start, once },
      })
    }, el)

    return () => {
      split?.revert()
      ctx.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createElement(
    as,
    { ref, className, style: { opacity: 0, perspective: 600 } },
    children,
  )
}

/**
 * A button/anchor that leans toward the cursor within a radius, then springs
 * back — the magnetic CTA. Pass `as="a"` for links. Disabled on touch/reduced.
 */
export function Magnetic({
  children,
  as = 'button',
  className,
  strength = 0.4,
  radius = 90,
  ...rest
}: {
  children: ReactNode
  as?: ElementType
  className?: string
  strength?: number
  radius?: number
  [key: string]: unknown
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced() || matchMedia('(hover: none)').matches) return

    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' })

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      if (Math.hypot(dx, dy) > radius + Math.max(r.width, r.height) / 2) {
        xTo(0)
        yTo(0)
        return
      }
      xTo(dx * strength)
      yTo(dy * strength)
    }
    const onLeave = () => {
      xTo(0)
      yTo(0)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [radius, strength])

  return createElement(
    as,
    { ref, className, 'data-hover': '', ...rest },
    children,
  )
}

/** Imperatively reveal `.reveal`-style children with a stagger on scroll. */
export function useStaggerReveal(
  scopeRef: { current: HTMLElement | null },
  selector = '.kreveal',
) {
  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return
    const items = scope.querySelectorAll<HTMLElement>(selector)
    if (!items.length) return
    if (reduced()) {
      gsap.set(items, { opacity: 1, y: 0 })
      return
    }
    const ctx = gsap.context(() => {
      items.forEach((el) =>
        gsap.fromTo(
          el,
          { y: 44, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          },
        ),
      )
    }, scope)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
