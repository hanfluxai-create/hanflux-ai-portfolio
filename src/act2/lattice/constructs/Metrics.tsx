/* ============================================================================
   METRICS · station 10 · proof: the four proof monoliths.

   Four smoked-glass slabs rise from the floor, two each side of the flight
   path, yawed toward the oncoming camera like an honour guard. Each carries a
   dot-matrix display on its path-facing side that tells its number's story:
     0  24/7   code rain that never stops, a heartbeat sweeping up it
     1  <1s    voice meters snapping in real time
     2  500+   connectors flickering on, denser as the count climbs
     3  2x     a rising staircase with launch chevrons racing up it
   As the camera arrives they light one after another and each display fills
   from the floor up, as if the numbers were counting. Overhead, beams rise
   from the white-hot caps into a lattice ceiling at y 9 that spans the path,
   with packets racing along it.

   The near pair stands wide (x ±13, z 0) and the far pair narrow (x ±7.5,
   z -14), so from the parked camera they read as two distinct ranks instead
   of stacking in the same screen column, and the camera threads the tighter
   pair as it flies on. The mobile tier (portrait: narrow view) closes them
   into a receding corridor (x ±6.5 / ±5) so all four stay in frame.

   5 draw calls: edges, bodies (fill + caps + floor pads), displays, beams,
   points (packets + motes + junction nodes).
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sphere,
  Vector3,
  Vector4,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  HASH,
  isNear,
  mulberry32,
  proximity,
  worldUniforms,
  type ConstructProps,
  type LatticeTier,
} from '../shared'

/* --- layout (group space; the group sits at y 0 so group y == world y) ---- */
const H = 15
const W = 2.2 // along the path
const DEP = 0.6 // across the path
const BOTTOM = -10 // the floor
const CY = BOTTOM + H / 2
const TOP = BOTTOM + H
const BEAM_Y = 9
const YAW = 0.6 // display faces turn toward the oncoming camera
type Layout = [number, number][]
const MONOS_DESKTOP: Layout = [
  [-13, 0],
  [13, 0],
  [-7.5, -14],
  [7.5, -14],
]
// portrait phones park 25 back with ~37° of horizontal view: x ±13 would sit
// off-screen, so the mobile tier closes ranks into a receding corridor
const MONOS_MOBILE: Layout = [
  [-6.5, 0],
  [6.5, 0],
  [-5, -16],
  [5, -16],
]

const ADD = {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  fog: false,
} as const

/** select uLit[i] without dynamic indexing */
const PICK = /* glsl */ `
float pick(vec4 v, float i) {
  vec4 m = vec4(1.0) - step(vec4(0.5), abs(vec4(i) - vec4(0.0, 1.0, 2.0, 3.0)));
  return dot(v, m);
}
`

