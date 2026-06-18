import { useEffect, useRef, useState, useId } from 'react'
import { useStore, type Section } from '../store/store'
import { resolveIntent, classifyIntentLLM } from '../lib/intent'

const CHIPS: { label: string; section: Section }[] = [
  { label: 'Work', section: 'work' },
  { label: 'About', section: 'about' },
  { label: 'Services', section: 'services' },
  { label: 'Contact', section: 'contact' },
  { label: 'Voice Agents', section: 'services' },
  { label: 'Workflow Automation', section: 'services' },
  { label: 'Integrations', section: 'services' },
]

const SECTION_LABEL: Record<Section, string> = {
  intro: 'the intro',
  work: 'Work',
  about: 'About',
  services: 'Services',
  contact: 'Contact',
}

/**
 * Bottom-left AI-chat navigator. Keyword routing is the always-on default
 * (works with no API key); free text optionally escalates to an LLM behind
 * an env flag. Resolved intent flies the camera + switches the section.
 */
export function ChatNavigator() {
  const chatOpen = useStore((s) => s.chatOpen)
  const setChatOpen = useStore((s) => s.setChatOpen)
  const requestFlyTo = useStore((s) => s.requestFlyTo)

  const [value, setValue] = useState('')
  const [reply, setReply] = useState('What are you looking for?')
  const [thinking, setThinking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<number | undefined>(undefined)
  const logId = useId()

  const go = (section: Section, note?: string) => {
    requestFlyTo(section) // also sets section in the store
    setReply(note ?? `Taking you to ${SECTION_LABEL[section]}.`)
    setValue('')
  }

  const submit = async (text: string) => {
    const q = text.trim()
    if (!q) return
    const local = resolveIntent(q)
    if (local.confidence >= 0.6) {
      go(local.section, `Got it — heading to ${SECTION_LABEL[local.section]}.`)
      return
    }
    setThinking(true)
    setReply('Thinking…')
    const result = await classifyIntentLLM(q)
    setThinking(false)
    go(result.section)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => void submit(value), 120)
  }

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus()
  }, [chatOpen])

  // clear any queued debounced submit on unmount
  useEffect(() => () => window.clearTimeout(debounce.current), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setChatOpen])

  return (
    <div className="chatnav" data-open={chatOpen}>
      <button
        className="chatnav-fab"
        aria-expanded={chatOpen}
        aria-controls="chatnav-panel"
        onClick={() => setChatOpen(!chatOpen)}
        data-hover
      >
        <span className="chatnav-fab__dot" aria-hidden="true" />
        {chatOpen ? 'Close' : 'Ask anything'}
      </button>

      {chatOpen && (
        <section id="chatnav-panel" className="chatnav-panel" role="dialog" aria-label="Navigate by asking">
          <p className="chatnav-reply" aria-live="polite" id={logId}>
            {reply}
          </p>

          <ul className="chatnav-chips" aria-label="Quick links">
            {CHIPS.map((c) => (
              <li key={c.label}>
                <button className="chatnav-chip" onClick={() => go(c.section)} data-hover>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>

          <form className="chatnav-form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="chatnav-input">
              Ask where to go
            </label>
            <input
              id="chatnav-input"
              ref={inputRef}
              className="chatnav-input"
              type="text"
              autoComplete="off"
              placeholder="e.g. can you automate my calls?"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby={logId}
              disabled={thinking}
            />
            <button className="chatnav-send" type="submit" disabled={thinking} data-hover aria-label="Send">
              {thinking ? '…' : '↵'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
