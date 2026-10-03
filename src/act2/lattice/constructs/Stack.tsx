/* ============================================================================
   Station 9 — THE STACK: "Best-in-class parts, welded into one machine".

   Six vast horizontal slabs straddle the flight path, one per group (bottom
   to top: Surfaces, Proof, Memory, Voice, Automation, Intelligence). The camera
   flies through the corridor between y = -3.6 and 5.6, so two slabs sit below
   it and four above. Each slab is a hologram deck: beam outline, an inset
   double rule, an AA grid, blinking data cells, streaming lanes and a hot scan
   bar that sweeps toward the viewer with a cooling trail. Wireframe "part"
   modules ride each deck in its group's hue; amber stays dominant.

   The story is the weld: from afar the slabs float exploded, tilted and
   offset. As the camera arrives they snap flat and aligned (corridor decks
   first), then eight weld beams extrude through every corner and edge, weld
   points ignite and packets race up and down the welds.

   Draw calls (4): beams (outlines + scan bars + welds), slab decks, modules,
   points (motes + packets + weld points).
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
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
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
  type LatticeTier,
} from '../shared'

const SLAB_Y = [-7, -3.6, 5.6, 9, 12.4, 15.8]
// bottom → top: Surfaces, Proof, Memory, Voice, Automation, Intelligence
const SLAB_HUE = ['#FF3D7F', '#9AE6FF', '#FFB36B', '#27F2C0', '#4EA8FF', '#7C5CFF']
const SNAP_RANK = [1, 0, 0, 1, 2, 3] // corridor decks weld first, the outermost last
const N_SLAB = SLAB_Y.length
const HW = 13 // deck half width (x)
const HD = 9 // deck half depth (z)
const GRID = 1.3 // grid pitch
const BT = 0.09 // outline beam thickness
// weld beams: four corners + two pairs on the front/back edges (clear of the path at x≈0)
const WELDS: [number, number][] = [
  [-HW, -HD], [HW, -HD], [-HW, HD], [HW, HD],
  [-6.5, HD], [6.5, HD], [-6.5, -HD], [6.5, -HD],
]
const Y0 = -7.6 // weld span (a little past the outer decks)
const Y1 = 16.4
const SPAN = Y1 - Y0
const MID = (Y0 + Y1) / 2
const MOTE_Y0 = -9
const MOTE_SPAN = 28
const I_SCAN = N_SLAB * 4 // instance index of the first scan bar
const I_WELD = I_SCAN + N_SLAB // instance index of the first weld beam
const N_BEAM = I_WELD + WELDS.length

const f3 = (x: number) => `(${x.toFixed(3)})` // GLSL float literal, parenthesised so negatives are safe

/* --- slab deck: grid, inset rule, ticks, lanes, data cells, scan sweep ----- */
const SLAB_VERT = /* glsl */ `
attribute vec4 aSlab; // x scan z, y weld 0..1, z seed
attribute vec3 aHue;
varying vec2 vP;
varying vec3 vTint;
varying vec3 vHue;
varying vec4 vSlab;
${FOG_VERT_PARS}
void main(){
  vP = position.xz;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
  #endif
  vHue = aHue;
  vSlab = aSlab;
  vec4 lp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  #endif
  vec4 mvPosition = modelViewMatrix * lp;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`