/* --- edges: box wireframe, seams, display frame, height-ruler ticks ------- */
const EDGE_VERT = /* glsl */ `
uniform vec4 uLit;
attribute float aIdx;
varying float vLit;
varying float vY;
varying float vIdx;
${FOG_VERT_PARS}
${PICK}
void main() {
  vLit = pick(uLit, aIdx);
  vY = position.y;
  vIdx = aIdx;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const EDGE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uTime;
varying float vLit;
varying float vY;
varying float vIdx;
${FOG_FRAG_PARS}
void main() {
  float scanY = mod(uTime * 2.6 + vIdx * 6.0, 24.0) - 13.0;
  // squared by hand: pow() with a negative base is undefined (NaN on ANGLE/D3D)
  float ds = (vY - scanY) / 0.8;
  float scan = exp(-ds * ds);
  float b = 0.35 + 0.65 * vLit;
  vec3 col = uColor * b * 0.85 + mix(uColor * 1.8, uHot, 0.4) * scan * (0.25 + 0.75 * vLit);
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

/* --- bodies: kind 0 smoked-glass fill, 1 white-hot cap, 2 floor pad ------- */
const BODY_VERT = /* glsl */ `
uniform vec4 uLit;
attribute float aIdx;
attribute float aKind;
varying vec2 vUv;
varying float vLit;
varying float vKind;
varying float vY;
varying float vIdx;
${FOG_VERT_PARS}
${PICK}
void main() {
  vUv = uv;
  vLit = pick(uLit, aIdx);
  vKind = aKind;
  vY = position.y;
  vIdx = aIdx;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const BODY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uTime;
varying vec2 vUv;
varying float vLit;
varying float vKind;
varying float vY;
varying float vIdx;
${FOG_FRAG_PARS}
void main() {
  vec3 col;
  if (vKind < 0.5) {
    float scanY = mod(uTime * 1.6 + vIdx * 5.0, 22.0) - 12.0;
    float db = (vY - scanY) / 1.4;
    float band = exp(-db * db);
    float foot = exp(-(vY + 10.0) * 0.6);
    col = uColor * (0.02 + 0.03 * vLit + band * 0.07 * (0.3 + vLit) + foot * 0.12 * (0.3 + 0.7 * vLit));
  } else if (vKind < 1.5) {
    float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vIdx * 1.7);
    col = mix(uColor * 2.4, uHot, 0.35) * (0.35 + 0.65 * vLit) * pulse;
  } else {
    vec2 c = (vUv - 0.5) * 2.0;
    float glow = exp(-dot(c, c) * 2.2);
    float box = max(abs(c.x), abs(c.y));
    float dr = (box - 0.62) / 0.03;
    float ring = exp(-dr * dr);
    col = uColor * (glow * 0.35 + ring * 0.6) * (0.35 + 0.65 * vLit);
  }
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

/* --- displays: dot-matrix faces, one story per metric --------------------- */
const DATA_VERT = /* glsl */ `
uniform vec4 uLit;
attribute float aIdx;
varying vec2 vUv;
varying float vLit;
varying float vIdx;
${FOG_VERT_PARS}
${PICK}
void main() {
  vUv = uv;
  vLit = pick(uLit, aIdx);
  vIdx = aIdx;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const DATA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uTime;
varying vec2 vUv;
varying float vLit;
varying float vIdx;
${FOG_FRAG_PARS}
${HASH}
void main() {
  const float COLS = 12.0;
  const float ROWS = 90.0;
  vec2 g = vUv * vec2(COLS, ROWS);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  // both axes: the yawed slabs squash the columns more than the rows
  vec2 fw = fwidth(g);
  float aa = max(max(fw.x, fw.y), 1e-3);
  float dotMask = 1.0 - smoothstep(0.36 - aa, 0.36 + aa, length(f));
  // once a cell shrinks toward a pixel, melt the dots into an even glow (no moire)
  dotMask = mix(dotMask, 0.4, smoothstep(0.25, 0.6, aa));
  float v = (cell.y + 0.5) / ROWS;
  float t = uTime;
  // wrapped clock for the hash seeds: sin() hashes degrade as arguments grow
  // over a long session; a wrap is invisible in random flicker
  float tq = mod(t, 512.0);
  float fill = 0.06 + 0.94 * vLit;
  float on = 0.0;
  float hotDot = 0.0;
  if (vIdx < 0.5) {
    // 24/7
    float sp = 0.45 + 0.6 * hash11(cell.x * 3.17 + 1.0);
    float s = fract(hash11(cell.x * 7.31) + cell.y / 22.0 + t * sp);
    on = pow(1.0 - s, 1.6) * step(0.3, hash21(cell + floor(tq * 9.0)) + 0.5 * (1.0 - s));
    hotDot = step(0.955, 1.0 - s);
    float dBeat = (v - fract(t * 0.42)) * ROWS / 3.0;
    float beat = exp(-dBeat * dBeat);
    on = max(on, beat * 0.9);
  } else if (vIdx < 1.5) {
    // <1s
    float hc = hash11(cell.x * 5.7 + 2.0);
    float lv = 0.5 + 0.5 * sin(t * (6.0 + hc * 6.0) + hc * 20.0);
    lv *= 0.55 + 0.45 * sin(t * 1.7 + cell.x * 0.8);
    float level = fill * (0.25 + 0.75 * lv);
    on = step(v, level) * (0.6 + 0.6 * v / max(level, 0.01));
    hotDot = step(level - 1.5 / ROWS, v) * step(v, level);
  } else if (vIdx < 2.5) {
    // 500+
    float rate = 1.5 + 4.0 * hash21(cell.yx + 3.0);
    float r = hash21(cell + floor(tq * rate));
    on = step(0.62 - 0.28 * vLit, r);
    float row = step(0.988, hash11(cell.y * 1.37 + floor(tq * 7.0)));
    on = max(on, row);
    hotDot = row * step(0.5, hash21(cell * 1.7 + floor(tq * 7.0)));
  } else {
    // 2x
    float stair = (0.3 + 0.7 * (floor(cell.x / 2.0) + 1.0) / 6.0) * fill;
    float chev = fract((cell.y + abs(cell.x - 5.5) * 1.2 - t * 16.0) / 10.0);
    float c = step(chev, 0.16);
    on = max(step(v, stair) * 0.45, c);
    hotDot = c * step(chev, 0.06);
  }
  // count-up: the display is live below the fill line, a ghost above it
  float live = step(v, fill);
  float frontier = (1.0 - smoothstep(0.0, 1.6 / ROWS, abs(v - fill))) * smoothstep(0.02, 0.15, vLit);
  float dSweep = (vUv.y - 1.0 + fract(t * 0.15 + vIdx * 0.25)) * 14.0;
  float sweep = exp(-dSweep * dSweep);
  float b = 0.035 + on * mix(0.12, 0.85, live) + sweep * 0.12;
  vec3 col = uColor * b + uHot * (hotDot * live * 0.9 + frontier * 0.9);
  col *= dotMask * (0.45 + 0.55 * vLit);
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

/* --- beams: risers + lattice ceiling with dashes streaming along ---------- */
const BEAM_VERT = /* glsl */ `
uniform vec4 uLit;
attribute float aIdx;
attribute float aLen;
attribute float aS;
varying float vS;
varying float vLen;
varying float vLit;
${FOG_VERT_PARS}
${PICK}
void main() {
  vS = aS;
  vLen = aLen;
  vLit = pick(uLit, aIdx);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uTime;
varying float vS;
varying float vLen;
varying float vLit;
${FOG_FRAG_PARS}
void main() {
  float d = vS * vLen;
  float dash = step(0.6, fract(d * 0.7 - uTime * 2.2));
  float ends = exp(-d * 1.5) + exp(-(vLen - d) * 1.5);
  float b = 0.3 + 0.7 * vLit;
  vec3 col = uColor * b * (0.45 + 0.55 * dash) + mix(uColor * 2.0, uHot, 0.5) * ends * b;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

/* --- points: kind 0 packets on beams, 1 rising motes, 2 junction nodes ---- */
const PTS_VERT = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform vec4 uLit;
attribute vec3 aB;
attribute float aOff;
attribute float aSpeed;
attribute float aSize;
attribute float aKind;
attribute float aIdx;
varying float vKind;
varying float vBright;
${FOG_VERT_PARS}
${PICK}
void main() {
  float f = fract(aOff + uTime * aSpeed);
  vec3 p = mix(position, aB, f);
  float lit = pick(uLit, aIdx);
  float bright;
  if (aKind < 0.5) {
    bright = (0.12 + 0.88 * lit) * smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.95, 1.0, f));
  } else if (aKind < 1.5) {
    p.x += sin(uTime * 0.6 + aOff * 37.0) * 0.35;
    p.z += cos(uTime * 0.5 + aOff * 23.0) * 0.35;
    float tw = 0.5 + 0.5 * sin(uTime * (1.5 + aOff * 3.0) + aOff * 60.0);
    bright = (0.3 + 0.7 * lit) * tw * smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.8, 1.0, f));
  } else {
    bright = (0.3 + 0.7 * lit) * (0.8 + 0.2 * sin(uTime * 3.0 + aOff * 20.0));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  vKind = aKind;
  vBright = bright;
  gl_PointSize = clamp(aSize * uDpr * (30.0 / max(-mv.z, 0.5)), 1.0, 36.0);
}
`
const PTS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
varying float vKind;
varying float vBright;
${FOG_FRAG_PARS}
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float halo = 1.0 - smoothstep(0.0, 0.5, d);
  float core = exp(-d * d * 60.0);
  vec3 col;
  if (vKind > 0.5 && vKind < 1.5) col = uColor * (halo * halo * 0.5 + core * 0.6);
  else col = uColor * halo * halo * 1.1 + uHot * core * 1.2;
  gl_FragColor = vec4(col * vBright * fogVis(), 1.0);
}
`

