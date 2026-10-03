/* ============================================================================
   GROWTH · station 5 · "Revenue Systems": the rising helix funnel.

   Outbound that researches and books while you sleep, drawn as a pipeline.
   Leads (shader-driven points) stream up two spiralling arms of a funnel that
   widens as it climbs, whitening as they qualify near the rim. Every few
   seconds a "meeting booked" ring bursts off the rim and the top flares. A
   crown of LED bar-chart blades stands on a holo-platform at the base, riding
   a travelling wave and growing taller as the camera arrives (pipeline
   without headcount).

   7 draw calls: leads, 2 strands (one geometry + material), funnel wire, bars,
   bursts, platform. All motion lives on the GPU; useFrame only advances a few
   clocks shared by every material.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Curve,
  DoubleSide,
  Group,
  LineBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  TubeGeometry,
  Vector3,
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

/* --- funnel profile (mirrored in FUNNEL_GLSL: keep in sync) --------------- */
const Y0 = -5
const Y1 = 6
const R0 = 0.6
const R1 = 5.4
const TURNS = 2.25
const BAR_R = 6
const BARS = 24
const BASE_Y = -5.35
const BURST_PHASES = [0, 0.37, 0.71]
const funnelR = (t: number) => R0 + (R1 - R0) * Math.pow(t, 1.25)

const FUNNEL_GLSL = /* glsl */ `
float funnelR(float t) { return 0.6 + 4.8 * pow(t, 1.25); }
`

class FunnelHelix extends Curve<Vector3> {
  // Curve's own constructor is protected in the typings
  constructor() {
    super()
  }
  getPoint(t: number, target = new Vector3()) {
    const a = t * TURNS * Math.PI * 2
    const r = funnelR(t)
    return target.set(Math.cos(a) * r, Y0 + (Y1 - Y0) * t, Math.sin(a) * r)
  }
  // sample by curve parameter, not arc length: the tube's uv.x then equals the
  // leads' height fraction t, so strand pulses climb in step with the leads
  getUtoTmapping(u: number) {
    return u
  }
}

const ADD = {
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  fog: false,
} as const

/* --- leads: points climbing the helix, respawning at the throat ----------- */
const LEADS_VERT = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uFlow;
uniform float uFlash;
attribute float aSeed;
attribute float aOffset;
attribute float aSpeed;
attribute float aAng;
attribute float aRadF;
attribute float aSize;
varying float vT;
varying float vBright;
${FOG_VERT_PARS}
${FUNNEL_GLSL}
void main() {
  float t = fract(aOffset + uFlow * 0.065 * aSpeed);
  float r = funnelR(t) * aRadF + sin(uTime * 1.3 + aSeed * 40.0) * 0.07 * (0.3 + t);
  float a = aAng + t * 14.137167;
  vec3 p = vec3(cos(a) * r, mix(-5.0, 6.0, t), sin(a) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  float tw = 0.6 + 0.4 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 91.0);
  float ends = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
  float top = smoothstep(0.8, 1.0, t);
  vBright = tw * ends;
  vT = t;
  float size = aSize * (1.3 + 2.4 * aSeed * aSeed) * (1.0 + 0.7 * t) * (1.0 + uFlash * top);
  gl_PointSize = clamp(size * uDpr * (34.0 / max(-mv.z, 0.5)), 1.0, 28.0);
}
`
const LEADS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uInt;
uniform float uFlash;
varying float vT;
varying float vBright;
${FOG_FRAG_PARS}
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float halo = 1.0 - smoothstep(0.0, 0.5, d);
  float core = exp(-d * d * 55.0);
  float top = smoothstep(0.6, 1.0, vT);
  vec3 col = mix(uColor, uHot, top * top * 0.9);
  float k = (halo * halo * 0.6 + core * 1.3) * vBright * (0.85 + 1.2 * top + uFlash * top * 1.4);
  gl_FragColor = vec4(col * k * uInt * fogVis(), 1.0);
}
`

