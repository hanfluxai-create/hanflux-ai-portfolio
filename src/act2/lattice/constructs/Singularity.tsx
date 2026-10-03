/* ============================================================================
   STATION 12 — SINGULARITY: the end of the corridor.

   The last object in the Lattice and the doorway to the Portal's tunnel of
   blue light. From far off it is a single cyan star with diffraction spikes
   at the vanishing point. As the camera closes in it blooms into a white-hot
   core wrapped in a tilted accretion disc whose spiral arms pour inward, a
   starburst of flickering rays, a photon ring, an anamorphic lens streak,
   and streaks of light funnelling past the camera into it: you are being
   pulled in.

   5 draw calls, all motion in shaders. Brightness ramps hard with proximity
   but is capped so Bloom glows instead of whiting the frame out. The core
   passes use a thinner fog (fogVisK) so the star reads as a beacon down the
   corridor instead of vanishing into the murk.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Group,
  type IUniform,
  type Mesh,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  isNear,
  mulberry32,
  proximity,
  worldState,
  worldUniforms,
  type ConstructProps,
  type LatticeTier,
} from '../shared'

const TAU = Math.PI * 2
const GLOW = 26 // half-size of the camera-facing glow billboard
const RAYS = 60
const HERO_RAYS = 6 // steady hexagonal diffraction spikes; the rest flicker

// fog visibility at a fraction of the world density: a beacon cuts through haze
const BEACON = /* glsl */ `
float fogVisK(float k) {
  float f = uFogDensity * k * vFogDepth;
  return exp(-f * f);
}
`

/* --- shaders --------------------------------------------------------------- */

// fresnel core: white-hot face, cyan limb, slow plasma churn
const CORE_V = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${FOG_VERT_PARS}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const CORE_F = /* glsl */ `
uniform float uT;
uniform float uI;
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${FOG_FRAG_PARS}
${BEACON}
void main() {
  float facing = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float plasma = sin(vP.x * 1.7 + uT * 1.1) * sin(vP.y * 2.3 - uT * 0.9) * sin(vP.z * 1.9 + uT * 1.3);
  vec3 rim = uColor * (1.5 + 0.5 * plasma);
  vec3 heart = vec3(1.0) * (2.5 + 0.35 * plasma);
  vec3 col = mix(rim, heart, pow(facing, 1.3)) + uColor * pow(1.0 - facing, 3.0) * 1.2;
  gl_FragColor = vec4(col * uI * fogVisK(0.45), 1.0);
}
`

// camera-facing glow: broad haze + tight halo + photon ring + lens streak
const GLOW_V = /* glsl */ `
varying vec2 vQ;
${FOG_VERT_PARS}
void main() {
  vQ = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const GLOW_F = /* glsl */ `
