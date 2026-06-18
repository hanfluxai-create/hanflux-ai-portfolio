import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { useStore } from '../store/store'
import { BRAND } from '../config/content'

/**
 * Black-screen preloader with REAL load progress (drei useProgress, 0..100).
 * The wordmark here is the SplitText target the intro timeline reveals.
 * Stays in the DOM (just fades out) so the intro can animate it.
 */
export function Preloader() {
  const { progress, errors } = useProgress()
  const setProgress = useStore((s) => s.setProgress)
  const loaded = useStore((s) => s.loaded)
  const barRef = useRef<HTMLDivElement>(null)
  const numRef = useRef<HTMLSpanElement>(null)

  // mirror real progress into the store as 0..1
  useEffect(() => {
    setProgress(Math.min(progress, 100) / 100)
  }, [progress, setProgress])

  // imperative write — no React re-render of the tree per tick
  useEffect(() => {
    const pct = Math.min(progress, 100)
    if (barRef.current) barRef.current.style.transform = `scaleX(${pct / 100})`
    if (numRef.current) numRef.current.textContent = String(Math.round(pct)).padStart(3, '0')
  }, [progress])

  return (
    <div className="preloader" data-done={loaded ? 'true' : 'false'} aria-hidden={loaded}>
      <div className="preloader__center">
        <span className="preloader__label">initialising signal</span>
        <h1 className="preloader__wordmark">
          {BRAND.wordmark}
          <span className="wordmark-mark">°</span>
        </h1>
        <div className="preloader__track">
          <div ref={barRef} className="preloader__bar" />
        </div>
        <span ref={numRef} className="preloader__num">000</span>
        {errors.length > 0 && <span className="preloader__err">asset error — continuing</span>}
      </div>
    </div>
  )
}
