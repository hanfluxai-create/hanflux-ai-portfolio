import { useSyncExternalStore } from 'react'

const RM_QUERY = '(prefers-reduced-motion: reduce)'

/** Live `prefers-reduced-motion: reduce` subscription. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(RM_QUERY)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(RM_QUERY).matches,
    () => false, // SSR/no-window default (SPA: never hit, but safe)
  )
}
