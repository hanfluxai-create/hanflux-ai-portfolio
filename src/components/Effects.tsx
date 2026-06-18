import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { CONFIG } from '../config/config'
import { useStore } from '../store/store'

/**
 * Neon-glow pipeline, gated by the active quality tier (read from the store so
 * this re-renders when the perf system steps the tier). Bloom + a whisper of
 * chromatic aberration drop out on weaker GPUs; the vignette always stays.
 */
export function Effects() {
  const quality = useStore((s) => s.quality)
  const t = CONFIG.tiers[quality]

  return (
    <EffectComposer>
      {t.bloom ? (
        <Bloom
          intensity={CONFIG.bloom.intensity}
          luminanceThreshold={CONFIG.bloom.luminanceThreshold}
          luminanceSmoothing={CONFIG.bloom.luminanceSmoothing}
          mipmapBlur={CONFIG.bloom.mipmapBlur}
        />
      ) : (
        <></>
      )}
      {t.chromaticAberration ? (
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new Vector2(CONFIG.chromaticAberration.offset, CONFIG.chromaticAberration.offset)}
          radialModulation={false}
          modulationOffset={0}
        />
      ) : (
        <></>
      )}
      <Vignette offset={CONFIG.vignette.offset} darkness={CONFIG.vignette.darkness} eskil={false} />
    </EffectComposer>
  )
}
