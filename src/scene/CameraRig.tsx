import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Object3D, Vector3 } from 'three'
import { CONFIG } from '../config/config'
import { useStore } from '../store/store'

/**
 * Module-singleton proxy the intro timeline (useIntro) tweens with GSAP.
 * CameraRig copies it onto the live camera each frame during the intro,
 * then hands control to the section-based fly-to easing once loaded.
 */
export const introProxy = new Object3D()

export function CameraRig() {
  const { camera } = useThree()
  const target = useMemo(() => new Vector3(), [])

  // seed the proxy pushed back (z = config z + 6) for the dolly-in
  useMemo(() => {
    introProxy.position.set(
      CONFIG.camera.position[0],
      CONFIG.camera.position[1],
      CONFIG.camera.position[2] + 6,
    )
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const st = useStore.getState()

    if (!st.loaded) {
      // intro phase: GSAP drives introProxy.z; we mirror it onto the camera
      camera.position.copy(introProxy.position)
    } else {
      // settled phase: ease toward the active section's framing
      const c = CONFIG.cam[st.section] ?? CONFIG.cam.intro
      target.set(c[0], c[1], c[2])
      camera.position.lerp(target, 1 - Math.exp(-3 * dt))
      if (st.flyTo && camera.position.distanceTo(target) < 0.025) st.clearFlyTo()
    }

    camera.lookAt(0, 0, 0)
  })

  return null
}
