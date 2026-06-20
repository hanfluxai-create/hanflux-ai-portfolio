/* ============================================================================
   ACT II / III — custom GLSL materials (the signature surfaces).
   Three drei `shaderMaterial`s, extended into R3F's JSX catalogue:
     • FlowFieldMaterial   — domain-warped fbm colour field (capability panels)
     • ImageDistortMaterial— cursor-reactive RGB-shift + ripple on a textured plane
     • PortalMaterial      — a rushing fbm tunnel (the closing spectacle)

   three 0.184 note: a drei `shaderMaterial` IS a `THREE.ShaderMaterial`, which
   compiles as `#version 300 es` and auto-#defines legacy GLSL (attribute/varying/
   texture2D/gl_FragColor) + injects position/uv/normal/projectionMatrix/etc.
   → write LEGACY-style GLSL, never redeclare the injected built-ins, and name
   your own attributes/varyings something else (vUv, etc.).
   ========================================================================== */
import { shaderMaterial } from '@react-three/drei'
import { extend, type ThreeElement } from '@react-three/fiber'
import { Color, Vector2, Texture } from 'three'

/* --- shared noise (Ashima 2D simplex, MIT) + fbm ------------------------- */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.02; a*=0.5; }
  return s;
}
`

/* ============================================================================
   1 · FlowFieldMaterial — the living colour field behind each capability panel.
   ========================================================================== */
const FLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const FLOW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform vec2  uPointer;   // -1..1
uniform float uIntensity; // 0..1 focus
uniform float uReveal;    // 0..1 entrance wipe
${NOISE}
void main(){
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(1.7, 1.0);
  p += uPointer * 0.16;

  float t = uTime * 0.05;
  // domain warp
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(3.2, 1.7) - t));
  vec2 r = vec2(fbm(p + 1.4 * q + vec2(1.7, 9.2)), fbm(p + 1.4 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 2.0 * r);

  // weave the three brand hues through the warped field
  vec3 col = mix(uColorA, uColorB, smoothstep(-0.6, 0.8, f));
  col = mix(col, uColorC, smoothstep(0.2, 1.0, length(r) * 0.7));
  col *= 0.55 + 0.65 * uIntensity;

  // filament highlights the bloom catches
  float fil = smoothstep(0.78, 0.95, fbm(p * 2.4 + r * 1.6 - t * 2.0));
  col += fil * (uColorA + uColorC) * 0.5 * (0.4 + uIntensity);

  // vignette + entrance wipe (diagonal)
  float vig = smoothstep(1.25, 0.25, length(uv - 0.5));
  float wipe = smoothstep(uReveal * 1.6 - 0.3, uReveal * 1.6, (uv.x + uv.y) * 0.5 + 0.0);
  float a = vig * mix(0.0, 1.0, uReveal) * (0.85);
  // grain
  float g = (fract(sin(dot(uv * uTime, vec2(12.99, 78.23))) * 43758.5) - 0.5) * 0.04;
  gl_FragColor = vec4(col + g, a * (0.6 + 0.4 * uReveal));
}
`
export const FlowFieldMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new Color('#27f2c0'),
    uColorB: new Color('#0a1c2e'),
    uColorC: new Color('#7c5cff'),
    uPointer: new Vector2(0, 0),
    uIntensity: 1,
    uReveal: 0,
  },
  FLOW_VERT,
  FLOW_FRAG,
)

/* ============================================================================
   2 · ImageDistortMaterial — the Active-Theory signature interaction:
   a textured plane that smears RGB + ripples toward the cursor on hover.
   ========================================================================== */