const SLAB_FRAG = /* glsl */ `
uniform float uT;
uniform float uInt;
varying vec2 vP;
varying vec3 vTint;
varying vec3 vHue;
varying vec4 vSlab;
${FOG_FRAG_PARS}
${HASH}
float rule(float d, float w, float fw){ return 1.0 - smoothstep(w, w + fw * 1.5 + 0.0001, abs(d)); }
void main(){
  vec2 d2 = vec2(${f3(HW)}, ${f3(HD)}) - abs(vP);
  float ed = min(d2.x, d2.y);
  float inside = step(0.6, ed);

  // double frame: an inset rule echoing the beam outline
  float inset = rule(ed - 0.6, 0.012, fwidth(ed));

  // ruler ticks between the outline and the inset rule (front/back edges)
  float tk = rule(fract(vP.x) - 0.5, 0.025, fwidth(vP.x)) * step(d2.y, 0.42) * step(0.8, d2.x);

  // AA grid, faded out where cells shrink to a few pixels (grazing views)
  vec2 gp = vP / ${f3(GRID)};
  vec2 fw = max(fwidth(gp), vec2(0.0001));
  vec2 gd = abs(fract(gp - 0.5) - 0.5) / fw;
  float grid = (1.0 - min(min(gd.x, gd.y), 1.0)) * (1.0 - smoothstep(0.25, 0.8, max(fw.x, fw.y))) * inside;

  // blinking data cells
  vec2 cell = floor(gp);
  float h = hash21(cell + vSlab.z * 13.7);
  float blink = step(0.87, h) * (0.5 + 0.5 * sin(uT * (0.8 + h * 2.5) + h * 31.0));
  vec2 cf = abs(fract(gp) - 0.5);
  float cbox = 1.0 - smoothstep(0.2, 0.2 + max(fw.x, fw.y) * 1.5, max(cf.x, cf.y));
  float cells = blink * cbox * inside;

  // two data lanes, dashes streaming in opposite directions
  float lane = rule(abs(vP.y) - ${f3(HD - 2.2)}, 0.03, fwidth(vP.y))
    * step(0.45, fract(vP.x * 0.7 - uT * 1.6 * sign(vP.y))) * step(1.2, d2.x);

  // the scan: hot leading edge, cooling trail behind it
  float dz = vP.y - vSlab.x;
  float band = exp(-dz * dz * 6.0);
  float trail = step(dz, 0.0) * exp(dz * 0.45);

  // an un-welded deck has an unstable signal
  float weld = vSlab.y;
  float flick = mix(0.7 + 0.3 * step(0.35, hash11(floor(uT * 14.0) + vSlab.z * 7.0)), 1.0, weld);

  vec3 col = vTint * (0.03 + grid * (0.13 + 0.5 * trail) + inset * 0.5 + band * 1.1)
    + vHue * (tk * 0.4 + lane * 0.55 + cells * (0.3 + 0.7 * trail))
    + vec3(0.15) * band;
  col *= uInt * mix(0.5, 1.0, weld) * flick * fogVis();
  gl_FragColor = vec4(col, 1.0);
}
`

/* --- part modules: dim fill, AA hologram edges, rack lines on the sides ---- */
const MOD_VERT = /* glsl */ `
varying vec3 vBox;
varying vec3 vScale;
varying vec3 vCol;
${FOG_VERT_PARS}
void main(){
  vBox = position;
  vScale = vec3(1.0);
  vCol = vec3(1.0);
  vec4 lp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  lp = instanceMatrix * lp;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vec4 mvPosition = modelViewMatrix * lp;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`
const MOD_FRAG = /* glsl */ `
uniform float uInt;
varying vec3 vBox;
varying vec3 vScale;
varying vec3 vCol;
${FOG_FRAG_PARS}
float second3(vec3 e){ return max(min(e.x, e.y), min(max(e.x, e.y), e.z)); }
void main(){
  vec3 e = (0.5 - abs(vBox)) * vScale;
  float s = second3(e);
  float edge = 1.0 - smoothstep(0.035, 0.035 + fwidth(s) * 1.5 + 0.0001, s);
  float yy = vBox.y * vScale.y * 4.0;
  float rack = (1.0 - smoothstep(0.06, 0.06 + fwidth(yy) * 1.5 + 0.0001, abs(fract(yy) - 0.5)))
    * step(abs(vBox.y), 0.49);
  vec3 col = vCol * (0.06 + edge + rack * 0.2) * uInt * fogVis();
  gl_FragColor = vec4(col, 1.0);
}
`

