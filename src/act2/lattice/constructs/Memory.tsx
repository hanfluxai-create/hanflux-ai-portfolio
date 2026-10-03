/* ============================================================================
   Station 4 — MEMORY (RAG & Knowledge Systems): the VOXEL DATA CRYSTAL.

   The indexed knowledge base as a 7x7x7 lattice of hologram voxels (5x5x5 on
   mobile), stood on its point like a diamond and turning slowly inside a
   bracketed bounding cube. An indexing slice sweeps through it layer by layer.
   Every ~0.8 s a retrieval event flares a cluster of voxels white-amber, and a
   citation beam arcs out of the crystal to the LEFT (toward the copy) where a
   small source-document card resolves: every answer traces to a real source.
   Far away the lattice is loose and dim; as the camera parks it locks into a
   crisp crystal and the retrievals quicken.

   Draw calls (6): voxels, cube frame + brackets, index slice, orbit ring,
   beams + source cards, points (beam heads + dust halo).
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
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
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

const SPACING = 0.82 // voxel pitch
const VOXEL = 0.3 // voxel edge length
const BEAMS = 8 // citation-beam pool
const ARC = 10 // segments per beam arc
const CARD = 7 // segments per source card (4 frame + 3 text rules)
const BEAM_V = (ARC + CARD) * 2 // vertices per beam slot
const DRAW_T = 0.42 // seconds for a beam to reach its source
const LIFE = 2.5 // seconds a citation stays alive
const CARD_W = 0.95
const CARD_H = 1.2
const TEXT_RULES = [0.62, 0.46, 0.55] // text-rule lengths as a fraction of card width

/* --- voxel: dim frosted fill + bright hologram edges (object-space, AA) ---- */
const VOXEL_VERT = /* glsl */ `
varying vec3 vBox;
varying vec3 vCol;
${FOG_VERT_PARS}
void main(){
  vBox = position * ${(1 / VOXEL).toFixed(5)};
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vec4 lp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vec4 mvPosition = modelViewMatrix * lp;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`
const VOXEL_FRAG = /* glsl */ `
uniform float uFill;
varying vec3 vBox;
varying vec3 vCol;
${FOG_FRAG_PARS}
float second3(vec3 e){ return max(min(e.x, e.y), min(max(e.x, e.y), e.z)); }
void main(){
  vec3 e = 0.5 - abs(vBox);
  float s = second3(e);
  float aa = fwidth(s) * 1.5 + 0.01;
  float edge = 1.0 - smoothstep(0.075, 0.075 + aa, s);
  gl_FragColor = vec4(vCol * (uFill + edge) * fogVis(), 1.0);
}
`

/* --- points: beam heads (static, CPU-placed) + orbiting dust (GPU) -------- */
const POINT_VERT = /* glsl */ `
uniform float uT;
uniform float uDpr;
uniform float uInt;
attribute vec3 aColor;
attribute float aSize;
attribute vec4 aOrbit;
varying vec3 vCol;
${FOG_VERT_PARS}
const float TC = 0.9611;
const float TS = 0.2764;
void main(){
  vec3 p = position;
  float k = 1.0;
  if (aOrbit.x > 0.0) {
    float a = aOrbit.y + uT * aOrbit.z;
    float r = aOrbit.x + sin(uT * 0.4 + aOrbit.w) * 0.25;
    vec3 q = vec3(cos(a) * r, position.y + sin(uT * 0.5 + aOrbit.w * 2.0) * 0.3, sin(a) * r);
    p = vec3(q.x * TC - q.y * TS, q.x * TS + q.y * TC, q.z);
    k = (0.4 + 0.6 * pow(0.5 + 0.5 * sin(uT * (1.3 + aOrbit.w * 0.3) + aOrbit.w * 9.0), 3.0)) * uInt;
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float dist = -mvPosition.z;
  // the halo's outer edge reaches the flight path (the camera flies past at
  // x ~ 0): never let a sprite smear across the lens
  vCol = aColor * k * smoothstep(1.5, 4.5, dist);
  vFogDepth = dist;
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(aSize * uDpr * (900.0 / max(dist, 0.1)), 0.0, 64.0 * uDpr);
}
`
const POINT_FRAG = /* glsl */ `
varying vec3 vCol;
${FOG_FRAG_PARS}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 7.0);
  float halo = (1.0 - d) * 0.35;
  gl_FragColor = vec4(vCol * (core + halo) * fogVis(), 1.0);
}
`

