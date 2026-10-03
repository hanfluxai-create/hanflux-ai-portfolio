/* ============================================================================
   STATION 3 · ORCHESTRATION: the n8n nervous system as a 3D flow graph.
   Thirteen holographic nodes in five stages (1 / 3 / 4 / 3 / 2), wired by
   n8n-style bezier connectors with horizontal tangents. A schedule trigger
   fires a wave of executions every couple of seconds; packets race the
   connectors and every arrival flashes the node it lands on. The amber node
   is the human checkpoint: work queues in orbit around it until a person
   approves the batch, then it is released downstream. Now and then a run
   errors (red-pink sparks), backs off to the previous node and retries:
   self-healing instead of silent failure.

   Layers: node shells + rotating cores and icons (main form), connectors and
   a projection plate with plumb lines, label stubs and HUD brackets
   (secondary system), packets, ports and drifting data dust (sparkle).
   Six draw calls. The packet sim runs on the CPU over pre-sampled curves (a
   few hundred floats per frame); everything else animates in the shaders.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubicBezierCurve3,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  ShaderMaterial,
  Sphere,
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

type V3 = [number, number, number]

/* --- the graph --------------------------------------------------------------
   A left-to-right DAG in five stages (x = -6 / -3 / 0 / 3 / 6), staggered in
   y and z so it reads as a volume rather than a flowchart on glass.
   -------------------------------------------------------------------------- */
const NODES: V3[] = [
  [-6, 0.1, 0],
  [-3, 2.5, -0.9],
  [-3, 0.1, 1.3],
  [-3, -2.4, -0.4],
  [0, 3.4, 0.7],
  [0, 1.15, -1.7],
  [0, -1.15, 1.5],
  [0, -3.3, -0.6],
  [3, 2.4, 1.1],
  [3, 0.05, -1.3],
  [3, -2.4, 0.9],
  [6, 1.35, -0.5],
  [6, -1.25, 0.7],
]
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3],
  [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7],
  [4, 8], [5, 8], [5, 9], [6, 9], [6, 10], [7, 10],
  [8, 11], [9, 11], [9, 12], [10, 12],
]
const N = NODES.length
const E = EDGES.length
const TRIGGER = 0
const CHECK = 9 // human-in-the-loop checkpoint (amber)
/** outgoing edge indices per node */
const OUT: number[][] = NODES.map((_n, i) => EDGES.flatMap(([a], e) => (a === i ? [e] : [])))
const STAGES = [-6, -3, 0, 3, 6]

const H = 0.45 // node half-size (0.9 cube)
const PORT = H + 0.04
const SAMPLES = 40
const YAW = 0.12
const DESKTOP_SCALE = 1.12
const PLATE_Y = -4.6
const TAU = Math.PI * 2
const AMBER = '#FFB547'
const FAIL = '#FF3D7F'

const TRIG_EVERY = 1.7 // schedule trigger period (s)
const GATE_EVERY = 2.9 // human approval cadence (s)
const FAIL_EVERY = 5.2 // roughly how often a run errors and retries (s)

// wireframe element kinds
const K_CUBE = 0
const K_CORE = 1
const K_HALO_A = 2
const K_HALO_B = 3
const K_TRIG = 4
const K_ICON = 5

// packet states
const S_TRAVEL = 0
const S_HELD = 1
const S_GATED = 2
const S_FAIL = 3
const S_RETRY = 4
const S_WAIT = 5
const S_QUEUED = 6

/* --- shaders -------------------------------------------------------------- */
const ROT2 = /* glsl */ `
mat2 rot2(float a){
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}
`

