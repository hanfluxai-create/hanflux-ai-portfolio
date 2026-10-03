/* ============================================================================
   Station 8 · THE BUILD LOG: "not a menu, a running log of what gets wired".

   Construct: a WALL OF CODE standing across the flight path. A 130 x 70 wall
   of falling glyph rain rises from the floor; the camera threads a rounded
   opening in it (track ~8.28). The whole wall is one fragment shader on a
   4-vertex quad:
     - per-column rain: two falling heads per column (hashed speed, phase and
       trail length), white-hot head cells, fading phosphor trails
     - glyphs that re-roll per cell at their own cadence (heads scramble fast)
     - "log lines": rows typed out left-to-right by a hot cursor, the build
       log being written as you watch, then fading
     - a vertical scan line sweeping across, leaving a brief wake
     - the opening: hot boundary line, a 2-3 cell band of brighter glyphs and
       a soft halo, all flaring as the camera passes through
   A sparser wall 7 units behind (larger cells, dimmer, same opening) gives
   parallax and turns the opening into a short tunnel. Sparks stream off the
   rim toward the viewer, glyph dust falls off the rain, and a thin HUD
   (chamfered corner brackets, ruler ticks, tunnel frames) frames the way in.

   Draw calls: 4 (front wall, back wall, sparks, HUD lines).
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Group,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  LATTICE,
  getGlyphAtlas,
  isNear,
  mulberry32,
  proximity,
  releaseGlyphAtlas,
  worldState,
  worldUniforms,
  type ConstructProps,
  type LatticeTier,
} from '../shared'

const WALL_W = 130
const WALL_H = 70
const BACK_Z = -7 // the sparser parallax wall, behind the main one
const HOLE_C: [number, number] = [0, -0.5] // opening centre in group space (world y ~1.5)
const HOLE_H: [number, number] = [5, 3.75] // opening half extents: 10 x 7.5
const HOLE_R = 1.6
const SCAN_SPAN = 100 // the sweep only crosses the part of the wall that is ever on screen

/* --- shaders --------------------------------------------------------------- */

const WALL_VERT = /* glsl */ `
varying vec2 vP;
${FOG_VERT_PARS}
void main() {
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`

const WALL_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uTint;
uniform vec2 uCell;
uniform vec2 uMin;
uniform vec2 uMax;
uniform vec2 uHoleC;
uniform vec2 uHoleH;
uniform float uHoleR;
uniform float uRimW;
uniform float uT;
uniform float uI;
uniform float uFlare;
uniform float uDensity;
uniform float uSeed;
uniform float uScan;
uniform float uGain;
uniform float uLog;
varying vec2 vP;
${FOG_FRAG_PARS}

