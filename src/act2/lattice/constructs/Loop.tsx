/* ============================================================================
   STATION 7 · THE BUILD LOOP GATE: "We don't demo. We deploy, prove, and
   keep it alive."  A 26-unit holographic ring straddles the flight path and
   the camera flies straight through it. Four step nodes ride the ring at
   12 / 3 / 6 / 9 o'clock (Map, Build, Prove, Run). A white-hot packet walks
   clockwise between them, dwelling at each step while it lights up, laying a
   comet trail and a progress arc behind it; every completed lap flashes the
   whole gate and the loop begins again, because the work never stops.

   Around it: a slow outer ring of dashes, a counter-rotating inner tick ring
   (parallax layers at different depths), HUD brackets, light spokes that
   charge as the camera closes in, orbiting data dust, and a faint hex
   membrane across the aperture that ripples outward from the exact point the
   camera pierces it.

   Five draw calls; all motion lives in the shaders (the CPU only writes a
   handful of uniforms per frame).
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
  Group,
  ShaderMaterial,
  Sphere,
  TorusGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  HASH,
  isNear,
  mulberry32,
  proximity,
  worldState,
  worldUniforms,
  type ConstructProps,
} from '../shared'

const R = 13 // gate radius
/** angle of step 1 (Map); the steps follow clockwise every 90 degrees.
 *  PI/2 = 12 o'clock. PI*0.75 (10:30) keeps all four in a 16:9 frame when parked. */
const START = Math.PI / 2
const R_DASH = 14 // outer dash ring
const R_TICK = 10.5 // inner tick ring
const STEP_DUR = 3.5 // seconds per step
const CYCLE = STEP_DUR * 4
const DWELL = 0.22 // fraction of a step the packet rests on its node
const TAU = Math.PI * 2
const COMET = 14 // packet head + comet points
const PORTRAIT_SCALE = 0.52 // tall frames: shrink so all four steps fit

// ring-mesh element kinds
const K_DASH = 0
const K_MAJOR = 1
const K_TICK = 2
const K_CIRCLE = 3
const K_BRACKET = 4
const K_SPOKE = 5

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* --- shaders -------------------------------------------------------------- */
const ANGDIST = /* glsl */ `
float angDist(float a, float b){
  return abs(mod(a - b + 3.1415927, 6.2831853) - 3.1415927);
}
`

// the gate itself: comet trail + progress arc from the packet angle
const RING_VERT = /* glsl */ `
varying float vAng;
${FOG_VERT_PARS}
void main(){
  vAng = uv.x * 6.2831853;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPkt;
uniform float uProg;
uniform float uTrail;
uniform float uFlash;
uniform float uNear;
uniform vec3 uCol;
varying float vAng;
${FOG_FRAG_PARS}
void main(){
  float behind = mod(vAng - uPkt, 6.2831853);
  float ahead = 6.2831853 - behind;
  float trail = exp(-behind * (2.4 - 1.6 * uTrail)) * (0.45 + 0.75 * uTrail);
  float head = exp(-min(behind, ahead) * 30.0);
  float fromTop = mod(${START.toFixed(7)} - vAng, 6.2831853);
  float lit = 1.0 - smoothstep(uProg * 6.2831853 - 0.05, uProg * 6.2831853, fromTop);
  float shimmer = 0.5 + 0.5 * sin(vAng * 120.0 - uTime * 2.5);
  float b = 0.16 + lit * 0.24 + shimmer * 0.05 + trail * 1.3 + uFlash * 0.9 + uNear * 0.8;
  vec3 c = uCol * b + vec3(1.0, 1.15, 1.35) * head * 2.4;
  gl_FragColor = vec4(c * uIntensity * fogVis(), 1.0);
}
`

