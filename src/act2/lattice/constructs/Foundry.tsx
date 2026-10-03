/* ============================================================================
   STATION 2 — FOUNDRY: the agent crystal ("Custom Agents & Skills").

   A geodesic orchestrator crystal (the lead agent) hangs over a holographic
   forge ring. Skills and tools spiral up out of the forge into its white-hot
   core while six star-tetrahedron sub-agents ride three tilted orbits around
   it, trailing comet light along their orbital planes. The core dispatches
   work down dashed links (violet packets racing outward); each agent kicks
   as a job lands, and every so often a white result packet races home. When
   it arrives the core flares and the whole lattice brightens: the result has
   been checked against the rubric.

   8 draw calls. All motion lives in shaders, driven by a handful of uniforms
   written once per frame (agent positions, return-packet phases, flashes).
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Euler,
  FrontSide,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  TetrahedronGeometry,
  Vector3,
  type Group,
  type IUniform,
  type Mesh,
  type Side,
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

const TAU = Math.PI * 2
const AGENTS = 6
const PACKET = 0.34 // dispatch packets: link traversals per second
const RET_RATE = 0.19 // result cycles per second, per agent
const RET_LEG = 0.42 // share of a result cycle spent travelling home
const ORBIT_W = [0.36, 0.29, 0.23] // rad/s, all prograde (ring trails assume +θ)
const ORBIT_PH = [0, 1.3, 2.6]
const ORBIT_TILT: [number, number, number][] = [
  [0.3, 0, 0.12],
  [1.1, 0.7, 0],
  [-1.1, -0.7, 0],
]
const FORGE_Y = -5.4

const frac = (x: number) => x - Math.floor(x)
/** dispatch packet phase offset; shared by the points buffer and the landing flashes */
const packetSeed = (agent: number, k: number) => frac(agent * 0.371 + k * 0.5)
/** integer hash -> [0,1), deterministic in JS (GLSL sin-hashes aren't reproducible on CPU) */
const ihash = (n: number) => {
  let x = Math.imul(n | 0, 0x9e3779b1)
  x ^= x >>> 15
  x = Math.imul(x, 0x85ebca77)
  x ^= x >>> 13
  return (x >>> 0) / 4294967296
}

/* --- shaders --------------------------------------------------------------- */

