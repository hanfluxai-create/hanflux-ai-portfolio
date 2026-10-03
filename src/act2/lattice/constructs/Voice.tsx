/* ============================================================================
   STATION 1 — AI Voice Agents: the SONIC CORE.

   A globe of 28 latitude rings that speaks. Each ring's radius is pushed out
   by a travelling voice waveform, gated into "syllables" whose loudness rolls
   pole to pole, so speech visibly washes across the agent. Around it a
   mirrored radial equalizer (low formants face the viewer) and a bezel of
   guide rings; sound-wave ripples leave toward the camera; a white-hot core
   swells on every syllable and a few dozen sparkles orbit.

   Proximity is the call connecting: amplitude, ripple strength and overall
   energy climb from an idle murmur (~0.35) to full voice when parked here.

   6 draw calls: sphere, equalizer, guide rings, ripples, sparkles, core.
   All motion lives in the vertex shaders off one shared uniform block.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
  type Group,
  type IUniform,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  HASH,
  hot,
  isNear,
  mulberry32,
  proximity,
  worldState,
  worldUniforms,
  type ConstructProps,
  type LatticeTier,
} from '../shared'

const TAU = Math.PI * 2
const R = 3.4 // sphere radius
const RINGS = 28
const LAT_SPAN = 2.9 // radians pole-to-pole the rings cover (keeps the poles open)
const EQ_R = 5.6 // equalizer ring radius
const BEZEL_R = 6.3

/* --- GLSL ------------------------------------------------------------------ */

// Syllable envelope shared by every layer so the whole construct speaks in
// sync. k (0..1) is the position along the speech front: the burst travels.
const SPEECH = /* glsl */ `
float syllable(float t, float k) {
  float s = t * 2.4 - k * 1.6;
  float id = floor(s);
  float f = fract(s);
  float loud = hash11(id * 7.13 + 3.1);
  float gate = smoothstep(0.22, 0.34, loud);
  float shape = sin(3.14159265 * f);
  shape *= shape;
  float phrase = 0.62 + 0.38 * sin(t * 0.53);
  return (0.14 + 0.86 * loud * gate * shape) * phrase;
}
`

// The bezel, equalizer limb, ripples and outer sparkles reach x ~ 0..2.4 of the
// flight path, so the camera brushes through them on the way past. Fade
// anything closer than a few units instead of letting it smear across the
// lens. (Never engages when parked: everything is 15+ units away then.)
// Must follow FOG_FRAG_PARS (reads vFogDepth).
const NEAR = /* glsl */ `
float nearFade(){ return smoothstep(0.8, 4.0, vFogDepth); }
`

const SPHERE_VERT = /* glsl */ `
uniform float uT;
uniform float uAmp;
attribute float aRing;
attribute float aAngle;
varying float vDisp;
varying float vEnv;
varying float vFace;
${FOG_VERT_PARS}
${HASH}
${SPEECH}
void main() {
  vec3 n = normalize(position);
  float env = syllable(uT, aRing);
  float w = sin(aAngle * 5.0 + uT * 3.1 + aRing * 9.0) * 0.55
    + sin(aAngle * 9.0 - uT * 4.3 + aRing * 15.0) * 0.28
    + sin(aAngle * 16.0 + uT * 7.7 - aRing * 21.0) * 0.1;
  float calm = sqrt(max(0.0, 1.0 - n.y * n.y)); // poles stay quieter
  float d = w * env * uAmp * (0.25 + 0.65 * calm);
  vec4 mv = modelViewMatrix * vec4(position + n * d, 1.0);
  vec3 vn = normalize((modelViewMatrix * vec4(n, 0.0)).xyz);
  vFace = dot(vn, normalize(-mv.xyz));
  vDisp = d;
  vEnv = env;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const SPHERE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uEnergy;
varying float vDisp;
varying float vEnv;
varying float vFace;
${FOG_FRAG_PARS}
void main() {
  float face = mix(0.4, 1.0, smoothstep(-0.35, 0.45, vFace));
  float a = abs(vDisp);
  vec3 col = uColor * (0.55 + 0.6 * vEnv);
  col += uHot * smoothstep(0.1, 0.7, a) * 0.9;
  col = mix(col, vec3(1.8, 2.1, 2.0), smoothstep(0.65, 1.0, a) * 0.4);
  gl_FragColor = vec4(col * face * uEnergy * fogVis(), 1.0);
}
`