// dashes, ticks, inner circle, brackets and flare spokes: thin quads
const RINGS_VERT = /* glsl */ `
attribute float aAng;
attribute float aKind;
attribute float aSpin;
attribute float aW;
attribute float aV;
uniform float uTime;
uniform float uIntensity;
uniform float uPkt;
uniform float uFlash;
uniform float uNear;
varying float vB;
varying float vW;
varying float vWhite;
${HASH}
${ANGDIST}
${FOG_VERT_PARS}
void main(){
  float rot = uTime * aSpin;
  float c = cos(rot);
  float s = sin(rot);
  vec3 p = vec3(c * position.x - s * position.y, s * position.x + c * position.y, position.z);
  float a = aAng + rot;
  float near = exp(-angDist(a, uPkt) * 3.0);
  float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash11(aAng * 13.7) * 30.0);
  float b = 0.0;
  if (aKind < 0.5) {
    b = (0.22 + near * 0.9) * tw + uNear * 0.9;
  } else if (aKind < 1.5) {
    b = 0.5 + near * 1.4 + uNear * 1.4 + uFlash * 0.6;
  } else if (aKind < 2.5) {
    b = 0.24 + near * 0.8 + uNear * 0.6;
  } else if (aKind < 3.5) {
    b = 0.14 + near * 0.3 + uNear * 0.4;
  } else if (aKind < 4.5) {
    b = 0.3 + uNear * 1.2 + uFlash * 0.4;
  } else {
    float f = 1.0 - aV;
    b = f * f * (0.05 + uNear * uNear * 1.8 + uFlash * 0.3);
  }
  vB = b * uIntensity;
  vW = aW;
  vWhite = aKind > 4.5 ? 0.35 : 0.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const RINGS_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vB;
varying float vW;
varying float vWhite;
${FOG_FRAG_PARS}
void main(){
  float edge = 1.0 - vW * vW;
  vec3 c = mix(uCol, vec3(1.0), vWhite);
  gl_FragColor = vec4(c * vB * edge * fogVis(), 1.0);
}
`

