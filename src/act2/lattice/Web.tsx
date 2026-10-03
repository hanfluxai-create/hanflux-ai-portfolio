/* ============================================================================
   THE LATTICE · the web itself.
   A neural mesh of ~1100 glowing nodes threaded through the corridor, each
   linked to its nearest neighbours. Data packets race along every link (a
   per-edge phase in the shader, so thousands of packets cost nothing on the
   CPU). Two draw calls: LineSegments for the links, Points for the nodes.
   This is the "agents talking to agents" layer: the world is literally wired.
   ========================================================================== */
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  LATTICE,
  mulberry32,
  worldUniforms,
  type LatticeTier,
} from './shared'

const EDGE_VERT = /* glsl */ `
attribute float aT;
attribute float aSeed;
varying float vT;
varying float vSeed;
${FOG_VERT_PARS}
void main(){
  vT = aT;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const EDGE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uAccent;
varying float vT;
varying float vSeed;
${FOG_FRAG_PARS}
void main(){
  float speed = 0.18 + fract(vSeed * 7.31) * 0.5;
  float dir = fract(vSeed * 3.7) > 0.5 ? 1.0 : -1.0;
  float p = fract(uTime * speed * dir + vSeed * 11.0);
  float d = abs(vT - p);
  float packet = smoothstep(0.07, 0.0, d);
  // how far this fragment sits BEHIND the packet along its direction of travel
  float behind = dir > 0.0 ? p - vT : vT - p;
  float trail = behind > 0.0 ? smoothstep(0.32, 0.0, behind) : 0.0;
  vec3 magenta = vec3(1.0, 0.16, 0.6);
  vec3 base = mix(uAccent, magenta, step(0.82, fract(vSeed * 1.93)));
  vec3 col = base * (0.014 + trail * 0.22) + vec3(0.85, 1.0, 0.95) * packet * 1.4;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

const NODE_VERT = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uDpr;
uniform float uTime;
varying float vSeed;
varying float vTw;
${FOG_VERT_PARS}
void main(){
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  vTw = 0.55 + 0.45 * sin(uTime * (0.8 + fract(aSeed * 5.1) * 2.2) + aSeed * 40.0);
  gl_PointSize = clamp(aSize * uDpr * (260.0 / max(-mv.z, 0.1)), 1.0, 46.0);
  gl_Position = projectionMatrix * mv;
}
`
const NODE_FRAG = /* glsl */ `
uniform vec3 uAccent;
varying float vSeed;
varying float vTw;
${FOG_FRAG_PARS}
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float core = smoothstep(0.16, 0.0, r);
  float halo = smoothstep(0.5, 0.0, r) * 0.18;
  vec3 col = mix(uAccent, vec3(0.3, 0.95, 1.0), step(0.7, fract(vSeed * 2.7)));
  col = col * (halo + core * 1.6) * vTw + vec3(1.0) * core * 0.5 * vTw;
  gl_FragColor = vec4(col * fogVis(), 1.0);
}
`

export function Web({ tier }: { tier: LatticeTier }) {
  const { edgeGeo, nodeGeo, edgeMat, nodeMat } = useMemo(() => {
    const rnd = mulberry32(0xa11ce)
    const N = tier === 'mobile' ? 480 : 1100
    const pts: { x: number; y: number; z: number }[] = []
    const z0 = LATTICE.Z_START
    const z1 = LATTICE.Z_END
    for (let i = 0; i < N; i++) {
      const z = z0 + (z1 - z0) * rnd()
      const th = rnd() * Math.PI * 2
      const r = 6 + Math.pow(rnd(), 0.75) * 48
      const x = Math.cos(th) * r
      let y = Math.sin(th) * r * 0.62 + 5
      if (y < LATTICE.FLOOR_Y + 1.5) y = LATTICE.FLOOR_Y + 1.5 + rnd() * 6
      pts.push({ x, y, z })
    }
    pts.sort((a, b) => a.z - b.z)

    // links: each node to its 2 nearest within a sliding z-window
    const pairs: [number, number][] = []
    const seen = new Set<number>()
    const W = 36
    const MAX = 17
    for (let i = 0; i < N; i++) {
      const best: { j: number; d: number }[] = []
      for (let j = Math.max(0, i - W); j < Math.min(N, i + W); j++) {
        if (j === i) continue
        const dx = pts[i].x - pts[j].x
        const dy = pts[i].y - pts[j].y
        const dz = pts[i].z - pts[j].z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d > MAX) continue
        best.push({ j, d })
      }
      best.sort((a, b) => a.d - b.d)
      for (let k = 0; k < Math.min(2, best.length); k++) {
        const a = Math.min(i, best[k].j)
        const b = Math.max(i, best[k].j)
        const key = a * 65536 + b
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push([a, b])
      }
    }

    const E = pairs.length
    const ePos = new Float32Array(E * 6)
    const eT = new Float32Array(E * 2)
    const eSeed = new Float32Array(E * 2)
    pairs.forEach(([a, b], k) => {
      const A = pts[a]
      const B = pts[b]
      ePos.set([A.x, A.y, A.z, B.x, B.y, B.z], k * 6)
      eT[k * 2] = 0
      eT[k * 2 + 1] = 1
      const s = rnd() * 100
      eSeed[k * 2] = s
      eSeed[k * 2 + 1] = s
    })
    const edgeGeo = new BufferGeometry()
    edgeGeo.setAttribute('position', new BufferAttribute(ePos, 3))
    edgeGeo.setAttribute('aT', new BufferAttribute(eT, 1))
    edgeGeo.setAttribute('aSeed', new BufferAttribute(eSeed, 1))

    const nPos = new Float32Array(N * 3)
    const nSize = new Float32Array(N)
    const nSeed = new Float32Array(N)
    pts.forEach((p, i) => {
      nPos.set([p.x, p.y, p.z], i * 3)
      const hub = rnd() < 0.08
      nSize[i] = hub ? 2.4 + rnd() * 1.4 : 0.7 + rnd() * 0.9
      nSeed[i] = rnd() * 100
    })
    const nodeGeo = new BufferGeometry()
    nodeGeo.setAttribute('position', new BufferAttribute(nPos, 3))
    nodeGeo.setAttribute('aSize', new BufferAttribute(nSize, 1))
    nodeGeo.setAttribute('aSeed', new BufferAttribute(nSeed, 1))

    const common = {
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      toneMapped: false,
    }
    const edgeMat = new ShaderMaterial({
      uniforms: { ...worldUniforms },
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      ...common,
    })
    const nodeMat = new ShaderMaterial({
      uniforms: { ...worldUniforms },
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      ...common,
    })
    return { edgeGeo, nodeGeo, edgeMat, nodeMat }
  }, [tier])

  useEffect(
    () => () => {
      edgeGeo.dispose()
      nodeGeo.dispose()
      edgeMat.dispose()
      nodeMat.dispose()
    },
    [edgeGeo, nodeGeo, edgeMat, nodeMat],
  )

  return (
    <>
      <lineSegments geometry={edgeGeo} material={edgeMat} frustumCulled={false} renderOrder={2} />
      <points geometry={nodeGeo} material={nodeMat} frustumCulled={false} renderOrder={3} />
    </>
  )
}
