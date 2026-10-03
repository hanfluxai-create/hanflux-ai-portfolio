/* ============================================================================
   ACT II centerpiece · the six DIVISIONS as stations in the Lattice.
   A pinned (CSS sticky) stage: as you scroll, the camera flies from one
   construct to the next (DownwardWorld maps this section onto stations 1..6)
   and the readout on the left pulls focus between divisions. Each division
   writes its accent into scrollState.divisionColor, so the whole world
   (rain, web, floor, fog) regrades as you arrive, and its title decodes out
   of the rain on arrival.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { gsap } from 'gsap'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'
import { Decode } from './decode'

gsap.registerPlugin(ScrollTrigger)

const CAPS = ACT2.capabilities

export function Divisions() {
  const section = useRef<HTMLElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const [active, setActive] = useState(0)
  // bumps on every entry into the strip and every division change: the title
  // in focus decodes on arrival (including division 01 on first entry)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    const sec = section.current
    if (!sec) return
    const N = CAPS.length
    let cur = 0
    const st = ScrollTrigger.create({
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onEnter: () => setPulse((n) => n + 1),
      onEnterBack: () => setPulse((n) => n + 1),
      onUpdate: (self) => {
        const f = self.progress * (N - 1)
        scrollState.galleryProgress = self.progress
        panels.current.forEach((el, i) => {
          if (!el) return
          const off = i - f
          // steep falloff: the outgoing readout is gone before the next lands
          const foc = Math.pow(Math.max(0, 1 - Math.abs(off) * 1.25), 2)
          el.style.setProperty('--off', off.toFixed(3))
          el.style.setProperty('--foc', foc.toFixed(3))
        })
        const i = Math.max(0, Math.min(N - 1, Math.round(f)))
        // single owner of the strip's grade + label, including the clamped edge
        // updates on leave; the next section's chapter observer takes over after
        scrollState.divisionColor = CAPS[i].a
        scrollState.hudLabel = CAPS[i].tag
        if (i !== cur) {
          cur = i
          setActive(i)
          setPulse((n) => n + 1)
        }
      },
    })
    return () => st.kill()
  }, [])

  return (
    <section
      className="divisions"
      ref={section}
      aria-label="What we build"
      data-division={CAPS[active].tag}
      data-accent={CAPS[active].a}
    >
      <div className="dv-stage">
        {CAPS.map((c, i) => (
          <article
            className="dv-panel"
            key={c.id}
            ref={(el) => {
              panels.current[i] = el
            }}
            data-on={i === active}
            style={{ ['--cap-a' as string]: c.a, ['--foc' as string]: i === 0 ? 1 : 0 }}
          >
            <p className="dv-path">
              <span className="dv-path-no">{c.no}</span>
              <span>{c.tag}</span>
            </p>
            <Decode
              as="h3"
              className="dv-title"
              play={i === active && pulse > 0 ? pulse : false}
              stagger={26}
              scramble={260}
            >
              {c.title}
            </Decode>
            <p className="dv-blurb">{c.blurb}</p>
            <ul className="dv-specs">
              {c.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </article>
        ))}

        <nav className="dv-index" aria-hidden="true">
          {CAPS.map((c, i) => (
            <span className="dv-seg" data-on={i === active} data-past={i < active} key={c.id} style={{ ['--cap-a' as string]: c.a }}>
              <i>{c.no}</i>
              <b>{c.title}</b>
            </span>
          ))}
        </nav>
      </div>
    </section>
  )
}