type Part = { geo: BufferGeometry; matrix: Matrix4; consts: Record<string, number> }

/** bake transformed parts into one geometry; `carry` names per-vertex attributes to keep */
function mergeParts(parts: Part[], carry: string[]): BufferGeometry {
  let nv = 0
  let ni = 0
  for (const { geo } of parts) {
    nv += geo.getAttribute('position').count
    ni += geo.index ? geo.index.count : 0
  }
  const indexed = parts.every((p) => p.geo.index !== null)
  const pos = new Float32Array(nv * 3)
  const carried = carry.map((name) => {
    const size = parts[0].geo.getAttribute(name).itemSize
    return { name, size, data: new Float32Array(nv * size) }
  })
  const consts = Object.keys(parts[0].consts).map((name) => ({ name, data: new Float32Array(nv) }))
  const index = indexed ? new Uint32Array(ni) : null
  const v = new Vector3()
  let vo = 0
  let io = 0
  for (const { geo, matrix, consts: values } of parts) {
    const p = geo.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix)
      pos[(vo + i) * 3] = v.x
      pos[(vo + i) * 3 + 1] = v.y
      pos[(vo + i) * 3 + 2] = v.z
    }
    for (const c of carried) {
      const src = geo.getAttribute(c.name)
      for (let i = 0; i < src.count; i++) {
        for (let k = 0; k < c.size; k++) c.data[(vo + i) * c.size + k] = src.getComponent(i, k)
      }
    }
    for (const c of consts) c.data.fill(values[c.name], vo, vo + p.count)
    if (index && geo.index) {
      for (let i = 0; i < geo.index.count; i++) index[io + i] = geo.index.getX(i) + vo
      io += geo.index.count
    }
    vo += p.count
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(pos, 3))
  for (const c of carried) out.setAttribute(c.name, new BufferAttribute(c.data, c.size))
  for (const c of consts) out.setAttribute(c.name, new BufferAttribute(c.data, 1))
  if (index) out.setIndex(new BufferAttribute(index, 1))
  return out
}

