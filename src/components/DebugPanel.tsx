import { useEffect } from 'react'
import { Pane } from 'tweakpane'
import { CONFIG } from '../config/config'
import { useStore } from '../store/store'

/**
 * A mini "Hydra GUI". Press "g" to toggle. Bindings mutate CONFIG
 * directly; the scene reads CONFIG each frame so changes are live.
 */
export function DebugPanel() {
  const debug = useStore((s) => s.debug)
  const toggleDebug = useStore((s) => s.toggleDebug)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key.toLowerCase() === 'g') toggleDebug()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDebug])

  useEffect(() => {
    if (!debug) return
    const pane = new Pane({ title: 'HYDRA · debug' })

    const particles = pane.addFolder({ title: 'Particles' })
    particles.addBinding(CONFIG.particles, 'size', { min: 0.004, max: 0.08, step: 0.001 })
    particles.addBinding(CONFIG.particles, 'rotationSpeed', { min: 0, max: 0.3, step: 0.005 })
    particles.addBinding(CONFIG.particles, 'pointerInfluence', { min: 0, max: 1.5, step: 0.01 })

    const bloom = pane.addFolder({ title: 'Bloom (remount to apply)' })
    bloom.addBinding(CONFIG.bloom, 'intensity', { min: 0, max: 3, step: 0.01 })
    bloom.addBinding(CONFIG.bloom, 'luminanceThreshold', { min: 0, max: 1, step: 0.01 })

    const color = pane.addFolder({ title: 'Color' })
    color.addBinding(CONFIG.colors, 'particleA')
    color.addBinding(CONFIG.colors, 'particleB')
    color.addBinding(CONFIG.colors, 'particleC')

    return () => pane.dispose()
  }, [debug])

  return null
}