// sine-free hashes: stable for the large cell / time indices used here
float h1(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float h2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  // glyph-space coords and their screen gradients, taken BEFORE any discard so
  // the quad's derivatives stay defined on every driver (ANGLE/Metal included)
  vec2 g = vP / uCell;
  vec2 gdx = dFdx(g) * 0.11;
  vec2 gdy = dFdy(g) * 0.11;

  float sd = sdRound(vP - uHoleC, uHoleH, uHoleR); // < 0 inside the opening
  if (sd < -0.2) discard;

  vec2 cell = floor(g);
  vec2 f = fract(g);
  float cx = cell.x + uSeed;
  float rowHi = floor(uMax.y / uCell.y);
  float rows = rowHi - floor(uMin.y / uCell.y);

  // rain: falling heads per column, each dragging a fading trail above it.
  // The period overshoots the wall so a head wraps only once its trail is gone.
  float live = step(h1(cx * 1.713 + 0.37), uDensity);
  float rain = 0.0;
  float head = 0.0;
  for (int i = 0; i < CW_HEADS; i++) {
    float fi = float(i);
    float hs = h1(cx * 3.117 + fi * 17.31);
    float speed = mix(3.0, 12.0, hs * hs);
    float trail = floor(mix(6.0, 28.0, h1(cx * 5.37 + fi * 9.1)));
    float period = rows + 36.0 + floor(h1(cx * 7.77 + fi * 2.9) * 48.0);
    float phase = h1(cx * 11.3 + fi * 3.3) * period;
    float hr = rowHi + 2.0 - floor(mod(uT * speed + phase, period));
    float d = cell.y - hr;
    if (d >= 0.0 && d < trail) {
      float k = 1.0 - d / trail;
      rain = max(rain, k * k);
      head = max(head, d < 0.5 ? 1.0 : (d < 1.5 ? 0.35 : 0.0));
    }
  }
  rain *= live;
  head *= live;

  // rim band: whole cells within ~uRimW of the opening light up
  vec2 cc = (cell + 0.5) * uCell - uHoleC;
  float sdc = sdRound(cc, uHoleH, uHoleR);
  float rim = (1.0 - smoothstep(0.0, uRimW, sdc)) * step(-0.45 * uCell.x, sdc);

  // log lines: a row gets typed out by a cursor, holds, then fades
  float logK = 0.0;
  float typed = 0.0;
  float cursor = 0.0;
#if CW_LOG
  float lt = uT * 0.16 + h1(cell.y * 1.31 + uSeed) * 9.0;
  float ep = mod(floor(lt), 997.0);
  float lf = fract(lt);
  float span = (uMax.x - uMin.x) / uCell.x;
  float x0 = floor((h2(vec2(ep + 3.1, cell.y * 0.7)) - 0.5) * span * 0.42);
  float len = floor(mix(10.0, 40.0, h2(vec2(cell.y + 9.7, ep))));
  float cur = x0 + floor(lf * 1.7 * len);
  typed = step(x0, cell.x) * step(cell.x, min(cur, x0 + len));
  cursor = (1.0 - step(0.5, abs(cell.x - cur))) * step(cur, x0 + len);
  logK = step(h2(vec2(cell.y, ep)), uLog) * (1.0 - smoothstep(0.72, 1.0, lf));
#endif

  // glyph: each cell re-rolls at its own cadence; heads, rim and cursor scramble
  float ch = h2(cell + uSeed * 0.13);
  float rate = mix(0.2, 2.4, ch * ch) + head * 14.0 + rim * 5.0 + cursor * logK * 20.0;
  float tick = mod(floor(uT * rate + ch * 31.0), 241.0);
  float gi = floor(h2(vec2(cell.x + tick * 7.13, cell.y - tick * 3.71)) * 64.0);
  vec2 auv = (vec2(mod(gi, 8.0), 7.0 - floor(gi / 8.0)) + mix(vec2(0.06), vec2(0.94), f)) / 8.0;
  // gradients from the continuous coordinate: no mip seams at cell borders
  float cov = textureGrad(uAtlas, auv, gdx, gdy).r;

  float occ = step(h2(cell * 1.37 + vec2(4.1, uSeed)), 0.62);
  float tw = step(0.993, h2(cell + vec2(mod(floor(uT * 3.0), 911.0), uSeed)));

  // scan sweep: thin line, glyph wake trailing behind it
  float dxs = uScan - vP.x;
  float wake = dxs >= 0.0 ? exp(-dxs * 0.3) : exp(dxs * 2.5);
  float scanLine = exp(-abs(dxs) * 9.0);

  float open = smoothstep(-0.02, 0.08, sd);
  float glyph = 0.05 * occ + rain * 0.48 + tw * 0.3
    + logK * (typed * 0.32 + cursor * 0.9)
    + rim * (0.55 + 0.9 * uFlare);
  glyph *= 1.0 + wake * 1.2;
  vec3 col = uTint * glyph * cov;
  float white = head * 2.3 + logK * cursor * 1.4 + rim * uFlare * 1.2;
  col += mix(uTint, vec3(1.0), 0.6) * white * cov;
  col *= open;

  // the opening: hot boundary line + soft halo on the wall face
  float edge = 1.0 - smoothstep(0.0, 0.2, abs(sd - 0.06));
  float halo = exp(-max(sd, 0.0) * 1.1) * step(0.0, sd);
  col += mix(uTint, vec3(1.0), 0.3) * edge * (1.1 + 2.4 * uFlare);
  col += uTint * halo * (0.1 + 0.4 * uFlare);
  col += uTint * scanLine * 0.45 * open;
  // seam where the wall meets the floor
  col += uTint * (1.0 - smoothstep(0.0, 0.15, vP.y - uMin.y)) * 0.9;

  float ef = smoothstep(uMin.x, uMin.x + 16.0, vP.x)
    * (1.0 - smoothstep(uMax.x - 16.0, uMax.x, vP.x))
    * (1.0 - smoothstep(uMax.y - 28.0, uMax.y, vP.y));
  col *= ef * uI * uGain * fogVis();
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}
`

const SPARK_VERT = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uFlare;
uniform float uDpr;
attribute vec4 aData;
attribute vec3 aDir;
varying float vA;
varying float vHot;
${FOG_VERT_PARS}
void main() {
  float life = fract(uT * aData.x + aData.y);
  vec3 p = position + aDir * life * (1.0 + uFlare * 1.2);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -mvPosition.z;
  vA = sin(3.14159265 * life) * (0.3 + 0.7 * uI) * (1.0 + uFlare);
  vHot = aData.w;
  gl_PointSize = clamp(aData.z * uDpr * (420.0 / max(-mvPosition.z, 0.5)), 1.0, 48.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

const SPARK_FRAG = /* glsl */ `
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