// crystal edges: a scan band sweeps down through the lattice in world space
const LINE_V = /* glsl */ `
varying float vY;
${FOG_VERT_PARS}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const LINE_F = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
uniform float uBase;
uniform float uScan;
uniform float uFlash;
varying float vY;
${FOG_FRAG_PARS}
void main() {
  float d = (vY - uScan) * 2.4;
  float band = exp(-d * d);
  float b = uBase + band * 2.6 + uFlash * 0.9;
  vec3 col = mix(uColor, vec3(1.0), band * 0.35 + uFlash * 0.15) * b * uI;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

// faint facet fill: fresnel sheen + random single-facet flashes + scan band
const FILL_V = /* glsl */ `
attribute float aFace;
varying vec3 vN;
varying vec3 vV;
varying float vFace;
varying float vY;
${FOG_VERT_PARS}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vY = wp.y;
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vFace = aFace;
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const FILL_F = /* glsl */ `
uniform float uT;
uniform vec3 uColor;
uniform float uI;
uniform float uScan;
uniform float uFlash;
varying vec3 vN;
varying vec3 vV;
varying float vFace;
varying float vY;
${FOG_FRAG_PARS}
${HASH}
void main() {
  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float face = floor(vFace + 0.5);
  // every facet rolls a die on its own clock; ~4% light up per tick, then decay
  float ph = uT * 0.9 + hash11(face * 3.17 + 0.5) * 11.0;
  float on = step(0.955, hash11(mod(floor(ph), 1021.0) * 1.37 + face * 0.618));
  float flash = on * pow(1.0 - fract(ph), 3.0);
  float d = (vY - uScan) * 2.4;
  float band = exp(-d * d);
  float b = 0.022 + 0.11 * fres * fres + band * 0.06 + flash * 0.8 + uFlash * 0.05;
  vec3 col = mix(uColor, vec3(1.0), flash * 0.25) * b * uI;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

// six star-tetrahedra, placed on their orbits and spun entirely on the GPU
const TET_V = /* glsl */ `
uniform float uT;
uniform float uI;
uniform vec3 uAgentPos[6];
uniform float uAgentFlash[6];
attribute float aAgent;
varying float vB;
varying float vW;
${FOG_VERT_PARS}
vec3 rotY(vec3 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
vec3 rotX(vec3 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
}
void main() {
  int ai = int(aAgent + 0.5);
  float fl = uAgentFlash[ai];
  float spin = uT * (0.7 + 0.12 * aAgent) + aAgent * 1.7;
  vec3 lp = rotX(rotY(position, spin), spin * 0.6 + aAgent) * (1.0 + 0.4 * fl);
  vec4 mv = modelViewMatrix * vec4(uAgentPos[ai] + lp, 1.0);
  gl_Position = projectionMatrix * mv;
  vB = (1.05 + 2.0 * fl) * uI;
  vW = fl * 0.45;
  vFogDepth = -mv.z;
}
`
const TET_F = /* glsl */ `
uniform vec3 uColor;
varying float vB;
varying float vW;
${FOG_FRAG_PARS}
void main() {
  gl_FragColor = vec4(mix(uColor, vec3(1.0), vW) * vB * fogVis(), 1.0);
}
`

// dispatch links core -> agent; dashes march outward at packet speed
const LINK_V = /* glsl */ `
uniform vec3 uAgentPos[6];
attribute float aAgent;
attribute float aEnd;
varying float vT;
varying float vSeed;
${FOG_VERT_PARS}
void main() {
  vec3 p = position + uAgentPos[int(aAgent + 0.5)] * aEnd;
  vT = aEnd;
  vSeed = aAgent;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const LINK_F = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uPacket;
uniform vec3 uColor;
varying float vT;
varying float vSeed;
${FOG_FRAG_PARS}
void main() {
  float dash = smoothstep(0.55, 1.0, fract((vT - uT * uPacket) * 7.0 + vSeed * 0.37));
  float ends = smoothstep(0.0, 0.14, vT) * (1.0 - 0.5 * smoothstep(0.85, 1.0, vT));
  float b = (0.2 + dash * 0.85) * ends * uI;
  gl_FragColor = vec4(uColor * b * fogVis(), 1.0);
}
`

// orbital planes (with comet trails behind each agent) + the forge ring
const RING_V = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uOrbitR;
uniform vec3 uOrbitAng;
attribute float aRing;
attribute float aAng;
varying float vB;
varying float vW;
${FOG_VERT_PARS}
void main() {
  vec3 p = position;
  float b = 0.0;
  float w = 0.0;
  if (aRing < 2.5) {
    p *= uOrbitR;
    float th = aRing < 0.5 ? uOrbitAng.x : (aRing < 1.5 ? uOrbitAng.y : uOrbitAng.z);
    float d0 = mod(th - aAng, 6.2831853);
    float d1 = mod(th + 3.1415927 - aAng, 6.2831853);
    float trail = exp(-d0 * 1.7) + exp(-d1 * 1.7);
    b = 0.15 + trail * 1.7;
    w = trail * 0.25;
  } else {
    float s = uT * 0.12;
    float c = cos(s);
    float sn = sin(s);
    p.xz = vec2(c * p.x - sn * p.z, sn * p.x + c * p.z);
    float sweep = pow(0.5 + 0.5 * cos(aAng - uT * 0.9), 10.0);
    b = (aRing < 3.5 ? 0.3 : 0.45) + sweep * 1.5;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vB = b * uI;
  vW = w;
  vFogDepth = -mv.z;
}
`
const RING_F = /* glsl */ `
uniform vec3 uColor;
varying float vB;
varying float vW;
${FOG_FRAG_PARS}
void main() {
  gl_FragColor = vec4(mix(uColor, vec3(1.0), vW) * vB * fogVis(), 1.0);
}
`

// every glowing point in one buffer, switched on aKind:
// 0 core · 1 agent beacon · 2 dispatch packet · 3 result packet ·
// 4 crystal vertex glint · 5 forge feed spiral · 6 ambient dust
const PTS_V = /* glsl */ `
uniform float uT;
uniform float uI;
uniform float uDpr;
uniform float uFlash;
uniform float uPacket;
uniform vec3 uColor;
uniform vec3 uAgentPos[6];
uniform float uAgentFlash[6];
uniform float uRet[6];
uniform mat4 uIcoMat;
attribute float aKind;
attribute float aAgent;
attribute float aSeed;
attribute float aAux;
varying vec3 vCol;
varying float vA;
varying float vPin;
${FOG_VERT_PARS}
${HASH}
void main() {
  int ai = int(aAgent + 0.5);
  vec3 agent = uAgentPos[ai];
  vec3 white = vec3(1.0);
  vec3 p = position;
  vec3 col = uColor * 2.0;
  float size = 6.0;
  float a = 1.0;
  float pin = 0.0;
  if (aKind < 0.5) {
    float beat = 0.5 + 0.5 * sin(uT * 2.2);
    size = 46.0 + 8.0 * beat + 30.0 * uFlash;
    col = mix(uColor * 2.6, white * 2.4, 0.45 + 0.35 * uFlash);
    pin = 1.0;
  } else if (aKind < 1.5) {
    float fl = uAgentFlash[ai];
    p = agent;
    size = 15.0 + 14.0 * fl;
    col = mix(uColor * 2.2, white * 2.0, 0.08 + 0.5 * fl);
    pin = 0.5;
  } else if (aKind < 2.5) {
    float t = fract(uT * uPacket + aSeed);
    p = agent * t;
    a = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.9, 1.0, t));
    size = 11.0;
    col = mix(uColor * 2.6, white * 2.0, 0.35);
    pin = 0.5;
  } else if (aKind < 3.5) {
    float t = uRet[ai];
    p = agent * max(t, 0.0);
    a = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t));
    size = 15.0;
    col = white * 2.6;
    pin = 1.0;
  } else if (aKind < 4.5) {
    p = (uIcoMat * vec4(position, 1.0)).xyz;
    float tw = hash11(aSeed * 91.7 + mod(floor(uT * 1.6 + aSeed * 13.0), 997.0));
    a = 0.3 + 0.7 * smoothstep(0.8, 1.0, tw);
    size = 8.0;
    col = mix(uColor * 2.0, white * 1.8, 0.3);
    pin = 0.4;
  } else if (aKind < 5.5) {
    float s = fract(uT * 0.07 + aSeed);
    float r = mix(3.75, 0.3, pow(s, 1.2)) * (0.85 + 0.3 * fract(aSeed * 13.7));
    float ang = aAux + s * 7.0 + uT * 0.25;
    p = vec3(cos(ang) * r, mix(${FORGE_Y.toFixed(1)}, 0.0, s), sin(ang) * r);
    a = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.8, 1.0, s));
    size = 6.0;
    col = mix(uColor * 1.8, white * 1.6, s * s);
  } else {
    float ang = uT * 0.04 * (0.5 + aSeed);
    float c = cos(ang);
    float sn = sin(ang);
    p = vec3(c * p.x - sn * p.z, p.y + sin(uT * 0.3 + aAux * 6.2831853) * 0.25, sn * p.x + c * p.z);
    float tw = 0.5 + 0.5 * sin(uT * (0.8 + aSeed * 2.0) + aAux * 6.2831853);
    a = 0.2 + 0.8 * tw * tw * tw;
    size = 4.5;
    col = uColor * 1.5;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float ps = size * uDpr * (10.0 / max(-mv.z, 0.5));
  // the flight path skims the outer orbits (~1.4 units) on the way past: fade
  // points before they balloon into lens-filling blobs (parked view is ~19 away)
  vA = a * clamp(ps, 0.0, 1.0) * smoothstep(1.2, 4.5, -mv.z);
  gl_PointSize = clamp(ps, 1.0, 110.0 * uDpr);
  vCol = col * uI;
  vPin = pin;
  vFogDepth = -mv.z;
}
`
const PTS_F = /* glsl */ `
varying vec3 vCol;
varying float vA;
varying float vPin;
${FOG_FRAG_PARS}
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d2 = dot(q, q) * 4.0;
  if (d2 > 1.0) discard;
  float halo = exp(-d2 * 4.5) * (1.0 - d2);
  float pin = exp(-d2 * 40.0) * vPin;
  gl_FragColor = vec4(vCol * (halo + pin * 1.2) * vA * fogVis(), 1.0);
}
`

// soft violet haze inside the crystal (camera-facing)
const HALO_V = /* glsl */ `
varying vec2 vQ;
${FOG_VERT_PARS}
void main() {
  vQ = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFogDepth = -mv.z;
}
`
const HALO_F = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
uniform float uFlash;
varying vec2 vQ;
${FOG_FRAG_PARS}
void main() {
  float r2 = dot(vQ, vQ);
  float g = exp(-r2 * 9.0) * (1.0 - smoothstep(0.6, 1.0, r2)) * (0.14 + 0.26 * uFlash);
  gl_FragColor = vec4(uColor * g * uI * fogVis(), 1.0);
}
`

/* --- build ----------------------------------------------------------------- */

function buildFoundry(accent: string, tier: LatticeTier) {
  const rand = mulberry32(0x0f0a2d)
  const col = new Color(accent)
  const light = col.clone().lerp(new Color(1, 1, 1), 0.15)

  // orbital plane bases: agent j on ring r sits at R·(cos θ·U + sin θ·V)
  const U: Vector3[] = []
  const V: Vector3[] = []
  for (const [x, y, z] of ORBIT_TILT) {
    const e = new Euler(x, y, z)
    U.push(new Vector3(1, 0, 0).applyEuler(e))
    V.push(new Vector3(0, 0, 1).applyEuler(e))
  }

  // uniforms shared (by reference) across every material of this construct
  const u = {
    uT: { value: 0 },
    uI: { value: 0.35 },
    uFlash: { value: 0 },
    uScan: { value: 0 },
    uPacket: { value: PACKET },
    uOrbitR: { value: 5.3 },
    uOrbitAng: { value: new Vector3() },
    uAgentPos: { value: Array.from({ length: AGENTS }, () => new Vector3()) },
    uAgentFlash: { value: new Float32Array(AGENTS) },
    uRet: { value: new Float32Array(AGENTS).fill(-1) },
    uIcoMat: { value: new Matrix4() },
  }
  const mat = (
    vertexShader: string,
    fragmentShader: string,
    extra: Record<string, IUniform>,
    side: Side = FrontSide,
  ) =>
    new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...worldUniforms, ...u, ...extra },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      fog: false,
      side,
    })

  // crystal: geodesic icosahedron (fill + edges) and its inner octahedron
  const fillGeo = new IcosahedronGeometry(3, 1)
  const fPos = fillGeo.attributes.position
  const face = new Float32Array(fPos.count)
  for (let i = 0; i < fPos.count; i++) face[i] = Math.floor(i / 3)
  fillGeo.setAttribute('aFace', new BufferAttribute(face, 1))
  const icoEdgeGeo = new EdgesGeometry(fillGeo)

  const nodes: number[] = []
  const seen = new Set<string>()
  for (let i = 0; i < fPos.count; i++) {
    const x = fPos.getX(i)
    const y = fPos.getY(i)
    const z = fPos.getZ(i)
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`
    if (seen.has(key)) continue
    seen.add(key)
    nodes.push(x, y, z)
  }

  const octaSrc = new OctahedronGeometry(1.7, 0)
  const octaGeo = new EdgesGeometry(octaSrc)
  octaSrc.dispose()

  // sub-agents: a tetrahedron plus its inverted, smaller twin (star tetrahedron)
  const tetSrc = new TetrahedronGeometry(0.6, 0)
  const tetEdges = new EdgesGeometry(tetSrc)
  tetSrc.dispose()
  const te = tetEdges.attributes.position.array as Float32Array
  const tn = tetEdges.attributes.position.count
  const per = tn * 2
  const tetPos = new Float32Array(per * AGENTS * 3)
  const tetAgent = new Float32Array(per * AGENTS)
  for (let a = 0; a < AGENTS; a++) {
    const o = a * per * 3
    for (let i = 0; i < tn * 3; i++) {
      tetPos[o + i] = te[i]
      tetPos[o + tn * 3 + i] = -te[i] * 0.55
    }
    tetAgent.fill(a, a * per, (a + 1) * per)
  }
  tetEdges.dispose()
  const tetGeo = new BufferGeometry()
  tetGeo.setAttribute('position', new BufferAttribute(tetPos, 3))
  tetGeo.setAttribute('aAgent', new BufferAttribute(tetAgent, 1))

  // dispatch links: endpoints resolved on the GPU from uAgentPos
  const linkGeo = new BufferGeometry()
  const lA = new Float32Array(AGENTS * 2)
  const lE = new Float32Array(AGENTS * 2)
  for (let a = 0; a < AGENTS; a++) {
    lA[a * 2] = a
    lA[a * 2 + 1] = a
    lE[a * 2 + 1] = 1
  }
  linkGeo.setAttribute('position', new BufferAttribute(new Float32Array(AGENTS * 2 * 3), 3))
  linkGeo.setAttribute('aAgent', new BufferAttribute(lA, 1))
  linkGeo.setAttribute('aEnd', new BufferAttribute(lE, 1))

  // rings: 3 unit orbits (scaled by uOrbitR in-shader) + forge circles and ticks
  const rp: number[] = []
  const rid: number[] = []
  const rang: number[] = []
  const SEG = 128
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < SEG; i++) {
      for (const a of [(i / SEG) * TAU, ((i + 1) / SEG) * TAU]) {
        const c = Math.cos(a)
        const s = Math.sin(a)
        rp.push(c * U[r].x + s * V[r].x, c * U[r].y + s * V[r].y, c * U[r].z + s * V[r].z)
        rid.push(r)
        rang.push(a)
      }
    }
  }
  for (const rad of [3.5, 4.0]) {
    const seg = 96
    for (let i = 0; i < seg; i++) {
      for (const a of [(i / seg) * TAU, ((i + 1) / seg) * TAU]) {
        rp.push(Math.cos(a) * rad, FORGE_Y, Math.sin(a) * rad)
        rid.push(3)
        rang.push(a)
      }
    }
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU
    const outer = i % 5 === 0 ? 4.75 : 4.45
    rp.push(Math.cos(a) * 4.15, FORGE_Y, Math.sin(a) * 4.15)
    rp.push(Math.cos(a) * outer, FORGE_Y, Math.sin(a) * outer)
    rid.push(4, 4)
    rang.push(a, a)
  }
  const ringGeo = new BufferGeometry()
  ringGeo.setAttribute('position', new BufferAttribute(new Float32Array(rp), 3))
  ringGeo.setAttribute('aRing', new BufferAttribute(new Float32Array(rid), 1))
  ringGeo.setAttribute('aAng', new BufferAttribute(new Float32Array(rang), 1))

  // points
  const nFeed = tier === 'mobile' ? 80 : 160
  const nDust = tier === 'mobile' ? 100 : 200
  const nNode = nodes.length / 3
  const total = 1 + AGENTS * 4 + nNode + nFeed + nDust
  const pPos = new Float32Array(total * 3)
  const pKind = new Float32Array(total)
  const pAgent = new Float32Array(total)
  const pSeed = new Float32Array(total)
  const pAux = new Float32Array(total)
  let n = 0
  const push = (kind: number, agent: number, seed: number, aux: number, x = 0, y = 0, z = 0) => {
    pPos[n * 3] = x
    pPos[n * 3 + 1] = y
    pPos[n * 3 + 2] = z
    pKind[n] = kind
    pAgent[n] = agent
    pSeed[n] = seed
    pAux[n] = aux
    n++
  }
  push(0, 0, 0, 0)
  for (let a = 0; a < AGENTS; a++) push(1, a, 0, 0)
  for (let a = 0; a < AGENTS; a++) for (let k = 0; k < 2; k++) push(2, a, packetSeed(a, k), 0)
  for (let a = 0; a < AGENTS; a++) push(3, a, 0, 0)
  for (let i = 0; i < nNode; i++) push(4, 0, rand(), 0, nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2])
  for (let i = 0; i < nFeed; i++) push(5, 0, rand(), rand() * TAU)
  for (let i = 0; i < nDust; i++) {
    const r = 3.6 + rand() * 5.4
    const th = rand() * TAU
    const ph = Math.acos(2 * rand() - 1)
    push(
      6,
      0,
      rand(),
      rand(),
      r * Math.sin(ph) * Math.cos(th),
      r * Math.cos(ph) * 0.75,
      r * Math.sin(ph) * Math.sin(th),
    )
  }
  const ptsGeo = new BufferGeometry()
  ptsGeo.setAttribute('position', new BufferAttribute(pPos, 3))
  ptsGeo.setAttribute('aKind', new BufferAttribute(pKind, 1))
  ptsGeo.setAttribute('aAgent', new BufferAttribute(pAgent, 1))
  ptsGeo.setAttribute('aSeed', new BufferAttribute(pSeed, 1))
  ptsGeo.setAttribute('aAux', new BufferAttribute(pAux, 1))

  const haloGeo = new PlaneGeometry(8, 8)

  const fillMat = mat(FILL_V, FILL_F, { uColor: { value: col } }, DoubleSide)
  // additive + no depth write, so one DoubleSide pass looks identical; without
  // this three splits transparent DoubleSide into back+front draws and flags
  // material.needsUpdate twice every frame
  fillMat.forceSinglePass = true
  const icoMat = mat(LINE_V, LINE_F, { uColor: { value: col }, uBase: { value: 1.25 } })
  const octaMat = mat(LINE_V, LINE_F, { uColor: { value: light }, uBase: { value: 1.9 } })
  const tetMat = mat(TET_V, TET_F, { uColor: { value: light } })
  const linkMat = mat(LINK_V, LINK_F, { uColor: { value: col } })
  const ringMat = mat(RING_V, RING_F, { uColor: { value: col } })
  const ptsMat = mat(PTS_V, PTS_F, { uColor: { value: col } })
  const haloMat = mat(HALO_V, HALO_F, { uColor: { value: col } })

  const geos = [fillGeo, icoEdgeGeo, octaGeo, tetGeo, linkGeo, ringGeo, ptsGeo, haloGeo]
  const mats = [fillMat, icoMat, octaMat, tetMat, linkMat, ringMat, ptsMat, haloMat]

  return {
    u,
    U,
    V,
    fillGeo,
    icoEdgeGeo,
    octaGeo,
    tetGeo,
    linkGeo,
    ringGeo,
    ptsGeo,
    haloGeo,
    fillMat,
    icoMat,
    octaMat,
    tetMat,
    linkMat,
    ringMat,
    ptsMat,
    haloMat,
    dispose() {
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
    },
  }
}