/* --- points: x type (0 mote, 1 weld packet, 2 weld point), y phase, z speed, w size */
const PT_VERT = /* glsl */ `
uniform float uT;
uniform float uDpr;
uniform float uInt;
uniform float uWeld;
attribute vec4 aData;
attribute vec3 aColor;
varying vec3 vCol;
${FOG_VERT_PARS}
void main(){
  vec3 p = position;
  float k = uInt;
  if (aData.x > 1.5) {
    // a weld point ignites only once its extruding weld beam has reached it
    float reach = ${f3(SPAN * 0.5)} * uWeld - abs(p.y - ${f3(MID)});
    k *= smoothstep(-0.3, 0.4, reach) * step(0.001, uWeld) * (0.6 + 0.4 * sin(uT * 3.0 + aData.y * 6.2832));
  } else if (aData.x > 0.5) {
    float f = fract(aData.y + uT * aData.z);
    p.y = ${f3(Y0)} + ${f3(SPAN)} * f;
    float halfLen = ${f3(SPAN * 0.5)} * uWeld;
    k *= step(abs(p.y - ${f3(MID)}), halfLen) * smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.94, 1.0, f));
  } else {
    p.y = ${f3(MOTE_Y0)} + mod(position.y - ${f3(MOTE_Y0)} + uT * aData.z, ${f3(MOTE_SPAN)});
    p.x += sin(uT * 0.3 + aData.y * 6.2832) * 0.4;
    k *= 0.25 + 0.75 * (0.5 + 0.5 * sin(uT * (1.0 + aData.z * 3.0) + aData.y * 40.0));
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float dist = -mvPosition.z;
  k *= smoothstep(1.5, 4.5, dist); // never let a sprite smear across the lens
  vCol = aColor * k;
  vFogDepth = dist;
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(aData.w * uDpr * (900.0 / max(dist, 0.1)), 0.0, 64.0 * uDpr);
}
`
const PT_FRAG = /* glsl */ `
varying vec3 vCol;
${FOG_FRAG_PARS}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 7.0);
  float halo = (1.0 - d) * 0.3;
  gl_FragColor = vec4(vCol * (core + halo) * fogVis(), 1.0);
}
`

const additive = {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
} as const

