/* ============================================================================
   Cal.com booking: the official element-click embed, typed and lazy.
   `ensureCal()` installs the queueing stub (the vendor snippet, verbatim in
   behaviour) and starts loading embed.js; calls made before it lands are
   queued and replayed. `openBooking` opens the month-view modal; the anchor's
   real href (cal.com page, new tab) stays as the no-JS / modifier-click path.
   ========================================================================== */
import type { MouseEvent } from 'react'
import { CONTACT } from './contact'

type CalFn = ((...args: unknown[]) => void) & {
  loaded?: boolean
  ns: Record<string, (...args: unknown[]) => void>
  q: unknown[]
  config?: Record<string, unknown>
}

declare global {
  interface Window {
    Cal?: CalFn
  }
}

const { namespace, link, origin } = CONTACT.cal
const UI = { hideEventTypeDetails: false, layout: 'month_view' }
const MODAL_CONFIG = { layout: 'month_view', useSlotsViewOnSmallScreen: 'true' }

let installed = false

export function ensureCal() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // ---- vendor stub (from the Cal "element-click" embed code) ----
  ;(function (C: Window & typeof globalThis, A: string, L: string) {
    const p = (a: { q: unknown[] }, ar: IArguments | unknown[]) => {
      a.q.push(ar)
    }
    const d = C.document
    C.Cal =
      C.Cal ||
      (function () {
        const cal = C.Cal as CalFn
        // eslint-disable-next-line prefer-rest-params
        const ar = arguments
        if (!cal.loaded) {
          cal.ns = {}
          cal.q = cal.q || []
          d.head.appendChild(d.createElement('script')).src = A
          cal.loaded = true
        }
        if (ar[0] === L) {
          const api = function () {
            // eslint-disable-next-line prefer-rest-params
            p(api as unknown as { q: unknown[] }, arguments)
          } as unknown as ((...a: unknown[]) => void) & { q: unknown[] }
          const ns = ar[1]
          api.q = api.q || []
          if (typeof ns === 'string') {
            cal.ns[ns] = cal.ns[ns] || api
            p(cal.ns[ns] as unknown as { q: unknown[] }, ar)
            p(cal, ['initNamespace', ns])
          } else p(cal, ar)
          return
        }
        p(cal, ar)
      } as unknown as CalFn)
  })(window, `${origin}/embed/embed.js`, 'init')

  const Cal = window.Cal!
  Cal('init', namespace, { origin })
  Cal.config = Cal.config || {}
  Cal.config.forwardQueryParams = true
  Cal.ns[namespace]('ui', UI)
}

/** Warm the embed when the browser is idle so the first click opens instantly. */
export function preloadCal() {
  if (installed || typeof window === 'undefined') return
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number })
    .requestIdleCallback
  if (ric) ric(ensureCal, { timeout: 4000 })
  else window.setTimeout(ensureCal, 2500)
}

/** onClick for any booking control: open the modal unless the user asked for a new tab. */
export function openBooking(e?: MouseEvent) {
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return
  e?.preventDefault()
  ensureCal()
  window.Cal!.ns[namespace]('modal', { calLink: link, config: MODAL_CONFIG })
}

/** Props for a booking anchor: real link + modal on click. */
export const bookingProps = {
  href: CONTACT.cal.url,
  target: '_blank',
  rel: 'noopener noreferrer',
  onClick: openBooking,
  onPointerEnter: ensureCal,
  onFocus: ensureCal,
}