const IMG_VERT = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uHover;   // 0..1 damped
uniform float uReveal;  // 0..1
void main(){
  vUv = uv;
  vec3 pos = position;
  // a gentle bulge toward the viewer on hover + a breathing wobble
  float d = distance(uv, vec2(0.5));
  pos.z += uHover * (0.18 * (0.5 - d)) + sin(uTime * 1.2 + uv.x * 6.0) * 0.012 * uHover;
  // rise-in on reveal
  pos.y += (1.0 - uReveal) * -0.35;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`
const IMG_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uHover;     // 0..1
uniform vec2  uPointer;   // 0..1 local within the tile
uniform float uReveal;    // 0..1
uniform vec3  uTint;
uniform float uHasTex;    // 1 = sample texture, 0 = procedural tint only
${NOISE}
void main(){
  vec2 uv = vUv;
  // pointer-anchored ripple
  vec2 dir = uv - uPointer;
  float dist = length(dir);
  float ripple = sin(dist * 22.0 - uTime * 3.5) * 0.012 * uHover * smoothstep(0.6, 0.0, dist);
  uv += normalize(dir + 1e-4) * ripple;

  // chromatic RGB-shift, strongest near the cursor, scaled by hover
  float amt = (0.006 + 0.02 * uHover) * (0.5 + 0.5 * smoothstep(0.7, 0.0, dist));
  vec2 off = normalize(dir + 1e-4) * amt;

  vec3 col;
  if(uHasTex > 0.5){
    float r = texture2D(uTex, uv + off).r;
    float g = texture2D(uTex, uv).g;
    float b = texture2D(uTex, uv - off).b;
    col = vec3(r, g, b);
  } else {
    // procedural fallback so a tile is never blank before its image loads
    float n = fbm(uv * 3.0 + uTime * 0.05);
    col = mix(uTint * 0.25, uTint, smoothstep(-0.4, 0.8, n));
    col += smoothstep(0.7, 1.0, fbm(uv * 6.0 - uTime * 0.1)) * uTint;
  }

  // hover lift + scanline shimmer
  col += uHover * 0.06;
  col *= 1.0 - 0.05 * sin(uv.y * 900.0) * uHover;

  // edge vignette so tiles sit in the dark
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  // reveal: a soft vertical wipe
  float wipe = smoothstep(uReveal - 0.25, uReveal + 0.05, uv.y * 0.5 + 0.5);
  float a = vig * uReveal;
  gl_FragColor = vec4(col * (0.85 + 0.15 * vig), a);
}
`
export const ImageDistortMaterial = shaderMaterial(
  {
    uTex: null as Texture | null,
    uTime: 0,
    uHover: 0,
    uPointer: new Vector2(0.5, 0.5),
    uReveal: 0,
    uTint: new Color('#27f2c0'),
    uHasTex: 0,
  },
  IMG_VERT,
  IMG_FRAG,
)

/* ============================================================================
   3 · PortalMaterial — the closing spectacle: an fbm tunnel rushing inward.
   Fill-rate bound → render on a single plane, cap DPR on the canvas.
   ========================================================================== */
const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const PORTAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform vec2  uPointer;  // -1..1
uniform float uProgress; // 0..1 how "open" the portal is
uniform float uAspect;
${NOISE}
void main(){
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  uv -= uPointer * 0.05;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // tunnel coordinates: depth rushes toward the eye
  float depth = 0.30 / (r + 0.04) + uTime * 0.55;
  // Sample the swirl on a RING (cos a, sin a) so the noise is periodic in the
  // angle. Feeding a/PI straight in seams along the -x axis (a hard horizontal
  // line from centre to the left edge). cos/sin wrap seamlessly at ±PI.
  vec2 ring = vec2(cos(a), sin(a));
  float n = fbm(ring * 1.7 + vec2(0.0, depth) + vec2(0.0, uTime * 0.2));
  n += 0.5 * fbm(ring * 3.4 + vec2(0.0, depth * 1.6) - vec2(0.0, uTime * 0.35));

  // concentric rushing rings
  float rings = 0.5 + 0.5 * sin(depth * 6.2831 + n * 3.0);
  vec3 col = mix(uColorB * 0.15, uColorA, smoothstep(0.2, 0.95, rings * (0.6 + 0.5 * n)));
  col = mix(col, uColorC, smoothstep(0.4, 1.0, n) * 0.6);

  // hot core glow
  float core = smoothstep(0.55, 0.0, r);
  col += core * (uColorA + uColorC) * (0.6 + 0.8 * uProgress);
  col += pow(core, 3.0) * 1.4;

  // fade the rim to obsidian + entrance
  float edge = smoothstep(1.15, 0.2, r);
  vec3 final = col * edge;
  final = mix(vec3(0.02, 0.025, 0.04), final, smoothstep(0.0, 0.5, uProgress));
  gl_FragColor = vec4(final, 1.0);
}
`
export const PortalMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new Color('#27f2c0'),
    uColorB: new Color('#05060a'),
    uColorC: new Color('#7c5cff'),
    uPointer: new Vector2(0, 0),
    uProgress: 0,
    uAspect: 1,
  },
  PORTAL_VERT,
  PORTAL_FRAG,
)

/* --- register into R3F's JSX catalogue + TS types ------------------------ */
extend({ FlowFieldMaterial, ImageDistortMaterial, PortalMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    flowFieldMaterial: ThreeElement<typeof FlowFieldMaterial>
    imageDistortMaterial: ThreeElement<typeof ImageDistortMaterial>
    portalMaterial: ThreeElement<typeof PortalMaterial>
  }
}
