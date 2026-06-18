import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { CONFIG } from '../config/config'

/**
 * The neon-glow pipeline: bloom for the light bleed, a whisper of
 * chromatic aberration for the cinematic lens feel, and a vignette
 * to focus the eye on the void's center.
 */
export function Effects() {
  return (
    <EffectComposer>
      <Bloom
        intensity={CONFIG.bloom.intensity}
        luminanceThreshold={CONFIG.bloom.luminanceThreshold}
        luminanceSmoothing={CONFIG.bloom.luminanceSmoothing}
        mipmapBlur={CONFIG.bloom.mipmapBlur}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={new Vector2(CONFIG.chromaticAberration.offset, CONFIG.chromaticAberration.offset)}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette
        offset={CONFIG.vignette.offset}
        darkness={CONFIG.vignette.darkness}
        eskil={false}
      />
    </EffectComposer>
  )
}
