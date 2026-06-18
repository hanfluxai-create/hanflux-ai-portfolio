import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import {
  AdditiveBlending,
  DataTexture,
  FloatType,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type ShaderMaterial as TShaderMaterial,
  BufferGeometry,
  BufferAttribute,
  Color,
} from 'three'
import { CONFIG } from '../config/config'
import { useStore } from '../store/store'

/* -------------------------------------------------------------------------- */
/*  GPGPU sizing — particle count is the SQUARE of the texture edge.          */
/*  We pick the smallest power-of-two FBO whose texel count >= CONFIG count.   */
/* -------------------------------------------------------------------------- */
function fboSizeFor(count: number) {
  const edge = Math.ceil(Math.sqrt(Math.max(1, count)))
  // round up to a clean POT for predictable filtering / mip behaviour
  const pot = Math.pow(2, Math.ceil(Math.log2(edge)))
  return pot
}

/* -------------------------------------------------------------------------- */
/*  SIMULATION fragment shader.                                               */
/*  Reads the previous-frame position texture, advects each particle along a  */
/*  curl-noise flow field, applies mouse repulsion + a scroll-driven swirl,   */
/*  and respawns particles back toward their seed home so the field breathes  */
/*  instead of dispersing. Output RGBA = xyz position + w = age (0..1).       */
/* -------------------------------------------------------------------------- */
const simFragment = /* glsl */ `
precision highp float;

uniform sampler2D uPosition;   // ping-pong: previous positions (xyz) + age (w)
uniform sampler2D uSeed;       // immutable home positions (xyz) + lifespan (w)
uniform float uTime;
uniform float uDelta;
uniform vec2  uMouse;          // world-space cursor on the z=0 plane
uniform float uScroll;         // 0..1 page scroll
uniform float uRadius;
uniform float uPointerInfluence;

varying vec2 vUv;

/* ---- Simplex-ish 3D noise (Ashima webgl-noise, MIT) ---------------------- */
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
      i.z+vec4(0.0,i1.z,i2.z,1.0))
    + i.y+vec4(0.0,i1.y,i2.y,1.0))
    + i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

/* analytic curl of a 3D noise field => divergence-free flow */
vec3 curlNoise(vec3 p){
  const float e=0.1;
  vec3 dx=vec3(e,0.0,0.0);
  vec3 dy=vec3(0.0,e,0.0);
  vec3 dz=vec3(0.0,0.0,e);
  float x0=snoise(p-dx),x1=snoise(p+dx);
  float y0=snoise(p-dy),y1=snoise(p+dy);
  float z0=snoise(p-dz),z1=snoise(p+dz);
  // sample an offset field for the other two components
  vec3 o=vec3(123.4,567.8,-901.2);
  float ax0=snoise(p-dy+o),ax1=snoise(p+dy+o);
  float ay0=snoise(p-dz+o),ay1=snoise(p+dz+o);
  float az0=snoise(p-dx+o),az1=snoise(p+dx+o);
  float curlX=(z1-z0)-(ax1-ax0);
  float curlY=(ay1-ay0)-(x1-x0);
  float curlZ=(y1-y0)-(az1-az0);
  return normalize(vec3(curlX,curlY,curlZ)+1e-5)/(2.0*e);
}

void main(){
  vec4 prev = texture2D(uPosition, vUv);
  vec4 seed = texture2D(uSeed, vUv);
  vec3 pos  = prev.xyz;
  float age = prev.w;
  float life = seed.w;            // per-particle lifespan (0.6..1.4)

  // --- flow field: scale & time-evolve the noise domain ---
  float scrollSwirl = mix(0.18, 0.6, uScroll);
  vec3 flow = curlNoise(pos * 0.28 + vec3(0.0, uTime * 0.05, uTime * 0.03));
  flow += curlNoise(pos * 0.9 - uTime * 0.08) * 0.35; // fine detail octave

  vec3 vel = flow * (0.55 + scrollSwirl);

  // --- gentle global rotation tied to scroll ---
  float ang = (0.08 + uScroll * 0.5) * uDelta;
  float c = cos(ang), s = sin(ang);
  vel.xz = mat2(c, -s, s, c) * vel.xz * 0.6 + vel.xz * 0.4;

  // --- mouse repulsion in the z~0 slab ---
  vec3 toMouse = pos - vec3(uMouse, 0.0);
  float md = length(toMouse.xy);
  float push = uPointerInfluence * exp(-md * md * 0.6);
  vel += normalize(vec3(toMouse.xy, 0.0001)) * push * 6.0;

  // --- containment: pull back toward the seed home, stronger past radius ---
  vec3 toHome = seed.xyz - pos;
  float dist = length(pos);
  float pull = smoothstep(uRadius * 0.7, uRadius * 1.25, dist);
  vel += toHome * (0.4 + pull * 2.2);

  pos += vel * uDelta;

  // --- age & respawn ---
  age += uDelta / life;
  if (age >= 1.0) {
    pos = seed.xyz;             // teleport home, reset age (recycle)
    age = fract(age);
  }

  gl_FragColor = vec4(pos, age);
}
`

