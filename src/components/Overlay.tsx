import { useStore, type Section } from '../store/store'
import { BRAND, CAPABILITIES, ABOUT } from '../config/content'

const NAV: { label: string; section: Section }[] = [
  { label: 'Work', section: 'work' },
  { label: 'Services', section: 'services' },
  { label: 'About', section: 'about' },
  { label: 'Contact', section: 'contact' },
]

/**
 * DOM overlay layer. Section-aware: the top nav reflects + drives the active
 * section, Work shows a live caption for the centered card (and a detail panel
 * when one is expanded), and About/Services/Contact fade in as panels.
 */
export function Overlay() {
  const section = useStore((s) => s.section)
  const requestFlyTo = useStore((s) => s.requestFlyTo)
  const activeIndex = useStore((s) => s.activeIndex)
  const selected = useStore((s) => s.selected)
  const setSelected = useStore((s) => s.setSelected)
  const loaded = useStore((s) => s.loaded)

  const active = CAPABILITIES[activeIndex]
  const detail = selected != null ? CAPABILITIES[selected] : null

  const openCard = (i: number) => {
    requestFlyTo('work')
    setSelected(i)
  }

  return (
    <div className="overlay" data-section={section}>
      <header className="topbar">
        <a href="#" className="wordmark" data-hover onClick={() => requestFlyTo('work')}>
          {BRAND.wordmark}
          <span className="wordmark-mark">°</span>
        </a>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.section}
              className="nav-link"
              data-active={section === n.section}
              onClick={() => requestFlyTo(n.section)}
              data-hover
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      {/* WORK — live caption for the centered card */}
      <div className="work-caption" data-active={section === 'work' && !detail}>
        <span className="work-kicker">{active?.kicker}</span>
        <h2 className="work-title">{active?.title}</h2>
        <p className="work-hint">
          drag · scroll · or ask — {activeIndex + 1} / {CAPABILITIES.length}
        </p>
        <div className="work-dots" aria-hidden="true">
          {CAPABILITIES.map((c, i) => (
            <span key={c.id} data-on={i === activeIndex} />
          ))}
        </div>
      </div>

      {/* WORK — expanded detail */}
      <aside className="detail" data-active={!!detail} aria-hidden={!detail}>
        {detail && (
          <>
            <button className="detail-close" onClick={() => setSelected(null)} data-hover>
              close ✕
            </button>
            <span className="detail-kicker">
              {detail.kicker} · {detail.year}
            </span>
            <h2 className="detail-title">{detail.title}</h2>
            <p className="detail-body">{detail.description}</p>
            <span className="detail-role">{detail.role}</span>
            <a className="detail-link" href={detail.href} data-hover>
              Explore →
            </a>
          </>
        )}
      </aside>

      {/* ABOUT */}
      <section className="panel panel-left" data-active={section === 'about'} aria-hidden={section !== 'about'}>
        <span className="panel-kicker">About</span>
        <h2 className="panel-heading">{ABOUT.heading}</h2>
        {ABOUT.body.map((p, i) => (
          <p className="panel-text" key={i}>
            {p}
          </p>
        ))}
        <div className="stats">
          {ABOUT.stats.map((s) => (
            <div className="stat" key={s.label}>
              <span className="stat-v">{s.value}</span>
              <span className="stat-l">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section className="panel panel-right" data-active={section === 'services'} aria-hidden={section !== 'services'}>
        <span className="panel-kicker">Services</span>
        <h2 className="panel-heading">What we automate</h2>
        <ul className="svc-list">
          {CAPABILITIES.map((c, i) => (
            <li key={c.id}>
              <button className="svc" onClick={() => openCard(i)} data-hover>
                <span className="svc-kicker">{c.kicker}</span>
                <span className="svc-title">{c.title}</span>
                <span className="svc-desc">{c.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* CONTACT */}
      <section className="panel panel-center" data-active={section === 'contact'} aria-hidden={section !== 'contact'}>
        <span className="panel-kicker">Contact</span>
        <h2 className="panel-heading">Let’s build your autonomous layer.</h2>
        <a className="contact-email" href={`mailto:${BRAND.contact.email}`} data-hover>
          {BRAND.contact.email}
        </a>
        <div className="socials">
          {BRAND.contact.socials.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noreferrer" data-hover>
              {s.label}
            </a>
          ))}
        </div>
      </section>

      <footer className="hud" data-active={loaded}>
        <span className="hud-pulse" aria-hidden="true" />
        <span>real-time webgl</span>
        <span className="hud-sep">/</span>
        <span>
          press <kbd>G</kbd>
        </span>
      </footer>
    </div>
  )
}