uniform float uT;
uniform float uP;
uniform float uI;
uniform vec3 uColor;
varying vec2 vQ;
${FOG_FRAG_PARS}
${BEACON}
void main() {
  float r = length(vQ);
  // haze grows from a small aura to most of the frame, peak kept under bloom-white
  float reach = mix(0.32, 1.0, uP);
  float haze = pow(max(1.0 - r / reach, 0.0), 2.6) * mix(0.26, 0.95, uP * uP);
  float halo = exp(-r * r * mix(110.0, 60.0, uP)) * mix(1.5, 2.3, uP);
  float rd = (r - mix(0.13, 0.15, uP)) * 70.0;
  float ring = exp(-rd * rd) * 0.8;
  float streak = exp(-abs(vQ.y) * mix(220.0, 120.0, uP))
    * pow(max(1.0 - abs(vQ.x), 0.0), 2.0) * mix(0.55, 1.2, uP);
  float pulse = 0.93 + 0.07 * sin(uT * 2.7);
  vec3 col = mix(uColor, vec3(1.0), 0.3) * haze
    + mix(uColor, vec3(1.0), 0.6) * halo * pulse
    + uColor * 1.4 * ring
    + mix(uColor, vec3(1.0), 0.25) * streak;
  gl_FragColor = vec4(col * uI * fogVisK(0.45), 1.0);
}
`

// starburst: thin tapered quads in the billboard plane, slowly turning
const RAY_V = /* glsl */ `
uniform float uT;
uniform float uP;
uniform float uDpr;
uniform vec2 uRes;
attribute vec4 aRay; // angle, seed, length factor, half-width
varying vec2 vR;
varying float vK;
${FOG_VERT_PARS}
void main() {
  float hero = step(1.2, aRay.z);
  float fl = 0.62 + 0.38 * sin(uT * (0.9 + aRay.y * 2.3) + aRay.y * 40.0)
    * sin(uT * (0.37 + aRay.y) + aRay.y * 13.0);
  fl = mix(fl, 0.9 + 0.1 * sin(uT * 1.7 + aRay.x * 3.0), hero);
  float ang = aRay.x + uT * mix(0.03, 0.012, hero);
  float len = mix(7.0, 36.0, uP) * aRay.z * fl;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 side = vec2(-dir.y, dir.x);
  // no MSAA in this pipeline: hold every ray at >= ~1.2 device px wide and dim
  // it by the same factor, so thin rays far down the corridor glow steadily
  // instead of crawling as sub-pixel slivers
  float depth = max(-(modelViewMatrix * vec4(position, 1.0)).z, 1.0);
  float px = 2.0 * depth / (projectionMatrix[1][1] * max(uRes.y * uDpr, 360.0));
  float w0 = aRay.w * mix(0.7, 1.0, uP) * (1.0 - 0.85 * uv.x);
  float w = max(w0, 0.6 * px);
  vec2 xy = dir * (1.6 + uv.x * len) + side * (uv.y * w);
  vec4 mv = modelViewMatrix * vec4(position + vec3(xy, 0.0), 1.0);
  gl_Position = projectionMatrix * mv;
  vR = uv;
  vK = mix(mix(0.45, 1.0, fract(aRay.y * 5.3)), 1.0, hero) * fl * (w0 / w);
  vFogDepth = -mv.z;
}
`
const RAY_F = /* glsl */ `
uniform float uI;
uniform vec3 uColor;
varying vec2 vR;
varying float vK;
${FOG_FRAG_PARS}
${BEACON}
void main() {
  float a = pow(max(1.0 - vR.x, 0.0), 1.8) * max(1.0 - vR.y * vR.y, 0.0) * vK;
  vec3 col = mix(vec3(1.6), uColor * 1.3, smoothstep(0.0, 0.45, vR.x));
  gl_FragColor = vec4(col * a * uI * fogVisK(0.45), 1.0);
}
`

// accretion disc: particles wind inward along spiral arms, respawning at the rim
const DISC_V = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uDpr;
uniform vec3 uColor;
uniform vec3 uDeep;
attribute float aRadius;
attribute float aAngle;
attribute float aSpeed;
attribute float aSeed;
varying vec3 vCol;
varying float vA;
${FOG_VERT_PARS}
void main() {
  float life = fract(uT * aSpeed + aSeed);
  float r = mix(26.0, 4.0, pow(life, 0.72)) * aRadius;
  float ang = aAngle + uT * 0.05 + 16.34 * life * life; // ~2.6 turns on the way in
  float h = (fract(aSeed * 17.31) - 0.5) * (0.15 + 0.05 * r);
  vec4 mv = modelViewMatrix * vec4(position + vec3(cos(ang) * r, h, sin(ang) * r), 1.0);
  gl_Position = projectionMatrix * mv;
  float inner = smoothstep(17.0, 4.0, r);
  float beam = 0.7 + 0.5 * sin(ang + 0.9); // one flank brighter, like Doppler beaming
  vec3 c = mix(uDeep, uColor, smoothstep(26.0, 14.0, r));
  c = mix(c, vec3(1.0), inner * inner * 0.7);
  vCol = c * (0.95 + 2.0 * inner) * beam * uI;
  float ps = (1.8 + 2.6 * inner + 1.6 * fract(aSeed * 7.7)) * uDpr * (60.0 / max(-mv.z, 1.0));
  vA = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.86, 1.0, life)) * clamp(ps, 0.0, 1.0);
  gl_PointSize = clamp(ps, 1.0, 20.0 * uDpr);
  vFogDepth = -mv.z;
}
`
const DISC_F = /* glsl */ `
varying vec3 vCol;
varying float vA;
${FOG_FRAG_PARS}
${BEACON}
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d2 = dot(q, q) * 4.0;
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vCol * exp(-d2 * 3.5) * vA * fogVisK(0.6), 1.0);
}
`