function lineGeo(pos: number[], col: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  return g
}

function lineMat() {
  return new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

/** collects colour-per-vertex line segments */
function segWriter() {
  const pos: number[] = []
  const col: number[] = []
  const seg = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    c: Color, k: number,
  ) => {
    pos.push(ax, ay, az, bx, by, bz)
    col.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k)
  }
  return { pos, col, seg }
}

function buildMemory(accent: string, tier: LatticeTier) {
  const mobile = tier === 'mobile'
  const n = mobile ? 5 : 7
  const count = n * n * n
  const dust = mobile ? 140 : 300
  const rand = mulberry32(0x4d454d04)
  const acc = new Color(accent)
  const hotW = new Color('#FFE3BF') // white-amber for flares, heads, packets
  const half = (n - 1) / 2
  const L = (n - 1) * SPACING + VOXEL // lattice extent
  const H = L / 2 + 0.6 // bounding-cube half size
  const ringR = mobile ? 5 : 6.4

  /* ---- voxel lattice ---- */
  const base = new Float32Array(count * 3) // rest positions (crystal space)
  const jit = new Float32Array(count * 3) // loose-state scatter
  const grid = new Float32Array(count * 3) // integer lattice coords
  const bright = new Float32Array(count)
  const phase = new Float32Array(count)
  const rMax = Math.sqrt(3) * half
  let i = 0
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++) {
        const o = i * 3
        grid[o] = x
        grid[o + 1] = y
        grid[o + 2] = z
        base[o] = (x - half) * SPACING
        base[o + 1] = (y - half) * SPACING
        base[o + 2] = (z - half) * SPACING
        jit[o] = (rand() - 0.5) * 1.1
        jit[o + 1] = (rand() - 0.5) * 1.1
        jit[o + 2] = (rand() - 0.5) * 1.1
        const r = Math.hypot(x - half, y - half, z - half) / (rMax || 1)
        bright[i] = (0.55 + 0.45 * rand()) * (1 - 0.35 * r)
        phase[i] = rand() * Math.PI * 2
        i++
      }

  const voxelGeo = new BoxGeometry(VOXEL, VOXEL, VOXEL)
  const voxelMat = new ShaderMaterial({
    uniforms: { ...worldUniforms, uFill: { value: 0.08 } },
    vertexShader: VOXEL_VERT,
    fragmentShader: VOXEL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  })
  voxelMat.forceSinglePass = true // additive: back/front order is irrelevant
  const voxels = new InstancedMesh(voxelGeo, voxelMat, count)
  voxels.instanceMatrix.setUsage(DynamicDrawUsage)
  voxels.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
  voxels.instanceColor.setUsage(DynamicDrawUsage)
  voxels.frustumCulled = false
  const mats = voxels.instanceMatrix.array as Float32Array
  for (let k = 0; k < count; k++) {
    const o = k * 16
    mats.fill(0, o, o + 16)
    mats[o] = mats[o + 5] = mats[o + 10] = mats[o + 15] = 1
    mats[o + 12] = base[k * 3]
    mats[o + 13] = base[k * 3 + 1]
    mats[o + 14] = base[k * 3 + 2]
  }

  /* ---- bounding cube + corner brackets + antenna dashes ---- */
  const fr = segWriter()
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      fr.seg(-H, a * H, b * H, H, a * H, b * H, acc, 0.3)
      fr.seg(a * H, -H, b * H, a * H, H, b * H, acc, 0.3)
      fr.seg(a * H, b * H, -H, a * H, b * H, H, acc, 0.3)
    }
  const B = H + 0.32
  const BL = 0.7
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * B
        const y = sy * B
        const z = sz * B
        fr.seg(x, y, z, x - sx * BL, y, z, acc, 1.9)
        fr.seg(x, y, z, x, y - sy * BL, z, acc, 1.9)
        fr.seg(x, y, z, x, y, z - sz * BL, acc, 1.9)
      }
  // the (1,1,1) diagonal stands vertical once the crystal is on its point
  const tip = B * Math.sqrt(3)
  const dg = 1 / Math.sqrt(3)
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const a0 = (tip + 0.35 + k * 0.42) * s * dg
      const a1 = (tip + 0.59 + k * 0.42) * s * dg
      fr.seg(a0, a0, a0, a1, a1, a1, acc, 1.3 - k * 0.35)
    }
  const frameGeo = lineGeo(fr.pos, fr.col)
  const frameMat = lineMat()
  const frame = new LineSegments(frameGeo, frameMat)

  /* ---- indexing slice: square + inward ticks, slides along crystal Y ---- */
  const sc = segWriter()
  const S = L / 2 + 0.22
  sc.seg(-S, 0, -S, S, 0, -S, acc, 1.5)
  sc.seg(S, 0, -S, S, 0, S, acc, 1.5)
  sc.seg(S, 0, S, -S, 0, S, acc, 1.5)
  sc.seg(-S, 0, S, -S, 0, -S, acc, 1.5)
  sc.seg(0, 0, -S, 0, 0, -S + 0.4, hotW, 1.3)
  sc.seg(S, 0, 0, S - 0.4, 0, 0, hotW, 1.3)
  sc.seg(0, 0, S, 0, 0, S - 0.4, hotW, 1.3)
  sc.seg(-S, 0, 0, -S + 0.4, 0, 0, hotW, 1.3)
  const scanGeo = lineGeo(sc.pos, sc.col)
  const scanMat = lineMat()
  const scan = new LineSegments(scanGeo, scanMat)

  /* ---- gimbal ring with ticks and three bright arcs ---- */
  const rg = segWriter()
  const RS = mobile ? 72 : 120
  for (let k = 0; k < RS; k++) {
    const a0 = (k / RS) * Math.PI * 2
    const a1 = ((k + 1) / RS) * Math.PI * 2
    const glow = 0.2 + 0.95 * Math.pow(Math.max(0, Math.cos(3 * (a0 + a1) * 0.5)), 10)
    rg.seg(Math.cos(a0) * ringR, 0, Math.sin(a0) * ringR, Math.cos(a1) * ringR, 0, Math.sin(a1) * ringR, acc, glow)
  }
  const TK = 48
  for (let k = 0; k < TK; k++) {
    const a = (k / TK) * Math.PI * 2
    const major = k % 4 === 0
    const r1 = ringR + (major ? 0.5 : 0.22)
    rg.seg(Math.cos(a) * ringR, 0, Math.sin(a) * ringR, Math.cos(a) * r1, 0, Math.sin(a) * r1, acc, major ? 1.2 : 0.55)
  }
  const ringGeo = lineGeo(rg.pos, rg.col)
  const ringMat = lineMat()
  const ring = new LineSegments(ringGeo, ringMat)

  /* ---- citation beams + source cards (one dynamic LineSegments) ---- */
  const beamPos = new Float32Array(BEAMS * BEAM_V * 3)
  const beamCol = new Float32Array(BEAMS * BEAM_V * 3)
  const beamGeo = new BufferGeometry()
  beamGeo.setAttribute('position', new BufferAttribute(beamPos, 3).setUsage(DynamicDrawUsage))
  beamGeo.setAttribute('color', new BufferAttribute(beamCol, 3).setUsage(DynamicDrawUsage))
  const beamMat = lineMat()
  const beams = new LineSegments(beamGeo, beamMat)
  beams.frustumCulled = false

  /* ---- points: [0..BEAMS) beam heads, then the dust halo ---- */
  const NP = BEAMS + dust
  const ptPos = new Float32Array(NP * 3)
  const ptCol = new Float32Array(NP * 3)
  const ptSize = new Float32Array(NP)
  const ptOrbit = new Float32Array(NP * 4)
  const rIn = mobile ? 3.4 : 4.2
  const rOut = mobile ? 6 : 7.6
  for (let d = 0; d < dust; d++) {
    const k = BEAMS + d
    ptOrbit[k * 4] = rIn + rand() * (rOut - rIn)
    ptOrbit[k * 4 + 1] = rand() * Math.PI * 2
    ptOrbit[k * 4 + 2] = (0.06 + rand() * 0.16) * (rand() < 0.8 ? 1 : -1)
    ptOrbit[k * 4 + 3] = rand() * Math.PI * 2
    ptPos[k * 3 + 1] = (rand() + rand() + rand() - 1.5) * 2.6
    const spark = rand() < 0.1
    const c = spark ? hotW : acc
    const kk = spark ? 1.6 : 0.5 + rand() * 0.8
    ptCol[k * 3] = c.r * kk
    ptCol[k * 3 + 1] = c.g * kk
    ptCol[k * 3 + 2] = c.b * kk
    ptSize[k] = spark ? 0.13 : 0.05 + rand() * 0.07
  }
  const headAttrs = [
    new BufferAttribute(ptPos, 3).setUsage(DynamicDrawUsage),
    new BufferAttribute(ptCol, 3).setUsage(DynamicDrawUsage),
    new BufferAttribute(ptSize, 1).setUsage(DynamicDrawUsage),
  ]
  const ptGeo = new BufferGeometry()
  ptGeo.setAttribute('position', headAttrs[0])
  ptGeo.setAttribute('aColor', headAttrs[1])
  ptGeo.setAttribute('aSize', headAttrs[2])
  ptGeo.setAttribute('aOrbit', new BufferAttribute(ptOrbit, 4))
  const ptMat = new ShaderMaterial({
    uniforms: { ...worldUniforms, uT: { value: 0 }, uInt: { value: 0.35 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  })
  const points = new Points(ptGeo, ptMat)
  points.frustumCulled = false

  // the cube's (1,1,1) diagonal → world up: the crystal stands on a vertex
  const qDiamond = new Quaternion().setFromUnitVectors(new Vector3(1, 1, 1).normalize(), new Vector3(0, 1, 0))

  const start = new Float32Array(count).fill(-1e6) // flare start time per voxel
  const peak = new Float32Array(count)
  const cur = new Float32Array(count * 3) // this frame's voxel positions (crystal space)
  cur.set(base)

  return {
    n, count, L, mobile, acc, hotW, qDiamond,
    base, jit, grid, bright, phase, start, peak, cur,
    voxels, voxelMat, frame, frameMat, scan, scanMat, ring, ringMat,
    beams, beamPos, beamCol, beamGeo, beamMat,
    points, ptGeo, ptMat, ptPos, ptCol, ptSize, headAttrs,
    bSrc: new Int16Array(BEAMS).fill(-1),
    bStart: new Float32Array(BEAMS),
    bEnd: new Float32Array(BEAMS * 3),
    bLift: new Float32Array(BEAMS * 3),
    // runtime state (mutated in useFrame, never triggers renders)
    rnd: mulberry32(0x5eed0004),
    next: 0,
    events: 0,
    lock: 0,
    dispose() {
      voxels.dispose()
      voxelGeo.dispose()
      voxelMat.dispose()
      frameGeo.dispose()
      frameMat.dispose()
      scanGeo.dispose()
      scanMat.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      beamGeo.dispose()
      beamMat.dispose()
      ptGeo.dispose()
      ptMat.dispose()
    },
  }
}

type MemoryParts = ReturnType<typeof buildMemory>

/** one retrieval: flare a cluster (rippling out from its centre) and fire 1-2 citations */
function spawnRetrieval(m: MemoryParts, now: number, p: number) {
  const { n, count, grid, start, peak, rnd } = m
  const c = Math.floor(rnd() * count) % count
  const cx = grid[c * 3]
  const cy = grid[c * 3 + 1]
  const cz = grid[c * 3 + 2]
  const R = (m.mobile ? 1.0 : 1.3) + rnd() * 0.7
  for (let i = 0; i < count; i++) {
    const dx = grid[i * 3] - cx
    const dy = grid[i * 3 + 1] - cy
    const dz = grid[i * 3 + 2] - cz
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > R) continue
    start[i] = now + d * 0.085
    peak[i] = 1 - 0.55 * (d / R)
  }
  const cites = p > 0.55 && rnd() < 0.45 ? 2 : 1
  for (let k = 0; k < cites; k++) {
    let slot = 0
    let oldest = Infinity
    for (let b = 0; b < BEAMS; b++) {
      if (m.bSrc[b] < 0) {
        slot = b
        break
      }
      if (m.bStart[b] < oldest) {
        oldest = m.bStart[b]
        slot = b
      }
    }
    // the second citation comes from a neighbouring voxel of the same cluster
    let src = c
    if (k > 0) {
      const nx = MathUtils.clamp(cx + Math.round(rnd() * 2 - 1), 0, n - 1)
      const ny = MathUtils.clamp(cy + Math.round(rnd() * 2 - 1), 0, n - 1)
      const nz = MathUtils.clamp(cz + 1 - 2 * Math.round(rnd()), 0, n - 1)
      src = (nx * n + ny) * n + nz
    }
    m.bSrc[slot] = src
    m.bStart[slot] = now + 0.1 + k * 0.2
    // sources stack down the left side on a golden-ratio sequence so cards rarely overlap
    m.events++
    const g = (m.events * 0.618034) % 1
    const o = slot * 3
    // portrait phones look straight at the crystal, so keep the sources inside the frame
    m.bEnd[o] = m.mobile ? -3.8 - rnd() * 1.4 : -6.6 - rnd() * 2.6
    m.bEnd[o + 1] = -2.6 + g * 5.6
    m.bEnd[o + 2] = -1.2 + rnd() * 3.8
    m.bLift[o] = 0
    m.bLift[o + 1] = 1 + rnd() * 1.6
    m.bLift[o + 2] = 0.6 + rnd()
  }
}

