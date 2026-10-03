/* ============================================================================
   STATION 6 — AI Reliability Ops: the GYROSCOPE MONITOR RIG.

   SRE for agents, drawn as an instrument. Three nested gimbal rings, each
   mounted in its parent on a real pivot axle, keep the system level while
   scan heads lap them and flare their tick marks. The rig stands on a radar
   console whose sweep pings ten eval blips; telemetry motes rise from the
   deck. At the centre a wireframe eye beats a steady lub-dub (status OK).
   Twelve status satellites blink on a tilted orbit; every few seconds one
   drifts amber off its track, the core fires a correction packet down a
   beam, and it settles back into line (drift detected, auto-corrected).

   9 draw calls. Gimbal frames are composed on the CPU into 4 mat4 uniforms
   and applied in the vertex shader, so all rings (and all ticks + axles)
   are one draw each.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  FrontSide,
  IcosahedronGeometry,
  LineBasicMaterial,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  TorusGeometry,
  Vector3,
  type Group,
  type IUniform,
  type Side,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
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
const RINGS = [5.4, 4.4, 3.4] // outer, middle, inner gimbal radii
const TUBE = 0.03
const HUB_Y = 1.1 // gimbal centre (construct-local)
const DECK_Y = -4.8 // radar console under the rig
const MOUNT = HUB_Y - DECK_Y // spindle length from hub down to the deck
const SWEEP_R = 4.7
const SAT_N = 12
const SAT_R = 7.1
const BLIPS = 10
const AMBER = '#FFB547'

/* --- GLSL ------------------------------------------------------------------ */

// frame 0..2 = outer/middle/inner ring, 3 = the fixed base (outer ring's axle)
const GIMBAL = /* glsl */ `
uniform mat4 uG0;
uniform mat4 uG1;
uniform mat4 uG2;
uniform mat4 uG3;
mat4 gimbal(float g) {
  if (g < 0.5) return uG0;
  if (g < 1.5) return uG1;
  if (g < 2.5) return uG2;
  return uG3;
}
`

// a scan head lapping ring g; u = angle around the ring (0..1). Needs uT.
const SCAN = /* glsl */ `
float scan(float u, float g) {
  float behind = fract(uT * (0.08 + 0.035 * g) + g * 0.31 - u);
  return exp(-behind * 8.0) * 0.85 + exp(-behind * 90.0) * 0.8;
}
`

// The satellite orbit (r 7.1, left point at world x ~1) and the correction
// beam cross the flight path, and the outer ring's sweep reaches x ~2.2, so
// the camera brushes through them on the way past. Fade anything closer than
// a few units instead of smearing it across the lens; never engages when
// parked (15+ units away). Must follow FOG_FRAG_PARS (reads vFogDepth).
const NEAR = /* glsl */ `
float nearFade(){ return smoothstep(0.8, 4.0, vFogDepth); }
`

const RING_VERT = /* glsl */ `
attribute float aGimbal;
varying float vU;
varying float vG;
${FOG_VERT_PARS}
${GIMBAL}
void main() {
  vec4 mv = modelViewMatrix * (gimbal(aGimbal) * vec4(position, 1.0));
  vU = uv.x;
  vG = aGimbal;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const RING_FRAG = /* glsl */ `