/* -------------------------------------------------------------------------- */
/*  RENDER vertex shader. Each point's `aRef` is its texel UV into the sim    */
/*  texture; we sample the live position there. Manual size attenuation       */
/*  (raw ShaderMaterial gives no sizeAttenuation), age-graded brightness.     */
/* -------------------------------------------------------------------------- */
const renderVertex = /* glsl */ `
precision highp float;

uniform sampler2D uPosition;
uniform float uSize;
uniform float uTime;
uniform float uScroll;
uniform float uDpr;

attribute vec2 aRef;       // UV into the simulation texture
attribute float aRand;     // per-particle 0..1 for variation / pink flares

varying float vAge;
varying float vRand;
varying float vDepth;

void main(){
  vec4 sim = texture2D(uPosition, aRef);
  vec3 pos = sim.xyz;
  vAge  = sim.w;
  vRand = aRand;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;

  // size attenuation (∝ 1/dist) + subtle twinkle + scroll-driven swell
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + aRand * 40.0);
  float swell = 1.0 + uScroll * 0.4;
  gl_PointSize = uSize * uDpr * swell * twinkle * (300.0 / max(vDepth, 0.001));
}
`

const renderFragment = /* glsl */ `
precision highp float;

uniform vec3 uColorA;   // teal
uniform vec3 uColorB;   // ultraviolet
uniform vec3 uColorC;   // signal pink
uniform float uSparkChance;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uFogColor;

varying float vAge;
varying float vRand;
varying float vDepth;

void main(){
  // round, soft-edged sprite
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, d);
  alpha *= alpha; // tighter glow core

  // color: teal -> violet over age, sparse pink flares
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vAge));
  float isPink = step(1.0 - uSparkChance, vRand);
  col = mix(col, uColorC, isPink * (0.6 + 0.4 * vRand));

  // fade in at birth, fade out near death (so recycling is invisible)
  float lifeFade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.85, 1.0, vAge));
  alpha *= lifeFade;

  // linear fog toward the void color (we use additive blend so fog = darken)
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
  col *= fog;
  alpha *= fog;

  gl_FragColor = vec4(col, alpha);
}
`

/* fullscreen-quad passthrough vertex used by the simulation material */
const quadVertex = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

