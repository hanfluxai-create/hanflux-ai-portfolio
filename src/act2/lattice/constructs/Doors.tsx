/* ============================================================================
   Station 11 · WAYS IN: "Three doors. Fixed fees. No mystery."
   (Signal Audit, First Agent Live, The Autonomous Layer)

   Construct: THREE CYBERPUNK GATES standing across the path at x = -15, 0,
   +15; the camera flies through the middle one (track ~11.28). Each gate is a
   chamfered portal frame with real depth (front + back frames tied by short
   connectors), a dashed outer frame, rung ticks that fill like a meter, an
   inner light curtain (faint scanlines + a vertical scanning sweep +
   flickering streaks), threshold strips and a light pool on the floor whose
   bands stream into the gate, and a thin sky beam. Tier marks above each
   gate read 1 / 2 / 3 hot bars: the three tiers, left to right.

   A charge band climbs every frame from the floor, over the lintel and up
   the sky beam, so the gates feel powered. The middle gate leads (brightest);
   all three flare as the camera crosses the gate plane. Motes rise inside
   the openings and a stream of them runs along the floor INTO the gates.

   Draw calls: 4 (instanced beams, curtains + floor pools, motes, HUD lines).
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  Object3D,
  ShaderMaterial,
  Vector3,
  type Group,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  LATTICE,
  isNear,
  mulberry32,
  proximity,
  worldState,
  worldUniforms,
  type ConstructProps,
  type LatticeTier,
} from '../shared'

const GATES_X = [-15, 0, 15]
const GAIN = [0.5, 1, 0.5] // the middle door, the one you walk through, leads
const HW = 4.5 // gate half width
const TOP = 8 // lintel height (group space)
const CH = 1.6 // 45 degree chamfer on the top corners
const FZ = 0.5 // front / back frame offset: the portal is 1 unit deep

/* --- shaders --------------------------------------------------------------- */

const BEAM_VERT = /* glsl */ `
attribute vec4 aInst; // brightness, gate, kind, param
varying vec3 vG;
varying vec4 vInst;
${FOG_VERT_PARS}
void main() {
  vec4 gp = instanceMatrix * vec4(position, 1.0);
  vG = gp.xyz;
  vInst = aInst;
  vec4 mvPosition = modelViewMatrix * gp;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`

// kinds: 0 frame, 1 rung tick, 2 tier bar, 3 floor strip, 4 sky beam
const BEAM_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uT;
uniform float uI;
uniform float uFlare;
uniform float uTop;
uniform float uFloor;
uniform float uCharge;
varying vec3 vG;
varying vec4 vInst;
${FOG_FRAG_PARS}
void main() {
  float gate = vInst.y;
  float kind = vInst.z;
  // charge band: climbs from the floor, over the lintel, up the sky beam.
  // uCharge is integrated on the CPU (faster when near) so it never jumps.
  float by = mod(uCharge + gate * 7.3, 36.0) + uFloor - 2.0;
  float dy = (vG.y - by) / 0.9;
  float b = vInst.x * (1.0 + 1.3 * exp(-dy * dy));
  if (kind > 0.5 && kind < 1.5) {
    // rung ticks fill bottom-to-top like a meter, then reset
    float ph = fract(uT * 0.3 + gate * 0.27) * 1.4 - vInst.w;
    b *= 0.3 + 1.7 * smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.25, 0.4, ph));
  } else if (kind > 1.5 && kind < 2.5) {
    // tier bars pulse in sequence
    float s = 0.5 + 0.5 * sin(uT * 2.6 - vInst.w * 1.2 - gate * 0.8);
    b *= 0.7 + 0.6 * s * s * s;
  } else if (kind > 3.5) {
    // sky beam fades into the dark above the gate
    b *= exp(-max(vG.y - uTop, 0.0) * 0.085);
  }
  b *= uI * (1.0 + 1.8 * uFlare);
  vec3 col = mix(uTint, vec3(1.0), clamp(b * 0.14, 0.0, 0.45)) * b;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