// infall: light streaks funnelling from around the camera into the core;
// they stretch with scroll speed (uVel) for a warp feel
const STREAK_V = /* glsl */ `
uniform float uT;
uniform float uVel;
attribute float aEnd;
attribute vec4 aStreak; // angle, outer radius, speed, seed
varying float vA;
${FOG_VERT_PARS}
void main() {
  float life = fract(uT * aStreak.z + aStreak.w);
  float zHead = mix(74.0, 3.0, life);
  float len = (2.5 + 7.0 * fract(aStreak.w * 9.7)) * (1.0 + 1.5 * clamp(uVel, 0.0, 2.0));
  float z = zHead + aEnd * len;
  float k = clamp(z / 74.0, 0.0, 1.0);
  float r = mix(3.4, aStreak.y, pow(k, 0.6));
  float ang = aStreak.x + z * 0.014;
  vec4 mv = modelViewMatrix * vec4(position + vec3(cos(ang) * r, sin(ang) * r, z), 1.0);
  gl_Position = projectionMatrix * mv;
  vA = (1.0 - aEnd) * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.82, 1.0, life))
    * smoothstep(4.0, 26.0, -mv.z); // thin out as they brush past the lens
  vFogDepth = -mv.z;
}
`
const STREAK_F = /* glsl */ `
uniform float uP;
uniform float uI;
uniform vec3 uColor;
varying float vA;
${FOG_FRAG_PARS}
${BEACON}
void main() {
  float show = smoothstep(0.2, 0.95, uP);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4) * 0.85 * vA * show * uI * fogVisK(0.6), 1.0);
}
`

/* --- build ----------------------------------------------------------------- */