uniform float uT;
uniform float uEnergy;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vU;
varying float vG;
${FOG_FRAG_PARS}
${NEAR}
${SCAN}
void main() {
  vec3 col = uColor * (0.28 + 0.1 * vG) + uHot * scan(vU, vG);
  gl_FragColor = vec4(col * uEnergy * fogVis() * nearFade(), 1.0);
}
`

const TICK_VERT = /* glsl */ `
attribute float aGimbal;
attribute float aKind; // 0 short tick, 1 long tick, 2 axle, 3 bearing
attribute float aU;
varying float vU;
varying float vG;
varying float vKind;
${FOG_VERT_PARS}
${GIMBAL}
void main() {
  vec4 mv = modelViewMatrix * (gimbal(aGimbal) * vec4(position, 1.0));
  vU = aU;
  vG = aGimbal;
  vKind = aKind;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const TICK_FRAG = /* glsl */ `
uniform float uT;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vU;
varying float vG;
varying float vKind;
${FOG_FRAG_PARS}
${NEAR}
${SCAN}
void main() {
  vec3 col;
  if (vKind < 1.5) {
    col = uColor * (vKind > 0.5 ? 0.6 : 0.3) + uHot * scan(vU, vG) * 1.2;
  } else if (vKind < 2.5) {
    col = uColor * 0.42;
  } else {
    col = uHot * (0.6 + 0.5 * uBeat); // bearings tick with the heartbeat
  }
  gl_FragColor = vec4(col * uEnergy * fogVis() * nearFade(), 1.0);
}
`

const DISC_VERT = /* glsl */ `
varying vec2 vUv;
${FOG_VERT_PARS}
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

// polar radar face: range rings, spokes, rim ticks, faint grid, a sweep beam
// with a fading wedge that re-lights the linework it passes over
const DISC_FRAG = /* glsl */ `
uniform float uSweep;
uniform float uEnergy;
uniform vec3 uColor;
uniform vec3 uHot;
varying vec2 vUv;
${FOG_FRAG_PARS}
const float TAU = 6.2831853;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  // atan(0, 0) is undefined (NaN on some GPUs); a NaN pixel smears through
  // Bloom's mip chain, so never evaluate it at the exact centre vertex
  float ang = atan(q.y, r < 0.00001 ? 1.0 : q.x);
  float aa = max(fwidth(r), 0.0001) * 1.5;
  float behind = mod(uSweep - ang, TAU);
  float trail = exp(-behind * 2.2);
  float beam = exp(-behind * 60.0);
  float rd = abs(fract(r * 4.0 + 0.5) - 0.5) * 0.25;
  float rings = 1.0 - smoothstep(0.0, aa, rd);
  float sd = abs(fract(ang / TAU * 12.0 + 0.5) - 0.5) * (TAU / 12.0) * r;
  float spokes = (1.0 - smoothstep(0.0, aa, sd)) * smoothstep(0.08, 0.2, r);
  float td = abs(fract(ang / TAU * 72.0 + 0.5) - 0.5) * (TAU / 72.0) * r;
  float ticks = (1.0 - smoothstep(0.0, aa, td)) * smoothstep(0.92, 0.94, r);
  vec2 gq = abs(fract(q * 6.0 + 0.5) - 0.5) / 6.0;
  float grid = 1.0 - smoothstep(0.0, aa, min(gq.x, gq.y));
  float rimD = (r - 0.975) * 70.0;
  float rim = exp(-rimD * rimD);
  float lines = rings * 0.5 + spokes * 0.22 + grid * 0.07 + ticks * 0.5;
  vec3 col = uColor * (lines * (0.45 + 1.1 * trail) + trail * 0.2 + rim * 0.6);
  col += uHot * beam * smoothstep(0.02, 0.1, r) * 0.9;
  col *= 1.0 - smoothstep(0.993, 1.0, r);
  gl_FragColor = vec4(col * uEnergy * fogVis(), 1.0);
}
`

const BLIP_VERT = /* glsl */ `
uniform float uSweep;
uniform float uDpr;
attribute float aAng;
varying float vPing;
varying float vAge;
${FOG_VERT_PARS}
const float TAU = 6.2831853;
void main() {
  float behind = mod(uSweep - aAng, TAU); // radians since the beam crossed
  vAge = behind / TAU;
  vPing = exp(-behind * 1.4);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // fixed sprite so the ping ring can genuinely grow in screen space (a sprite
  // that shrank with the ping kept the ring's pixel radius almost constant)
  gl_PointSize = clamp(44.0 * uDpr * (19.0 / -mv.z), 1.0, 120.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const BLIP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uEnergy;
varying float vPing;
varying float vAge;
${FOG_FRAG_PARS}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float dotc = 1.0 - smoothstep(0.0, 0.04 + 0.05 * vPing, d);
  float life = clamp(vAge / 0.28, 0.0, 1.0); // ring lives ~28% of a lap
  float rr = mix(0.05, 0.46, sqrt(life));
  float fade = 1.0 - life;
  float ring = (1.0 - smoothstep(0.0, 0.025, abs(d - rr))) * fade * fade;
  vec3 col = uColor * dotc * (0.3 + 0.7 * vPing) + uHot * (dotc * vPing + ring) * 0.8;
  col *= step(d, 0.5);
  gl_FragColor = vec4(col * uEnergy * fogVis(), 1.0);
}
`

const CORE_VERT = /* glsl */ `
uniform float uBeat;
varying vec2 vQ;
${FOG_VERT_PARS}
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * (2.4 + 0.5 * uBeat);
  vQ = position.xy * 2.0;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const CORE_FRAG = /* glsl */ `
uniform float uBeat;
uniform float uEnergy;
uniform vec3 uHot;
varying vec2 vQ;
${FOG_FRAG_PARS}
void main() {
  float d = length(vQ);
  float core = exp(-d * d * 34.0);
  float halo = exp(-d * d * 7.0) * (0.12 + 0.2 * uBeat);
  vec3 col = uHot * halo + vec3(2.0, 2.3, 2.5) * core * (0.5 + 0.5 * uBeat);
  col *= 1.0 - smoothstep(0.85, 1.0, d);
  gl_FragColor = vec4(col * uEnergy * fogVis(), 1.0);
}
`

const SAT_VERT = /* glsl */ `
uniform float uT;
uniform float uDpr;
uniform float uDrift;
uniform float uDriftIdx;
attribute float aIdx;
varying float vAmber;
varying float vBlink;
${FOG_VERT_PARS}
void main() {
  float isDrift = 1.0 - step(0.5, abs(aIdx - uDriftIdx));
  vAmber = isDrift * uDrift;
  float ph = fract(uT * (0.4 + 0.06 * mod(aIdx, 5.0)) + aIdx * 0.618);
  vBlink = 0.35 + 0.65 * exp(-ph * 10.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp((13.0 + 5.0 * vBlink + 14.0 * vAmber) * uDpr * (19.0 / -mv.z), 1.0, 56.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

// diamond frame + pinpoint; the drifting one turns amber with a pulsing alert ring
const SAT_FRAG = /* glsl */ `
uniform float uT;
uniform float uEnergy;
uniform vec3 uHot;
uniform vec3 uAmber;
varying float vAmber;
varying float vBlink;
${FOG_FRAG_PARS}
${NEAR}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float dia = abs(c.x) + abs(c.y);
  float frame = 1.0 - smoothstep(0.0, 0.05, abs(dia - 0.3));
  float pin = 1.0 - smoothstep(0.0, 0.11, d);
  float alert = (1.0 - smoothstep(0.0, 0.04, abs(d - 0.42 + 0.04 * sin(uT * 14.0)))) * vAmber;
  vec3 tint = mix(uHot, uAmber, vAmber);
  vec3 col = tint * (frame * 0.55 + pin * vBlink) + uAmber * alert;
  col *= step(d, 0.5);
  gl_FragColor = vec4(col * uEnergy * fogVis() * nearFade(), 1.0);
}
`

// dashed satellite orbit (aT = -1) + the correction beam hub -> satellite (aT 0..1)
const ORBIT_VERT = /* glsl */ `
attribute float aT;
varying float vT;
${FOG_VERT_PARS}
void main() {
  vT = aT;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const ORBIT_FRAG = /* glsl */ `
uniform float uT;
uniform float uDrift;
uniform float uEnergy;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vT;
${FOG_FRAG_PARS}
${NEAR}
void main() {
  vec3 col;
  if (vT < -0.5) {
    col = uColor * 0.22;
  } else {
    float x = (vT - fract(uT * 1.6)) * 7.0;
    float packet = exp(-x * x);
    col = (uHot * 0.35 + vec3(1.6, 1.9, 2.0) * packet) * uDrift;
  }
  gl_FragColor = vec4(col * uEnergy * fogVis() * nearFade(), 1.0);
}
`

const MOTE_VERT = /* glsl */ `
uniform float uT;
uniform float uDpr;
attribute vec4 aM; // angle, radius, phase, rise speed
varying float vA;
${FOG_VERT_PARS}
void main() {
  float span = 11.5;
  float h = mod(aM.z * span + uT * aM.w, span);
  float a = aM.x + uT * 0.12;
  vA = smoothstep(0.0, 1.2, h) * (1.0 - smoothstep(span - 2.5, span, h));
  vec4 mv = modelViewMatrix * vec4(cos(a) * aM.y, h, sin(a) * aM.y, 1.0);
  gl_PointSize = clamp(5.0 * uDpr * (19.0 / -mv.z), 1.0, 16.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uEnergy;
varying float vA;
${FOG_FRAG_PARS}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float glow = 1.0 - smoothstep(0.0, 0.5, d);
  gl_FragColor = vec4(uColor * glow * glow * vA * 0.9 * uEnergy * fogVis(), 1.0);
}
`

/* --- build ----------------------------------------------------------------- */

type Uniforms = { [name: string]: IUniform }

function additive(
  uniforms: Uniforms,
  vertexShader: string,
  fragmentShader: string,
  side: Side = DoubleSide,
) {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side,
    toneMapped: false,
    fog: false,
  })
}

