import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Points,
  type PointsMaterial,
} from 'three'
import { CONFIG } from '../config/config'

/**
 * Phase 0 backdrop: a soft volumetric shell of GPU points graded
 * teal -> ultraviolet, with sparse pink flares. Rotates slowly and
 * parallaxes toward the pointer. Phase 2 replaces this with a true
 * GPGPU/FBO simulation; the visual language is established here.
 */
export function ParticleField() {
  const ref = useRef<Points>(null!)
  const matRef = useRef<PointsMaterial>(null!)
  const { pointer } = useThree()

  const geometry = useMemo(() => {
    const { count, radius, sparkChance } = CONFIG.particles
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const cA = new Color(CONFIG.colors.particleA)
    const cB = new Color(CONFIG.colors.particleB)
    const cC = new Color(CONFIG.colors.particleC)
    const tmp = new Color()

    for (let i = 0; i < count; i++) {
      // cbrt for uniform volume fill, biased outward for a glowing shell
      const r = radius * Math.cbrt(Math.random()) * (0.65 + Math.random() * 0.35)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      const t = Math.min(r / radius, 1)
      tmp.copy(cA).lerp(cB, t)
      if (Math.random() < sparkChance) tmp.lerp(cC, 0.7)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }

    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return g
  }, [])

  useFrame((_, dt) => {
    const p = ref.current
    if (!p) return
    const { rotationSpeed, pointerInfluence, size } = CONFIG.particles
    p.rotation.y += dt * rotationSpeed
    p.rotation.x += dt * rotationSpeed * 0.35
    // eased parallax toward the cursor
    p.position.x += (pointer.x * pointerInfluence - p.position.x) * 0.045
    p.position.y += (pointer.y * pointerInfluence * 0.7 - p.position.y) * 0.045
    // live size from the debug panel
    if (matRef.current) matRef.current.size = size
  })

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        vertexColors
        size={CONFIG.particles.size}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}
