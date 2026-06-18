import { useTexture } from '@react-three/drei'
import heroUrl from '../assets/hero.png'

/**
 * Mounted INSIDE <Canvas><Suspense> — routes a real texture through
 * three's DefaultLoadingManager so drei's useProgress has total > 0 and
 * the preloader bar reflects genuine asset loading. Suspends until ready.
 * Add more real assets here (textures, GLTFs) as the site grows.
 */
export function PreloadAssets() {
  useTexture(heroUrl)
  return null
}