// step nodes: spinning octahedra, dashed brackets, callout stems + step pips
const STEP_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute float aStep;
attribute float aKind;
uniform float uTime;
uniform float uIntensity;
uniform float uNear;
uniform float uStep[4];
uniform vec3 uCol;
varying vec3 vCol;
${FOG_VERT_PARS}
mat2 rot2(float a){
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}
void main(){
  int i = int(aStep + 0.5);
  float act = uStep[i];
  vec3 l = position - aCenter;
  float b = 0.0;
  if (aKind < 0.5) {
    l.xz = rot2(uTime * 0.7 + aStep * 1.3) * l.xz;
    l.yz = rot2(0.42) * l.yz;
    l *= 1.0 + act * 0.22;
    b = 0.45 + act * 1.9;
  } else if (aKind < 1.5) {
    l.xz = rot2(-uTime * 1.3 - aStep) * l.xz;
    l.xy = rot2(uTime * 0.5) * l.xy;
    l *= 1.0 + act * 0.55;
    b = 0.6 + act * 2.6;
  } else if (aKind < 2.5) {
    l.xy = rot2(uTime * (mod(aStep, 2.0) < 0.5 ? 0.6 : -0.6)) * l.xy;
    l *= 1.0 + act * 0.18;
    b = 0.18 + act * 1.1;
  } else {
    b = 0.16 + act * 0.7;
  }
  b += uNear * 0.5;
  vCol = mix(uCol, vec3(1.0), clamp(act - 0.6, 0.0, 1.0) * 0.5) * b * uIntensity;
  vec4 mv = modelViewMatrix * vec4(aCenter + l, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const STEP_FRAG = /* glsl */ `
varying vec3 vCol;
${FOG_FRAG_PARS}
void main(){
  gl_FragColor = vec4(vCol * fogVis(), 1.0);
}
`

// one point cloud, three behaviours: node auras, the packet comet, orbit dust
const PTS_VERT = /* glsl */ `
attribute float aMode;
attribute float aA;
attribute float aR;
attribute float aSeed;
uniform float uTime;
uniform float uDpr;
uniform float uProj;
uniform float uIntensity;
uniform float uPkt;
uniform float uTrail;
uniform float uNear;
uniform float uStep[4];
uniform vec3 uCol;
varying vec3 vCol;
varying float vSharp;
${HASH}
${ANGDIST}
${FOG_VERT_PARS}
void main(){
  vec3 p = position;
  vec3 c = uCol;
  float size = 0.1;
  float b = 1.0;
  vSharp = 0.0;
  if (aMode < 0.5) {
    int i = int(aA + 0.5);
    float act = uStep[i];
    size = 1.1 + act * 1.5;
    b = 0.18 + act * 0.9;
  } else if (aMode < 1.5) {
    float k = 1.0 - aA / ${COMET}.0;
    float ang = uPkt + aA * (0.012 + 0.03 * uTrail);
    p = vec3(cos(ang) * aR, sin(ang) * aR, 0.0);
    if (aA < 0.5) {
      size = 1.0;
      b = 2.4;
      c = vec3(1.0, 1.1, 1.3);
      vSharp = 1.0;
    } else {
      size = 0.12 + 0.3 * k;
      b = (0.4 + 1.4 * uTrail) * k * k;
      vSharp = 0.6;
    }
  } else {
    float sp = 0.03 + hash11(aSeed * 3.7) * 0.1;
    float ang = aA - uTime * sp;
    p = vec3(cos(ang) * aR, sin(ang) * aR, position.z);
    float tw = 0.5 + 0.5 * sin(uTime * (1.0 + hash11(aSeed) * 3.0) + aSeed * 50.0);
    size = 0.07 + hash11(aSeed * 9.1) * 0.09;
    b = (0.3 + exp(-angDist(ang, uPkt) * 2.5) * 1.5 + uNear * 0.6) * tw;
    c = mix(uCol, vec3(1.2), step(0.93, hash11(aSeed * 1.3)) * 0.7);
    vSharp = 0.5;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  // sprite sizes are world units: follow the group scale (0.52 on portrait) so
  // auras and the comet keep their proportion to the ring; dust only halfway,
  // so it never shrinks below a readable sparkle
  float sc = length(modelViewMatrix[0].xyz);
  size *= aMode < 1.5 ? sc : sqrt(sc);
  gl_PointSize = clamp(size * uProj * uDpr / max(0.5, -mv.z), 1.0, 256.0);
  vCol = c * b * uIntensity;
  gl_Position = projectionMatrix * mv;
}
`
const PTS_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vSharp;
${FOG_FRAG_PARS}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float halo = exp(-d * d * 5.0) - 0.0067;
  float core = smoothstep(0.4, 0.0, d);
  vec3 col = vCol * (halo * (1.0 - vSharp * 0.4) + core * vSharp * 1.4);
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

// hex membrane across the aperture: rim-weighted, flares as it is pierced
const MEM_VERT = /* glsl */ `
varying vec2 vP;
${FOG_VERT_PARS}
void main(){
  vP = position.xy;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const MEM_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uPkt;
uniform float uFlash;
uniform float uNear;
uniform float uCross;
uniform vec2 uCamXY;
uniform vec3 uCol;
varying vec2 vP;
${HASH}
${ANGDIST}
${FOG_FRAG_PARS}
// distance to the hex cell border (0.5 on the border) + the cell centre
float hexDist(vec2 p, out vec2 id){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  id = p - g;
  g = abs(g);
  return max(dot(g, vec2(0.5, 0.8660254)), g.x);
}
void main(){
  float rr = length(vP) / ${R.toFixed(1)};
  vec2 id;
  float hd = hexDist(vP * 0.62, id);
  float w = fwidth(hd) + 0.012;
  float line = smoothstep(0.5 - w, 0.5, hd);
  // finer lattice that only resolves while the camera is inside the membrane
  vec2 id2;
  float hd2 = hexDist(vP * 2.4, id2);
  float line2 = smoothstep(0.5 - fwidth(hd2) - 0.01, 0.5, hd2);
  // a few cells blink on and off like a shield negotiating a handshake
  vec2 key = vec2(floor(id.x * 2.0 + 0.5), floor(id.y * 1.1547005 + 0.5));
  float on = step(0.93, hash21(key * 1.37 + floor(uTime * 1.5 + hash21(key) * 7.0)));
  float fill = on * smoothstep(0.5, 0.2, hd);
  float rim = smoothstep(0.55, 1.0, rr);
  // atan(0, 0) is undefined (NaN on some GPUs, and a NaN pixel smears through
  // the bloom mip chain): nudge x off the exact centre
  float ax = abs(vP.x) < 0.0001 ? 0.0001 : vP.x;
  float near = exp(-angDist(atan(vP.y, ax), uPkt) * 2.0);
  float wave = 0.5 + 0.5 * sin(rr * 20.0 + uTime * 2.0);
  // ripples spreading from the exact point the camera pierces the membrane
  float dc = length(vP - uCamXY);
  float rip = 0.5 + 0.5 * sin(dc * 2.0 - uTime * 8.0);
  rip = rip * rip * rip * rip * exp(-dc * 0.1);
  float glow = exp(-dc * 0.3);
  float b = line * rim * (0.03 + near * 0.09 + wave * 0.025 + uNear * 0.05);
  b += line * uCross * (0.08 + 0.18 * rim + rip * 0.6 + glow * 0.4);
  b += line2 * uCross * (0.05 + glow * 0.25);
  b += rip * uCross * 0.05;
  b += fill * (0.05 * rim + 0.1 * uCross);
  b += smoothstep(0.94, 1.0, rr) * (0.06 + uFlash * 0.15 + uNear * 0.2 + uCross * 0.4);
  gl_FragColor = vec4(uCol * b * uIntensity * fogVis(), 1.0);
}
`

/* --- geometry builders ---------------------------------------------------- */

/** every thin-quad element of the gate in one indexed mesh */
function buildRings(mobile: boolean, rnd: () => number) {
  const pos: number[] = []
  const ang: number[] = []
  const kind: number[] = []
  const spin: number[] = []
  const wv: number[] = []
  const vv: number[] = []
  const idx: number[] = []
  let vc = 0
  // phones see the gate at 0.52 scale from 25u: thicken every quad so the
  // hairlines stay above a pixel instead of breaking into dotted aliasing
  const WK = mobile ? 1.6 : 1
  // corners in order: (w-, v0) (w+, v0) (w-, v1) (w+, v1)
  const quad = (pts: number[], a: number, k: number, sp: number, v1 = 0) => {
    pos.push(...pts)
    ang.push(a, a, a, a)
    kind.push(k, k, k, k)
    spin.push(sp, sp, sp, sp)
    wv.push(-1, 1, -1, 1)
    vv.push(0, 0, v1, v1)
    idx.push(vc, vc + 1, vc + 2, vc + 2, vc + 1, vc + 3)
    vc += 4
  }
  // tangential arc piece at radius r from angle a0 to a1, half-thickness w
  const arc = (r: number, a0: number, a1: number, hw: number, z: number, k: number, sp: number) => {
    const w = hw * WK
    const c0 = Math.cos(a0)
    const s0 = Math.sin(a0)
    const c1 = Math.cos(a1)
    const s1 = Math.sin(a1)
    quad(
      [c0 * (r - w), s0 * (r - w), z, c0 * (r + w), s0 * (r + w), z, c1 * (r - w), s1 * (r - w), z, c1 * (r + w), s1 * (r + w), z],
      (a0 + a1) / 2,
      k,
      sp,
    )
  }
  // radial bar at angle a from r0 to r1, half-width w
  const bar = (a: number, r0: number, r1: number, hw: number, z: number, k: number, sp: number, v1 = 0) => {
    const c = Math.cos(a)
    const s = Math.sin(a)
    const tx = -s * hw * WK
    const ty = c * hw * WK
    quad(
      [c * r0 - tx, s * r0 - ty, z, c * r0 + tx, s * r0 + ty, z, c * r1 - tx, s * r1 - ty, z, c * r1 + tx, s * r1 + ty, z],
      a,
      k,
      sp,
      v1,
    )
  }

  // outer dashes (slow clockwise drift), a major every 30 degrees
  const ND = mobile ? 120 : 180
  for (let i = 0; i < ND; i++) {
    const a = (i / ND) * TAU
    const major = i % (ND / 12) === 0
    const d = (major ? 0.7 : 0.26) / (2 * R_DASH)
    arc(R_DASH, a - d, a + d, major ? 0.06 : 0.035, -0.4, major ? K_MAJOR : K_DASH, -0.05)
  }
  // inner tick ring + its hairline circle, counter-rotating, nearer the eye
  const NT = mobile ? 72 : 120
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * TAU
    const major = i % (NT / 12) === 0
    bar(a, R_TICK, R_TICK - (major ? 0.95 : 0.42), major ? 0.045 : 0.025, 0.6, K_TICK, 0.08)
  }
  const NS = mobile ? 120 : 200
  for (let i = 0; i < NS; i++) {
    arc(R_TICK, (i / NS) * TAU, ((i + 1) / NS) * TAU, 0.02, 0.6, K_CIRCLE, 0.08)
  }
  // HUD brackets on the diagonals (static), with inward end caps
  const RB = 15.7
  for (let q = 0; q < 4; q++) {
    const c = Math.PI / 4 + (q * Math.PI) / 2
    const half = 0.24
    for (let s = 0; s < 14; s++) {
      arc(RB, c - half + (s * 2 * half) / 14, c - half + ((s + 1) * 2 * half) / 14, 0.045, 0.9, K_BRACKET, 0)
    }
    bar(c - half, RB - 0.55, RB + 0.05, 0.04, 0.9, K_BRACKET, 0)
    bar(c + half, RB - 0.55, RB + 0.05, 0.04, 0.9, K_BRACKET, 0)
  }
  // light spokes that charge as the camera approaches the gate
  const NSP = mobile ? 20 : 36
  for (let i = 0; i < NSP; i++) {
    const a = ((i + 0.5) / NSP) * TAU + (rnd() - 0.5) * 0.08
    bar(a, 14.4, 14.4 + 4 + rnd() * 7, 0.05 + rnd() * 0.03, 0, K_SPOKE, 0, 1)
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aAng', new BufferAttribute(new Float32Array(ang), 1))
  g.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1))
  g.setAttribute('aSpin', new BufferAttribute(new Float32Array(spin), 1))
  g.setAttribute('aW', new BufferAttribute(new Float32Array(wv), 1))
  g.setAttribute('aV', new BufferAttribute(new Float32Array(vv), 1))
  g.setIndex(idx)
  return g
}