/* --- geometry helpers ------------------------------------------------------ */

type HolePt = { x: number; y: number; nx: number; ny: number }

/** point + outward normal on the opening's rounded-rect outline, relative to
 *  its centre; t in [0,1) walks clockwise starting on the top edge */
function holePoint(t: number, out: HolePt) {
  const [hx, hy] = HOLE_H
  const r = HOLE_R
  const sx = 2 * (hx - r)
  const sy = 2 * (hy - r)
  const arc = (Math.PI * r) / 2
  const lens = [sx, arc, sy, arc, sx, arc, sy, arc]
  let s = (((t % 1) + 1) % 1) * (2 * sx + 2 * sy + 4 * arc)
  let i = 0
  while (i < 7 && s > lens[i]) {
    s -= lens[i]
    i++
  }
  const u = Math.min(1, s / lens[i])
  const arcAt = (cx: number, cy: number, a0: number) => {
    const a = a0 - u * (Math.PI / 2)
    out.nx = Math.cos(a)
    out.ny = Math.sin(a)
    out.x = cx + r * out.nx
    out.y = cy + r * out.ny
  }
  switch (i) {
    case 0:
      out.x = -hx + r + u * sx
      out.y = hy
      out.nx = 0
      out.ny = 1
      break
    case 1:
      arcAt(hx - r, hy - r, Math.PI / 2)
      break
    case 2:
      out.x = hx
      out.y = hy - r - u * sy
      out.nx = 1
      out.ny = 0
      break
    case 3:
      arcAt(hx - r, -hy + r, 0)
      break
    case 4:
      out.x = hx - r - u * sx
      out.y = -hy
      out.nx = 0
      out.ny = -1
      break
    case 5:
      arcAt(-hx + r, -hy + r, -Math.PI / 2)
      break
    case 6:
      out.x = -hx
      out.y = -hy + r + u * sy
      out.nx = -1
      out.ny = 0
      break
    default:
      arcAt(-hx + r, hy - r, Math.PI)
      break
  }
  return out
}

function wallMaterial(o: {
  tint: Color
  cell: [number, number]
  min: Vector2
  max: Vector2
  density: number
  seed: number
  gain: number
  log: number
  rimW: number
  heads: number
}) {
  return new ShaderMaterial({
    uniforms: {
      ...worldUniforms,
      uAtlas: { value: null },
      uTint: { value: o.tint },
      uCell: { value: new Vector2(o.cell[0], o.cell[1]) },
      uMin: { value: o.min },
      uMax: { value: o.max },
      uHoleC: { value: new Vector2(HOLE_C[0], HOLE_C[1]) },
      uHoleH: { value: new Vector2(HOLE_H[0], HOLE_H[1]) },
      uHoleR: { value: HOLE_R },
      uRimW: { value: o.rimW },
      uT: { value: 0 },
      uI: { value: 0.35 },
      uFlare: { value: 0 },
      uDensity: { value: o.density },
      uSeed: { value: o.seed },
      uScan: { value: 0 },
      uGain: { value: o.gain },
      uLog: { value: o.log },
    },
    defines: { CW_HEADS: o.heads, CW_LOG: o.log > 0 ? 1 : 0 },
    vertexShader: WALL_VERT,
    fragmentShader: WALL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  })
}