/** extra line detail per slab, in slab-local space (x across the path) */
function slabLines(side: number) {
  const out: number[] = []
  const seg = (a: number[], b: number[]) => out.push(a[0], a[1], a[2], b[0], b[1], b[2])
  const hx = DEP / 2
  const hz = W / 2
  // seams girdling the slab every 5 units
  for (const y of [BOTTOM + 5, BOTTOM + 10]) {
    seg([-hx, y, -hz], [hx, y, -hz])
    seg([hx, y, -hz], [hx, y, hz])
    seg([hx, y, hz], [-hx, y, hz])
    seg([-hx, y, hz], [-hx, y, -hz])
  }
  // frame around the display, and ruler ticks up both edges of that face
  const fx = -side * (hx + 0.004)
  const fz = 0.97
  const y0 = CY - 7.18
  const y1 = CY + 7.18
  seg([fx, y0, -fz], [fx, y0, fz])
  seg([fx, y1, -fz], [fx, y1, fz])
  seg([fx, y0, -fz], [fx, y1, -fz])
  seg([fx, y0, fz], [fx, y1, fz])
  for (let y = BOTTOM + 1; y < TOP; y++) {
    const len = (y - BOTTOM) % 5 === 0 ? 0.13 : 0.06
    seg([fx, y, hz], [fx, y, hz - len])
    seg([fx, y, -hz], [fx, y, -hz + len])
  }
  return out
}

