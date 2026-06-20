/* ============================================================================
   ACT II→III bridge · "THE DIVE" — a scroll-driven plunge INTO the screen.
   A Seedance hyperspace clip is held PAUSED and its `currentTime` is scrubbed by
   scroll (you pilot the dive). Kinetic words rush toward the viewer — each one
   scales from a distant speck to flying past your face at its own scroll depth —
   while the footage scales up and the vignette tightens. Pure DOM video + GSAP
   ScrollTrigger; no WebGL, so it runs even where the canvas can't. Lazy-gated.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT3 } from './content3'

gsap.registerPlugin(ScrollTrigger)

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const D = ACT3.dive
const N = D.words.length

export function Dive() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const words = useRef<(HTMLSpanElement | null)[]>([])
  const duration = useRef(5)
  const [src, setSrc] = useState<string | null>(null)
  // phones can't reliably scrub a PAUSED <video> (iOS only renders frames after a
  // gesture-driven play) → autoplay the muted loop inline instead of scrubbing.
  const isMobile =
    typeof window !== 'undefined' &&
    (window.innerWidth < 760 || matchMedia('(hover: none)').matches)

  // load the clip only when the dive is near view (don't pay for it up top)
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSrc(D.video)
          io.disconnect()
        }
      },
      { rootMargin: '60% 0px 60% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // mobile: play the muted loop inline once the source is in (no scrubbing)
  useEffect(() => {
    const vid = video.current
    if (!vid || !src || !isMobile) return
    vid.loop = true
    const tryPlay = () => {
      vid.play().catch(() => {})
    }
    tryPlay()
    vid.addEventListener('canplay', tryPlay, { once: true })
    return () => vid.removeEventListener('canplay', tryPlay)
  }, [src, isMobile])

  // scrub the video + drive the kinetic dive from scroll
  useEffect(() => {
    const sec = section.current
    const vid = video.current
    if (!sec || !vid) return
    const isReduced = reduced()

    const onMeta = () => {
      if (vid.duration && isFinite(vid.duration)) duration.current = vid.duration
    }
    vid.addEventListener('loadedmetadata', onMeta)

    const st = ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress
        // desktop scrubs the paused footage by scroll; mobile autoplays the loop
        if (!isMobile && vid.readyState >= 1) {
          const t = Math.min(duration.current - 0.05, p * duration.current)
          if (Math.abs(vid.currentTime - t) > 0.01) vid.currentTime = t
        }
        // footage pushes toward the viewer
        if (stage.current) {
          stage.current.style.setProperty('--vid-scale', String(1 + p * (isReduced ? 0.04 : 0.2)))
          stage.current.style.setProperty('--dive-vig', String(0.35 + p * 0.5))
        }
        if (isReduced) return
        // words fly past: tiny speck → readable → huge as you pass through each
        for (let i = 0; i < N; i++) {
          const el = words.current[i]
          if (!el) continue
          const center = 0.13 + (N > 1 ? (i / (N - 1)) * 0.74 : 0)
          const d = p - center
          const scale = Math.min(16, Math.max(0.18, Math.pow(2, d * 22)))
          const opacity = Math.max(0, 1 - Math.abs(d) / 0.1)
          const blur = Math.min(9, Math.abs(d) * 46)
          el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`
          el.style.opacity = opacity.toFixed(3)
          el.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : 'none'
        }
      },
    })

    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      st.kill()
    }
  }, [src])

  return (
    <section className="dive" ref={section} aria-label="Dive into the machine">
      <div className="dive-stage" ref={stage}>
        <video
          className="dive-video"
          ref={video}
          src={src ?? undefined}
          poster={D.poster}
          muted
          playsInline
          loop={isMobile}
          autoPlay={isMobile}
          preload="auto"
          aria-hidden="true"
        />
        <div className="dive-scrim" aria-hidden="true" />

        {/* kinetic words rushing toward the viewer (or a static line if reduced) */}
        <div className="dive-words" aria-hidden="true">
          {D.words.map((w, i) => (
            <span
              className="dive-word"
              key={w + i}
              ref={(el) => {
                words.current[i] = el
              }}
            >
              {w}
            </span>
          ))}
        </div>

        <div className="dive-hud">
          <span className="dive-kicker">{D.kicker}</span>
          <span className="dive-sub">{D.sub}</span>
        </div>

        {/* accessible, non-animated phrase for SR + reduced-motion */}
        <h2 className="sr-only">
          {D.words.join(' ')} — {D.sub}
        </h2>
      </div>
    </section>
  )
}
