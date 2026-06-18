import { useEffect, useRef } from 'react'

/**
 * Custom cursor: a crisp dot that tracks instantly + a lagging ring
 * that eases behind it and swells over interactive elements.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null!)
  const ring = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let rx = x
    let ry = y

    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      const d = dot.current
      if (d) {
        d.style.setProperty('--x', `${x}px`)
        d.style.setProperty('--y', `${y}px`)
      }
    }

    const over = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      const hit = !!t?.closest('a, button, [data-hover]')
      ring.current?.classList.toggle('is-hover', hit)
    }

    let raf = 0
    const loop = () => {
      rx += (x - rx) * 0.16
      ry += (y - ry) * 0.16
      const r = ring.current
      if (r) {
        r.style.setProperty('--x', `${rx}px`)
        r.style.setProperty('--y', `${ry}px`)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerover', over)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerover', over)
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
  )
}