function bound(g: BufferGeometry, r: number) {
  g.boundingSphere = new Sphere(new Vector3(), r)
  return g
}

/** steady ~57 bpm lub-dub, 0..1 */
function heartbeat(t: number) {
  const ph = (t % 1.05) / 1.05
  const a = (ph - 0.04) * 16
  const b = (ph - 0.22) * 16
  return Math.min(1, Math.exp(-a * a) + 0.6 * Math.exp(-b * b))
}

function buildOps(accent: string, tier: LatticeTier) {
  const mobile = tier === 'mobile'
  const rand = mulberry32(0x0e5e7a)

  const u = {
    uT: { value: 0 },
    uEnergy: { value: 0.35 },
    uBeat: { value: 0 },
    uSweep: { value: 0 },
    uDrift: { value: 0 },
    uDriftIdx: { value: 3 },
    uColor: { value: new Color(accent) },
    uHot: { value: hot(accent, 2.2) },
    uAmber: { value: hot(AMBER, 2.4) },
    uG0: { value: new Matrix4() },
    uG1: { value: new Matrix4() },
    uG2: { value: new Matrix4() },
    uG3: { value: new Matrix4() }, // base frame: identity (vertical outer axle)
  }
  const uni = (): Uniforms => ({ ...worldUniforms, ...u })

  // --- gimbal rings: three tori merged, tagged with their frame -------------
  const tori = RINGS.map((r) => new TorusGeometry(r, TUBE, mobile ? 4 : 6, mobile ? 128 : 192))
  let vCount = 0
  let iCount = 0
  for (const t of tori) {
    vCount += t.attributes.position.count
    iCount += t.index!.count
  }
  const tPos = new Float32Array(vCount * 3)
  const tUv = new Float32Array(vCount * 2)
  const tGim = new Float32Array(vCount)
  const tIdx = new Uint16Array(iCount)
  let vo = 0
  let io = 0
  tori.forEach((t, gi) => {
    const n = t.attributes.position.count
    tPos.set(t.attributes.position.array, vo * 3)
    tUv.set(t.attributes.uv.array, vo * 2)
    tGim.fill(gi, vo, vo + n)
    const ix = t.index!.array
    for (let i = 0; i < ix.length; i++) tIdx[io + i] = ix[i] + vo
    vo += n
    io += ix.length
    t.dispose()
  })
  const ringGeo = new BufferGeometry()
  ringGeo.setAttribute('position', new BufferAttribute(tPos, 3))
  ringGeo.setAttribute('uv', new BufferAttribute(tUv, 2))
  ringGeo.setAttribute('aGimbal', new BufferAttribute(tGim, 1))
  ringGeo.setIndex(new BufferAttribute(tIdx, 1))
  bound(ringGeo, RINGS[0] + 0.5)
  const ringMat = additive(uni(), RING_VERT, RING_FRAG, FrontSide)

  // --- ticks, axles and bearings (one LineSegments, per-vertex frame) -------
  const kp: number[] = []
  const kg: number[] = []
  const kk: number[] = []
  const ku: number[] = []
  const line = (
    g: number,
    kind: number,
    uu: number,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ) => {
    kp.push(x0, y0, z0, x1, y1, z1)
    kg.push(g, g)
    kk.push(kind, kind)
    ku.push(uu, uu)
  }
  const bearing = (g: number, x: number, y: number, z: number) => {
    const s = 0.14
    line(g, 3, 0, x - s, y, z, x + s, y, z)
    line(g, 3, 0, x, y - s, z, x, y + s, z)
    line(g, 3, 0, x, y, z - s, x, y, z + s)
  }
  RINGS.forEach((r, gi) => {
    for (let k = 0; k < 60; k++) {
      // short every 6 deg, long every 30 deg (long ones also point inward)
      const a = (k / 60) * TAU
      const c = Math.cos(a)
      const s = Math.sin(a)
      const long = k % 5 === 0
      const out = r + (long ? 0.42 : 0.16)
      line(gi, long ? 1 : 0, k / 60, c * (r + 0.06), s * (r + 0.06), 0, c * out, s * out, 0)
      if (long) line(gi, 1, k / 60, c * (r - 0.06), s * (r - 0.06), 0, c * (r - 0.24), s * (r - 0.24), 0)
    }
  })
  const [R0, R1, R2] = RINGS
  // base frame: outer ring spins on a vertical axle that plants into the deck
  line(3, 2, 0, 0, -R0, 0, 0, -MOUNT, 0)
  line(3, 2, 0, 0, R0, 0, 0, R0 + 0.55, 0)
  line(3, 2, 0, -0.25, R0 + 0.55, 0, 0.25, R0 + 0.55, 0)
  bearing(3, 0, R0, 0)
  bearing(3, 0, -R0, 0)
  // outer frame carries the middle ring's axle (along X)
  line(0, 2, 0, R1, 0, 0, R0, 0, 0)
  line(0, 2, 0, -R1, 0, 0, -R0, 0, 0)
  bearing(0, R1, 0, 0)
  bearing(0, -R1, 0, 0)
  // middle frame carries the inner ring's axle (along Y)
  line(1, 2, 0, 0, R2, 0, 0, R1, 0)
  line(1, 2, 0, 0, -R2, 0, 0, -R1, 0)
  bearing(1, 0, R2, 0)
  bearing(1, 0, -R2, 0)
  const tickGeo = new BufferGeometry()
  tickGeo.setAttribute('position', new BufferAttribute(new Float32Array(kp), 3))
  tickGeo.setAttribute('aGimbal', new BufferAttribute(new Float32Array(kg), 1))
  tickGeo.setAttribute('aKind', new BufferAttribute(new Float32Array(kk), 1))
  tickGeo.setAttribute('aU', new BufferAttribute(new Float32Array(ku), 1))
  bound(tickGeo, MOUNT + 0.5)
  const tickMat = additive(uni(), TICK_VERT, TICK_FRAG)

  // --- radar deck -------------------------------------------------------------
  const discGeo = new CircleGeometry(SWEEP_R, mobile ? 64 : 96)
  discGeo.rotateX(-Math.PI / 2)
  const discMat = additive(uni(), DISC_VERT, DISC_FRAG)

  // blips in the deck plane; angle matches the disc shader's atan(q.y, q.x)
  const bPos = new Float32Array(BLIPS * 3)
  const bAng = new Float32Array(BLIPS)
  for (let i = 0; i < BLIPS; i++) {
    const a = ((i + rand() * 0.8) / BLIPS) * TAU
    const r = (0.22 + rand() * 0.68) * SWEEP_R
    bPos[i * 3] = Math.cos(a) * r
    bPos[i * 3 + 1] = 0.03
    bPos[i * 3 + 2] = -Math.sin(a) * r
    bAng[i] = a
  }
  const blipGeo = new BufferGeometry()
  blipGeo.setAttribute('position', new BufferAttribute(bPos, 3))
  blipGeo.setAttribute('aAng', new BufferAttribute(bAng, 1))
  bound(blipGeo, SWEEP_R + 0.5)
  const blipMat = additive(uni(), BLIP_VERT, BLIP_FRAG)

  // --- the eye: two nested wire icosahedra + a beating core -----------------
  const icoA = new IcosahedronGeometry(0.95, 1)
  const icoB = new IcosahedronGeometry(0.48, 0)
  const edgeA = new EdgesGeometry(icoA)
  const edgeB = new EdgesGeometry(icoB)
  const ea = edgeA.attributes.position.array
  const eb = edgeB.attributes.position.array
  const ePos = new Float32Array(ea.length + eb.length)
  ePos.set(ea, 0)
  ePos.set(eb, ea.length)
  ;[icoA, icoB, edgeA, edgeB].forEach((x) => x.dispose())
  const eyeGeo = new BufferGeometry()
  eyeGeo.setAttribute('position', new BufferAttribute(ePos, 3))
  const eyeMat = new LineBasicMaterial({
    color: hot(accent, 1.4),
    transparent: true,
    opacity: 0.35,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const coreGeo = bound(new PlaneGeometry(1, 1), 2.2) // billboard diag ~2.05 at full beat
  const coreMat = additive(uni(), CORE_VERT, CORE_FRAG)

  // --- status satellites (CPU-positioned, 12 verts) --------------------------
  const satPos = new BufferAttribute(new Float32Array(SAT_N * 3), 3)
  satPos.setUsage(DynamicDrawUsage)
  const satIdx = new Float32Array(SAT_N)
  for (let i = 0; i < SAT_N; i++) satIdx[i] = i
  const satGeo = new BufferGeometry()
  satGeo.setAttribute('position', satPos)
  satGeo.setAttribute('aIdx', new BufferAttribute(satIdx, 1))
  bound(satGeo, SAT_R + 1.5)
  const satMat = additive(uni(), SAT_VERT, SAT_FRAG)

  // orbit path (dashed) + correction beam; beam = first two verts, updated live
  const oSeg = mobile ? 72 : 112
  const oPos: number[] = [0, 0, 0, SAT_R, 0, 0]
  const oT: number[] = [0, 1]
  for (let i = 0; i < oSeg; i += 2) {
    const a0 = (i / oSeg) * TAU
    const a1 = ((i + 1) / oSeg) * TAU
    oPos.push(Math.cos(a0) * SAT_R, 0, Math.sin(a0) * SAT_R, Math.cos(a1) * SAT_R, 0, Math.sin(a1) * SAT_R)
    oT.push(-1, -1)
  }
  const orbitPos = new BufferAttribute(new Float32Array(oPos), 3)
  orbitPos.setUsage(DynamicDrawUsage)
  const orbitGeo = new BufferGeometry()
  orbitGeo.setAttribute('position', orbitPos)
  orbitGeo.setAttribute('aT', new BufferAttribute(new Float32Array(oT), 1))
  bound(orbitGeo, SAT_R + 1.5)
  const orbitMat = additive(uni(), ORBIT_VERT, ORBIT_FRAG)

  // --- telemetry motes rising off the deck ------------------------------------
  const MOTES = mobile ? 40 : 80
  const mAttr = new Float32Array(MOTES * 4)
  for (let i = 0; i < MOTES; i++) {
    mAttr[i * 4] = rand() * TAU
    mAttr[i * 4 + 1] = 0.3 + Math.sqrt(rand()) * 4.3
    mAttr[i * 4 + 2] = rand()
    mAttr[i * 4 + 3] = 0.4 + rand() * 0.7
  }
  const moteGeo = new BufferGeometry()
  moteGeo.setAttribute('position', new BufferAttribute(new Float32Array(MOTES * 3), 3))
  moteGeo.setAttribute('aM', new BufferAttribute(mAttr, 4))
  moteGeo.boundingSphere = new Sphere(new Vector3(0, 5.75, 0), 7.5)
  const moteMat = additive(uni(), MOTE_VERT, MOTE_FRAG)

  const geos = [ringGeo, tickGeo, discGeo, blipGeo, eyeGeo, coreGeo, satGeo, orbitGeo, moteGeo]
  const mats = [ringMat, tickMat, discMat, blipMat, eyeMat, coreMat, satMat, orbitMat, moteMat]
  return {
    u,
    satPos,
    orbitPos,
    ringGeo,
    ringMat,
    tickGeo,
    tickMat,
    discGeo,
    discMat,
    blipGeo,
    blipMat,
    eyeGeo,
    eyeMat,
    coreGeo,
    coreMat,
    satGeo,
    satMat,
    orbitGeo,
    orbitMat,
    moteGeo,
    moteMat,
    dispose() {
      geos.forEach((x) => x.dispose())
      mats.forEach((x) => x.dispose())
    },
  }
}

/* --- component ------------------------------------------------------------- */

export function OpsConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const eye = useRef<Group>(null)
  const o = useMemo(() => buildOps(accent, tier), [accent, tier])
  useEffect(() => () => o.dispose(), [o])

  const st = useRef({
    last: -1,
    a0: 0,
    a1: 1.1,
    a2: 0.6,
    sweep: 0,
    orbit: 0,
    eyeA: 0,
    // drift incident state machine
    next: 3.5,
    start: -1,
    idx: 3,
  })
  const tmp = useMemo(() => new Matrix4(), [])

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
    const s = st.current
    const dt = s.last < 0 ? 0 : Math.min(Math.max(t - s.last, 0), 0.1)
    s.last = t
    const u = o.u

    // gimbals spin up as the camera arrives
    const spd = 0.5 + 0.5 * p
    s.a0 += dt * 0.18 * spd
    s.a1 += dt * 0.29 * spd
    s.a2 += dt * 0.47 * spd
    u.uG0.value.makeRotationY(s.a0)
    u.uG1.value.multiplyMatrices(u.uG0.value, tmp.makeRotationX(s.a1))
    u.uG2.value.multiplyMatrices(u.uG1.value, tmp.makeRotationY(s.a2))

    s.sweep = (s.sweep + dt * (0.9 + 0.6 * p)) % TAU
    s.orbit = (s.orbit + dt * 0.11) % TAU

    // drift incident: ramp out (0.5s), hold amber (1.6s), get corrected (0.9s)
    if (s.start < 0 && t >= s.next) {
      s.start = t
      s.idx = (s.idx + 5) % SAT_N
    }
    let drift = 0
    if (s.start >= 0) {
      const e = t - s.start
      if (e < 0.5) drift = e / 0.5
      else if (e < 2.1) drift = 1
      else if (e < 3.0) drift = 1 - (e - 2.1) / 0.9
      else {
        s.start = -1
        s.next = t + 5 + (s.idx % 4) * 0.7
      }
      drift = drift * drift * (3 - 2 * drift)
    }

    const beat = heartbeat(t)
    u.uT.value = t
    u.uEnergy.value = 0.35 + 0.65 * p
    u.uBeat.value = beat
    u.uSweep.value = s.sweep
    u.uDrift.value = drift
    u.uDriftIdx.value = s.idx
    o.eyeMat.opacity = (0.35 + 0.65 * p) * (0.75 + 0.25 * beat)

    // satellites ride the orbit; the drifting one slides out and up off-track
    const sp = o.satPos.array as Float32Array
    for (let i = 0; i < SAT_N; i++) {
      const a = s.orbit + (i / SAT_N) * TAU
      const off = i === s.idx ? drift : 0
      const r = SAT_R + off * 1.1
      sp[i * 3] = Math.cos(a) * r
      sp[i * 3 + 1] = off * 0.6
      sp[i * 3 + 2] = Math.sin(a) * r
    }
    o.satPos.needsUpdate = true
    const op = o.orbitPos.array as Float32Array
    op[3] = sp[s.idx * 3]
    op[4] = sp[s.idx * 3 + 1]
    op[5] = sp[s.idx * 3 + 2]
    o.orbitPos.needsUpdate = true

    s.eyeA += dt * 0.35
    const e = eye.current
    if (e) {
      e.rotation.set(s.eyeA * 0.6, s.eyeA, 0)
      e.scale.setScalar(1 + 0.07 * beat)
    }
  })

  return (
    <group ref={root} position={position}>
      <group position={[0, HUB_Y, 0]}>
        <mesh geometry={o.ringGeo} material={o.ringMat} />
        <lineSegments geometry={o.tickGeo} material={o.tickMat} />
        <group ref={eye}>
          <lineSegments geometry={o.eyeGeo} material={o.eyeMat} />
        </group>
        <mesh geometry={o.coreGeo} material={o.coreMat} />
        <group rotation={[0.42, 0, 0.18]}>
          <points geometry={o.satGeo} material={o.satMat} />
          <lineSegments geometry={o.orbitGeo} material={o.orbitMat} />
        </group>
      </group>
      {/* deck tipped toward the approaching (front-left) camera so it reads */}
      <group position={[0, DECK_Y, 0]} rotation={[0, -0.36, 0]}>
        <group rotation={[0.16, 0, 0]}>
          <mesh geometry={o.discGeo} material={o.discMat} />
          <points geometry={o.blipGeo} material={o.blipMat} />
        </group>
      </group>
      <points position={[0, DECK_Y, 0]} geometry={o.moteGeo} material={o.moteMat} />
    </group>
  )
}
