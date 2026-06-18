import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, AdaptiveDpr, AdaptiveEvents } from '@react-three/drei'
import { CONFIG } from '../config/config'
import { ParticleField } from './ParticleField'
import { Carousel } from './Carousel'
import { CameraRig } from './CameraRig'
import { PreloadAssets } from './PreloadAssets'
import { Effects } from '../components/Effects'
import { useInitialQuality } from '../hooks/usePerfTier'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useStore, type Quality } from '../store/store'

function applyTier(q: Quality) {
  const t = CONFIG.tiers[q]
  CONFIG.runtime.quality = q
  CONFIG.runtime.particleCount = t.particleCount
  CONFIG.runtime.chromaticAberration = t.chromaticAberration
  CONFIG.runtime.bloomEnabled = t.bloom
}

/**
 * Seeds the quality tier from detect-gpu (suspends). Mutates CONFIG during
 * render — idempotent — so ParticleField (the NEXT sibling) reads the correct
 * particle count on its first build, then notifies the parent after commit.
 */
function QualityController({ onTier }: { onTier: (q: Quality) => void }) {
  const reduced = useReducedMotion()
  const initial = useInitialQuality(reduced)
  useMemo(() => applyTier(initial), [initial])
  useEffect(() => {
    onTier(initial)
  }, [initial, onTier])
  return null
}

export default function Scene() {
  const [tier, setTier] = useState<Quality>('high')
  const setQuality = useStore((s) => s.setQuality)
  const t = CONFIG.tiers[tier]

  const handleTier = useCallback(
    (q: Quality) => {
      applyTier(q)
      setTier(q)
      setQuality(q)
    },
    [setQuality],
  )
  const decline = useCallback(
    () =>
      setTier((q) => {
        const n: Quality = q === 'high' ? 'medium' : 'low'
        applyTier(n)
        setQuality(n)
        return n
      }),
    [setQuality],
  )
  const incline = useCallback(
    () =>
      setTier((q) => {
        const n: Quality = q === 'low' ? 'medium' : 'high'
        applyTier(n)
        setQuality(n)
        return n
      }),
    [setQuality],
  )

  return (
    <Canvas
      className="canvas"
      dpr={t.dpr}
      performance={{ min: 0.5, max: 1, debounce: 200 }}
      frameloop="always"
      gl={{ antialias: tier !== 'low', alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: CONFIG.camera.position, fov: CONFIG.camera.fov }}
    >
      <color attach="background" args={[CONFIG.colors.background]} />
      <fog attach="fog" args={[CONFIG.colors.fog, CONFIG.fog.near, CONFIG.fog.far]} />

      <Suspense fallback={null}>
        <QualityController onTier={handleTier} />
        <PreloadAssets />
        {/* key={tier} remounts to rebuild the GPGPU buffers at the new count */}
        <ParticleField key={tier} />
        <Carousel />
      </Suspense>

      <CameraRig />
      <Effects />

      <PerformanceMonitor
        onDecline={decline}
        onIncline={incline}
        flipflops={3}
        onFallback={() => handleTier('low')}
      />
      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />
    </Canvas>
  )
}