const WIRE_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute float aNode;
attribute float aKind;
uniform float uTime;
uniform float uIntensity;
uniform float uHeat[${N}];
uniform vec3 uTint[${N}];
uniform float uTrig;
uniform float uGate;
uniform float uRelease;
varying vec3 vCol;
${FOG_VERT_PARS}
${ROT2}
void main(){
  int i = int(aNode + 0.5);
  float heat = uHeat[i];
  vec3 l = position - aCenter;
  float b = 0.0;
  if (aKind < 0.5) {
    l *= 1.0 + heat * 0.07;
    b = 0.5 + heat * 1.9;
  } else if (aKind < 1.5) {
    float a = uTime * 0.8 + aNode * 1.37;
    l.xz = rot2(a) * l.xz;
    l.xy = rot2(a * 0.6) * l.xy;
    l *= 1.0 + heat * 0.4;
    b = 0.9 + heat * 2.4;
  } else if (aKind < 2.5) {
    l.xy = rot2(uTime * 0.5) * l.xy;
    l *= 1.0 + uRelease * 0.22;
    b = 0.28 + uGate * 1.0 + uRelease * 1.5;
  } else if (aKind < 3.5) {
    l.xy = rot2(-uTime * 0.8) * l.xy;
    l *= 1.0 + uRelease * 0.12;
    b = 0.18 + uGate * 0.55 + uRelease * 1.1;
  } else if (aKind < 4.5) {
    l *= 0.75 + uTrig * 1.9;
    float f = 1.0 - uTrig;
    b = f * f * 1.7;
  } else {
    l.y += sin(uTime * 1.6 + aNode) * 0.02;
    l *= 1.0 + heat * 0.25;
    b = 1.0 + heat * 2.2;
  }
  vCol = uTint[i] * b * uIntensity;
  vec4 mv = modelViewMatrix * vec4(aCenter + l, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const WIRE_FRAG = /* glsl */ `
varying vec3 vCol;
${FOG_FRAG_PARS}
void main(){
  gl_FragColor = vec4(vCol * fogVis(), 1.0);
}
`

const FILL_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute float aNode;
uniform float uHeat[${N}];
uniform vec3 uTint[${N}];
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vCol;
varying float vHeat;
varying float vY;
${FOG_VERT_PARS}
void main(){
  int i = int(aNode + 0.5);
  vHeat = uHeat[i];
  vCol = uTint[i] * uIntensity;
  vUv = uv;
  vec3 l = (position - aCenter) * (1.0 + vHeat * 0.07);
  vY = l.y;
  vec4 mv = modelViewMatrix * vec4(aCenter + l, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const FILL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vHeat;
varying float vY;
${FOG_FRAG_PARS}
void main(){
  vec2 q = abs(vUv - 0.5) * 2.0;
  float edge = max(q.x, q.y);
  float rim = smoothstep(0.6, 1.0, edge);
  float scan = smoothstep(0.7, 1.0, sin(vY * 30.0 - uTime * 4.0));
  float b = 0.03 + rim * 0.14 + scan * 0.03 + vHeat * (0.16 + rim * 0.3);
  gl_FragColor = vec4(vCol * b * fogVis(), 1.0);
}
`

const LINK_VERT = /* glsl */ `
attribute float aEdge;
attribute float aT;
attribute float aAmber;
uniform float uEdgeHeat[${E}];
uniform float uEdgeFail[${E}];
varying float vT;
varying float vSeed;
varying float vHeat;
varying float vFail;
varying float vAmber;
${FOG_VERT_PARS}
void main(){
  int e = int(aEdge + 0.5);
  vHeat = uEdgeHeat[e];
  vFail = uEdgeFail[e];
  vT = aT;
  vSeed = aEdge * 0.37;
  vAmber = aAmber;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const LINK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uCol;
uniform vec3 uAmber;
uniform vec3 uRed;
varying float vT;
varying float vSeed;
varying float vHeat;
varying float vFail;
varying float vAmber;
${FOG_FRAG_PARS}
void main(){
  float flow = smoothstep(0.8, 1.0, fract(vT * 7.0 - uTime * 0.9 + vSeed));
  vec3 c = mix(uCol, uAmber * 0.7, vAmber);
  c = mix(c, uRed, vFail);
  float b = 0.14 + flow * 0.2 + vHeat * 0.42 + vFail * 0.55;
  gl_FragColor = vec4(c * b * uIntensity * fogVis(), 1.0);
}
`

const CHASSIS_VERT = /* glsl */ `
attribute float aA;
varying float vA;
varying float vX;
${FOG_VERT_PARS}
void main(){
  vA = aA;
  vX = position.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const CHASSIS_FRAG = /* glsl */ `
uniform float uSweep;
uniform float uIntensity;
uniform vec3 uCol;
varying float vA;
varying float vX;
${FOG_FRAG_PARS}
void main(){
  float dx = (vX - uSweep) * 1.2;
  float band = exp(-dx * dx);
  float b = vA * (0.3 + band * 0.9);
  gl_FragColor = vec4(uCol * b * uIntensity * fogVis(), 1.0);
}
`

const PKT_VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
uniform float uDpr;
uniform float uProj;
uniform float uIntensity;
varying vec3 vCol;
${FOG_VERT_PARS}
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_PointSize = clamp(aSize * uProj * uDpr / max(0.5, -mv.z), 0.0, 96.0);
  vCol = aCol * (0.55 + 0.45 * uIntensity);
  gl_Position = projectionMatrix * mv;
}
`
const PKT_FRAG = /* glsl */ `
varying vec3 vCol;
${FOG_FRAG_PARS}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.42, 0.0, d);
  float halo = (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(vCol * (halo * 0.7 + core * 1.3) * fogVis(), 1.0);
}
`

const DUST_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uDpr;
uniform float uProj;
varying float vTw;
varying float vWhite;
${HASH}
${FOG_VERT_PARS}
void main(){
  vec3 p = position;
  float sp = 0.25 + hash11(aSeed * 17.0) * 0.6;
  p.x = mod(p.x + 7.5 + uTime * sp, 15.0) - 7.5;
  p.y += sin(uTime * 0.6 + aSeed * 6.2831853) * 0.15;
  float edgeFade = 1.0 - smoothstep(5.5, 7.5, abs(p.x));
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash11(aSeed * 7.0) * 3.0) + aSeed * 40.0);
  vTw = tw * tw * edgeFade;
  vWhite = step(0.93, hash11(aSeed * 31.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mv.z;
  float sz = (0.05 + hash11(aSeed * 53.0) * 0.08) * (1.0 + vWhite * 0.5);
  gl_PointSize = clamp(sz * uProj * uDpr / max(0.5, -mv.z), 1.0, 24.0);
  gl_Position = projectionMatrix * mv;
}
`
const DUST_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uIntensity;
varying float vTw;
varying float vWhite;
${FOG_FRAG_PARS}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d) * (1.0 - d);
  vec3 c = mix(uCol * 0.9, vec3(1.0, 1.2, 1.5), vWhite);
  gl_FragColor = vec4(c * a * vTw * uIntensity * fogVis(), 1.0);
}
`

/* --- geometry builders ---------------------------------------------------- */

/** node shells, cores/icons, checkpoint halos and the trigger pulse ring */
function buildWire() {
  const pos: number[] = []
  const cen: number[] = []
  const nid: number[] = []
  const kind: number[] = []
  const seg = (i: number, k: number, a: V3, b: V3) => {
    const [cx, cy, cz] = NODES[i]
    pos.push(cx + a[0], cy + a[1], cz + a[2], cx + b[0], cy + b[1], cz + b[2])
    cen.push(cx, cy, cz, cx, cy, cz)
    nid.push(i, i)
    kind.push(k, k)
  }
  const poly = (i: number, k: number, pts: [number, number][]) => {
    for (let s = 0; s < pts.length - 1; s++) {
      seg(i, k, [pts[s][0], pts[s][1], 0], [pts[s + 1][0], pts[s + 1][1], 0])
    }
  }
  const ring = (
    i: number,
    k: number,
    r: number,
    n: number,
    on: (s: number) => boolean,
    oy = 0,
    span = TAU,
  ) => {
    for (let s = 0; s < n; s++) {
      if (!on(s)) continue
      const t0 = (span * s) / n
      const t1 = (span * (s + 1)) / n
      seg(i, k, [Math.cos(t0) * r, Math.sin(t0) * r + oy, 0], [Math.cos(t1) * r, Math.sin(t1) * r + oy, 0])
    }
  }
  const all = () => true
  const corner = (c: number): V3 => [c & 1 ? H : -H, c & 2 ? H : -H, c & 4 ? H : -H]
  const OCT: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

  for (let i = 0; i < N; i++) {
    // 0.9 cube shell: corner pairs that differ in exactly one axis
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        const x = a ^ b
        if (x === 1 || x === 2 || x === 4) seg(i, K_CUBE, corner(a), corner(b))
      }
    }
    if (i === TRIGGER) {
      poly(i, K_ICON, [[0.09, 0.27], [-0.1, 0.02], [0.05, 0.02], [-0.09, -0.27]]) // bolt
    } else if (i === CHECK) {
      ring(i, K_ICON, 0.075, 16, all, 0.13) // head
      ring(i, K_ICON, 0.17, 12, all, -0.2, Math.PI) // shoulders
    } else if (!OUT[i].length) {
      poly(i, K_ICON, [[-0.17, 0], [-0.05, -0.13], [0.19, 0.15]]) // delivered
    } else {
      const r = 0.2
      for (let a = 0; a < 6; a++) {
        for (let b = a + 1; b < 6; b++) {
          if (a >> 1 === b >> 1) continue // opposite tips
          const A = OCT[a]
          const B = OCT[b]
          seg(i, K_CORE, [A[0] * r, A[1] * r, A[2] * r], [B[0] * r, B[1] * r, B[2] * r])
        }
      }
    }
  }
  ring(CHECK, K_HALO_A, 0.8, 40, (s) => s % 2 === 0)
  ring(CHECK, K_HALO_B, 1.14, 48, (s) => s % 8 < 5)
  ring(TRIGGER, K_TRIG, 0.62, 36, all)

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aCenter', new BufferAttribute(new Float32Array(cen), 3))
  g.setAttribute('aNode', new BufferAttribute(new Float32Array(nid), 1))
  g.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1))
  return g
}

/** faint holo-panel fills: every node box merged into one mesh */
function buildFill() {
  const box = new BoxGeometry(H * 2, H * 2, H * 2)
  const bp = box.attributes.position.array
  const bu = box.attributes.uv.array
  const bi = box.index!.array
  const vc = box.attributes.position.count
  const pos = new Float32Array(vc * N * 3)
  const uv = new Float32Array(vc * N * 2)
  const cen = new Float32Array(vc * N * 3)
  const nid = new Float32Array(vc * N)
  const idx = new Uint16Array(bi.length * N)
  for (let i = 0; i < N; i++) {
    const [cx, cy, cz] = NODES[i]
    for (let v = 0; v < vc; v++) {
      const o = i * vc + v
      pos[o * 3] = bp[v * 3] + cx
      pos[o * 3 + 1] = bp[v * 3 + 1] + cy
      pos[o * 3 + 2] = bp[v * 3 + 2] + cz
      cen[o * 3] = cx
      cen[o * 3 + 1] = cy
      cen[o * 3 + 2] = cz
      uv[o * 2] = bu[v * 2]
      uv[o * 2 + 1] = bu[v * 2 + 1]
      nid[o] = i
    }
    for (let k = 0; k < bi.length; k++) idx[i * bi.length + k] = bi[k] + i * vc
  }
  box.dispose()
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setAttribute('aCenter', new BufferAttribute(cen, 3))
  g.setAttribute('aNode', new BufferAttribute(nid, 1))
  g.setIndex(new BufferAttribute(idx, 1))
  return g
}

/** connectors: out-port → in-port beziers, arc-length sampled for the packets */
function buildLinks() {
  const samp = new Float32Array(E * (SAMPLES + 1) * 3)
  const lens = new Float32Array(E)
  const pos = new Float32Array(E * SAMPLES * 6)
  const aEdge = new Float32Array(E * SAMPLES * 2)
  const aT = new Float32Array(E * SAMPLES * 2)
  const aAmber = new Float32Array(E * SAMPLES * 2)
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  const pt = new Vector3()
  EDGES.forEach(([a, b], e) => {
    const A = NODES[a]
    const B = NODES[b]
    const p0 = new Vector3(A[0] + PORT, A[1], A[2])
    const p3 = new Vector3(B[0] - PORT, B[1], B[2])
    const dx = (p3.x - p0.x) * 0.55
    const curve = new CubicBezierCurve3(
      p0,
      new Vector3(p0.x + dx, p0.y, p0.z),
      new Vector3(p3.x - dx, p3.y, p3.z),
      p3,
    )
    lens[e] = curve.getLength()
    for (let s = 0; s <= SAMPLES; s++) {
      curve.getPointAt(s / SAMPLES, pt)
      const o = (e * (SAMPLES + 1) + s) * 3
      samp[o] = pt.x
      samp[o + 1] = pt.y
      samp[o + 2] = pt.z
    }
    // amber tint where a connector enters / leaves the human checkpoint
    const amber = (t: number) => (b === CHECK ? sm(0.5, 1, t) : a === CHECK ? 1 - sm(0, 0.5, t) : 0)
    for (let s = 0; s < SAMPLES; s++) {
      const v = (e * SAMPLES + s) * 2
      for (let j = 0; j < 2; j++) {
        const src = (e * (SAMPLES + 1) + s + j) * 3
        pos[(v + j) * 3] = samp[src]
        pos[(v + j) * 3 + 1] = samp[src + 1]
        pos[(v + j) * 3 + 2] = samp[src + 2]
        const t = (s + j) / SAMPLES
        aEdge[v + j] = e
        aT[v + j] = t
        aAmber[v + j] = amber(t)
      }
    }
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aEdge', new BufferAttribute(aEdge, 1))
  geo.setAttribute('aT', new BufferAttribute(aT, 1))
  geo.setAttribute('aAmber', new BufferAttribute(aAmber, 1))
  return { geo, samp, lens }
}

/** projection plate, plumb lines, label stubs, stage ruler and HUD brackets */
function buildChassis() {
  const pos: number[] = []
  const al: number[] = []
  const line = (a: V3, b: V3, aa: number, ab = aa) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2])
    al.push(aa, ab)
  }
  const XR = 7.6
  const ZR = 3.6
  const fade = (x: number, z: number) => {
    const u = x / XR
    const w = z / ZR
    return 0.55 * Math.max(0, (1 - u * u) * (1 - w * w))
  }
  // plate grid, subdivided so it can fade out toward its rim
  for (let zi = -3; zi <= 3; zi++) {
    for (let s = 0; s < 30; s++) {
      const x0 = -XR + s * ((2 * XR) / 30)
      const x1 = x0 + (2 * XR) / 30
      line([x0, PLATE_Y, zi], [x1, PLATE_Y, zi], fade(x0, zi), fade(x1, zi))
    }
  }
  for (let xi = -7; xi <= 7; xi++) {
    for (let s = 0; s < 18; s++) {
      const z0 = -ZR + s * ((2 * ZR) / 18)
      const z1 = z0 + (2 * ZR) / 18
      line([xi, PLATE_Y, z0], [xi, PLATE_Y, z1], fade(xi, z0), fade(xi, z1))
    }
  }
  for (const [x, y, z] of NODES) {
    // label stubs (stand-ins for the node title + subtitle)
    line([x - 0.36, y - H - 0.18, z], [x + 0.36, y - H - 0.18, z], 0.75)
    line([x - 0.36, y - H - 0.3, z], [x + 0.1, y - H - 0.3, z], 0.45)
    // dashed plumb line down to the plate + its footprint
    const top = y - H - 0.44
    const fa = (yy: number) => 0.35 + (0.35 * (yy - PLATE_Y)) / (top - PLATE_Y)
    for (let yy = top; yy > PLATE_Y + 0.01; yy -= 0.28) {
      const y2 = Math.max(PLATE_Y, yy - 0.16)
      line([x, yy, z], [x, y2, z], fa(yy), fa(y2))
    }
    const q = 0.2
    line([x - q, PLATE_Y, z - q], [x + q, PLATE_Y, z - q], 1)
    line([x + q, PLATE_Y, z - q], [x + q, PLATE_Y, z + q], 1)
    line([x + q, PLATE_Y, z + q], [x - q, PLATE_Y, z + q], 1)
    line([x - q, PLATE_Y, z + q], [x - q, PLATE_Y, z - q], 1)
  }
  // stage ruler along the front edge of the plate
  const zr = ZR + 0.3
  line([-6.6, PLATE_Y, zr], [6.6, PLATE_Y, zr], 0.5)
  for (const x of STAGES) line([x, PLATE_Y, zr - 0.15], [x, PLATE_Y, zr + 0.3], 0.95)
  // HUD corner brackets around the whole volume
  const arm = 0.7
  for (const cx of [-7.8, 7.8]) {
    for (const cy of [PLATE_Y, 4.6]) {
      for (const cz of [-3.4, 3.4]) {
        const sx = cx < 0 ? arm : -arm
        const sy = cy < 0 ? arm : -arm
        const sz = cz < 0 ? arm : -arm
        line([cx, cy, cz], [cx + sx, cy, cz], 0.9)
        line([cx, cy, cz], [cx, cy + sy, cz], 0.9)
        line([cx, cy, cz], [cx, cy, cz + sz], 0.9)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aA', new BufferAttribute(new Float32Array(al), 1))
  return g
}

/* --- assembly + packet simulation ----------------------------------------- */
function buildOrchestration(accent: string, mobile: boolean) {
  const P = mobile ? 24 : 40
  const TRAIL = mobile ? 3 : 5
  const DUST = mobile ? 160 : 380
  const rnd = mulberry32(0x0e57a3)

  const acc = new Color(accent)
  const amb = new Color(AMBER)
  const red = new Color(FAIL)
  const ambNode = amb.clone().multiplyScalar(0.8) // amber reads hotter than blue at equal gain

  const heat = new Float32Array(N)
  const glow = new Float32Array(N) // error tint per node
  const tint = new Float32Array(N * 3)
  const edgeHeat = new Float32Array(E)
  const edgeFail = new Float32Array(E)
  const edgeCount = new Float32Array(E)

  const U = {
    uIntensity: { value: 0.35 },
    uProj: { value: 800 },
    uHeat: { value: heat },
    uTint: { value: tint },
    uEdgeHeat: { value: edgeHeat },
    uEdgeFail: { value: edgeFail },
    uTrig: { value: 0 },
    uGate: { value: 0 },
    uRelease: { value: 0 },
    uSweep: { value: -8 },
    uCol: { value: acc.clone() },
    uAmber: { value: amb.clone() },
    uRed: { value: red.clone() },
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

  const wireGeo = buildWire()
  const fillGeo = buildFill()
  const links = buildLinks()
  const linkGeo = links.geo
  const chassisGeo = buildChassis()
  const { samp, lens } = links

  // packets (+ the 2 ports of every node) in one dynamic points cloud
  const NP = 2 * N + P * TRAIL
  const pPos = new Float32Array(NP * 3)
  const pCol = new Float32Array(NP * 3)
  const pSize = new Float32Array(NP)
  NODES.forEach(([x, y, z], i) => {
    pPos.set([x - PORT, y, z, x + PORT, y, z], i * 6)
  })
  const posAttr = new BufferAttribute(pPos, 3).setUsage(DynamicDrawUsage)
  const colAttr = new BufferAttribute(pCol, 3).setUsage(DynamicDrawUsage)
  const sizeAttr = new BufferAttribute(pSize, 1).setUsage(DynamicDrawUsage)
  const ptsGeo = new BufferGeometry()
  ptsGeo.setAttribute('position', posAttr)
  ptsGeo.setAttribute('aCol', colAttr)
  ptsGeo.setAttribute('aSize', sizeAttr)

  const dPos = new Float32Array(DUST * 3)
  const dSeed = new Float32Array(DUST)
  for (let i = 0; i < DUST; i++) {
    dPos[i * 3] = (rnd() - 0.5) * 15
    dPos[i * 3 + 1] = (rnd() - 0.5) * 9
    dPos[i * 3 + 2] = (rnd() - 0.5) * 7
    dSeed[i] = rnd()
  }
  const dustGeo = new BufferGeometry()
  dustGeo.setAttribute('position', new BufferAttribute(dPos, 3))
  dustGeo.setAttribute('aSeed', new BufferAttribute(dSeed, 1))

  // every piece lives inside a ~10u sphere around the anchor
  const geos = [wireGeo, fillGeo, linkGeo, chassisGeo, ptsGeo, dustGeo]
  for (const g of geos) g.boundingSphere = new Sphere(new Vector3(0, 0, 0), 10)

  const wireMat = mat(WIRE_VERT, WIRE_FRAG)
  const fillMat = mat(FILL_VERT, FILL_FRAG)
  fillMat.side = DoubleSide
  const linkMat = mat(LINK_VERT, LINK_FRAG)
  const chassisMat = mat(CHASSIS_VERT, CHASSIS_FRAG)
  const ptsMat = mat(PKT_VERT, PKT_FRAG)
  const dustMat = mat(DUST_VERT, DUST_FRAG)
  const mats = [wireMat, fillMat, linkMat, chassisMat, ptsMat, dustMat]

  /* packet state (struct-of-arrays) */
  const pE = new Int16Array(P) // current edge
  const pT = new Float32Array(P) // 0..1 along it
  const pV = new Float32Array(P) // world units / s
  const pS = new Uint8Array(P) // state
  const pTm = new Float32Array(P) // state timer
  const pSlot = new Uint8Array(P) // orbit slot while held
  const pF = new Float32Array(P) // pending failure point (t), -1 = none
  for (let k = 0; k < P; k++) {
    pE[k] = Math.floor(rnd() * E)
    pT[k] = rnd()
    pV[k] = 2.5 + rnd() * 0.9
    pS[k] = k % 5 === 0 ? S_WAIT : S_TRAVEL
    pF[k] = -1
  }
  const sim = { trig: 0, gate: 0, fail: 0, failing: -1, cursor: 0, held: 0, release: 0 }

  const bump = (n: number, amt: number) => {
    heat[n] = Math.min(1.6, heat[n] + amt)
  }
  const launch = (k: number, node: number) => {
    const outs = OUT[node]
    pE[k] = outs[Math.floor(rnd() * outs.length)]
    pT[k] = 0
    pS[k] = S_TRAVEL
  }
  const arrive = (k: number, node: number) => {
    bump(node, 0.85)
    if (node === CHECK) {
      pS[k] = S_HELD
      // round-robin slots: never reset on release, so a fresh arrival can't land
      // on a slot still occupied by a packet waiting out its release stagger
      pSlot[k] = sim.held
      sim.held = (sim.held + 1) % 16
    } else if (!OUT[node].length) {
      pS[k] = S_WAIT
    } else {
      launch(k, node)
    }
  }
  // schedule the next error on a packet that has just set off on a plain edge
  const pickFailure = () => {
    for (let j = 0; j < P; j++) {
      const k = (sim.cursor + j) % P
      const ed = EDGES[pE[k]]
      if (pS[k] !== S_TRAVEL || pT[k] > 0.3 || ed[0] === CHECK || ed[1] === CHECK) continue
      pF[k] = pT[k] + 0.35 + rnd() * 0.2
      sim.failing = k
      sim.cursor = k + 1
      return
    }
  }
  const sampleInto = (e: number, t: number, o: number) => {
    const f = Math.min(Math.max(t, 0), 1) * SAMPLES
    const i = Math.min(SAMPLES - 1, Math.floor(f))
    const u = f - i
    const b = (e * (SAMPLES + 1) + i) * 3
    pPos[o] = samp[b] + (samp[b + 3] - samp[b]) * u
    pPos[o + 1] = samp[b + 1] + (samp[b + 4] - samp[b + 1]) * u
    pPos[o + 2] = samp[b + 2] + (samp[b + 5] - samp[b + 2]) * u
  }
  const setCol = (o: number, r: number, g: number, b: number) => {
    pCol[o * 3] = r
    pCol[o * 3 + 1] = g
    pCol[o * 3 + 2] = b
  }
  const headR = acc.r * 1.7 + 0.8
  const headG = acc.g * 1.7 + 0.8
  const headB = acc.b * 1.7 + 0.8

  const step = (dt: number, time: number) => {
    sim.trig += dt
    const fire = sim.trig >= TRIG_EVERY
    if (fire) {
      sim.trig -= TRIG_EVERY
      bump(TRIGGER, 0.9)
    }
    sim.gate += dt
    const open = sim.gate >= GATE_EVERY
    if (open) {
      sim.gate -= GATE_EVERY
      sim.release = 1
      bump(CHECK, 1.1)
    }
    sim.fail += dt
    if (sim.failing < 0 && sim.fail >= FAIL_EVERY) pickFailure()

    let q = 0 // launch stagger within a trigger wave
    let r = 0 // release stagger out of the checkpoint
    edgeCount.fill(0)
    for (let k = 0; k < P; k++) {
      const e = pE[k]
      switch (pS[k]) {
        case S_TRAVEL:
          pT[k] += (pV[k] * dt) / lens[e]
          if (pF[k] >= 0 && pT[k] >= pF[k]) {
            pT[k] = pF[k]
            pF[k] = -1
            pS[k] = S_FAIL
            pTm[k] = 0.7
            glow[EDGES[e][1]] = 1
          } else if (pT[k] >= 1) {
            arrive(k, EDGES[e][1])
          }
          break
        case S_HELD:
          if (open) {
            pS[k] = S_GATED
            pTm[k] = r++ * 0.1
          }
          break
        case S_GATED:
          pTm[k] -= dt
          if (pTm[k] <= 0) launch(k, CHECK)
          break
        case S_FAIL:
          pTm[k] -= dt
          if (pTm[k] <= 0) pS[k] = S_RETRY
          break
        case S_RETRY:
          pT[k] -= (pV[k] * 1.5 * dt) / lens[e]
          if (pT[k] <= 0) {
            pT[k] = 0
            pS[k] = S_TRAVEL
            bump(EDGES[e][0], 0.9)
            sim.failing = -1
            sim.fail = 0
          }
          break
        case S_WAIT:
          if (fire) {
            pS[k] = S_QUEUED
            pTm[k] = q++ * 0.075
          }
          break
        case S_QUEUED:
          pTm[k] -= dt
          if (pTm[k] <= 0) launch(k, TRIGGER)
          break
      }
      const s = pS[k]
      if (s === S_TRAVEL || s === S_FAIL || s === S_RETRY) edgeCount[pE[k]] += 1
    }

    // decay + per-node tint (amber checkpoint, red flash where a run errored)
    const kH = Math.exp(-dt * 3.2)
    const kG = Math.exp(-dt * 1.5)
    const kE = 1 - Math.exp(-dt * 6)
    for (let i = 0; i < N; i++) {
      heat[i] *= kH
      glow[i] *= kG
      const base = i === CHECK ? ambNode : acc
      const f = glow[i]
      tint[i * 3] = base.r + (red.r - base.r) * f
      tint[i * 3 + 1] = base.g + (red.g - base.g) * f
      tint[i * 3 + 2] = base.b + (red.b - base.b) * f
    }
    const fk = sim.failing
    const failEdge = fk >= 0 && (pS[fk] === S_FAIL || pS[fk] === S_RETRY) ? pE[fk] : -1
    for (let e = 0; e < E; e++) {
      edgeHeat[e] += (Math.min(1.2, edgeCount[e] * 0.45) - edgeHeat[e]) * kE
      edgeFail[e] += ((e === failEdge ? 1 : 0) - edgeFail[e]) * kE
    }
    sim.release *= Math.exp(-dt * 3)
    U.uRelease.value = sim.release
    const gp = sim.gate / GATE_EVERY
    U.uGate.value = gp * gp
    U.uTrig.value = Math.min(1, sim.trig / 1.1)
    U.uSweep.value = -8.5 + ((time * 3.4) % 17)

    // ports: brighten with their node (a trigger has no input)
    for (let i = 0; i < N; i++) {
      const b = 0.75 + heat[i] * 1.6
      for (let s = 0; s < 2; s++) {
        const o = i * 2 + s
        const m = i === TRIGGER && s === 0 ? 0 : b
        setCol(o, tint[i * 3] * m, tint[i * 3 + 1] * m, tint[i * 3 + 2] * m)
        pSize[o] = 0.16 + heat[i] * 0.08
      }
    }

    // packets: head + comet trail
    const hx = NODES[CHECK][0]
    const hy = NODES[CHECK][1]
    const hz = NODES[CHECK][2]
    for (let k = 0; k < P; k++) {
      const base = 2 * N + k * TRAIL
      const s = pS[k]
      if (s === S_WAIT || s === S_QUEUED) {
        for (let j = 0; j < TRAIL; j++) {
          setCol(base + j, 0, 0, 0)
          pSize[base + j] = 0
        }
        continue
      }
      if (s === S_HELD || s === S_GATED) {
        // queued in orbit around the checkpoint, waiting for approval
        const rr = 0.97 + (pSlot[k] >= 8 ? 0.2 : 0)
        const a0 = pSlot[k] * (TAU / 8) + time * 1.5
        for (let j = 0; j < TRAIL; j++) {
          const o = base + j
          const a = a0 - j * 0.17
          pPos[o * 3] = hx + Math.cos(a) * rr
          pPos[o * 3 + 1] = hy + Math.sin(a) * rr
          pPos[o * 3 + 2] = hz
          const f = 1 - j / TRAIL
          if (j === 0) setCol(o, amb.r * 1.4 + 0.25, amb.g * 1.4 + 0.25, amb.b * 1.4 + 0.25)
          else setCol(o, amb.r * f, amb.g * f, amb.b * f)
          pSize[o] = j === 0 ? 0.3 : 0.2 * f + 0.05
        }
        continue
      }
      const e = pE[k]
      if (s === S_FAIL) {
        // error: the head stutters red while sparks spit off it
        const fl = 0.5 + 0.5 * Math.sin(time * 38 + k)
        sampleInto(e, pT[k], base * 3)
        const fx = pPos[base * 3]
        const fy = pPos[base * 3 + 1]
        const fz = pPos[base * 3 + 2]
        setCol(base, red.r * (1.8 + fl * 1.2) + 0.2, red.g * (1.8 + fl * 1.2) + 0.2, red.b * (1.8 + fl * 1.2) + 0.2)
        pSize[base] = 0.42 + fl * 0.18
        for (let j = 1; j < TRAIL; j++) {
          const o = base + j
          pPos[o * 3] = fx + Math.sin(time * 23 + j * 7.1) * 0.28
          pPos[o * 3 + 1] = fy + Math.cos(time * 19 + j * 3.3) * 0.28
          pPos[o * 3 + 2] = fz + Math.sin(time * 17 + j * 1.9) * 0.28
          setCol(o, red.r * 1.2 * fl, red.g * 1.2 * fl, red.b * 1.2 * fl)
          pSize[o] = 0.12
        }
        continue
      }
      // travelling forward, or backing off to retry (trail leads the other way)
      const back = s === S_RETRY
      const dir = back ? 1 : -1
      const sp = 0.16 / lens[e]
      for (let j = 0; j < TRAIL; j++) {
        const o = base + j
        sampleInto(e, pT[k] + dir * j * sp, o * 3)
        const f = Math.pow(1 - j / TRAIL, 1.3)
        if (back) {
          if (j === 0) setCol(o, red.r * 1.2 + acc.r * 0.6 + 0.3, red.g * 1.2 + acc.g * 0.6 + 0.3, red.b * 1.2 + acc.b * 0.6 + 0.3)
          else setCol(o, red.r * 0.9 * f, red.g * 0.9 * f, red.b * 0.9 * f)
        } else if (j === 0) {
          setCol(o, headR, headG, headB)
        } else {
          setCol(o, acc.r * 1.6 * f, acc.g * 1.6 * f, acc.b * 1.6 * f)
        }
        pSize[o] = j === 0 ? 0.34 : 0.24 * f + 0.06
      }
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
  }

  const dispose = () => {
    for (const g of geos) g.dispose()
    for (const m of mats) m.dispose()
  }

  return {
    U,
    step,
    dispose,
    wireGeo,
    fillGeo,
    linkGeo,
    chassisGeo,
    ptsGeo,
    dustGeo,
    wireMat,
    fillMat,
    linkMat,
    chassisMat,
    ptsMat,
    dustMat,
  }
}

export function OrchestrationConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const last = useRef(-1)
  const A = useMemo(() => buildOrchestration(accent, tier === 'mobile'), [accent, tier])
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

    const cam = state.camera as PerspectiveCamera
    A.U.uIntensity.value = 0.35 + 0.65 * p
    A.U.uProj.value = state.size.height / (2 * Math.tan(((cam.fov || 62) * Math.PI) / 360))
    A.step(dt, time)

    // a slow sway so the volume keeps revealing its depth; a touch larger on
    // wide frames where it shares the screen with the copy
    const ig = inner.current
    if (ig) {
      const sc = worldState.aspect < 0.9 ? 1 : DESKTOP_SCALE
      if (ig.scale.x !== sc) ig.scale.setScalar(sc)
      ig.rotation.y = YAW + Math.sin(time * 0.21) * 0.05
      ig.position.y = Math.sin(time * 0.47) * 0.12
    }
  })

  return (
    <group ref={root} position={position}>
      <group ref={inner} rotation={[0, YAW, 0]}>
        <mesh geometry={A.fillGeo} material={A.fillMat} />
        <lineSegments geometry={A.wireGeo} material={A.wireMat} />
        <lineSegments geometry={A.linkGeo} material={A.linkMat} />
        <lineSegments geometry={A.chassisGeo} material={A.chassisMat} />
        <points geometry={A.ptsGeo} material={A.ptsMat} />
        <points geometry={A.dustGeo} material={A.dustMat} />
      </group>
    </group>
  )
}
