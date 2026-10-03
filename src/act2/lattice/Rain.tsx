/* ============================================================================
   THE LATTICE · volumetric code rain.
   ~1600 glyph columns stood up in 3D around the flight corridor, so the
   Matrix rain has real depth and parallax instead of being a flat overlay.
   One draw call: an InstancedBufferGeometry of unit quads on a plain Mesh.
   Each column is a cylindrical billboard (always turns to face the eye around
   Y); its fragment shader runs the whole rain: cells, glyph swaps, two falling
   heads per column with white-hot tips and phosphor trails.
   Scroll velocity feeds uVel → the rain accelerates when you fly fast.
   ========================================================================== */
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import {
  FOG_FRAG_PARS,
  FOG_VERT_PARS,
  HASH,
  LATTICE,
  getGlyphAtlas,
  mulberry32,
  releaseGlyphAtlas,
  worldUniforms,
  type LatticeTier,
} from './shared'

const VERT = /* glsl */ `
attribute vec3 aBase;   // column bottom-centre (world)
attribute vec4 aData;   // x cells, y cell size, z speed (cells/s), w phase 0..1
attribute float aSeed;
varying vec2 vUv;
varying float vCells;
varying float vSpeed;
varying float vPhase;
varying float vSeed;
varying float vNear;
${FOG_VERT_PARS}
void main(){
  vUv = uv;
  vCells = aData.x;
  vSpeed = aData.z;
  vPhase = aData.w;
  vSeed = aSeed;
  // cylindrical billboard: rotate about Y to face the eye
  vec3 toCam = cameraPosition - aBase;
  vec2 flat2 = normalize(vec2(toCam.x, toCam.z) + vec2(1e-5, 0.0));
  vec3 right = vec3(flat2.y, 0.0, -flat2.x);
  float w = aData.y;
  float h = aData.x * aData.y;
  vec3 world = aBase + right * position.x * w + vec3(0.0, (position.y + 0.5) * h, 0.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vFogDepth = -mv.z;
  // dissolve columns the eye is about to pass through
  vNear = smoothstep(2.5, 9.0, length(toCam));
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uFlow;
uniform float uVel;
uniform vec3 uAccent;
uniform float uIntensity;
varying vec2 vUv;
varying float vCells;
varying float vSpeed;
varying float vPhase;
varying float vSeed;
varying float vNear;
${FOG_FRAG_PARS}
${HASH}
void main(){
  float cy = vUv.y * vCells;
  float cell = floor(cy);
  float fromTop = vCells - 1.0 - cell;
  vec2 cuv = vec2(vUv.x, fract(cy));

  // glyph per cell, re-rolled at a per-cell rate
  float rate = 0.5 + hash11(vSeed * 7.13 + cell * 1.91) * 3.5;
  float tick = floor(uTime * rate + hash11(cell + vSeed * 3.1) * 10.0);
  float g = floor(hash11(vSeed * 13.7 + cell * 1.37 + tick * 0.61) * 64.0);
  vec2 atl = (vec2(mod(g, 8.0), 7.0 - floor(g / 8.0)) + cuv) / 8.0;
  float m = texture2D(uAtlas, atl).r;

  // two falling heads per column; uFlow is integrated, so fast scroll accelerates the fall
  float len = 7.0 + hash11(vSeed * 3.3) * 16.0;
  float span = vCells + len;
  float t = uFlow * vSpeed;
  float h1 = mod(t + vPhase * span, span);
  float h2 = mod(t * 0.71 + (vPhase + 0.5) * span, span);
  float d1 = h1 - fromTop;
  float d2 = h2 - fromTop;
  float tr1 = (d1 >= 0.0 && d1 < len) ? 1.0 - d1 / len : 0.0;
  float tr2 = (d2 >= 0.0 && d2 < len) ? (1.0 - d2 / len) * 0.75 : 0.0;
  float trail = max(tr1, tr2);
  float head = max(step(0.0, d1) * step(d1, 1.0), step(0.0, d2) * step(d2, 1.0) * 0.8);

  float b = pow(trail, 1.8) * 0.75 + 0.004;
  vec3 phosphor = mix(uAccent, vec3(0.16, 1.0, 0.62), 0.35);
  vec3 col = phosphor * b + vec3(0.75, 1.0, 0.9) * head * 1.6;
  col *= m * uIntensity * (1.0 + uVel * 0.35);
  col *= fogVis() * vNear;
  // soft column edges so quads never read as rectangles
  col *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  gl_FragColor = vec4(col, 1.0);
}
`

export function Rain({ tier }: { tier: LatticeTier }) {
  const { geo, mat } = useMemo(() => {
    const rnd = mulberry32(0x5eed)
    const COUNT = tier === 'mobile' ? 650 : 1500
    const base = new Float32Array(COUNT * 3)
    const data = new Float32Array(COUNT * 4)
    const seed = new Float32Array(COUNT)
    const z0 = LATTICE.Z_START
    const z1 = LATTICE.Z_END
    for (let i = 0; i < COUNT; i++) {
      const overhead = rnd() < 0.14
      let x: number
      let yTop: number
      const z = z0 + (z1 - z0) * rnd()
      let cellSize: number
      if (overhead) {
        // columns hanging over the corridor: the eye flies beneath them
        x = (rnd() * 2 - 1) * 6
        cellSize = 0.42 + rnd() * 0.3
        yTop = 30 + rnd() * 26
      } else {
        const side = rnd() < 0.5 ? -1 : 1
        const r = 4.5 + Math.pow(rnd(), 1.6) * 80
        x = side * r
        // far columns get bigger glyphs: depth reads instantly
        cellSize = 0.4 + (r / 85) * 1.3 + rnd() * 0.25
        yTop = 6 + rnd() * (18 + r * 0.6)
      }
      const cells = Math.round(14 + rnd() * 32)
      const h = cells * cellSize
      let yBottom = yTop - h
      if (overhead) yBottom = Math.max(yBottom, 7)
      base[i * 3] = x
      base[i * 3 + 1] = yBottom
      base[i * 3 + 2] = z
      data[i * 4] = overhead ? Math.max(6, Math.floor((yTop - yBottom) / cellSize)) : cells
      data[i * 4 + 1] = cellSize
      data[i * 4 + 2] = 5 + rnd() * 13
      data[i * 4 + 3] = rnd()
      seed[i] = rnd() * 1000
    }
    const quad = new PlaneGeometry(1, 1)
    const geo = new InstancedBufferGeometry()
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    geo.setAttribute('uv', quad.getAttribute('uv'))
    geo.setAttribute('aBase', new InstancedBufferAttribute(base, 3))
    geo.setAttribute('aData', new InstancedBufferAttribute(data, 4))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1))
    geo.instanceCount = COUNT
    quad.dispose()

    const mat = new ShaderMaterial({
      uniforms: {
        ...worldUniforms,
        uAtlas: { value: getGlyphAtlas() },
        uIntensity: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      toneMapped: false,
    })
    return { geo, mat }
  }, [tier])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      releaseGlyphAtlas()
    },
    [geo, mat],
  )

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={1} />
}