/* --- strands: tubes tracing the funnel edge, pulses riding up ------------- */
const STRAND_VERT = /* glsl */ `
varying float vT;
${FOG_VERT_PARS}
void main() {
  vT = uv.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const STRAND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccHot;
uniform vec3 uHot;
uniform float uInt;
uniform float uFlow;
uniform float uFlash;
varying float vT;
${FOG_FRAG_PARS}
void main() {
  // same climb rate as the leads: 0.065 of the height per flow unit
  float ph = fract(vT * 4.0 - uFlow * 0.26);
  float pulse = pow(ph, 10.0);
  float ends = smoothstep(0.0, 0.05, vT) * (1.0 - smoothstep(0.985, 1.0, vT));
  vec3 col = uColor * (0.28 + 0.6 * vT);
  col += mix(uAccHot, uHot, pulse * pulse) * pulse * 1.3;
  col += uHot * uFlash * smoothstep(0.82, 1.0, vT) * 0.7;
  gl_FragColor = vec4(col * ends * uInt * fogVis(), 1.0);
}
`

/* --- bars: a crown of LED blades, travelling wave, grows with proximity --- */
const BARS_VERT = /* glsl */ `
uniform float uTime;
uniform float uGrow;
attribute float aBar;
attribute float aU;
varying float vY;
varying float vH;
varying float vU;
${FOG_VERT_PARS}
void main() {
  float ramp = aBar / 23.0;
  float wave = 0.5 + 0.5 * sin(aBar * 0.5235988 - uTime * 2.1);
  float jitter = 0.12 * sin(uTime * 5.3 + aBar * 2.7);
  float h = (0.4 + ramp * 1.9 + wave * 2.6 + jitter) * (0.3 + 0.7 * uGrow);
  vec3 p = vec3(position.x, -5.35 + position.y * h, position.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  vY = position.y * h;
  vH = h;
  vU = aU;
}
`
const BARS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccHot;
uniform vec3 uHot;
uniform float uInt;
varying float vY;
varying float vH;
varying float vU;
${FOG_FRAG_PARS}
void main() {
  float led = 0.3 + 0.7 * step(fract(vY * 3.4), 0.7);
  float grad = 0.3 + 0.7 * clamp(vY / vH, 0.0, 1.0);
  float edge = smoothstep(0.3, 0.5, abs(vU - 0.5));
  float cap = smoothstep(vH - 0.2, vH, vY);
  vec3 col = uColor * grad * led * (0.2 + 0.7 * edge);
  col += mix(uAccHot, uHot, 0.45) * cap;
  gl_FragColor = vec4(col * uInt * fogVis(), 1.0);
}
`

/* --- bursts: "meeting booked" rings blooming off the rim ------------------ */
const BURST_VERT = /* glsl */ `
uniform float uBurst;
attribute float aEdge;
attribute float aPhase;
varying float vEdge;
varying float vLife;
${FOG_VERT_PARS}
void main() {
  float life = fract(uBurst + aPhase);
  float e = 1.0 - pow(1.0 - life, 3.0);
  float w = mix(0.4, 0.06, life);
  float rr = 5.4 + 4.4 * e + (aEdge - 0.5) * w;
  vec3 p = vec3(position.x * rr, 6.0 + 0.8 * e, position.z * rr);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
  vEdge = aEdge;
  vLife = life;
}
`
const BURST_FRAG = /* glsl */ `
uniform vec3 uAccHot;
uniform vec3 uHot;
uniform float uInt;
varying float vEdge;
varying float vLife;
${FOG_FRAG_PARS}
void main() {
  float band = 1.0 - abs(vEdge * 2.0 - 1.0);
  band *= band;
  float fade = (1.0 - vLife) * (1.0 - vLife) * smoothstep(0.0, 0.025, vLife);
  vec3 col = mix(uHot, uAccHot * 0.8, smoothstep(0.0, 0.35, vLife));
  gl_FragColor = vec4(col * band * fade * uInt * fogVis(), 1.0);
}
`

/* --- platform: polar holo-grid with a radar sweep under the funnel -------- */
const PAD_VERT = /* glsl */ `
varying vec2 vP;
${FOG_VERT_PARS}
void main() {
  vP = (uv - 0.5) * 16.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const PAD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccHot;
uniform vec3 uHot;
uniform float uInt;
uniform float uGrow;
uniform float uTime;
varying vec2 vP;
${FOG_FRAG_PARS}
void main() {
  float r = length(vP);
  if (r > 7.9) discard;
  float aa = max(fwidth(r), 1e-4);
  float rings = 1.0 - smoothstep(0.0, aa * 1.4, abs(fract(r + 0.5) - 0.5));
  // 24 spokes, lined up with the bar crown (arc distance keeps them crisp)
  float a = atan(vP.y, vP.x);
  float seg = 6.2831853 / 24.0;
  float ds = abs(fract(a / seg + 0.5) - 0.5) * seg * r;
  float spokes = (1.0 - smoothstep(0.0, aa * 1.4, ds)) * smoothstep(0.8, 1.6, r);
  float wake = mod(uTime * 0.7 - a, 6.2831853);
  float sweep = exp(-wake * 2.2) * smoothstep(0.6, 1.2, r) * (1.0 - smoothstep(5.6, 6.1, r));
  // squared by hand: pow() with a negative base is undefined (NaN on ANGLE/D3D)
  float dRim = (r - 6.0) / 0.06;
  float rim = exp(-dRim * dRim);
  float dThroat = (r - 0.6) / 0.05;
  float throat = exp(-dThroat * dThroat);
  float core = exp(-r * r * 2.5);
  float fade = 1.0 - smoothstep(5.8, 7.9, r);
  vec3 col = uColor * ((rings * 0.2 + spokes * 0.1 + sweep * 0.22) * fade + rim * 0.9 + throat * 1.4);
  col += mix(uAccHot * 0.7, uHot, 0.5) * core * (0.4 + 0.6 * uGrow);
  gl_FragColor = vec4(col * uInt * fogVis(), 1.0);
}
`

function buildGrowth(tier: LatticeTier, accent: string) {
  const mobile = tier === 'mobile'
  const rnd = mulberry32(5005)

  // one set of {value} refs shared by every material (plus the world's)
  const u = {
    uInt: { value: 0.35 },
    uFlow: { value: 0 },
    uFlash: { value: 0 },
    uBurst: { value: 0 },
    uGrow: { value: 0 },
    uColor: { value: new Color(accent) },
    uAccHot: { value: hot(accent, 2.2) },
    uHot: { value: new Color('#ffd9e8').multiplyScalar(2.4) },
  }
  const mat = (vertexShader: string, fragmentShader: string, side = DoubleSide) =>
    new ShaderMaterial({
      uniforms: { ...worldUniforms, ...u },
      vertexShader,
      fragmentShader,
      side,
      ...ADD,
    })

  // leads: 60% ride the two arms, 30% fill the funnel, 10% orbit outside as sparks
  const N = mobile ? 1000 : 2500
  const seed = new Float32Array(N)
  const offset = new Float32Array(N)
  const speed = new Float32Array(N)
  const ang = new Float32Array(N)
  const radF = new Float32Array(N)
  const size = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    seed[i] = rnd()
    offset[i] = rnd()
    const cls = rnd()
    if (cls < 0.6) {
      ang[i] = (i % 2) * Math.PI + (rnd() - 0.5) * 0.42
      radF[i] = 1 + (rnd() - 0.5) * 0.14
      speed[i] = 0.85 + rnd() * 0.35
      size[i] = 1
    } else if (cls < 0.9) {
      ang[i] = rnd() * Math.PI * 2
      radF[i] = 0.2 + Math.sqrt(rnd()) * 0.85
      speed[i] = 0.6 + rnd() * 0.4
      size[i] = 0.75
    } else {
      ang[i] = rnd() * Math.PI * 2
      radF[i] = 1.15 + rnd() * 0.5
      speed[i] = 0.25 + rnd() * 0.2
      size[i] = 0.5
    }
  }
  const leadsGeo = new BufferGeometry()
  leadsGeo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
  leadsGeo.setAttribute('aSeed', new BufferAttribute(seed, 1))
  leadsGeo.setAttribute('aOffset', new BufferAttribute(offset, 1))
  leadsGeo.setAttribute('aSpeed', new BufferAttribute(speed, 1))
  leadsGeo.setAttribute('aAng', new BufferAttribute(ang, 1))
  leadsGeo.setAttribute('aRadF', new BufferAttribute(radF, 1))
  leadsGeo.setAttribute('aSize', new BufferAttribute(size, 1))
  // outer sparks reach r ~9 at the rim (y 6): 11 keeps every point inside
  leadsGeo.boundingSphere = new Sphere(new Vector3(0, 0.5, 0), 11)
  const leadsMat = mat(LEADS_VERT, LEADS_FRAG)

  // strand B is strand A turned half a revolution, so one geometry serves both
  const strandGeo = new TubeGeometry(new FunnelHelix(), mobile ? 160 : 320, 0.045, 6, false)
  const strandMat = mat(STRAND_VERT, STRAND_FRAG)

  // funnel wireframe: latitude rings + meridians, brighter toward the rim
  const wp: number[] = []
  const wc: number[] = []
  const pushV = (t: number, a: number) => {
    const r = funnelR(t)
    wp.push(Math.cos(a) * r, Y0 + (Y1 - Y0) * t, Math.sin(a) * r)
    const b = 0.35 + 0.65 * t
    wc.push(b, b, b)
  }
  const RS = 72
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    for (let k = 0; k < RS; k++) {
      pushV(t, (k / RS) * Math.PI * 2)
      pushV(t, ((k + 1) / RS) * Math.PI * 2)
    }
  }
  const MER = 16
  const MS = 22
  for (let m = 0; m < MER; m++) {
    const a = (m / MER) * Math.PI * 2
    for (let s = 0; s < MS; s++) {
      pushV(s / MS, a)
      pushV((s + 1) / MS, a)
    }
  }
  const wireGeo = new BufferGeometry()
  wireGeo.setAttribute('position', new BufferAttribute(new Float32Array(wp), 3))
  wireGeo.setAttribute('color', new BufferAttribute(new Float32Array(wc), 3))
  const wireBase = new Color(accent).multiplyScalar(0.3)
  const wireMat = new LineBasicMaterial({
    color: wireBase.clone(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

  // bars: square blades (4 side quads each); y is 0..1, the shader sets height
  const bp: number[] = []
  const bBar: number[] = []
  const bU: number[] = []
  const bIdx: number[] = []
  const hw = 0.09
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2
    const cx = Math.cos(a) * BAR_R
    const cz = Math.sin(a) * BAR_R
    const rx = Math.cos(a)
    const rz = Math.sin(a)
    const tx = -rz
    const tz = rx
    const cs = [
      [cx + (rx + tx) * hw, cz + (rz + tz) * hw],
      [cx + (-rx + tx) * hw, cz + (-rz + tz) * hw],
      [cx + (-rx - tx) * hw, cz + (-rz - tz) * hw],
      [cx + (rx - tx) * hw, cz + (rz - tz) * hw],
    ]
    for (let f = 0; f < 4; f++) {
      const A = cs[f]
      const B = cs[(f + 1) % 4]
      const base = bp.length / 3
      bp.push(A[0], 0, A[1], B[0], 0, B[1], B[0], 1, B[1], A[0], 1, A[1])
      bU.push(0, 1, 1, 0)
      bBar.push(i, i, i, i)
      bIdx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const barsGeo = new BufferGeometry()
  barsGeo.setAttribute('position', new BufferAttribute(new Float32Array(bp), 3))
  barsGeo.setAttribute('aBar', new BufferAttribute(new Float32Array(bBar), 1))
  barsGeo.setAttribute('aU', new BufferAttribute(new Float32Array(bU), 1))
  barsGeo.setIndex(bIdx)
  barsGeo.boundingSphere = new Sphere(new Vector3(0, -3, 0), 8.5)
  const barsMat = mat(BARS_VERT, BARS_FRAG)

  // bursts: thin unit annuli (inner/outer edge rows), scaled in the shader
  const SEG = mobile ? 96 : 160
  const rp: number[] = []
  const rEdge: number[] = []
  const rPhase: number[] = []
  const rIdx: number[] = []
  for (const phase of BURST_PHASES) {
    const base = rp.length / 3
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2
      for (let e = 0; e < 2; e++) {
        rp.push(Math.cos(a), 0, Math.sin(a))
        rEdge.push(e)
        rPhase.push(phase)
      }
    }
    for (let s = 0; s < SEG; s++) {
      const i0 = base + s * 2
      rIdx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2)
    }
  }
  const burstGeo = new BufferGeometry()
  burstGeo.setAttribute('position', new BufferAttribute(new Float32Array(rp), 3))
  burstGeo.setAttribute('aEdge', new BufferAttribute(new Float32Array(rEdge), 1))
  burstGeo.setAttribute('aPhase', new BufferAttribute(new Float32Array(rPhase), 1))
  burstGeo.setIndex(rIdx)
  burstGeo.boundingSphere = new Sphere(new Vector3(0, 6.5, 0), 11)
  const burstMat = mat(BURST_VERT, BURST_FRAG)

  const padGeo = new PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, BASE_Y - 0.05, 0)
  const padMat = mat(PAD_VERT, PAD_FRAG)

  const geos = [leadsGeo, strandGeo, wireGeo, barsGeo, burstGeo, padGeo]
  const mats = [leadsMat, strandMat, wireMat, barsMat, burstMat, padMat]
  return {
    leadsGeo,
    leadsMat,
    strandGeo,
    strandMat,
    wireGeo,
    wireMat,
    barsGeo,
    barsMat,
    burstGeo,
    burstMat,
    padGeo,
    padMat,
    /** advance the construct's clocks by dt (world time) at proximity p */
    tick(dt: number, p: number) {
      u.uInt.value = 0.35 + 0.65 * p
      u.uGrow.value = p
      // the pipeline runs faster and books more meetings once you're watching
      u.uFlow.value += dt * (0.55 + 0.75 * p)
      u.uBurst.value = (u.uBurst.value + dt * (0.09 + 0.13 * p)) % 1
      let flash = 0
      for (let i = 0; i < BURST_PHASES.length; i++) {
        flash = Math.max(flash, Math.exp(-((u.uBurst.value + BURST_PHASES[i]) % 1) * 16))
      }
      u.uFlash.value = flash * (0.4 + 0.6 * p)
      wireMat.color.copy(wireBase).multiplyScalar(u.uInt.value)
    },
    dispose() {
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
    },
  }
}

export function GrowthConstruct({ station, position, accent, tier }: ConstructProps) {
  const group = useRef<Group>(null)
  const spinner = useRef<Group>(null)
  const last = useRef(worldState.time)
  const a = useMemo(() => buildGrowth(tier, accent), [tier, accent])
  useEffect(() => () => a.dispose(), [a])

  useFrame(() => {
    // clocks advance from the world's (reduced-motion aware) time
    const now = worldState.time
    const dt = Math.min(0.1, Math.max(0, now - last.current))
    last.current = now
    const g = group.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    a.tick(dt, proximity(station))
    // the helix turns so its threads read as climbing
    if (spinner.current) spinner.current.rotation.y = now * 0.15
  })

  return (
    <group ref={group} position={position}>
      <group ref={spinner}>
        <points geometry={a.leadsGeo} material={a.leadsMat} />
        <mesh geometry={a.strandGeo} material={a.strandMat} />
        <mesh geometry={a.strandGeo} material={a.strandMat} rotation-y={Math.PI} />
        <lineSegments geometry={a.wireGeo} material={a.wireMat} />
      </group>
      <mesh geometry={a.barsGeo} material={a.barsMat} />
      <mesh geometry={a.burstGeo} material={a.burstMat} />
      <mesh geometry={a.padGeo} material={a.padMat} />
    </group>
  )
}
