import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Float, Sparkles, GradientTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Group, MathUtils } from 'three'
import { GlassCard } from './GlassCard'
import { ACT2 } from './content2'
import { scrollState } from './scrollState'

const CARDS = ACT2.capabilities
const SPACING = 2.75
// push the whole constellation right on desktop so it clears the text column
const FIELD_X = typeof window !== 'undefined' && window.innerWidth < 860 ? 0 : 1.7

const prefersReduced =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Soft colour field far behind the cards — content for the glass to refract. */
function Backdrop() {
  return (
    <mesh position={[0, 0, -4.5]} scale={[34, 20, 1]}>
      <planeGeometry />
      <meshBasicMaterial toneMapped={false} depthWrite={false}>
        <GradientTexture
          stops={[0, 0.35, 0.62, 1]}
          colors={['#06101c', '#0f6b60', '#4a37a0', '#7a1f4e']}
          size={512}
        />
      </meshBasicMaterial>
    </mesh>
  )
}

/** Lays the cards on a horizontal rail and slides it with scroll progress. */
function CardField() {
  const refs = useRef<(Group | null)[]>([])
  const root = useRef<Group>(null)
  const cursor = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    // target rail cursor from scroll progress (0..n-1)
    const target = scrollState.galleryProgress * (CARDS.length - 1)
    cursor.current = prefersReduced
      ? target
      : MathUtils.damp(cursor.current, target, 5, dt)
    scrollState.active = Math.round(cursor.current)

    const t = performance.now() / 1000
    for (let i = 0; i < CARDS.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      const d = i - cursor.current // signed distance from focus
      const ad = Math.abs(d)
      const focus = MathUtils.clamp(1 - ad * 0.55, 0, 1)
      g.position.x = MathUtils.damp(g.position.x, d * SPACING, 8, dt)
      g.position.z = MathUtils.damp(g.position.z, -ad * 1.35 + focus * 0.6, 8, dt)
      g.position.y = MathUtils.damp(
        g.position.y,
        Math.sin(d * 0.9) * 0.25 + (prefersReduced ? 0 : Math.sin(t * 0.6 + i) * 0.05),
        8,
        dt,
      )
      g.rotation.y = MathUtils.damp(g.rotation.y, d * -0.16, 8, dt)
      const s = 0.7 + focus * 0.55
      g.scale.setScalar(MathUtils.damp(g.scale.x, s, 8, dt))
    }

    // whole-field parallax from pointer + a slow idle drift
    if (root.current) {
      const px = scrollState.pointerX
      const py = scrollState.pointerY
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, px * 0.18, 4, dt)
      root.current.rotation.x = MathUtils.damp(root.current.rotation.x, -py * 0.12, 4, dt)
      root.current.position.x = MathUtils.damp(root.current.position.x, FIELD_X + px * 0.4, 4, dt)
    }
  })

  return (
    <group ref={root}>
      {CARDS.map((c, i) => (
        <group key={c.id} ref={(el) => (refs.current[i] = el)}>
          <Float
            enabled={!prefersReduced}
            speed={1.1}
            rotationIntensity={0.25}
            floatIntensity={0.4}
            floatingRange={[-0.06, 0.06]}
          >
            <GlassCard colorA={c.a} colorB={c.b} focus={i === scrollState.active ? 1 : 0.3} />
          </Float>
        </group>
      ))}
    </group>
  )
}

export function GlassGallery() {
  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.25]}
      camera={{ position: [0, 0, 7.5], fov: 38 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 5, 6]} intensity={40} color="#9affe6" distance={30} decay={2} />
      <pointLight position={[-5, -3, 4]} intensity={30} color="#9b8cff" distance={30} decay={2} />

      {/* studio light shapes the glass reflections — rendered once, no network HDRI */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 3, 4]} scale={[8, 3, 1]} color="#27f2c0" />
        <Lightformer form="rect" intensity={2.4} position={[-5, -1, 3]} scale={[5, 6, 1]} color="#7c5cff" />
        <Lightformer form="rect" intensity={2.2} position={[5, -2, 2]} scale={[5, 6, 1]} color="#ff3d7f" />
        <Lightformer form="circle" intensity={3} position={[0, 0, -6]} scale={[10, 10, 1]} color="#0a1830" />
      </Environment>

      <Backdrop />
      <CardField />

      <Sparkles count={44} scale={[14, 8, 6]} size={2.2} speed={0.3} opacity={0.5} color="#9affe6" />

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.2} luminanceSmoothing={0.85} />
      </EffectComposer>
    </Canvas>
  )
}