function buildMetrics(tier: LatticeTier, accent: string) {
  const mobile = tier === 'mobile'
  const MONOS = mobile ? MONOS_MOBILE : MONOS_DESKTOP
  const rnd = mulberry32(10010)
  const u = {
    uLit: { value: new Vector4() },
    uColor: { value: new Color(accent) },
    uHot: { value: new Color('#d8fff2').multiplyScalar(2.3) },
  }
  const mat = (vertexShader: string, fragmentShader: string, side: typeof FrontSide | typeof DoubleSide) =>
    new ShaderMaterial({
      uniforms: { ...worldUniforms, ...u },
      vertexShader,
      fragmentShader,
      side,
      ...ADD,
    })
  const bounds = () => new Sphere(new Vector3(0, 0, -7), 26)

  const slabM = MONOS.map(([x, z]) => new Matrix4().makeRotationY(Math.sign(x) * YAW).setPosition(x, 0, z))
  const temps: BufferGeometry[] = []
  const tmp = <T extends BufferGeometry>(g: T) => {
    temps.push(g)
    return g
  }

  // edges
  const box = tmp(new BoxGeometry(DEP, H, W).translate(0, CY, 0))
  const boxEdges = tmp(new EdgesGeometry(box))
  const edgeParts: Part[] = []
  slabM.forEach((m, i) => {
    edgeParts.push({ geo: boxEdges, matrix: m, consts: { aIdx: i } })
    const lines = tmp(new BufferGeometry())
    lines.setAttribute('position', new BufferAttribute(new Float32Array(slabLines(Math.sign(MONOS[i][0]))), 3))
    edgeParts.push({ geo: lines, matrix: m, consts: { aIdx: i } })
  })
  const edgeGeo = mergeParts(edgeParts, [])
  edgeGeo.boundingSphere = bounds()

  // bodies: fill, cap and floor pad per slab
  const cap = tmp(new BoxGeometry(DEP + 0.14, 0.14, W + 0.14).translate(0, TOP + 0.07, 0))
  const pad = tmp(new PlaneGeometry(2.6, 4.2).rotateX(-Math.PI / 2).translate(0, BOTTOM + 0.03, 0))
  const bodyParts: Part[] = []
  slabM.forEach((m, i) => {
    bodyParts.push({ geo: box, matrix: m, consts: { aIdx: i, aKind: 0 } })
    bodyParts.push({ geo: cap, matrix: m, consts: { aIdx: i, aKind: 1 } })
    bodyParts.push({ geo: pad, matrix: m, consts: { aIdx: i, aKind: 2 } })
  })
  const bodyGeo = mergeParts(bodyParts, ['uv'])
  bodyGeo.boundingSphere = bounds()

  // displays on the path-facing side of each slab
  const plane = tmp(new PlaneGeometry(1.86, 14.2))
  const dataParts: Part[] = slabM.map((m, i) => {
    const side = Math.sign(MONOS[i][0])
    const local = new Matrix4()
      .makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2)
      .setPosition(-side * (DEP / 2 + 0.012), CY, 0)
    return { geo: plane, matrix: m.clone().multiply(local), consts: { aIdx: i } }
  })
  const dataGeo = mergeParts(dataParts, ['uv'])
  dataGeo.boundingSphere = bounds()

  // beams: risers from each cap, two spans across the path, side rails, an X
  const tops = MONOS.map(([x, z]) => new Vector3(x, TOP + 0.14, z))
  const highs = MONOS.map(([x, z]) => new Vector3(x, BEAM_Y, z))
  const beams: { a: Vector3; b: Vector3; idx: number; th: number }[] = [
    ...tops.map((t, i) => ({ a: t, b: highs[i], idx: i, th: 0.07 })),
    { a: highs[0], b: highs[1], idx: 1, th: 0.075 },
    { a: highs[3], b: highs[2], idx: 3, th: 0.065 },
    { a: highs[0], b: highs[2], idx: 2, th: 0.05 },
    { a: highs[1], b: highs[3], idx: 3, th: 0.05 },
    { a: highs[0], b: highs[3], idx: 3, th: 0.035 },
    { a: highs[1], b: highs[2], idx: 3, th: 0.035 },
  ]
  const X_AXIS = new Vector3(1, 0, 0)
  const dir = new Vector3()
  const mid = new Vector3()
  const q = new Quaternion()
  const one = new Vector3(1, 1, 1)
  const beamParts: Part[] = beams.map(({ a, b, idx, th }) => {
    const len = a.distanceTo(b)
    const g = tmp(new BoxGeometry(len, th, th))
    const gp = g.getAttribute('position')
    const s = new Float32Array(gp.count)
    for (let i = 0; i < gp.count; i++) s[i] = gp.getX(i) / len + 0.5
    g.setAttribute('aS', new BufferAttribute(s, 1))
    dir.subVectors(b, a).normalize()
    q.setFromUnitVectors(X_AXIS, dir)
    mid.addVectors(a, b).multiplyScalar(0.5)
    return { geo: g, matrix: new Matrix4().compose(mid, q, one), consts: { aIdx: idx, aLen: len } }
  })
  const beamGeo = mergeParts(beamParts, ['aS'])
  beamGeo.boundingSphere = bounds()

  temps.forEach((g) => g.dispose())

  // points: packets ride the beams, motes drift up through the hall, nodes mark junctions
  const pa: number[] = []
  const pb: number[] = []
  const pOff: number[] = []
  const pSpeed: number[] = []
  const pSize: number[] = []
  const pKind: number[] = []
  const pIdx: number[] = []
  const pushP = (a: Vector3, b: Vector3, off: number, speed: number, size: number, kind: number, idx: number) => {
    pa.push(a.x, a.y, a.z)
    pb.push(b.x, b.y, b.z)
    pOff.push(off)
    pSpeed.push(speed)
    pSize.push(size)
    pKind.push(kind)
    pIdx.push(idx)
  }
  for (const { a, b, idx } of beams) {
    const len = a.distanceTo(b)
    const n = Math.max(1, Math.round(len / 4))
    for (let j = 0; j < n; j++) {
      pushP(a, b, j / n + rnd() * 0.1, (4.5 + rnd() * 2.5) / len, 2.6 + rnd(), 0, idx)
    }
  }
  const MOTES = mobile ? 180 : 420
  const rankSplit = (MONOS[0][1] + MONOS[2][1]) / 2
  const ma = new Vector3()
  const mb = new Vector3()
  for (let i = 0; i < MOTES; i++) {
    const side = rnd() < 0.5 ? -1 : 1
    const x = side * (mobile ? 3 + rnd() * 9 : 4 + rnd() * 12)
    const z = -22 + rnd() * 30
    ma.set(x, BOTTOM, z)
    mb.set(x + (rnd() - 0.5) * 2, BEAM_Y + 2, z + (rnd() - 0.5) * 2)
    // a mote wakes with the rank it drifts beside
    const idx = (z > rankSplit ? 0 : 2) + (side > 0 ? 1 : 0)
    pushP(ma, mb, rnd(), 0.025 + rnd() * 0.035, 0.8 + rnd() * 1.2, 1, idx)
  }
  highs.forEach((h, i) => pushP(h, h, rnd(), 0, 6.5, 2, i))
  const nearMid = new Vector3().addVectors(highs[0], highs[1]).multiplyScalar(0.5)
  const farMid = new Vector3().addVectors(highs[2], highs[3]).multiplyScalar(0.5)
  pushP(nearMid, nearMid, rnd(), 0, 4.5, 2, 1)
  pushP(farMid, farMid, rnd(), 0, 4.5, 2, 3)
  // where the X of the ceiling crosses above the path
  const s = -highs[0].x / (highs[3].x - highs[0].x)
  const cross = new Vector3().lerpVectors(highs[0], highs[3], s)
  pushP(cross, cross, rnd(), 0, 5, 2, 3)

  const ptsGeo = new BufferGeometry()
  ptsGeo.setAttribute('position', new BufferAttribute(new Float32Array(pa), 3))
  ptsGeo.setAttribute('aB', new BufferAttribute(new Float32Array(pb), 3))
  ptsGeo.setAttribute('aOff', new BufferAttribute(new Float32Array(pOff), 1))
  ptsGeo.setAttribute('aSpeed', new BufferAttribute(new Float32Array(pSpeed), 1))
  ptsGeo.setAttribute('aSize', new BufferAttribute(new Float32Array(pSize), 1))
  ptsGeo.setAttribute('aKind', new BufferAttribute(new Float32Array(pKind), 1))
  ptsGeo.setAttribute('aIdx', new BufferAttribute(new Float32Array(pIdx), 1))
  ptsGeo.boundingSphere = bounds()

  const edgeMat = mat(EDGE_VERT, EDGE_FRAG, FrontSide)
  const bodyMat = mat(BODY_VERT, BODY_FRAG, DoubleSide)
  const dataMat = mat(DATA_VERT, DATA_FRAG, DoubleSide)
  const beamMat = mat(BEAM_VERT, BEAM_FRAG, FrontSide)
  const ptsMat = mat(PTS_VERT, PTS_FRAG, FrontSide)

  const geos = [edgeGeo, bodyGeo, dataGeo, beamGeo, ptsGeo]
  const mats = [edgeMat, bodyMat, dataMat, beamMat, ptsMat]
  return {
    u,
    edgeGeo,
    edgeMat,
    bodyGeo,
    bodyMat,
    dataGeo,
    dataMat,
    beamGeo,
    beamMat,
    ptsGeo,
    ptsMat,
    dispose() {
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
    },
  }
}

/** staggered wake-up: slab i lights a beat after slab i-1 */
const stage = (p: number, i: number) => {
  const k = Math.min(1, Math.max(0, (p - i * 0.13) / 0.5))
  return k * k * (3 - 2 * k)
}

export function MetricsConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const a = useMemo(() => buildMetrics(tier, accent), [tier, accent])
  useEffect(() => () => a.dispose(), [a])

  useFrame(() => {
    const g = group.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station)
    a.u.uLit.value.set(stage(p, 0), stage(p, 1), stage(p, 2), stage(p, 3))
  })

  return (
    <group ref={group} position={position}>
      <mesh geometry={a.bodyGeo} material={a.bodyMat} />
      <mesh geometry={a.dataGeo} material={a.dataMat} />
      <lineSegments geometry={a.edgeGeo} material={a.edgeMat} />
      <mesh geometry={a.beamGeo} material={a.beamMat} />
      <points geometry={a.ptsGeo} material={a.ptsMat} />
    </group>
  )
}