/** step nodes at 12 / 3 / 6 / 9 o'clock: Map, Build, Prove, Run */
function buildSteps() {
  const pos: number[] = []
  const cen: number[] = []
  const stp: number[] = []
  const kind: number[] = []
  const OCT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (let i = 0; i < 4; i++) {
    const a = START - (i * Math.PI) / 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const cx = dx * R
    const cy = dy * R
    const seg = (k: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      pos.push(cx + ax, cy + ay, az, cx + bx, cy + by, bz)
      cen.push(cx, cy, 0, cx, cy, 0)
      stp.push(i, i)
      kind.push(k, k)
    }
    const octa = (r: number, k: number) => {
      for (let u = 0; u < 6; u++) {
        for (let v = u + 1; v < 6; v++) {
          if (u >> 1 === v >> 1) continue // opposite tips
          seg(k, OCT[u][0] * r, OCT[u][1] * r, OCT[u][2] * r, OCT[v][0] * r, OCT[v][1] * r, OCT[v][2] * r)
        }
      }
    }
    octa(0.9, 0)
    octa(0.4, 1)
    // dashed bracket ring around the node
    for (let s = 0; s < 36; s += 2) {
      const t0 = (s / 36) * TAU
      const t1 = ((s + 1) / 36) * TAU
      seg(2, Math.cos(t0) * 1.6, Math.sin(t0) * 1.6, 0, Math.cos(t1) * 1.6, Math.sin(t1) * 1.6, 0)
    }
    // callout: radial stem, label bars, and i+1 pips that number the step
    const tx = dy // clockwise tangent
    const ty = -dx
    const r0 = 2.0
    const r1 = 3.5
    seg(3, dx * r0, dy * r0, 0, dx * r1, dy * r1, 0)
    seg(3, dx * r1, dy * r1, 0, dx * r1 + tx * 1.9, dy * r1 + ty * 1.9, 0)
    const r2 = r1 + 0.32
    seg(3, dx * r2 + tx * 0.85, dy * r2 + ty * 0.85, 0, dx * r2 + tx * 1.9, dy * r2 + ty * 1.9, 0)
    for (let n = 0; n <= i; n++) {
      const o = 0.12 + n * 0.16
      seg(3, dx * (r1 + 0.2) + tx * o, dy * (r1 + 0.2) + ty * o, 0, dx * (r1 + 0.48) + tx * o, dy * (r1 + 0.48) + ty * o, 0)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aCenter', new BufferAttribute(new Float32Array(cen), 3))
  g.setAttribute('aStep', new BufferAttribute(new Float32Array(stp), 1))
  g.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1))
  return g
}