/** sparks: most stream off the rim toward the viewer, the rest is glyph dust
 *  falling just in front of the wall */
function buildSparks(count: number, floorY: number) {
  const rnd = mulberry32(80808)
  const pos = new Float32Array(count * 3)
  const dir = new Float32Array(count * 3)
  const data = new Float32Array(count * 4)
  const hp: HolePt = { x: 0, y: 0, nx: 0, ny: 0 }
  const rimCount = Math.floor(count * 0.62)
  for (let i = 0; i < count; i++) {
    if (i < rimCount) {
      holePoint(rnd(), hp)
      const o = rnd() * 0.5
      pos.set([HOLE_C[0] + hp.x + hp.nx * o, HOLE_C[1] + hp.y + hp.ny * o, rnd() * 0.3], i * 3)
      const spread = 0.3 + rnd() * 1.4
      dir.set([hp.nx * spread, hp.ny * spread + 0.3, 3 + rnd() * 8], i * 3)
      data.set([0.12 + rnd() * 0.25, rnd(), 0.07 + rnd() * 0.1, rnd() < 0.3 ? 1 : 0], i * 4)
    } else {
      let x = 0
      let y = 0
      do {
        x = (rnd() - 0.5) * 90
        y = floorY + 2 + rnd() * 36
      } while (
        Math.abs(x - HOLE_C[0]) < HOLE_H[0] + 1 &&
        Math.abs(y - HOLE_C[1]) < HOLE_H[1] + 1
      )
      pos.set([x, y, 0.3 + rnd() * 1.6], i * 3)
      dir.set([0, -(3 + rnd() * 7), 0.4 + rnd() * 2], i * 3)
      data.set([0.05 + rnd() * 0.12, rnd(), 0.05 + rnd() * 0.07, rnd() < 0.12 ? 1 : 0], i * 4)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('aDir', new Float32BufferAttribute(dir, 3))
  geo.setAttribute('aData', new Float32BufferAttribute(data, 4))
  return geo
}

/** thin HUD around the opening: chamfered brackets, ruler ticks, tunnel frames
 *  between the two walls and dashed guide rails across the wall face */
function buildHud(accent: string) {
  const pos: number[] = []
  const col: number[] = []
  const c = new Color(accent)
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number) => {
    pos.push(ax, ay, az, bx, by, bz)
    col.push(c.r * k, c.g * k, c.b * k, c.r * k, c.g * k, c.b * k)
  }
  const [cx, cy] = HOLE_C
  const bx = HOLE_H[0] + 1.1
  const by = HOLE_H[1] + 1.0
  const arm = 1.8
  const cut = 0.45
  const z = 0.35
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const X = cx + sx * bx
      const Y = cy + sy * by
      seg(X - sx * arm, Y, z, X - sx * cut, Y, z, 1.6)
      seg(X - sx * cut, Y, z, X, Y - sy * cut, z, 1.6)
      seg(X, Y - sy * cut, z, X, Y - sy * arm, z, 1.6)
    }
  }
  for (let i = -8; i <= 8; i++) {
    const x = cx + i * 0.5
    const L = i % 4 === 0 ? 0.45 : 0.2
    seg(x, cy + by + 0.25, z, x, cy + by + 0.25 + L, z, 0.9)
    seg(x, cy - by - 0.25, z, x, cy - by - 0.25 - L, z, 0.9)
  }
  const a: HolePt = { x: 0, y: 0, nx: 0, ny: 0 }
  const b: HolePt = { x: 0, y: 0, nx: 0, ny: 0 }
  const P = 48
  for (const zf of [-1.75, -3.5, -5.25]) {
    for (let i = 0; i < P; i++) {
      holePoint(i / P, a)
      holePoint((i + 1) / P, b)
      seg(cx + a.x, cy + a.y, zf, cx + b.x, cy + b.y, zf, 0.55)
    }
  }
  for (let i = 0; i < 8; i++) {
    holePoint((i + 0.5) / 8, a)
    seg(cx + a.x, cy + a.y, 0, cx + a.x, cy + a.y, BACK_Z, 0.8)
  }
  for (const sy of [-1, 1]) {
    const y = cy + sy * (by + 1.4)
    for (const sx of [-1, 1]) {
      for (let d = 0; d < 14; d++) {
        const x0 = cx + sx * (bx + 1 + d * 2.4)
        seg(x0, y, 0.2, x0 + sx * 1.5, y, 0.2, 0.7 * (1 - d / 14))
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  return geo
}

function buildCodeWall(tier: LatticeTier, accent: string, floorY: number) {
  const mobile = tier === 'mobile'
  const tint = new Color(accent)
  // the wall stands on the floor and towers up into the dark
  const wallGeo = new PlaneGeometry(WALL_W, WALL_H, 1, 1)
  wallGeo.translate(0, floorY + WALL_H / 2, 0)
  const min = new Vector2(-WALL_W / 2, floorY)
  const max = new Vector2(WALL_W / 2, floorY + WALL_H)

  const frontMat = wallMaterial({
    tint,
    cell: [0.7, 0.82],
    min,
    max,
    density: 0.85,
    seed: 0,
    gain: 1,
    log: 0.14,
    rimW: 1.9,
    heads: 2,
  })
  const backMat = wallMaterial({
    tint,
    cell: [1.15, 1.35],
    min,
    max,
    density: 0.45,
    seed: 57.3,
    gain: 0.45,
    log: 0,
    rimW: 2.6,
    heads: 1,
  })

  const sparkGeo = buildSparks(mobile ? 420 : 900, floorY)
  const sparkMat = new ShaderMaterial({
    uniforms: {
      ...worldUniforms,
      uTint: { value: tint },
      uT: { value: 0 },
      uI: { value: 0.35 },
      uFlare: { value: 0 },
    },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
  })

  const hudGeo = buildHud(accent)
  const hudMat = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

  return {
    wallGeo,
    frontMat,
    backMat,
    sparkGeo,
    sparkMat,
    hudGeo,
    hudMat,
    dispose() {
      wallGeo.dispose()
      frontMat.dispose()
      backMat.dispose()
      sparkGeo.dispose()
      sparkMat.dispose()
      hudGeo.dispose()
      hudMat.dispose()
    },
  }
}

export function CodeWallConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const floorY = LATTICE.FLOOR_Y - position[1]
  const a = useMemo(() => buildCodeWall(tier, accent, floorY), [tier, accent, floorY])
  useEffect(() => () => a.dispose(), [a])

  // the shared glyph atlas is ref-counted: one acquire per mount, one release
  useEffect(() => {
    const tex = getGlyphAtlas()
    a.frontMat.uniforms.uAtlas.value = tex
    a.backMat.uniforms.uAtlas.value = tex
    return () => {
      a.frontMat.uniforms.uAtlas.value = null
      a.backMat.uniforms.uAtlas.value = null
      releaseGlyphAtlas()
    }
  }, [a])

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

    // flare as the camera crosses each wall plane (front at dz = 0, back at dz = -7).
    // Read the real camera: portrait phones fly with a longer stand-off than LATTICE.D.
    const dzF = state.camera.position.z - position[2]
    const dzB = dzF - BACK_Z
    const flareF = Math.exp(-(dzF * dzF) / 26) + 0.2 * Math.exp(-(dzF * dzF) / 700)
    const flareB = Math.exp(-(dzB * dzB) / 26)
    const scan = ((t * 14) % SCAN_SPAN) - SCAN_SPAN / 2

    const fu = a.frontMat.uniforms
    fu.uT.value = t
    fu.uI.value = intensity
    fu.uFlare.value = flareF
    fu.uScan.value = scan
    const bu = a.backMat.uniforms
    bu.uT.value = t
    bu.uI.value = intensity
    bu.uFlare.value = flareB
    bu.uScan.value = scan - 8

    const su = a.sparkMat.uniforms
    su.uT.value = t
    su.uI.value = intensity
    su.uFlare.value = Math.max(flareF, flareB)

    a.hudMat.color.setScalar(intensity * (1 + 1.4 * Math.max(flareF, flareB)))
  })

  return (
    <group ref={group} position={position}>
      <mesh geometry={a.wallGeo} material={a.backMat} position={[0, 0, BACK_Z]} />
      <mesh geometry={a.wallGeo} material={a.frontMat} />
      <points geometry={a.sparkGeo} material={a.sparkMat} frustumCulled={false} />
      <lineSegments geometry={a.hudGeo} material={a.hudMat} />
    </group>
  )
}