// Camera-facing bars mirrored about the ring plane; heights from a fake
// spectrum that is symmetric about the side facing +Z (low bins up front).
const EQ_VERT = /* glsl */ `
uniform float uT;
uniform float uAmp;
uniform float uBars;
uniform float uHalfW;
attribute float aBar;
attribute vec2 aCorner;
varying float vY;
varying float vH;
varying float vBand;
varying float vFacing;
${FOG_VERT_PARS}
${HASH}
${SPEECH}
void main() {
  float u = (aBar + 0.5) / uBars;
  float band = abs(fract(u - 0.25 + 0.5) - 0.5) * 2.0;
  float halfN = floor(uBars * 0.5);
  float bin = floor(band * halfN + 0.5);
  float bt = uT * 7.0;
  float i0 = floor(bt);
  float n = mix(
    hash11(bin * 3.71 + i0 * 1.37),
    hash11(bin * 3.71 + (i0 + 1.0) * 1.37),
    smoothstep(0.0, 1.0, fract(bt))
  );
  float syl = syllable(uT, 0.5);
  float tilt = 1.0 - 0.55 * band;
  float h = 0.1 + (0.18 + 2.0 * n * n * tilt) * (0.25 + 0.75 * syl) * uAmp;
  float y = aCorner.y * h;
  vec4 mv = modelViewMatrix * vec4(position.x, position.y + y, position.z, 1.0);
  mv.x += aCorner.x * uHalfW;
  // bars bunch up where the ring turns edge-on (the limbs): dim them there
  vec3 rv = normalize((modelViewMatrix * vec4(position.x, 0.0, position.z, 0.0)).xyz);
  vFacing = abs(dot(rv, normalize(-mv.xyz)));
  vY = y;
  vH = h;
  vBand = band;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const EQ_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uEnergy;
varying float vY;
varying float vH;
varying float vBand;
varying float vFacing;
${FOG_FRAG_PARS}
${NEAR}
void main() {
  float ay = abs(vY);
  float seg = step(0.3, fract(ay * 5.5)); // LED segments
  float rel = ay / max(vH, 0.001);
  float tip = smoothstep(0.82, 1.0, rel);
  vec3 col = uColor * (0.15 + 0.45 * rel) + uHot * tip * 0.55;
  col *= seg * uEnergy * (1.0 - 0.45 * vBand) * mix(0.3, 1.0, vFacing);
  gl_FragColor = vec4(col * fogVis() * nearFade(), 1.0);
}
`

// Annuli in the local XY plane that expand and fade: sound leaving the agent.
const RIPPLE_VERT = /* glsl */ `
uniform float uT;
uniform float uAmp;
attribute float aRipple;
attribute float aEdge;
attribute float aAngle;
varying float vEdge;
varying float vFade;
${FOG_VERT_PARS}
void main() {
  float ph = fract(uT * 0.3 + aRipple / 3.0);
  float grow = 1.0 - pow(1.0 - ph, 1.7);
  float r = mix(3.8, 8.6, grow);
  r += sin(aAngle * 12.0 + uT * 5.0 + aRipple * 2.1) * 0.09 * uAmp * (1.0 - ph);
  r += aEdge * mix(0.04, 0.15, ph);
  vec4 mv = modelViewMatrix * vec4(cos(aAngle) * r, sin(aAngle) * r, 0.0, 1.0);
  vFade = (1.0 - ph) * (1.0 - ph) * smoothstep(0.0, 0.08, ph);
  vEdge = aEdge;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const RIPPLE_FRAG = /* glsl */ `