function buildStack(accent: string, tier: LatticeTier) {
  const mobile = tier === 'mobile'
  const rand = mulberry32(0x57ac0009)
  const acc = new Color(accent)
  const hotW = new Color('#FFE3BF')
  const white = new Color(1, 1, 1)
  // deck body stays amber with only a breath of its group hue; details carry the hue softly
  const tints = SLAB_HUE.map((h) => acc.clone().lerp(new Color(h), 0.15))
  const hues = SLAB_HUE.map((h) => new Color(h).lerp(white, 0.3))
  // parts carry their group hue, pulled toward amber so the machine still reads as one
  const partHues = SLAB_HUE.map((h) => new Color(h).lerp(acc, 0.4).lerp(white, 0.15))
  const MODS = mobile ? 3 : 5
  const PK = mobile ? 3 : 6
  const MOTES = mobile ? 140 : 320

  /* ---- exploded-view offsets per slab: dx dy dz rx ry rz ---- */
  const off = new Float32Array(N_SLAB * 6)
  for (let i = 0; i < N_SLAB; i++) {
    const away = SLAB_Y[i] < 1 ? -1 : 1 // always explode away from the corridor
    off[i * 6] = (rand() - 0.5) * 5
    off[i * 6 + 1] = away * (0.8 + rand() * 1.6)
    off[i * 6 + 2] = (rand() - 0.5) * 6
    off[i * 6 + 3] = (rand() - 0.5) * 0.24
    off[i * 6 + 4] = (rand() - 0.5) * 0.3
    off[i * 6 + 5] = (rand() - 0.5) * 0.18
  }

  /* ---- beams: slab outlines, scan bars, weld beams (one InstancedMesh) ---- */
  const boxGeo = new BoxGeometry(1, 1, 1)
  const beamMat = new MeshBasicMaterial({ color: 0xffffff, ...additive })
  const beams = new InstancedMesh(boxGeo, beamMat, N_BEAM)
  beams.instanceMatrix.setUsage(DynamicDrawUsage)
  beams.frustumCulled = false
  const outline = [
    new Matrix4().makeScale(2 * HW + BT, BT, BT).setPosition(0, 0, HD),
    new Matrix4().makeScale(2 * HW + BT, BT, BT).setPosition(0, 0, -HD),
    new Matrix4().makeScale(BT, BT, 2 * HD).setPosition(-HW, 0, 0),
    new Matrix4().makeScale(BT, BT, 2 * HD).setPosition(HW, 0, 0),
  ]
  const c = new Color()
  for (let i = 0; i < N_SLAB; i++) {
    for (let k = 0; k < 4; k++) beams.setColorAt(i * 4 + k, c.copy(tints[i]).multiplyScalar(1.0))
    beams.setColorAt(I_SCAN + i, c.copy(acc).multiplyScalar(1.7).add(hues[i].clone().multiplyScalar(0.45)))
  }
  for (let w = 0; w < WELDS.length; w++) beams.setColorAt(I_WELD + w, c.copy(acc).multiplyScalar(1.6))
  beams.instanceColor!.needsUpdate = true

  /* ---- slab decks ---- */
  const deckGeo = new PlaneGeometry(2 * HW, 2 * HD)
  deckGeo.rotateX(-Math.PI / 2) // into the XZ plane: position.xz = deck coords
  const deckMat = new ShaderMaterial({
    uniforms: { ...worldUniforms, uT: { value: 0 }, uInt: { value: 0.35 } },
    vertexShader: SLAB_VERT,
    fragmentShader: SLAB_FRAG,
    side: DoubleSide,
    fog: false,
    ...additive,
  })
  deckMat.forceSinglePass = true // additive: back/front order is irrelevant
  const aSlabArr = new Float32Array(N_SLAB * 4)
  const aHueArr = new Float32Array(N_SLAB * 3)
  for (let i = 0; i < N_SLAB; i++) {
    aSlabArr[i * 4 + 2] = i + rand()
    hues[i].toArray(aHueArr, i * 3)
  }
  const aSlab = new InstancedBufferAttribute(aSlabArr, 4).setUsage(DynamicDrawUsage)
  deckGeo.setAttribute('aSlab', aSlab)
  deckGeo.setAttribute('aHue', new InstancedBufferAttribute(aHueArr, 3))
  const decks = new InstancedMesh(deckGeo, deckMat, N_SLAB)
  decks.instanceMatrix.setUsage(DynamicDrawUsage)
  decks.frustumCulled = false
  for (let i = 0; i < N_SLAB; i++) decks.setColorAt(i, tints[i])
  decks.instanceColor!.needsUpdate = true

  /* ---- part modules riding each deck (on top below the corridor, hanging above it) ---- */
  const nMod = N_SLAB * MODS
  const modLocal: Matrix4[] = []
  const modZ = new Float32Array(nMod)
  const colW = (2 * HW - 3) / MODS
  for (let i = 0; i < N_SLAB; i++) {
    const side = SLAB_Y[i] < 1 ? 1 : -1
    for (let k = 0; k < MODS; k++) {
      const w = colW * (0.45 + rand() * 0.35)
      const d = 1.2 + rand() * 2.6
      const h = 0.45 + rand() * 0.85
      const x = -HW + 1.5 + colW * (k + 0.5) + (rand() - 0.5) * colW * 0.3
      const z = (rand() - 0.5) * (2 * HD - d - 2.5)
      modZ[i * MODS + k] = z
      modLocal.push(new Matrix4().makeScale(w, h, d).setPosition(x, side * (h / 2 + 0.04), z))
    }
  }
  const modMat = new ShaderMaterial({
    uniforms: { ...worldUniforms, uInt: { value: 0.35 } },
    vertexShader: MOD_VERT,
    fragmentShader: MOD_FRAG,
    side: DoubleSide,
    fog: false,
    ...additive,
  })
  modMat.forceSinglePass = true
  const modules = new InstancedMesh(boxGeo, modMat, nMod)
  modules.instanceMatrix.setUsage(DynamicDrawUsage)
  modules.instanceColor = new InstancedBufferAttribute(new Float32Array(nMod * 3), 3)
  modules.instanceColor.setUsage(DynamicDrawUsage)
  modules.frustumCulled = false

  /* ---- points: weld packets, weld points, drifting motes ---- */
  const nPk = WELDS.length * PK
  const nJn = WELDS.length * N_SLAB
  const NP = nPk + nJn + MOTES
  const pPos = new Float32Array(NP * 3)
  const pCol = new Float32Array(NP * 3)
  const pData = new Float32Array(NP * 4)
  let q = 0
  const put = (x: number, y: number, z: number, type: number, ph: number, sp: number, size: number, col: Color, k: number) => {
    pPos[q * 3] = x
    pPos[q * 3 + 1] = y
    pPos[q * 3 + 2] = z
    pData[q * 4] = type
    pData[q * 4 + 1] = ph
    pData[q * 4 + 2] = sp
    pData[q * 4 + 3] = size
    pCol[q * 3] = col.r * k
    pCol[q * 3 + 1] = col.g * k
    pCol[q * 3 + 2] = col.b * k
    q++
  }
  for (const [wx, wz] of WELDS)
    for (let k = 0; k < PK; k++) {
      const hotPk = rand() < 0.35
      const dir = rand() < 0.5 ? 1 : -1
      put(wx, Y0, wz, 1, rand(), (0.05 + rand() * 0.07) * dir, 0.22, hotPk ? hotW : acc, hotPk ? 2.6 : 2.4)
    }
  for (const [wx, wz] of WELDS)
    for (let i = 0; i < N_SLAB; i++) put(wx, SLAB_Y[i], wz, 2, rand(), 0, 0.34, hotW, 2.2)
  for (let k = 0; k < MOTES; k++) {
    const amber = rand() < 0.7
    const col = amber ? acc : hues[Math.floor(rand() * N_SLAB) % N_SLAB]
    put(
      (rand() - 0.5) * 30,
      MOTE_Y0 + rand() * MOTE_SPAN,
      (rand() - 0.5) * 22,
      0,
      rand(),
      0.15 + rand() * 0.35,
      0.05 + rand() * 0.07,
      col,
      amber ? 0.5 + rand() * 0.6 : 0.6 + rand() * 0.4,
    )
  }
  const ptGeo = new BufferGeometry()
  ptGeo.setAttribute('position', new BufferAttribute(pPos, 3))
  ptGeo.setAttribute('aColor', new BufferAttribute(pCol, 3))
  ptGeo.setAttribute('aData', new BufferAttribute(pData, 4))
  const ptMat = new ShaderMaterial({
    uniforms: { ...worldUniforms, uT: { value: 0 }, uInt: { value: 0.35 }, uWeld: { value: 0 } },
    vertexShader: PT_VERT,
    fragmentShader: PT_FRAG,
    fog: false,
    ...additive,
  })
  const points = new Points(ptGeo, ptMat)
  points.frustumCulled = false

  return {
    MODS, off, outline, modLocal, modZ, partHues,
    beams, decks, aSlab, modules, points,
    deckMat, modMat, ptMat, beamMat,
    weld: 0, // damped weld progress (runtime)
    dispose() {
      beams.dispose()
      decks.dispose()
      modules.dispose()
      boxGeo.dispose()
      beamMat.dispose()
      deckGeo.dispose()
      deckMat.dispose()
      modMat.dispose()
      ptGeo.dispose()
      ptMat.dispose()
    },
  }
}