/** node auras (4) + packet comet (COMET) + orbit dust */
function buildPoints(mobile: boolean, rnd: () => number) {
  const SPARK = mobile ? 260 : 600
  const n = 4 + COMET + SPARK
  const pos = new Float32Array(n * 3)
  const mode = new Float32Array(n)
  const aA = new Float32Array(n)
  const aR = new Float32Array(n)
  const seed = new Float32Array(n)
  let o = 0
  for (let i = 0; i < 4; i++, o++) {
    const a = START - (i * Math.PI) / 2
    pos[o * 3] = Math.cos(a) * R
    pos[o * 3 + 1] = Math.sin(a) * R
    mode[o] = 0
    aA[o] = i
    aR[o] = R
  }
  for (let j = 0; j < COMET; j++, o++) {
    pos[o * 3] = R
    mode[o] = 1
    aA[o] = j
    aR[o] = R
  }
  for (let s = 0; s < SPARK; s++, o++) {
    const a = rnd() * TAU
    const r = R + (rnd() + rnd() - 1) * 2.4
    const z = (rnd() - 0.5) * 2.2
    pos[o * 3] = Math.cos(a) * r
    pos[o * 3 + 1] = Math.sin(a) * r
    pos[o * 3 + 2] = z
    mode[o] = 2
    aA[o] = a
    aR[o] = r
    seed[o] = rnd()
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aMode', new BufferAttribute(mode, 1))
  g.setAttribute('aA', new BufferAttribute(aA, 1))
  g.setAttribute('aR', new BufferAttribute(aR, 1))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  return g
}

function buildLoop(accent: string, mobile: boolean) {
  const rnd = mulberry32(0x100b7)
  const stepLv = new Float32Array(4)
  const U = {
    uIntensity: { value: 0.35 },
    uProj: { value: 800 },
    uPkt: { value: START },
    uProg: { value: 0 },
    uTrail: { value: 0 },
    uFlash: { value: 0 },
    uNear: { value: 0 },
    uCross: { value: 0 },
    uCamXY: { value: new Vector2(0, 0) },
    uStep: { value: stepLv },
    uCol: { value: new Color(accent) },
  }
  const mat = (vertexShader: string, fragmentShader: string) =>
    new ShaderMaterial({
      uniforms: { ...worldUniforms, ...U },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      toneMapped: false,
    })

  const ringGeo = new TorusGeometry(R, mobile ? 0.13 : 0.08, 6, mobile ? 220 : 360)
  const ringsGeo = buildRings(mobile, rnd)
  const stepGeo = buildSteps()
  const ptsGeo = buildPoints(mobile, rnd)
  const memGeo = new CircleGeometry(R - 0.12, mobile ? 72 : 144)
  const geos = [ringGeo, ringsGeo, stepGeo, ptsGeo, memGeo]
  // spoke tips reach r = 25.4 (14.4 + 4 + 7); shader motion never leaves this sphere
  for (const g of geos) g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 26)

  const ringMat = mat(RING_VERT, RING_FRAG)
  const ringsMat = mat(RINGS_VERT, RINGS_FRAG)
  ringsMat.side = DoubleSide
  const stepMat = mat(STEP_VERT, STEP_FRAG)
  const ptsMat = mat(PTS_VERT, PTS_FRAG)
  const memMat = mat(MEM_VERT, MEM_FRAG)
  memMat.side = DoubleSide
  const mats = [ringMat, ringsMat, stepMat, ptsMat, memMat]

  const dispose = () => {
    for (const g of geos) g.dispose()
    for (const m of mats) m.dispose()
  }
  return { U, stepLv, dispose, ringGeo, ringsGeo, stepGeo, ptsGeo, memGeo, ringMat, ringsMat, stepMat, ptsMat, memMat }
}