uniform vec3 uHot;
uniform float uAmp;
uniform float uEnergy;
varying float vEdge;
varying float vFade;
${FOG_FRAG_PARS}
${NEAR}
void main() {
  float prof = exp(-vEdge * vEdge * 3.5);
  vec3 col = uHot * prof * vFade * (0.25 + 0.75 * uAmp) * 0.3;
  gl_FragColor = vec4(col * uEnergy * fogVis() * nearFade(), 1.0);
}
`

const SPARK_VERT = /* glsl */ `
uniform float uT;
uniform float uDpr;
attribute vec4 aOrbit; // radius, tilt, phase, angular speed
attribute vec2 aMeta; // yaw, size (px at ~19u)
varying float vTw;
${FOG_VERT_PARS}
void main() {
  float a = aOrbit.z + uT * aOrbit.w;
  vec3 p = vec3(cos(a) * aOrbit.x, 0.0, sin(a) * aOrbit.x);
  float ct = cos(aOrbit.y);
  float st = sin(aOrbit.y);
  p = vec3(p.x, -p.z * st, p.z * ct);
  float cy = cos(aMeta.x);
  float sy = sin(aMeta.x);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vTw = 0.3 + 0.7 * (0.5 + 0.5 * sin(uT * 2.7 + aOrbit.z * 11.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aMeta.y * (0.6 + 0.6 * vTw) * uDpr * (19.0 / -mv.z), 1.0, 40.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const SPARK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uEnergy;
varying float vTw;
${FOG_FRAG_PARS}
${NEAR}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float glow = 1.0 - smoothstep(0.0, 0.5, d);
  float pin = 1.0 - smoothstep(0.0, 0.14, d);
  vec3 col = uColor * glow * glow * 0.6 + uHot * pin * 0.6;
  gl_FragColor = vec4(col * vTw * uEnergy * fogVis() * nearFade(), 1.0);
}
`

// Billboarded quad: white-hot pinpoint + accent halo that swells per syllable.
const CORE_VERT = /* glsl */ `
uniform float uT;
uniform float uAmp;
varying vec2 vQ;
varying float vSyl;
${FOG_VERT_PARS}
${HASH}
${SPEECH}
void main() {
  vSyl = syllable(uT, 0.5) * uAmp;
  float s = 2.8 * (0.85 + 0.3 * vSyl);
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * s;
  vQ = position.xy * 2.0;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const CORE_FRAG = /* glsl */ `
uniform vec3 uHot;
uniform float uEnergy;
varying vec2 vQ;
varying float vSyl;
${FOG_FRAG_PARS}
void main() {
  float d = length(vQ);
  float core = exp(-d * d * 30.0);
  float halo = exp(-d * d * 6.0) * (0.12 + 0.18 * vSyl);
  float rr = (d - 0.62) * 16.0;
  float ring = exp(-rr * rr) * 0.1 * vSyl;
  vec3 col = uHot * (halo + ring) + vec3(2.2, 2.4, 2.3) * core * (0.55 + 0.45 * vSyl);
  col *= 1.0 - smoothstep(0.85, 1.0, d);
  gl_FragColor = vec4(col * uEnergy * fogVis(), 1.0);
}
`

/* --- build ----------------------------------------------------------------- */

type Uniforms = { [name: string]: IUniform }

function additive(uniforms: Uniforms, vertexShader: string, fragmentShader: string) {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  })
}

/** shader-displaced geometry: give culling an honest (padded) bound */
function bound(g: BufferGeometry, r: number) {
  g.boundingSphere = new Sphere(new Vector3(), r)
  return g
}

function buildVoice(accent: string, tier: LatticeTier) {
  const mobile = tier === 'mobile'
  const rand = mulberry32(0x0b01ce)

  // one uniform block shared (by reference) across every layer
  const u = {
    uT: { value: 0 },
    uAmp: { value: 0.22 },
    uEnergy: { value: 0.35 },
    uColor: { value: new Color(accent) },
    uHot: { value: hot(accent, 2.4) },
  }
  const uni = (extra: Uniforms = {}): Uniforms => ({ ...worldUniforms, ...u, ...extra })

  // --- sphere: latitude rings as one LineSegments ---------------------------
  const SEG = mobile ? 64 : 128
  const sN = RINGS * SEG * 2
  const sPos = new Float32Array(sN * 3)
  const sRing = new Float32Array(sN)
  const sAng = new Float32Array(sN)
  let v = 0
  for (let r = 0; r < RINGS; r++) {
    const k = (r + 0.5) / RINGS
    const lat = (k - 0.5) * LAT_SPAN
    const cy = Math.sin(lat) * R
    const cr = Math.cos(lat) * R
    for (let s = 0; s < SEG; s++) {
      for (let e = 0; e < 2; e++) {
        const a = ((s + e) / SEG) * TAU
        sPos[v * 3] = Math.cos(a) * cr
        sPos[v * 3 + 1] = cy
        sPos[v * 3 + 2] = Math.sin(a) * cr
        sRing[v] = k
        sAng[v] = a
        v++
      }
    }
  }
  const sphereGeo = new BufferGeometry()
  sphereGeo.setAttribute('position', new BufferAttribute(sPos, 3))
  sphereGeo.setAttribute('aRing', new BufferAttribute(sRing, 1))
  sphereGeo.setAttribute('aAngle', new BufferAttribute(sAng, 1))
  bound(sphereGeo, R + 1.2)
  const sphereMat = additive(uni(), SPHERE_VERT, SPHERE_FRAG)

  // --- radial equalizer: billboarded quads, one mesh --------------------------
  const BARS = mobile ? 64 : 96
  const ePos = new Float32Array(BARS * 4 * 3)
  const eBar = new Float32Array(BARS * 4)
  const eCorner = new Float32Array(BARS * 4 * 2)
  const eIdx: number[] = []
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1]
  for (let b = 0; b < BARS; b++) {
    const a = ((b + 0.5) / BARS) * TAU
    const x = Math.cos(a) * EQ_R
    const z = Math.sin(a) * EQ_R
    for (let c = 0; c < 4; c++) {
      const i = b * 4 + c
      ePos[i * 3] = x
      ePos[i * 3 + 2] = z
      eBar[i] = b
      eCorner[i * 2] = corners[c * 2]
      eCorner[i * 2 + 1] = corners[c * 2 + 1]
    }
    const o = b * 4
    eIdx.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }
  const eqGeo = new BufferGeometry()
  eqGeo.setAttribute('position', new BufferAttribute(ePos, 3))
  eqGeo.setAttribute('aBar', new BufferAttribute(eBar, 1))
  eqGeo.setAttribute('aCorner', new BufferAttribute(eCorner, 2))
  eqGeo.setIndex(eIdx)
  bound(eqGeo, EQ_R + 2.6)
  const eqMat = additive(
    uni({ uBars: { value: BARS }, uHalfW: { value: mobile ? 0.12 : 0.085 } }),
    EQ_VERT,
    EQ_FRAG,
  )

  // --- guide rings: baseline, dashed inner track, ticked bezel, axis stubs ---
  const g: number[] = []
  const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    g.push(x0, y0, z0, x1, y1, z1)
  const circle = (r: number, n: number, dashed = false) => {
    for (let i = 0; i < n; i++) {
      if (dashed && i % 2) continue
      const a0 = (i / n) * TAU
      const a1 = ((i + 1) / n) * TAU
      seg(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r)
    }
  }
  circle(EQ_R, mobile ? 96 : 128)
  circle(BEZEL_R, mobile ? 120 : 160)
  circle(4.65, mobile ? 64 : 96, true)
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU
    const len = i % 9 === 0 ? 0.42 : 0.14
    const c = Math.cos(a)
    const s = Math.sin(a)
    seg(c * BEZEL_R, 0, s * BEZEL_R, c * (BEZEL_R + len), 0, s * (BEZEL_R + len))
  }
  for (const sy of [-1, 1]) {
    seg(0, sy * 3.75, 0, 0, sy * 5.3, 0)
    seg(-0.22, sy * 5.3, 0, 0.22, sy * 5.3, 0)
    seg(0, sy * 5.3, -0.22, 0, sy * 5.3, 0.22)
  }
  const guideGeo = new BufferGeometry()
  guideGeo.setAttribute('position', new BufferAttribute(new Float32Array(g), 3))
  const guideMat = new LineBasicMaterial({
    color: new Color(accent).multiplyScalar(0.6),
    transparent: true,
    opacity: 0.3,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })

  // --- ripples: 3 annuli (triangle strips) ----------------------------------
  const RSEG = mobile ? 96 : 160
  const rN = 3 * (RSEG + 1) * 2
  const rPos = new Float32Array(rN * 3)
  const rRip = new Float32Array(rN)
  const rEdge = new Float32Array(rN)
  const rAng = new Float32Array(rN)
  const rIdx: number[] = []
  v = 0
  for (let i = 0; i < 3; i++) {
    const base = v
    for (let s = 0; s <= RSEG; s++) {
      const a = (s / RSEG) * TAU
      for (let e = 0; e < 2; e++) {
        rPos[v * 3] = Math.cos(a) * 6
        rPos[v * 3 + 1] = Math.sin(a) * 6
        rRip[v] = i
        rEdge[v] = e ? 1 : -1
        rAng[v] = a
        v++
      }
    }
    for (let s = 0; s < RSEG; s++) {
      const a0 = base + s * 2
      rIdx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2)
    }
  }
  const rippleGeo = new BufferGeometry()
  rippleGeo.setAttribute('position', new BufferAttribute(rPos, 3))
  rippleGeo.setAttribute('aRipple', new BufferAttribute(rRip, 1))
  rippleGeo.setAttribute('aEdge', new BufferAttribute(rEdge, 1))
  rippleGeo.setAttribute('aAngle', new BufferAttribute(rAng, 1))
  rippleGeo.setIndex(rIdx)
  bound(rippleGeo, 9)
  const rippleMat = additive(uni(), RIPPLE_VERT, RIPPLE_FRAG)

  // --- sparkles: orbiting motes ---------------------------------------------
  const SPARKS = mobile ? 28 : 56
  const pOrbit = new Float32Array(SPARKS * 4)
  const pMeta = new Float32Array(SPARKS * 2)
  for (let i = 0; i < SPARKS; i++) {
    pOrbit[i * 4] = 3.9 + rand() * 3.7
    pOrbit[i * 4 + 1] = (rand() - 0.5) * 1.4
    pOrbit[i * 4 + 2] = rand() * TAU
    pOrbit[i * 4 + 3] = (0.12 + rand() * 0.33) * (rand() < 0.5 ? -1 : 1)
    pMeta[i * 2] = rand() * TAU
    pMeta[i * 2 + 1] = 3 + rand() * 4
  }
  const sparkGeo = new BufferGeometry()
  sparkGeo.setAttribute('position', new BufferAttribute(new Float32Array(SPARKS * 3), 3))
  sparkGeo.setAttribute('aOrbit', new BufferAttribute(pOrbit, 4))
  sparkGeo.setAttribute('aMeta', new BufferAttribute(pMeta, 2))
  bound(sparkGeo, 8)
  const sparkMat = additive(uni(), SPARK_VERT, SPARK_FRAG)

  // --- core ------------------------------------------------------------------
  // billboard reaches +-1.61 per side at a full syllable (diagonal ~2.3)
  const coreGeo = bound(new PlaneGeometry(1, 1), 2.4)
  const coreMat = additive(uni(), CORE_VERT, CORE_FRAG)

  const geos = [sphereGeo, eqGeo, guideGeo, rippleGeo, sparkGeo, coreGeo]
  const mats = [sphereMat, eqMat, guideMat, rippleMat, sparkMat, coreMat]
  return {
    u,
    sphereGeo,
    sphereMat,
    eqGeo,
    eqMat,
    guideGeo,
    guideMat,
    rippleGeo,
    rippleMat,
    sparkGeo,
    sparkMat,
    coreGeo,
    coreMat,
    dispose() {
      geos.forEach((x) => x.dispose())
      mats.forEach((x) => x.dispose())
    },
  }
}