// scratch (module level: no per-frame allocation)
const _o = new Object3D()
const _m = new Matrix4()
const _l = new Matrix4()
const _c = new Color()

/** easeOutBack: a slight overshoot so the decks visibly snap into place */
const snap = (x: number) => {
  const t = x - 1
  return 1 + 2.5 * t * t * t + 1.5 * t * t
}

export function StackConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const parts = useMemo(() => buildStack(accent, tier), [accent, tier])
  useEffect(() => () => parts.dispose(), [parts])

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const m = parts
    const p = proximity(station)
    const now = worldState.time
    const I = 0.35 + 0.65 * p
    m.weld = MathUtils.damp(m.weld, MathUtils.smoothstep(p, 0.2, 0.8), 2.6, Math.min(delta, 0.1))
    const w = m.weld
    // weld beams extrude only once the decks have (mostly) aligned
    const wx = MathUtils.clamp((w - 0.55) / 0.45, 0, 1)
    const we = wx * wx * (3 - 2 * wx)

    const { off, outline, modLocal, modZ, partHues, MODS, beams, decks, modules } = m
    const aSlab = m.aSlab.array as Float32Array
    for (let i = 0; i < N_SLAB; i++) {
      const e = snap(MathUtils.clamp(w * 1.4 - SNAP_RANK[i] * 0.12, 0, 1))
      const r = 1 - e
      const j = i * 6
      _o.position.set(off[j] * r, SLAB_Y[i] + off[j + 1] * r, off[j + 2] * r)
      _o.rotation.set(off[j + 3] * r, off[j + 4] * r, off[j + 5] * r)
      _o.updateMatrix()
      decks.setMatrixAt(i, _o.matrix)
      for (let k = 0; k < 4; k++) {
        _m.multiplyMatrices(_o.matrix, outline[k])
        beams.setMatrixAt(i * 4 + k, _m)
      }

      // scan bars cascade up the stack, each sweeping toward the viewer
      const scanZ = -HD + 2 * HD * ((now * 0.19 + i * 0.16) % 1)
      _l.makeScale(2 * HW - 0.4, 0.045, 0.1).setPosition(0, 0, scanZ)
      _m.multiplyMatrices(_o.matrix, _l)
      beams.setMatrixAt(I_SCAN + i, _m)
      aSlab[i * 4] = scanZ
      aSlab[i * 4 + 1] = MathUtils.clamp(e, 0, 1)

      // modules ride their deck and flare as the scan passes over them
      for (let k = 0; k < MODS; k++) {
        const idx = i * MODS + k
        _m.multiplyMatrices(_o.matrix, modLocal[idx])
        modules.setMatrixAt(idx, _m)
        const dz = modZ[idx] - scanZ
        modules.setColorAt(idx, _c.copy(partHues[i]).multiplyScalar(0.55 + 1.9 * Math.exp(-dz * dz * 1.2)))
      }
    }
    // un-welded: collapse to a zero matrix so no stub sliver is rasterised at MID
    const wt = we > 0.002 ? 0.075 : 0
    for (let k = 0; k < WELDS.length; k++) {
      _m.makeScale(wt, SPAN * we, wt).setPosition(WELDS[k][0], MID, WELDS[k][1])
      beams.setMatrixAt(I_WELD + k, _m)
    }

    beams.instanceMatrix.needsUpdate = true
    decks.instanceMatrix.needsUpdate = true
    m.aSlab.needsUpdate = true
    modules.instanceMatrix.needsUpdate = true
    modules.instanceColor!.needsUpdate = true

    m.beamMat.color.setScalar(I)
    m.deckMat.uniforms.uT.value = now
    m.deckMat.uniforms.uInt.value = I
    m.modMat.uniforms.uInt.value = I
    m.ptMat.uniforms.uT.value = now
    m.ptMat.uniforms.uInt.value = I
    m.ptMat.uniforms.uWeld.value = we
  })

  return (
    <group ref={group} position={position}>
      <primitive object={parts.decks} />
      <primitive object={parts.beams} />
      <primitive object={parts.modules} />
      <primitive object={parts.points} />
    </group>
  )
}