// scratch (module level: no per-frame allocation)
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _p = new Vector3()
const _m = new Matrix4()

function bezier(s: number, out: Vector3) {
  const u = 1 - s
  const w0 = u * u
  const w1 = 2 * u * s
  const w2 = s * s
  out.set(
    w0 * _a.x + w1 * _c.x + w2 * _b.x,
    w0 * _a.y + w1 * _c.y + w2 * _b.y,
    w0 * _a.z + w1 * _c.z + w2 * _b.z,
  )
}

function writeVert(arr: Float32Array, v: number, x: number, y: number, z: number) {
  arr[v * 3] = x
  arr[v * 3 + 1] = y
  arr[v * 3 + 2] = z
}

function writeSeg(
  m: MemoryParts, v: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  c: Color, k: number,
) {
  writeVert(m.beamPos, v, ax, ay, az)
  writeVert(m.beamPos, v + 1, bx, by, bz)
  writeVert(m.beamCol, v, c.r * k, c.g * k, c.b * k)
  writeVert(m.beamCol, v + 1, c.r * k, c.g * k, c.b * k)
}

/** advance every live citation: arc draw-in, trace pulse, source card, head point */
function updateBeams(m: MemoryParts, now: number, I: number) {
  const { acc, hotW, beamPos, beamCol, ptPos, ptCol, ptSize } = m
  for (let b = 0; b < BEAMS; b++) {
    const v0 = b * BEAM_V
    const age = now - m.bStart[b]
    const src = m.bSrc[b]
    if (src < 0 || age < 0 || age > LIFE) {
      if (src >= 0 && age > LIFE) m.bSrc[b] = -1
      beamPos.fill(0, v0 * 3, (v0 + BEAM_V) * 3)
      beamCol.fill(0, v0 * 3, (v0 + BEAM_V) * 3)
      ptCol[b * 3] = ptCol[b * 3 + 1] = ptCol[b * 3 + 2] = 0
      ptSize[b] = 0
      continue
    }

    // source voxel: crystal space → root space through the diamond + spin rotations
    _a.set(m.cur[src * 3], m.cur[src * 3 + 1], m.cur[src * 3 + 2]).applyQuaternion(m.qDiamond).applyMatrix4(_m)
    const e = b * 3
    _b.set(m.bEnd[e], m.bEnd[e + 1], m.bEnd[e + 2])
    _c.addVectors(_a, _b).multiplyScalar(0.5)
    _c.x += m.bLift[e]
    _c.y += m.bLift[e + 1]
    _c.z += m.bLift[e + 2]

    const t = Math.min(age / DRAW_T, 1)
    const head = 1 - (1 - t) * (1 - t) * (1 - t)
    const fade = (age < DRAW_T ? 1 : Math.exp(-(age - DRAW_T) * 1.45)) * (0.55 + 0.45 * I)
    const pulse = age > DRAW_T ? ((age - DRAW_T) * 1.1) % 1 : -10
    const headHot = age < DRAW_T ? 2.2 : 0.7

    // arc from the voxel to the source, drawn only up to the head
    for (let j = 0; j <= ARC; j++) {
      const u = j / ARC
      bezier(u * head, _p)
      const k = (0.3 + 0.9 * u * u) * fade
      const pq = (u - pulse) * 7
      const w = (Math.exp(-pq * pq) * 1.6 + u * u * u * u * u * u * headHot) * fade
      const r = acc.r * k + hotW.r * w
      const g = acc.g * k + hotW.g * w
      const bl = acc.b * k + hotW.b * w
      if (j > 0) {
        writeVert(beamPos, v0 + 2 * (j - 1) + 1, _p.x, _p.y, _p.z)
        writeVert(beamCol, v0 + 2 * (j - 1) + 1, r, g, bl)
      }
      if (j < ARC) {
        writeVert(beamPos, v0 + 2 * j, _p.x, _p.y, _p.z)
        writeVert(beamCol, v0 + 2 * j, r, g, bl)
      }
    }

    // beam head: a white-amber packet in flight, then a pulsing anchor on the card
    ptPos[b * 3] = _p.x
    ptPos[b * 3 + 1] = _p.y
    ptPos[b * 3 + 2] = _p.z
    const hk = (age < DRAW_T ? 3 : 2) * fade
    ptCol[b * 3] = hotW.r * hk
    ptCol[b * 3 + 1] = hotW.g * hk
    ptCol[b * 3 + 2] = hotW.b * hk
    ptSize[b] = age < DRAW_T ? 0.45 : 0.3 + 0.07 * Math.sin(age * 12)

    // source card resolves where the beam lands (beam meets its right edge)
    const cs = MathUtils.smoothstep(age, DRAW_T * 0.8, DRAW_T + 0.28)
    const hw = (CARD_W / 2) * cs
    const hh = (CARD_H / 2) * cs
    const cx = _b.x - CARD_W / 2 - 0.1
    const cy = _b.y
    const cz = _b.z
    const ck = 1.5 * fade * cs
    let v = v0 + ARC * 2
    writeSeg(m, v, cx - hw, cy - hh, cz, cx + hw, cy - hh, cz, acc, ck)
    writeSeg(m, (v += 2), cx + hw, cy - hh, cz, cx + hw, cy + hh, cz, acc, ck)
    writeSeg(m, (v += 2), cx + hw, cy + hh, cz, cx - hw, cy + hh, cz, acc, ck)
    writeSeg(m, (v += 2), cx - hw, cy + hh, cz, cx - hw, cy - hh, cz, acc, ck)
    for (let k = 0; k < TEXT_RULES.length; k++) {
      const typed = MathUtils.clamp((age - DRAW_T - 0.15 - k * 0.12) / 0.3, 0, 1)
      const y = cy + hh * (0.5 - k * 0.36)
      const x0 = cx - hw + 0.14 * cs
      const x1 = x0 + TEXT_RULES[k] * CARD_W * cs * typed
      writeSeg(m, (v += 2), x0, y, cz, x1, y, cz, k === 0 ? hotW : acc, (k === 0 ? 1.3 : 0.9) * fade * cs)
    }
  }
}