const CURTAIN_VERT = /* glsl */ `
attribute vec2 aL; // gate-local coords: (x, y) on curtains, (x, z) on floor pools
attribute vec2 aK; // gate index, kind (0 curtain, 1 floor pool)
varying vec2 vL;
varying vec2 vK;
${FOG_VERT_PARS}
void main() {
  vL = aL;
  vK = aK;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`

const CURTAIN_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uGain;
uniform float uT;
uniform float uI;
uniform float uFlare;
uniform float uHW;
uniform float uTop;
uniform float uFloor;
uniform float uCh;
varying vec2 vL;
varying vec2 vK;
${FOG_FRAG_PARS}
float h1(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
void main() {
  float gate = vK.x;
  float gain = gate < 0.5 ? uGain.x : (gate < 1.5 ? uGain.y : uGain.z);
  vec3 col = vec3(0.0);
  if (vK.y < 0.5) {
    // light curtain filling the opening (chamfered top corners clipped)
    float x = vL.x;
    float y = vL.y;
    float cut = abs(x) + y - (uHW + uTop - uCh) + 0.15;
    if (cut > 0.0) discard;
    float dEdge = min(min(uHW - abs(x), uTop - y), -cut * 0.7071);
    float edge = exp(-max(dEdge, 0.0) * 2.4);
    // far away the 0.25-unit scanlines drop below a few pixels: fade them to
    // their mean (~0.2) instead of letting them moire
    float farK = smoothstep(22.0, 50.0, vFogDepth);
    float lines = pow(max(0.5 + 0.5 * sin(y * 25.0 - uT * 2.0), 0.0), 8.0);
    lines = mix(lines, 0.2, farK);
    float span = uTop - uFloor + 8.0;
    float sy = y - (mod(uT * 3.0 + gate * 5.1, span) + uFloor - 4.0);
    float sweep = exp(-sy * sy * 0.8);
    // shimmer: thin flickering vertical threads
    float streak = step(0.8, h1(floor(x * 6.0) + 17.0 * gate + floor(uT * 6.0) * 0.618))
      * (1.0 - smoothstep(0.04, 0.12, abs(fract(x * 6.0) - 0.5))) * (1.0 - farK);
    float rise = 1.0 - 0.6 * smoothstep(uFloor, uTop, y);
    float a = (0.012 + 0.03 * lines) * rise
      + sweep * (0.06 + 0.16 * lines)
      + edge * 0.14
      + streak * 0.05 * (1.0 + 2.0 * sweep);
    // the screen-filling plane dissolves as you reach it instead of washing the view
    float reach = smoothstep(1.0, 10.0, vFogDepth);
    col = mix(uTint, vec3(1.0), sweep * 0.3) * a * reach;
  } else {
    // floor light pool: bands stream toward and into the gate
    float x = vL.x;
    float z = vL.y;
    float fx = 1.0 - smoothstep(uHW * 0.6, uHW + 0.8, abs(x));
    float fz = exp(-max(z, 0.0) * 0.32) * smoothstep(-2.5, 0.0, z);
    float flow = pow(max(0.5 + 0.5 * sin((z + uT * 2.5) * 3.0), 0.0), 10.0);
    col = uTint * fx * fz * (0.07 + 0.16 * flow);
  }
  col *= gain * uI * (1.0 + 1.5 * uFlare);
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

const MOTE_VERT = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uFlare;
uniform float uDpr;
attribute vec4 aData; // speed, phase, size, hot
attribute vec3 aDir;
attribute float aGain;
varying float vA;
varying float vHot;
${FOG_VERT_PARS}
void main() {
  float life = fract(uT * aData.x + aData.y);
  vec3 p = position + aDir * life;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mvPosition.z;
  vA = sin(3.14159265 * life) * aGain * (0.3 + 0.7 * uI) * (1.0 + uFlare);
  vHot = aData.w;
  gl_PointSize = clamp(aData.z * uDpr * (420.0 / max(-mvPosition.z, 0.5)), 1.0, 48.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

const MOTE_FRAG = /* glsl */ `
uniform vec3 uTint;
varying float vA;
varying float vHot;
${FOG_FRAG_PARS}
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  if (r2 > 0.25) discard;
  float core = exp(-r2 * 40.0);
  float glow = exp(-r2 * 10.0) * 0.35;
  vec3 c = mix(uTint, vec3(1.0), vHot * core) * (core * (1.1 + vHot * 1.6) + glow);
  gl_FragColor = vec4(c * vA * fogVis(), 1.0);
}
`

/* --- geometry -------------------------------------------------------------- */

type V2 = [number, number]

/** chamfered gate outline offset outward by o, bottom at y0 (open at the floor) */
function outline(o: number, y0: number): V2[] {
  const k = o * 0.4142 // tan(22.5deg): keeps the offset chamfer parallel
  return [
    [-HW - o, y0],
    [-HW - o, TOP - CH + k],
    [-HW + CH - k, TOP + o],
    [HW - CH + k, TOP + o],
    [HW + o, TOP - CH + k],
    [HW + o, y0],
  ]
}

type Beam = {
  a: [number, number, number]
  b: [number, number, number]
  sx: number // thickness across the beam (in-plane, or world x for depth beams)
  sz: number // thickness in depth (world z, or world y for depth beams)
  bright: number
  gate: number
  kind: number
  w: number
}

function buildBeams(tier: LatticeTier, floorY: number) {
  const mobile = tier === 'mobile'
  const beams: Beam[] = []
  const add = (
    a: [number, number, number],
    b: [number, number, number],
    sx: number,
    sz: number,
    bright: number,
    gate: number,
    kind: number,
    w = 0,
  ) => beams.push({ a, b, sx, sz, bright, gate, kind, w })

  GATES_X.forEach((gx, g) => {
    const G = GAIN[g]
    const main = outline(0, floorY)
    for (let i = 0; i < main.length - 1; i++) {
      const [ax, ay] = main[i]
      const [bx, by] = main[i + 1]
      add([gx + ax, ay, FZ], [gx + bx, by, FZ], 0.11, 0.11, 1.45 * G, g, 0)
      add([gx + ax, ay, -FZ], [gx + bx, by, -FZ], 0.07, 0.07, 0.8 * G, g, 0)
    }
    // depth connectors at every corner plus mid-post, so the portal reads as a volume
    const ties: V2[] = [...main, [-HW, -1], [HW, -1]]
    for (const [x, y] of ties) {
      const yy = Math.max(y, floorY + 0.05)
      add([gx + x, yy, FZ], [gx + x, yy, -FZ], 0.06, 0.06, 0.75 * G, g, 0)
    }
    // dashed outer frame
    const outer = outline(0.75, floorY + 0.5)
    const dash = 1.1
    const gap = mobile ? 0.9 : 0.45
    for (let i = 0; i < outer.length - 1; i++) {
      const [ax, ay] = outer[i]
      const [bx, by] = outer[i + 1]
      const len = Math.hypot(bx - ax, by - ay)
      const ux = (bx - ax) / len
      const uy = (by - ay) / len
      for (let s = 0; s < len - 0.2; s += dash + gap) {
        const e = Math.min(s + dash, len)
        add(
          [gx + ax + ux * s, ay + uy * s, FZ],
          [gx + ax + ux * e, ay + uy * e, FZ],
          0.05,
          0.05,
          0.7 * G,
          g,
          0,
        )
      }
    }
    // rung ticks on the outer face of both posts (param = normalised height)
    const step = mobile ? 1.8 : 0.9
    for (let y = floorY + 1.2; y < TOP - CH - 0.3; y += step) {
      const w = (y - floorY) / (TOP - floorY)
      for (const s of [-1, 1]) {
        add([gx + s * (HW + 0.2), y, FZ], [gx + s * (HW + 0.56), y, FZ], 0.05, 0.05, 1.1 * G, g, 1, w)
      }
    }
    // header line under the lintel
    add([gx - (HW - CH), TOP - 0.7, FZ], [gx + (HW - CH), TOP - 0.7, FZ], 0.04, 0.04, 0.9 * G, g, 0)
    // tier marks: gate g carries g + 1 hot bars
    for (let j = 0; j <= g; j++) {
      const y = TOP + 1.5 + j * 0.62
      add([gx - 1.7, y, FZ], [gx + 1.7, y, FZ], 0.2, 0.2, 1.9 + 1.1 * G, g, 2, j)
    }
    // feet
    for (const s of [-1, 1]) {
      add([gx + s * HW, floorY + 0.06, -1.3], [gx + s * HW, floorY + 0.06, 1.3], 0.1, 0.1, 1.1 * G, g, 0)
    }
    // threshold strips on the floor in front, narrowing toward the viewer
    const ys = floorY + 0.05
    const strips: [number, number, number][] = [
      [FZ + 1.0, 1, 1.7],
      [FZ + 2.0, 0.8, 1.1],
      [FZ + 3.2, 0.6, 0.6],
    ]
    for (const [z, wk, bk] of strips) {
      add([gx - HW * wk, ys, z], [gx + HW * wk, ys, z], 0.02, 0.2, bk * G, g, 3)
    }
    for (const s of [-1, 1]) {
      add([gx + s * (HW + 0.3), ys, FZ + 0.6], [gx + s * (HW + 0.3), ys, FZ + 7], 0.12, 0.02, 0.8 * G, g, 3)
    }
    // sky beam rising from the tier marks
    const skyY = TOP + 1.5 + (g + 1) * 0.62 + 0.3
    add([gx, skyY, 0], [gx, TOP + 46, 0], 0.05, 0.05, 1.5 * G, g, 4)
  })

  const geo = new BoxGeometry(1, 1, 1)
  const inst = new Float32Array(beams.length * 4)
  const o = new Object3D()
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const mat = new ShaderMaterial({
    uniforms: {
      ...worldUniforms,
      uTint: { value: new Color() },
      uT: { value: 0 },
      uI: { value: 0.35 },
      uFlare: { value: 0 },
      uTop: { value: TOP },
      uFloor: { value: floorY },
      uCharge: { value: 0 },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  })
  const mesh = new InstancedMesh(geo, mat, beams.length)
  beams.forEach((bm, i) => {
    const dx = bm.b[0] - bm.a[0]
    const dy = bm.b[1] - bm.a[1]
    const dz = bm.b[2] - bm.a[2]
    const len = Math.hypot(dx, dy, dz)
    dir.set(dx / len, dy / len, dz / len)
    o.position.set((bm.a[0] + bm.b[0]) / 2, (bm.a[1] + bm.b[1]) / 2, (bm.a[2] + bm.b[2]) / 2)
    o.quaternion.setFromUnitVectors(up, dir)
    o.scale.set(bm.sx, len, bm.sz)
    o.updateMatrix()
    mesh.setMatrixAt(i, o.matrix)
    inst.set([bm.bright, bm.gate, bm.kind, bm.w], i * 4)
  })
  geo.setAttribute('aInst', new InstancedBufferAttribute(inst, 4))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return { mesh, geo, mat, count: beams.length }
}

/** 3 curtains (gate planes) + 3 floor pools, merged into one geometry */
function buildCurtains(floorY: number) {
  const pos: number[] = []
  const loc: number[] = []
  const kin: number[] = []
  const idx: number[] = []
  const quad = (v: [number, number, number][], l: V2[], gate: number, kind: number) => {
    const base = pos.length / 3
    for (let i = 0; i < 4; i++) {
      pos.push(...v[i])
      loc.push(...l[i])
      kin.push(gate, kind)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  GATES_X.forEach((gx, g) => {
    const x0 = gx - HW + 0.1
    const x1 = gx + HW - 0.1
    const y1 = TOP - 0.1
    quad(
      [
        [x0, floorY, 0],
        [x1, floorY, 0],
        [x1, y1, 0],
        [x0, y1, 0],
      ],
      [
        [x0 - gx, floorY],
        [x1 - gx, floorY],
        [x1 - gx, y1],
        [x0 - gx, y1],
      ],
      g,
      0,
    )
    const px0 = gx - HW - 1
    const px1 = gx + HW + 1
    const pz0 = -2.5
    const pz1 = 9
    const py = floorY + 0.03
    quad(
      [
        [px0, py, pz1],
        [px1, py, pz1],
        [px1, py, pz0],
        [px0, py, pz0],
      ],
      [
        [px0 - gx, pz1],
        [px1 - gx, pz1],
        [px1 - gx, pz0],
        [px0 - gx, pz0],
      ],
      g,
      1,
    )
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('aL', new Float32BufferAttribute(loc, 2))
  geo.setAttribute('aK', new Float32BufferAttribute(kin, 2))
  geo.setIndex(idx)
  const mat = new ShaderMaterial({
    uniforms: {
      ...worldUniforms,
      uTint: { value: new Color() },
      uGain: { value: new Vector3(0.5, 1, 0.5) },
      uT: { value: 0 },
      uI: { value: 0.35 },
      uFlare: { value: 0 },
      uHW: { value: HW },
      uTop: { value: TOP },
      uFloor: { value: floorY },
      uCh: { value: CH },
    },
    vertexShader: CURTAIN_VERT,
    fragmentShader: CURTAIN_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    side: DoubleSide,
    fog: false,
  })
  return { geo, mat }
}

/** motes: rising inside each opening, plus a stream running along the floor
 *  into the gates; weighted toward the middle door */
function buildMotes(count: number, floorY: number) {
  const rnd = mulberry32(111111)
  const pos = new Float32Array(count * 3)
  const dir = new Float32Array(count * 3)
  const data = new Float32Array(count * 4)
  const gain = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = rnd()
    const g = r < 0.5 ? 1 : r < 0.75 ? 0 : 2
    const gx = GATES_X[g]
    gain[i] = g === 1 ? 1 : 0.5
    if (rnd() < 0.33) {
      pos.set([gx + (rnd() - 0.5) * HW * 1.4, floorY + 0.15 + rnd() * 0.8, FZ + 8 + rnd() * 2], i * 3)
      dir.set([0, rnd() * 0.6, -(10 + rnd() * 3)], i * 3)
      data.set([0.12 + rnd() * 0.13, rnd(), 0.06 + rnd() * 0.06, rnd() < 0.25 ? 1 : 0], i * 4)
    } else {
      pos.set([gx + (rnd() - 0.5) * 2 * HW * 0.9, floorY + rnd() * 4, (rnd() - 0.5) * 2.5], i * 3)
      dir.set([(rnd() - 0.5) * 1.2, 8 + rnd() * 12, (rnd() - 0.5) * 1.0], i * 3)
      data.set([0.05 + rnd() * 0.09, rnd(), 0.05 + rnd() * 0.08, rnd() < 0.15 ? 1 : 0], i * 4)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('aDir', new Float32BufferAttribute(dir, 3))
  geo.setAttribute('aData', new Float32BufferAttribute(data, 4))
  geo.setAttribute('aGain', new Float32BufferAttribute(gain, 1))
  return geo
}

/** HUD: dashed gantry tying the three doors together, hangers to the tier
 *  marks, and floor outlines framing each approach */
function buildHud(accent: string, floorY: number) {
  const pos: number[] = []
  const col: number[] = []
  const c = new Color(accent)
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number) => {
    pos.push(ax, ay, az, bx, by, bz)
    col.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k)
  }
  const gy = TOP + 5.2
  for (let x = -21; x < 21; x += 1.7) seg(x, gy, 0, Math.min(x + 1.2, 21), gy, 0, 0.6)
  for (const s of [-1, 1]) seg(s * 21, gy, 0, s * 21, gy - 0.8, 0, 0.8)
  GATES_X.forEach((gx, g) => {
    const k = g === 1 ? 1 : 0.6
    const barTop = TOP + 1.5 + g * 0.62 + 0.1
    for (const s of [-1, 1]) seg(gx + s * 1.7, gy, 0, gx + s * 1.7, barTop, FZ, 0.45 * k)
    const fy = floorY + 0.04
    for (const s of [-1, 1]) seg(gx + s * (HW + 1), fy, FZ, gx + s * (HW + 1), fy, FZ + 9, 0.4 * k)
    seg(gx - HW - 1, fy, FZ + 9, gx + HW + 1, fy, FZ + 9, 0.4 * k)
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  return geo
}

function buildDoors(tier: LatticeTier, accent: string, floorY: number) {
  const tint = new Color(accent)
  const beams = buildBeams(tier, floorY)
  beams.mat.uniforms.uTint.value = tint
  const curtains = buildCurtains(floorY)
  curtains.mat.uniforms.uTint.value = tint

  const moteGeo = buildMotes(tier === 'mobile' ? 200 : 420, floorY)
  const moteMat = new ShaderMaterial({
    uniforms: {
      ...worldUniforms,
      uTint: { value: tint },
      uT: { value: 0 },
      uI: { value: 0.35 },
      uFlare: { value: 0 },
    },
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  })

  const hudGeo = buildHud(accent, floorY)
  const hudMat = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

  return {
    beams,
    curtains,
    moteGeo,
    moteMat,
    hudGeo,
    hudMat,
    dispose() {
      beams.mesh.dispose()
      beams.geo.dispose()
      beams.mat.dispose()
      curtains.geo.dispose()
      curtains.mat.dispose()
      moteGeo.dispose()
      moteMat.dispose()
      hudGeo.dispose()
      hudMat.dispose()
    },
  }
}

export function DoorsConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const floorY = LATTICE.FLOOR_Y - position[1]
  const a = useMemo(() => buildDoors(tier, accent, floorY), [tier, accent, floorY])
  useEffect(() => () => a.dispose(), [a])
  const charge = useRef(0)
  const lastT = useRef(worldState.time)

  useFrame((state) => {
    const g = group.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station)
    const t = worldState.time
    const intensity = 0.35 + 0.65 * p
    // charge clock: speed follows proximity without phase jumps (clamped dt
    // covers the frames skipped while the station was out of range)
    const dt = Math.min(Math.max(t - lastT.current, 0), 0.1)
    lastT.current = t
    charge.current = (charge.current + dt * (4 + 4 * intensity)) % 36

    // flare as the camera crosses the gate plane. Read the real camera:
    // portrait phones fly with a longer stand-off than LATTICE.D.
    const dz = state.camera.position.z - position[2]
    const flare = Math.exp(-(dz * dz) / 40)

    const bu = a.beams.mat.uniforms
    bu.uT.value = t
    bu.uI.value = intensity
    bu.uFlare.value = flare
    bu.uCharge.value = charge.current
    const cu = a.curtains.mat.uniforms
    cu.uT.value = t
    cu.uI.value = intensity
    cu.uFlare.value = flare
    const mu = a.moteMat.uniforms
    mu.uT.value = t
    mu.uI.value = intensity
    mu.uFlare.value = flare

    a.hudMat.color.setScalar(intensity * (1 + flare))
  })

  return (
    <group ref={group} position={position}>
      <primitive object={a.beams.mesh} />
      <mesh geometry={a.curtains.geo} material={a.curtains.mat} />
      <points geometry={a.moteGeo} material={a.moteMat} frustumCulled={false} />
      <lineSegments geometry={a.hudGeo} material={a.hudMat} />
    </group>
  )
}