function buildSingularity(accent: string, tier: LatticeTier) {
  const mobile = tier === 'mobile'
  const rand = mulberry32(0x5196a7)

  const u = {
    uT: { value: 0 },
    uP: { value: 0 },
    uI: { value: 0.35 },
    uColor: { value: new Color(accent) },
    uDeep: { value: new Color('#1f5cff') },
  }
  const mat = (vertexShader: string, fragmentShader: string, extra: Record<string, IUniform> = {}) =>
    new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...worldUniforms, ...u, ...extra },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      fog: false,
    })

  const coreGeo = new SphereGeometry(3, mobile ? 40 : 64, mobile ? 28 : 40)
  const glowGeo = new PlaneGeometry(GLOW * 2, GLOW * 2)

  // rays: 4 verts per quad, (u along, v across) in the uv slot
  const rayPos = new Float32Array(RAYS * 4 * 3)
  const rayUv = new Float32Array(RAYS * 4 * 2)
  const rayAttr = new Float32Array(RAYS * 4 * 4)
  const rayIdx = new Uint16Array(RAYS * 6)
  const corners = [0, -1, 0, 1, 1, -1, 1, 1]
  for (let i = 0; i < RAYS; i++) {
    const hero = i < HERO_RAYS
    const angle = hero ? (i / HERO_RAYS) * TAU + 0.26 : rand() * TAU
    const seed = rand()
    const lenK = hero ? 1.45 : 0.35 + rand() * 0.65
    const halfW = hero ? 0.22 : 0.05 + rand() * 0.09
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c
      rayUv[v * 2] = corners[c * 2]
      rayUv[v * 2 + 1] = corners[c * 2 + 1]
      rayAttr[v * 4] = angle
      rayAttr[v * 4 + 1] = seed
      rayAttr[v * 4 + 2] = lenK
      rayAttr[v * 4 + 3] = halfW
    }
    const o = i * 4
    rayIdx.set([o, o + 2, o + 1, o + 2, o + 3, o + 1], i * 6) // CCW toward the camera
  }
  const rayGeo = new BufferGeometry()
  rayGeo.setAttribute('position', new BufferAttribute(rayPos, 3))
  rayGeo.setAttribute('uv', new BufferAttribute(rayUv, 2))
  rayGeo.setAttribute('aRay', new BufferAttribute(rayAttr, 4))
  rayGeo.setIndex(new BufferAttribute(rayIdx, 1))

  // disc: three spiral arms plus an even scatter between them
  const nDisc = mobile ? 1200 : 3000
  const dRadius = new Float32Array(nDisc)
  const dAngle = new Float32Array(nDisc)
  const dSpeed = new Float32Array(nDisc)
  const dSeed = new Float32Array(nDisc)
  for (let i = 0; i < nDisc; i++) {
    const arm = Math.floor(rand() * 3)
    dAngle[i] = rand() < 0.35 ? rand() * TAU : (arm / 3) * TAU + (rand() - rand()) * 0.9
    dRadius[i] = 0.88 + rand() * 0.24
    dSpeed[i] = 0.018 + rand() * 0.027
    dSeed[i] = rand()
  }
  const discGeo = new BufferGeometry()
  discGeo.setAttribute('position', new BufferAttribute(new Float32Array(nDisc * 3), 3))
  discGeo.setAttribute('aRadius', new BufferAttribute(dRadius, 1))
  discGeo.setAttribute('aAngle', new BufferAttribute(dAngle, 1))
  discGeo.setAttribute('aSpeed', new BufferAttribute(dSpeed, 1))
  discGeo.setAttribute('aSeed', new BufferAttribute(dSeed, 1))

  // infall streaks: 2 verts each (head, tail)
  const nStreak = mobile ? 120 : 260
  const sEnd = new Float32Array(nStreak * 2)
  const sAttr = new Float32Array(nStreak * 2 * 4)
  for (let i = 0; i < nStreak; i++) {
    const angle = rand() * TAU
    const radius = 5 + rand() * 14
    const speed = 0.08 + rand() * 0.08
    const seed = rand()
    for (let e = 0; e < 2; e++) {
      const v = i * 2 + e
      sEnd[v] = e
      sAttr[v * 4] = angle
      sAttr[v * 4 + 1] = radius
      sAttr[v * 4 + 2] = speed
      sAttr[v * 4 + 3] = seed
    }
  }
  const streakGeo = new BufferGeometry()
  streakGeo.setAttribute('position', new BufferAttribute(new Float32Array(nStreak * 2 * 3), 3))
  streakGeo.setAttribute('aEnd', new BufferAttribute(sEnd, 1))
  streakGeo.setAttribute('aStreak', new BufferAttribute(sAttr, 4))

  const coreMat = mat(CORE_V, CORE_F)
  const glowMat = mat(GLOW_V, GLOW_F)
  const rayMat = mat(RAY_V, RAY_F)
  // the billboard (half-size 26) and the spikes (~54 long) reach far below the
  // opaque, depth-writing floor at y = -10; depth-tested, the floor in front
  // slices the halo and the downward rays off along a hard horizon line. They
  // are lens light, so let them wash over the floor. Every other Lattice pass
  // is additive with no depth writes, so nothing else changes.
  glowMat.depthTest = false
  rayMat.depthTest = false
  const discMat = mat(DISC_V, DISC_F)
  const streakMat = mat(STREAK_V, STREAK_F)

  const geos = [coreGeo, glowGeo, rayGeo, discGeo, streakGeo]
  const mats = [coreMat, glowMat, rayMat, discMat, streakMat]

  return {
    u,
    coreGeo,
    glowGeo,
    rayGeo,
    discGeo,
    streakGeo,
    coreMat,
    glowMat,
    rayMat,
    discMat,
    streakMat,
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
    },
  }
}

/* --- component ------------------------------------------------------------- */

export function SingularityConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const face = useRef<Group>(null) // camera-facing: glow + starburst
  const core = useRef<Mesh>(null)

  const b = useMemo(() => buildSingularity(accent, tier), [accent, tier])
  useEffect(() => () => b.dispose(), [b])

  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    if (!isNear(station, 4.5)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station, 2.5)
    const t = worldState.time
    const u = b.u
    u.uT.value = t
    u.uP.value = p
    // distant star -> blinding destination; the curve keeps it restrained until the end
    u.uI.value = 0.35 + 0.65 * Math.pow(p, 1.4)

    face.current?.quaternion.copy(camera.quaternion)
    core.current?.scale.setScalar((0.85 + 0.15 * p) * (1 + 0.03 * Math.sin(t * 2.7)))
  })

  return (
    <group ref={root} position={position}>
      <mesh ref={core} geometry={b.coreGeo} material={b.coreMat} />
      <group rotation={[0.38, 0, 0.14]}>
        <points geometry={b.discGeo} material={b.discMat} frustumCulled={false} />
      </group>
      <lineSegments geometry={b.streakGeo} material={b.streakMat} frustumCulled={false} />
      <group ref={face}>
        <mesh geometry={b.glowGeo} material={b.glowMat} />
        <mesh geometry={b.rayGeo} material={b.rayMat} frustumCulled={false} />
      </group>
    </group>
  )
}