export function MemoryConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const parts = useMemo(() => buildMemory(accent, tier), [accent, tier])
  useEffect(() => () => parts.dispose(), [parts])

  useFrame((_, delta) => {
    const g = group.current
    const sp = spin.current
    if (!g || !sp) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const m = parts
    const p = proximity(station)
    const now = worldState.time
    const I = 0.35 + 0.65 * p
    // the lattice "locks" a beat behind the camera's arrival
    m.lock = MathUtils.damp(m.lock, p, 2.5, Math.min(delta, 0.1))
    const loose = 1 - m.lock
    const spread = 1 + 0.14 * loose

    // slow turn on the vertical axis with a faint precession
    sp.rotation.set(Math.sin(now * 0.23) * 0.06, now * 0.16, 0)
    sp.updateMatrix()
    _m.copy(sp.matrix)
    if (ring.current) ring.current.rotation.y = now * 0.07

    // indexing slice sweeps along the crystal's own Y axis
    const scanY = -m.L / 2 - 0.35 + (m.L + 0.7) * ((now / 3.4) % 1)
    m.scan.position.y = scanY

    // retrieval cadence: ~0.8 s when parked, lazier from afar
    if (now >= m.next || m.next - now > 5) {
      spawnRetrieval(m, now, p)
      m.next = now + 0.8 * (1.7 - 0.7 * p) * (0.7 + 0.6 * m.rnd())
    }

    // voxels: position (loose → locked), flare pop, colour
    const { count, base, jit, bright, phase, start, peak, cur, acc, hotW } = m
    const mats = m.voxels.instanceMatrix.array as Float32Array
    const cols = m.voxels.instanceColor!.array as Float32Array
    for (let i = 0; i < count; i++) {
      const o = i * 3
      const ft = now - start[i]
      const f = ft < 0 ? 0 : peak[i] * (ft < 0.1 ? ft / 0.1 : Math.exp(-(ft - 0.1) * 2.3))
      const wob = loose * (0.6 + 0.4 * Math.sin(now * 0.7 + phase[i]))
      const x = base[o] * spread + jit[o] * wob
      const y = base[o + 1] * spread + jit[o + 1] * wob
      const z = base[o + 2] * spread + jit[o + 2] * wob
      cur[o] = x
      cur[o + 1] = y
      cur[o + 2] = z
      const s = 1 + 0.4 * f
      const mo = i * 16
      mats[mo] = mats[mo + 5] = mats[mo + 10] = s
      mats[mo + 12] = x
      mats[mo + 13] = y
      mats[mo + 14] = z
      const dy = y - scanY
      const band = Math.exp(-dy * dy * 5)
      const k = I * bright[i] * (0.27 + 0.5 * band)
      const h = f * (0.9 + 1.1 * I)
      cols[o] = acc.r * k + hotW.r * h
      cols[o + 1] = acc.g * k + hotW.g * h
      cols[o + 2] = acc.b * k + hotW.b * h
    }
    m.voxels.instanceMatrix.needsUpdate = true
    m.voxels.instanceColor!.needsUpdate = true

    updateBeams(m, now, I)
    m.beamGeo.attributes.position.needsUpdate = true
    m.beamGeo.attributes.color.needsUpdate = true
    // only the beam heads move on the CPU: upload just that slice of the points
    for (let a = 0; a < m.headAttrs.length; a++) {
      const attr = m.headAttrs[a]
      attr.clearUpdateRanges()
      attr.addUpdateRange(0, BEAMS * attr.itemSize)
      attr.needsUpdate = true
    }

    m.frameMat.color.setScalar(I)
    m.scanMat.color.setScalar(I * (0.6 + 0.4 * p))
    m.ringMat.color.setScalar(I * 0.9)
    m.ptMat.uniforms.uT.value = now
    m.ptMat.uniforms.uInt.value = I
  })

  return (
    <group ref={group} position={position}>
      <group ref={spin}>
        <group quaternion={parts.qDiamond}>
          <primitive object={parts.voxels} />
          <primitive object={parts.frame} />
          <primitive object={parts.scan} />
        </group>
      </group>
      <group rotation={[0.36, 0, -0.2]}>
        <group ref={ring}>
          <primitive object={parts.ring} />
        </group>
      </group>
      <primitive object={parts.beams} />
      <primitive object={parts.points} />
    </group>
  )
}