/* --- component ------------------------------------------------------------- */

export function VoiceConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const bezel = useRef<Group>(null)
  const acc = useRef({ last: -1, spin: 0, bezel: 0 })
  const v = useMemo(() => buildVoice(accent, tier), [accent, tier])
  useEffect(() => () => v.dispose(), [v])

  useFrame(() => {
    const g = root.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station)
    const t = worldState.time
    const a = acc.current
    const dt = a.last < 0 ? 0 : Math.min(Math.max(t - a.last, 0), 0.1)
    a.last = t

    v.u.uT.value = t
    v.u.uAmp.value = 0.22 + 0.78 * p // the call connects
    v.u.uEnergy.value = 0.35 + 0.65 * p
    v.guideMat.opacity = 0.3 + 0.4 * p

    a.spin += dt * (0.1 + 0.12 * p)
    a.bezel -= dt * 0.05
    if (spin.current) spin.current.rotation.y = a.spin
    if (bezel.current) bezel.current.rotation.y = a.bezel
  })

  return (
    <group ref={root} position={position}>
      {/* tilted so the rings read as ellipses from a near-level camera */}
      <group rotation={[0.42, 0, -0.16]}>
        <group ref={spin}>
          <lineSegments geometry={v.sphereGeo} material={v.sphereMat} />
        </group>
      </group>
      <mesh geometry={v.coreGeo} material={v.coreMat} />
      <group rotation={[0.3, 0, 0]}>
        <mesh geometry={v.eqGeo} material={v.eqMat} />
        <group ref={bezel}>
          <lineSegments geometry={v.guideGeo} material={v.guideMat} />
        </group>
      </group>
      {/* ripple plane turned to face the approaching (front-left) camera */}
      <group rotation={[0, -0.36, 0]}>
        <mesh geometry={v.rippleGeo} material={v.rippleMat} />
      </group>
      <points geometry={v.sparkGeo} material={v.sparkMat} />
    </group>
  )
}