/* --- component ------------------------------------------------------------- */

export function FoundryConstruct({ station, position, accent, tier }: ConstructProps) {
  const root = useRef<Group>(null)
  const ico = useRef<Group>(null)
  const octa = useRef<Group>(null)
  const halo = useRef<Mesh>(null)

  const b = useMemo(() => buildFoundry(accent, tier), [accent, tier])
  useEffect(() => () => b.dispose(), [b])

  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    if (!isNear(station)) {
      g.visible = false
      return
    }
    g.visible = true
    const p = proximity(station)
    const t = worldState.time
    const u = b.u
    u.uT.value = t
    u.uI.value = 0.35 + 0.65 * p

    // crystal: slow tumble, counter-rotating heart, swells a touch as it wakes
    const s = 0.9 + 0.1 * p
    const ig = ico.current
    if (ig) {
      ig.rotation.set(Math.sin(t * 0.13) * 0.25, t * 0.16, 0)
      ig.scale.setScalar(s)
      ig.updateMatrix()
      u.uIcoMat.value.copy(ig.matrix)
    }
    const og = octa.current
    if (og) {
      og.rotation.set(t * 0.21, -t * 0.42, 0)
      og.scale.setScalar(s)
    }

    // sub-agents: two per tilted orbit, opposite phases
    const R = 4.7 + 0.6 * p
    u.uOrbitR.value = R
    const ang = u.uOrbitAng.value
    const pos = u.uAgentPos.value
    for (let r = 0; r < 3; r++) {
      const th = (t * ORBIT_W[r] + ORBIT_PH[r]) % TAU
      ang.setComponent(r, th)
      for (let j = 0; j < 2; j++) {
        const a = th + j * Math.PI
        pos[r * 2 + j]
          .copy(b.U[r])
          .multiplyScalar(Math.cos(a) * R)
          .addScaledVector(b.V[r], Math.sin(a) * R)
      }
    }

    // work landing on agents, and results heading home to be checked
    const flash = u.uAgentFlash.value
    const ret = u.uRet.value
    let coreFlash = 0
    for (let i = 0; i < AGENTS; i++) {
      let f = 0
      for (let k = 0; k < 2; k++) {
        f = Math.max(f, Math.exp(-frac(t * PACKET + packetSeed(i, k)) * 9))
      }
      const c = t * RET_RATE + i * 0.173
      const cycle = Math.floor(c)
      const ph = c - cycle
      const live = ihash(cycle * 7 + i) > 0.42
      if (live && ph < RET_LEG) {
        ret[i] = 1 - ph / RET_LEG
        if (ph < 0.05) f = Math.max(f, 1 - ph / 0.05)
      } else {
        ret[i] = -1
        if (live) coreFlash += Math.exp(-(ph - RET_LEG) * 24)
      }
      flash[i] = f
    }
    u.uFlash.value = Math.min(1, coreFlash)

    // scan band sweeps top -> bottom through the crystal, then rests below it
    const sc = (t * 0.2) % 1.5
    u.uScan.value = position[1] + 3.7 - sc * 7.4

    halo.current?.quaternion.copy(camera.quaternion)
  })

  return (
    <group ref={root} position={position}>
      <group ref={ico}>
        <mesh geometry={b.fillGeo} material={b.fillMat} />
        <lineSegments geometry={b.icoEdgeGeo} material={b.icoMat} />
      </group>
      <group ref={octa}>
        <lineSegments geometry={b.octaGeo} material={b.octaMat} />
      </group>
      <lineSegments geometry={b.tetGeo} material={b.tetMat} frustumCulled={false} />
      <lineSegments geometry={b.linkGeo} material={b.linkMat} frustumCulled={false} />
      <lineSegments geometry={b.ringGeo} material={b.ringMat} frustumCulled={false} />
      <points geometry={b.ptsGeo} material={b.ptsMat} frustumCulled={false} />
      <mesh ref={halo} geometry={b.haloGeo} material={b.haloMat} />
    </group>
  )
}
