/* ============================================================================
   ACT II centerpiece — the DIVISIONS of the Spire as a pinned, horizontally-
   scrubbed filmstrip. The panels are transparent glass HUD cards riding OVER
   the persistent CityWorld canvas: as each division takes focus it writes its
   accent into scrollState.divisionColor and the entire city — helix strand,
   fog, rings, window accents, ground beacons — regrades to match.

   Self-contained: owns its ScrollTrigger (pin via CSS sticky + scrub) and
   per-panel parallax/focus. No canvas of its own any more — one fewer GPU
   surface than the previous build; the city IS the backdrop.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'

gsap.registerPlugin(ScrollTrigger)

const CAPS = ACT2.capabilities

export function Filmstrip() {
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)

  // pin (CSS sticky) + horizontal scrub
  useEffect(() => {
    const sec = section.current
    const trk = track.current
    if (!sec || !trk) return
    const N = CAPS.length
    const setX = gsap.quickSetter(trk, 'x', 'px')

    const st = ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress
        scrollState.galleryProgress = p
        setX(-p * (N - 1) * window.innerWidth)
        const f = p * (N - 1)
        // per-panel depth parallax + focus fade
        panels.current.forEach((el, i) => {
          if (!el) return
          const off = i - f
          const ad = Math.abs(off)
          // steeper-than-linear falloff: the outgoing panel's copy dims hard and
          // fast so it never sits legibly on top of the incoming one mid-scrub —
          // a clean focus-pull instead of a double-exposure.
          const foc = Math.pow(Math.max(0, 1 - ad * 1.1), 2.2)
          el.style.setProperty('--off', String(off))
          el.style.setProperty('--foc', String(foc))
        })
        const i = Math.max(0, Math.min(N - 1, Math.round(f)))
        // write every update (not just on change): re-entering the strip from a
        // section below must restore this division's grade + HUD label
        scrollState.divisionColor = CAPS[i].a
        scrollState.hudLabel = CAPS[i].tag
        setActive((prev) => (prev === i ? prev : i))
      },
    })
    return () => st.kill()
  }, [])

  return (
    <section
      className="filmstrip"
      ref={section}
      aria-label="The divisions of the Spire"
      data-division="THE DIVISIONS"
    >
      <div className="film-stage">
        <div className="film-track" ref={track}>
          {CAPS.map((c, i) => (
            <article
              className="film-panel"
              key={c.id}
              ref={(el) => {
                panels.current[i] = el
              }}
              data-on={i === active}
              style={{ ['--cap-a' as string]: c.a }}
            >
              <span className="film-numeral" aria-hidden="true">
                {c.no}
              </span>
              <div className="film-copy">
                <span className="film-tag">{c.tag}</span>
                <h3 className="film-title">{c.title}</h3>
                <p className="film-blurb">{c.blurb}</p>
                <ul className="film-bullets">
                  {c.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        {/* progress index */}
        <div className="film-index" aria-hidden="true">
          <span className="film-index-no">
            {CAPS[active].no}
            <i>/ {String(CAPS.length).padStart(2, '0')}</i>
          </span>
          <div className="film-rail">
            <span
              className="film-rail-fill"
              style={{ width: `${(active / (CAPS.length - 1)) * 100}%` }}
            />
          </div>
          <span className="film-index-label">{CAPS[active].title}</span>
        </div>
      </div>
    </section>
  )
}
