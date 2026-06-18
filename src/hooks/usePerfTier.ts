import { useDetectGPU } from '@react-three/drei'
import type { Quality } from '../store/store'

/**
 * Seed quality tier from detect-gpu (suspends; must be under <Suspense>).
 * PerformanceMonitor then corrects this over the first few seconds at runtime.
 */
export function useInitialQuality(reducedMotion: boolean): Quality {
  const gpu = useDetectGPU()
  if (reducedMotion) return 'low'
  if (gpu.isMobile) return gpu.tier >= 3 ? 'medium' : 'low'
  if (gpu.tier <= 1) return 'low'
  if (gpu.tier === 2) return 'medium'
  return 'high' // tier 3 desktop
}