export function ParticleField() {
  const { gl, pointer, viewport } = useThree()

  // ---- derive grid size from CONFIG count (square FBO) ----
  const SIZE = useMemo(() => fboSizeFor(CONFIG.particles.count), [])
  const COUNT = SIZE * SIZE

  // ---- ping-pong float render targets (explicit, fixed size = SIZE x SIZE) ----
  // NOTE: we pass explicit width/height so drei's useFBO does NOT resize/wipe
  // them on canvas resize. NearestFilter is mandatory for exact texel fetches.
  const fboOpts = useMemo(
    () => ({
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const fboA = useFBO(SIZE, SIZE, fboOpts)
  const fboB = useFBO(SIZE, SIZE, fboOpts)
  const read = useRef(fboA)
  const write = useRef(fboB)

  // ---- seed DataTexture: home positions (xyz) + per-particle lifespan (w) ----
  const seedTexture = useMemo(() => {
    const { radius } = CONFIG.particles
    const data = new Float32Array(COUNT * 4)
    for (let i = 0; i < COUNT; i++) {
      const r = radius * Math.cbrt(Math.random()) * (0.55 + Math.random() * 0.45)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      data[i * 4 + 0] = r * Math.sin(phi) * Math.cos(theta)
      data[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta)
      data[i * 4 + 2] = r * Math.cos(phi)
      data[i * 4 + 3] = 0.6 + Math.random() * 0.8 // lifespan
    }
    const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, FloatType)
    tex.needsUpdate = true
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    return tex
  }, [COUNT, SIZE])

  // ---- private sim scene: a fullscreen quad rendered into the FBOs ----
  const sim = useMemo(() => {
    const scene = new Scene()
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const material = new ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: simFragment,
      uniforms: {
        uPosition: { value: seedTexture }, // first frame reads the seed
        uSeed: { value: seedTexture },
        uTime: { value: 0 },
        uDelta: { value: 0 },
        uMouse: { value: new Vector2(999, 999) },
        uScroll: { value: 0 },
        uRadius: { value: CONFIG.particles.radius },
        uPointerInfluence: { value: CONFIG.particles.pointerInfluence },
      },
    })
    const quad = new Mesh(new PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    scene.add(quad)
    return { scene, camera, material }
  }, [seedTexture])

  // ---- seed BOTH ping-pong targets with the initial state on mount ----
  const seeded = useRef(false)
  const seedTargets = () => {
    sim.material.uniforms.uPosition.value = seedTexture
    sim.material.uniforms.uDelta.value = 0
    gl.setRenderTarget(read.current)
    gl.render(sim.scene, sim.camera)
    gl.setRenderTarget(write.current)
    gl.render(sim.scene, sim.camera)
    gl.setRenderTarget(null)
  }

  // ---- render geometry: one vertex per particle, aRef = texel UV ----
  const pointsGeometry = useMemo(() => {
    const refs = new Float32Array(COUNT * 2)
    const rands = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const x = i % SIZE
      const y = Math.floor(i / SIZE)
      refs[i * 2 + 0] = (x + 0.5) / SIZE
      refs[i * 2 + 1] = (y + 0.5) / SIZE
      rands[i] = Math.random()
    }
    const g = new BufferGeometry()
    // a dummy position attribute is required by three even though we override it
    g.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 3), 3))
    g.setAttribute('aRef', new BufferAttribute(refs, 2))
    g.setAttribute('aRand', new BufferAttribute(rands, 1))
    g.setDrawRange(0, COUNT)
    return g
  }, [COUNT, SIZE])

  const renderMatRef = useRef<TShaderMaterial>(null!)

  const renderUniforms = useMemo(
    () => ({
      uPosition: { value: fboA.texture },
      uSize: { value: CONFIG.particles.size },
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uDpr: { value: Math.min(viewport.dpr ?? 1, 2) },
      uColorA: { value: new Color(CONFIG.colors.particleA) },
      uColorB: { value: new Color(CONFIG.colors.particleB) },
      uColorC: { value: new Color(CONFIG.colors.particleC) },
      uSparkChance: { value: CONFIG.particles.sparkChance },
      uFogNear: { value: CONFIG.fog.near },
      uFogFar: { value: CONFIG.fog.far },
      uFogColor: { value: new Color(CONFIG.colors.fog) },
    }),
    // built once; values are mutated live in useFrame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // scratch vectors
  const mouseWorld = useMemo(() => new Vector3(), [])

  /* -------------------------------------------------------------------------
   *  PRIORITY -1 : runs BEFORE the postprocessing EffectComposer (priority 1).
   *  Negative priority orders the callback first WITHOUT taking over the
   *  render loop, so R3F still lets the composer do the final screen draw.
   *  Here we only render into off-screen FBOs — we never touch the canvas.
   * ------------------------------------------------------------------------ */
  useFrame((state, delta) => {
    if (!seeded.current) {
      seedTargets()
      seeded.current = true
    }

    const dt = Math.min(delta, 1 / 30) // clamp to avoid blow-ups on tab refocus
    const m = sim.material.uniforms

    // map pointer (-1..1 NDC) to world units on the z=0 plane
    mouseWorld.set(
      pointer.x * (viewport.width / 2),
      pointer.y * (viewport.height / 2),
      0,
    )
    ;(m.uMouse.value as Vector2).set(mouseWorld.x, mouseWorld.y)
    m.uTime.value = state.clock.elapsedTime
    m.uDelta.value = dt
    m.uScroll.value = useStore.getState().progress
    m.uRadius.value = CONFIG.particles.radius
    m.uPointerInfluence.value = CONFIG.particles.pointerInfluence

    // read current positions from `read`, write advected positions into `write`
    m.uPosition.value = read.current.texture
    gl.setRenderTarget(write.current)
    gl.render(sim.scene, sim.camera)
    gl.setRenderTarget(null)

    // swap
    const tmp = read.current
    read.current = write.current
    write.current = tmp

    // point the RENDER material at the freshly written texture
    if (renderMatRef.current) {
      const u = renderMatRef.current.uniforms
      u.uPosition.value = write.current.texture
      u.uTime.value = state.clock.elapsedTime
      u.uScroll.value = m.uScroll.value
      u.uSize.value = CONFIG.particles.size
    }
  }, -1)

  return (
    <points geometry={pointsGeometry} frustumCulled={false}>
      <shaderMaterial
        ref={renderMatRef}
        vertexShader={renderVertex}
        fragmentShader={renderFragment}
        uniforms={renderUniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}