export function LoopConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const last = useRef(-1)
  const A = useMemo(() => buildLoop(accent, tier === 'mobile'), [accent, tier])
  useEffect(() => () => A.dispose(), [A])

  useFrame((state) => {
    const g = root.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station)
    const time = worldState.time
    const dt = last.current < 0 ? 0 : Math.min(Math.max(time - last.current, 0), 0.05)
    last.current = time
    const U = A.U
    const cam = state.camera as PerspectiveCamera
    U.uIntensity.value = 0.35 + 0.65 * p
    U.uProj.value = state.size.height / (2 * Math.tan(((cam.fov || 62) * Math.PI) / 360))

    // tall frames: shrink the gate so all four steps fit (the path still threads it)
    const s = worldState.aspect < 0.9 ? PORTRAIT_SCALE : 1
    const ig = inner.current
    if (ig) {
      if (ig.scale.x !== s) ig.scale.setScalar(s)
      ig.rotation.x = Math.sin(time * 0.13) * 0.04
      ig.rotation.y = Math.sin(time * 0.11) * 0.05
    }

    // the loop: dwell on a step, then glide clockwise to the next
    const sp = (time % CYCLE) / STEP_DUR // 0..4
    const si = Math.min(3, Math.floor(sp))
    const x = Math.min(1, Math.max(0, (sp - si - DWELL) / (0.95 - DWELL)))
    const prog = (si + x * x * (3 - 2 * x)) / 4
    U.uPkt.value = START - prog * TAU
    U.uProg.value = prog
    U.uTrail.value = 4 * x * (1 - x)

    // a step flares when the packet lands on it, stays lit until the lap
    // completes, and Map re-fires (with the whole gate) as the loop restarts
    const e0 = sp >= 3.95 ? sp - 3.95 : sp + 0.05
    const k = 1 - Math.exp(-dt * 10)
    const lv = A.stepLv
    for (let i = 0; i < 4; i++) {
      const e = i === 0 ? e0 : sp - (i - 0.05)
      const target = e < 0 ? 0.08 : 0.4 + 1.25 * Math.exp(-e * 2.4)
      lv[i] += (target - lv[i]) * k
    }
    U.uFlash.value = Math.exp(-e0 * 3.5)

    // gate crossing: the rim charges on approach, the membrane flares as it is pierced
    const dz = Math.abs(cam.position.z - position[2])
    U.uNear.value = 1 - smooth(4, 24, dz)
    U.uCross.value = 1 - smooth(0, 7, dz)
    U.uCamXY.value.set((cam.position.x - position[0]) / s, (cam.position.y - position[1]) / s)
  })

  return (
    <group ref={root} position={position}>
      <group ref={inner}>
        <mesh geometry={A.memGeo} material={A.memMat} />
        <mesh geometry={A.ringGeo} material={A.ringMat} />
        <mesh geometry={A.ringsGeo} material={A.ringsMat} />
        <lineSegments geometry={A.stepGeo} material={A.stepMat} />
        <points geometry={A.ptsGeo} material={A.ptsMat} />
      </group>
    </group>
  )
}
