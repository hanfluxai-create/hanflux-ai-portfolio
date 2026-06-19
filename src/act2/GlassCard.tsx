import { useMemo } from 'react'
import { RoundedBox, GradientTexture } from '@react-three/drei'
import { Color, AdditiveBlending, Shape, BufferGeometry, Vector3 } from 'three'

/**
 * A single floating glass capability "module" — frosted iridescent glass.
 * Deliberately NOT using transmission: a transmission pass is a full extra
 * scene render per frame, and stacked on Act I's always-on GPGPU field it
 * stalls the GPU. Instead: a transparent physical material (frost via roughness)
 * + iridescence (oil-slick sheen) + clearcoat (glossy env reflections) reads as
 * glass for ~free. A colored backing plane shows through to give each its hue;
 * the additive rim is what Bloom turns into the neon halo.
 */
function roundedRectPoints(w: number, h: number, r: number) {
  const x = -w / 2
  const y = -h / 2
  const s = new Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  const pts = s.getPoints(80).map((p) => new Vector3(p.x, p.y, 0))
  return new BufferGeometry().setFromPoints(pts)
}

export function GlassCard({
  w = 1.6,
  h = 2.1,
  colorA = '#27F2C0',
  colorB = '#0c5c5a',
  focus = 0, // 0..1, how "selected" this card is — drives glow intensity
}: {
  w?: number
  h?: number
  colorA?: string
  colorB?: string
  focus?: number
}) {
  const atten = useMemo(() => new Color(colorA), [colorA])
  const tint = useMemo(() => new Color('#e2ecff'), [])
  const rim = useMemo(() => roundedRectPoints(w, h, 0.12), [w, h])

  return (
    <group>
      {/* colored core — shows through the frosted glass to give each its hue */}
      <mesh position={[0, 0, -0.04]}>
        <planeGeometry args={[w * 0.9, h * 0.9]} />
        <meshBasicMaterial
          transparent
          opacity={0.32 + focus * 0.3}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        >
          <GradientTexture attach="map" stops={[0, 1]} colors={[colorA, colorB]} size={256} />
        </meshBasicMaterial>
      </mesh>

      {/* the glass slab — frosted iridescent, no transmission pass */}
      <RoundedBox args={[w, h, 0.16]} radius={0.12} smoothness={5} bevelSegments={4} creaseAngle={0.5}>
        <meshPhysicalMaterial
          transparent
          opacity={0.6}
          roughness={0.3}
          metalness={0}
          ior={1.3}
          clearcoat={1}
          clearcoatRoughness={0.16}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[120, 560]}
          color={tint}
          attenuationColor={atten}
          envMapIntensity={1.5}
          emissive={atten}
          emissiveIntensity={0.05 + focus * 0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </RoundedBox>

      {/* crisp neon rim — additive line the bloom catches */}
      <lineLoop position={[0, 0, 0.085]} geometry={rim}>
        <lineBasicMaterial
          color={colorA}
          transparent
          opacity={0.4 + focus * 0.6}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </lineLoop>
    </group>
  )
}
