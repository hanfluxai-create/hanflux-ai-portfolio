/* ============================================================================
   THE SPIRE — GLSL suite for the Act II megacity descent.
   Every material here is a raw three ShaderMaterial built imperatively (no JSX
   typing friction) and wired to ONE shared uniform set, so the whole city is
   graded per-frame from a single update: time, fog, altitude, division accent,
   helix pulse, cloud veil.

   three 0.184: ShaderMaterial compiles as `#version 300 es` and auto-defines
   legacy GLSL (attribute/varying/texture2D/gl_FragColor) + injects the standard
   matrices AND `cameraPosition` in BOTH stages — write legacy style, never
   redeclare the injected built-ins.
   ========================================================================== */
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  ShaderMaterial,
} from 'three'

/* --- shared uniform set (one object, referenced by every material) -------- */
export interface CitySharedUniforms {
  uTime: { value: number }
  uFogColor: { value: Color }
  uFogDensity: { value: number }
  uAccent: { value: Color } // active division hue — grades the whole city
  uAlt: { value: number } // 0 at the crown → 1 at street level
  uGlow: { value: number } // global window emissive gain
  uPulse: { value: number } // helix data-pulse phase (descends 1.15 → -0.15)
  uVeil: { value: number } // cloud-breakthrough whiteout 0..1
}

export function makeSharedUniforms(): CitySharedUniforms {
  return {
    uTime: { value: 0 },
    uFogColor: { value: new Color('#0a1226') },
    uFogDensity: { value: 0.0026 },
    uAccent: { value: new Color('#27f2c0') },
    uAlt: { value: 0 },
    uGlow: { value: 0.9 },
    uPulse: { value: 1.0 },
    uVeil: { value: 0 },
  }
}

/* --- GLSL chunks ---------------------------------------------------------- */
const HASH = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`

const VNOISE = /* glsl */ `
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
`

const FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 applyFog(vec3 c, float d){
  float f = 1.0 - exp(-d * uFogDensity);
  return mix(c, uFogColor, clamp(f, 0.0, 1.0));
}
float fogExtinct(float d){ return exp(-d * uFogDensity); }
`

type Shared = CitySharedUniforms

/* ============================================================================
   1 · Towers + the Spire — procedural lit-window facades on instanced geometry.
   One shader, two variants: planar facade mapping (boxes) vs cylindrical (the
   spire's stacked drums, which also get sky-lobby light bands + edge strips).
   ========================================================================== */
function towerVert(curved: boolean) {
  // NOTE: three 0.184 auto-declares `attribute mat4 instanceMatrix;` in the
  // ShaderMaterial vertex prefix — redeclaring it is a compile error.
  return /* glsl */ `
attribute float aSeed;
${curved ? 'attribute float aRad; varying float vRad;' : ''}
varying vec3 vW;
varying vec3 vN;
varying float vSeed;
varying vec3 vLocal;
void main(){
  vSeed = aSeed;
  vLocal = position;
  ${curved ? 'vRad = aRad;' : ''}
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
}

function towerFrag(curved: boolean) {
  return /* glsl */ `
precision highp float;
varying vec3 vW;
varying vec3 vN;
varying float vSeed;
varying vec3 vLocal;
${curved ? 'varying float vRad;' : ''}
uniform float uTime;
uniform vec3 uAccent;
uniform float uGlow;
${HASH}
${FOG}
void main(){
  vec3 n = normalize(vN);
  float roof = step(0.55, abs(n.y));
  ${
    curved
      ? 'float u = atan(vLocal.z, vLocal.x) * vRad;'
      : 'float u = mix(vW.x, vW.z, step(0.5, abs(n.x)));'
  }
  float v = vW.y;
  vec2 cell = vec2(floor(u / 3.4), floor(v / 4.0));
  vec2 f = vec2(fract(u / 3.4), fract(v / 4.0));
  float rnd = hash12(cell + vSeed * 113.7);
  // mechanical floors read as dark bands
  float mech = step(0.93, hash12(vec2(cell.y, vSeed * 7.3)));
  // occupancy varies per building and per 10-floor block
  float occ = 0.32 + 0.30 * hash12(vec2(vSeed, floor(v / 40.0)));
  float lit = step(1.0 - occ, rnd) * (1.0 - mech);
  // a rare subset of windows flickers slowly (life in the building)
  float fl = hash12(cell * 1.71 + vSeed);
  lit *= mix(1.0, step(0.45, fract(fl * 67.0 + uTime * (0.10 + fl * 0.30))), step(0.94, fl));
  // window pane shape within the cell
  float win = smoothstep(0.08, 0.22, f.x) * smoothstep(0.94, 0.78, f.x)
            * smoothstep(0.14, 0.30, f.y) * smoothstep(0.90, 0.70, f.y);
  // window colour population: warm sodium / cool office / division accent
  float cw = hash12(cell + vec2(17.0, 3.0) + vSeed);
  vec3 wcol = mix(vec3(1.0, 0.80, 0.52), vec3(0.55, 0.82, 1.05), step(0.55, cw));
  wcol = mix(wcol, uAccent * 1.5, step(0.90, cw));

  vec3 base = vec3(0.012, 0.018, 0.034) * (0.55 + 0.45 * max(n.y, 0.0)) + vec3(0.008, 0.012, 0.020);
  float dist = length(vW - cameraPosition);
  // distant facades collapse to an averaged glow — kills window moiré
  float lod = smoothstep(750.0, 140.0, dist);
  vec3 winGlow = wcol * win * lit * (1.3 + 0.7 * hash12(cell + vec2(3.1, 7.7)));
  vec3 farGlow = wcol * occ * 0.20;
  vec3 col = base * (1.0 - roof * 0.35) + mix(farGlow, winGlow, lod) * (1.0 - roof) * uGlow;
  ${
    curved
      ? /* glsl */ `
  // sky-lobby bands every ~62 floors + faint vertical edge light strips
  float band = pow(0.5 + 0.5 * cos((v / 250.0) * 6.28318), 180.0);
  col += uAccent * band * 0.9;
  float ang = atan(vLocal.z, vLocal.x);
  float strip = pow(0.5 + 0.5 * cos(ang * 8.0), 60.0);
  col += uAccent * strip * 0.10 * (1.0 - roof);
  `
      : ''
  }
  col = applyFog(col, dist);
  gl_FragColor = vec4(col, 1.0);
}
`
}

export function makeTowerMaterial(shared: Shared, curved: boolean) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uAccent: shared.uAccent,
      uGlow: shared.uGlow,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    vertexShader: towerVert(curved),
    fragmentShader: towerFrag(curved),
  })
}

/* ============================================================================
   2 · Helix — the DNA data-spine. Instanced node spheres on two strands plus
   rungs; a pulse travels down the strands (uPulse) and surges at chapter
   crossings. Additive; Bloom turns it into the descent's neon throughline.
   ========================================================================== */
const HELIX_VERT = /* glsl */ `
attribute float aPhase;
attribute float aStrand;
varying float vPhase;
varying float vStrand;
varying vec3 vN;
varying vec3 vW;
void main(){
  vPhase = aPhase;
  vStrand = aStrand;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const HELIX_NODE_FRAG = /* glsl */ `
precision highp float;
varying float vPhase;
varying float vStrand;
varying vec3 vN;
varying vec3 vW;
uniform float uTime;
uniform float uPulse;
uniform vec3 uColA;
uniform vec3 uAccent;
${FOG}
void main(){
  vec3 base = mix(uColA, uAccent, vStrand);
  // GLSL pow() is undefined for negative bases — square manually
  float pd = (vPhase - uPulse) * 22.0;
  float pulse = exp(-pd * pd);
  float br = 0.6 + 0.4 * sin(uTime * 1.3 + vPhase * 44.0);
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(max(0.0, 1.0 - abs(dot(normalize(vN), V))), 1.6);
  vec3 col = base * (0.35 * br + 0.9 * fr) + base * pulse * 2.6 + vec3(1.0) * pulse * 0.35;
  float ext = fogExtinct(length(vW - cameraPosition));
  gl_FragColor = vec4(col * ext, 1.0);
}
`
const HELIX_RUNG_FRAG = /* glsl */ `
precision highp float;
varying float vPhase;
varying float vStrand;
varying vec3 vN;
varying vec3 vW;
uniform float uTime;
uniform float uPulse;
uniform vec3 uColA;
uniform vec3 uAccent;
${FOG}
void main(){
  float pd = (vPhase - uPulse) * 22.0;
  float pulse = exp(-pd * pd);
  vec3 col = mix(vec3(0.45, 0.75, 0.85), uAccent, 0.35) * (0.16 + pulse * 1.6);
  col += uColA * pulse * 0.4;
  float ext = fogExtinct(length(vW - cameraPosition));
  gl_FragColor = vec4(col * ext * (0.6 + 0.4 * sin(uTime + vStrand)), 1.0);
}
`

export function makeHelixNodeMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uPulse: shared.uPulse,
      uColA: { value: new Color('#27f2c0') },
      uAccent: shared.uAccent,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    vertexShader: HELIX_VERT,
    fragmentShader: HELIX_NODE_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}
export function makeHelixRungMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uPulse: shared.uPulse,
      uColA: { value: new Color('#27f2c0') },
      uAccent: shared.uAccent,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    vertexShader: HELIX_VERT,
    fragmentShader: HELIX_RUNG_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}

/* ============================================================================
   3 · Vehicles — GPU-animated traffic streaks. Each instance is a camera-facing
   quad whose centre glides along its own lane (aStart + aDir · t), head burning
   white-hot into a fading tail. Zero per-frame CPU work.
   ========================================================================== */
const VEHICLE_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aDir;
attribute vec4 aParam; // x: speed (laps/sec)  y: phase  z: lane length  w: streak length
attribute vec3 aColor;
attribute float aThick;
varying vec2 vQuv;
varying vec3 vCol;
varying float vFade;
uniform float uTime;
uniform float uFogDensity;
void main(){
  float t = fract(uTime * aParam.x + aParam.y);
  vec3 center = aStart + aDir * (t * aParam.z);
  vec3 toCam = normalize(cameraPosition - center);
  vec3 side = normalize(cross(aDir, toCam));
  vec3 p = center + aDir * (position.x * aParam.w) + side * (position.y * aThick);
  vQuv = uv;
  vCol = aColor;
  vFade = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.94, t);
  vFade *= exp(-length(cameraPosition - p) * uFogDensity * 0.9);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const VEHICLE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vQuv;
varying vec3 vCol;
varying float vFade;
void main(){
  float body = pow(vQuv.x, 2.0);
  float across = pow(max(0.0, 1.0 - abs(vQuv.y - 0.5) * 2.0), 1.6);
  vec3 col = mix(vCol * 0.85, vec3(1.15), pow(vQuv.x, 6.0));
  float a = across * (0.12 + body) * vFade;
  gl_FragColor = vec4(col * a, a);
}
`
export function makeVehicleMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uFogDensity: shared.uFogDensity },
    vertexShader: VEHICLE_VERT,
    fragmentShader: VEHICLE_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
}

/* ============================================================================
   4 · Drones — points hovering near facades: bob, drift, blink, rare strobe.
   Also carries the spire crown beacons.
   ========================================================================== */
const DRONE_VERT = /* glsl */ `
attribute float aPhase;
attribute vec3 aCol;
varying vec3 vCol;
varying float vTw;
varying float vExt;
uniform float uTime;
uniform float uFogDensity;
void main(){
  vec3 p = position;
  p.y += sin(uTime * 0.7 + aPhase * 6.283) * 2.4;
  p.x += sin(uTime * 0.23 + aPhase * 9.0) * 3.0;
  p.z += cos(uTime * 0.19 + aPhase * 7.0) * 3.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.1, -mv.z);
  gl_PointSize = clamp(300.0 / dist, 1.2, 8.0);
  vCol = aCol;
  vTw = 0.55 + 0.45 * sin(uTime * 2.6 + aPhase * 40.0);
  vTw += step(0.985, fract(uTime * 0.5 + aPhase * 3.7)) * 2.2; // strobe
  vExt = exp(-dist * uFogDensity);
  gl_Position = projectionMatrix * mv;
}
`
const DRONE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vTw;
varying float vExt;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(c));
  gl_FragColor = vec4(vCol * vTw * a * vExt, a * vExt);
}
`
export function makeDroneMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uFogDensity: shared.uFogDensity },
    vertexShader: DRONE_VERT,
    fragmentShader: DRONE_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}

/* ============================================================================
   5 · Traffic rings — sky-lane tori around the spire with counter-flowing
   dash traffic. Division-tinted.
   ========================================================================== */
const RING_VERT = /* glsl */ `
varying vec2 vRuv;
varying vec3 vW;
void main(){
  vRuv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const RING_FRAG = /* glsl */ `
precision highp float;
varying vec2 vRuv;
varying vec3 vW;
uniform float uTime;
uniform vec3 uAccent;
uniform float uCount;
uniform float uFlow;
${FOG}
void main(){
  float dash = pow(0.5 + 0.5 * sin((vRuv.x * uCount + uTime * uFlow) * 6.28318), 3.0);
  float dash2 = pow(0.5 + 0.5 * sin((vRuv.x * uCount * 0.5 - uTime * uFlow * 0.7) * 6.28318 + 2.1), 5.0);
  vec3 col = uAccent * (0.10 + dash * 0.85) + vec3(1.0, 0.85, 0.6) * dash2 * 0.30;
  float ext = fogExtinct(length(vW - cameraPosition));
  gl_FragColor = vec4(col * ext, 1.0);
}
`
export function makeRingMaterial(shared: Shared, count: number, flow: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uAccent: shared.uAccent,
      uCount: { value: count },
      uFlow: { value: flow },
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}

/* ============================================================================
   6 · Cloud decks — horizontal fbm planes the camera punches through. uNear is
   driven per-layer from camera proximity so the plane fades before it clips;
   the shared uVeil whiteout covers the actual crossing.
   ========================================================================== */
const CLOUD_VERT = /* glsl */ `
varying vec2 vCuv;
void main(){
  vCuv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec2 vCuv;
uniform float uTime;
uniform float uNear;
uniform float uWind;
uniform float uScale;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec3 uAccent;
${HASH}
${VNOISE}
void main(){
  vec2 p = (vCuv - 0.5) * uScale;
  float n = fbm4(p + vec2(uTime * uWind, uTime * uWind * 0.6));
  n += fbm4(p * 2.7 - vec2(uTime * uWind * 1.7, 0.0)) * 0.4;
  float radial = smoothstep(0.5, 0.18, length(vCuv - 0.5));
  float a = smoothstep(0.42, 0.9, n) * radial * uNear * 0.85;
  vec3 col = mix(uTintA, uTintB, smoothstep(0.3, 1.0, n));
  col += uAccent * 0.06;
  gl_FragColor = vec4(col, a);
}
`
export function makeCloudMaterial(shared: Shared, tintA: string, tintB: string, wind: number, scale: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uNear: { value: 1 },
      uWind: { value: wind },
      uScale: { value: scale },
      uTintA: { value: new Color(tintA) },
      uTintB: { value: new Color(tintB) },
      uAccent: shared.uAccent,
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
}

/* ============================================================================
   7 · Ground — street grid, arterial traffic dashes, and the landing beacon:
   accent rings pulsing outward from the spire base, growing as you approach.
   ========================================================================== */
const GROUND_VERT = /* glsl */ `
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const GROUND_FRAG = /* glsl */ `
precision highp float;
varying vec3 vW;
uniform float uTime;
uniform vec3 uAccent;
uniform float uAlt;
${HASH}
${FOG}
void main(){
  vec2 g = vW.xz;
  // grid: minor 26m, major 130m
  vec2 mnr = abs(fract(g / 26.0) - 0.5) * 26.0;
  float minor = smoothstep(0.55, 0.10, min(mnr.x, mnr.y));
  vec2 mjr = abs(fract(g / 130.0) - 0.5) * 130.0;
  float major = smoothstep(1.1, 0.25, min(mjr.x, mjr.y));
  vec3 col = vec3(0.010, 0.014, 0.022);
  col += vec3(0.10, 0.35, 0.45) * minor * 0.30;
  col += vec3(0.16, 0.50, 0.60) * major * 0.45;
  // arterial avenues every 260m along x, carrying moving traffic dashes
  float av = smoothstep(2.2, 0.5, abs(mod(g.x + 130.0, 260.0) - 130.0));
  float dash = pow(0.5 + 0.5 * sin(g.y * 0.11 - uTime * 2.2), 12.0);
  col += vec3(1.0, 0.72, 0.42) * dash * av * 0.55;
  float av2 = smoothstep(2.2, 0.5, abs(mod(g.y + 130.0, 260.0) - 130.0));
  float dash2 = pow(0.5 + 0.5 * sin(g.x * 0.09 + uTime * 1.7), 12.0);
  col += vec3(0.5, 0.8, 1.0) * dash2 * av2 * 0.4;
  // landing beacon — pulsing accent rings around the spire base
  float r = length(g);
  float ring = pow(0.5 + 0.5 * sin(r * 0.16 - uTime * 1.6), 6.0) * smoothstep(340.0, 40.0, r);
  col += uAccent * ring * (0.25 + 0.75 * uAlt);
  float pad = smoothstep(30.0, 26.0, r) * (0.4 + 0.3 * sin(uTime * 2.0));
  col += uAccent * pad;
  col = applyFog(col, length(vW - cameraPosition));
  gl_FragColor = vec4(col, 1.0);
}
`
export function makeGroundMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uAccent: shared.uAccent,
      uAlt: shared.uAlt,
      uFogColor: shared.uFogColor,
      uFogDensity: shared.uFogDensity,
    },
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
  })
}

/* ============================================================================
   8 · Sky — a camera-following dome: altitude-graded gradient, twinkling star
   cells, aurora ribbons up top, amber city-glow near the ground, and a moon.
   ========================================================================== */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position; // sphere is centred on the camera every frame
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uAlt;
uniform vec3 uAccent;
${HASH}
${VNOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 top = mix(vec3(0.010, 0.012, 0.040), vec3(0.006, 0.008, 0.022), uAlt);
  vec3 hor = mix(vec3(0.045, 0.09, 0.15), vec3(0.34, 0.17, 0.06), uAlt * uAlt);
  vec3 col = mix(hor, top, smoothstep(-0.06, 0.42, h));
  // city glow dome hugging the horizon, grows on approach
  col += vec3(0.30, 0.16, 0.05) * pow(max(0.0, 1.0 - abs(h + 0.02) * 3.2), 2.0) * uAlt * 0.7;
  // star cells (fade out as you sink into the haze)
  vec2 sc = vec2(atan(d.z, d.x) * 1.9099, asin(clamp(d.y, -1.0, 1.0)) * 3.8197);
  vec2 cell = floor(sc * 22.0);
  vec2 f = fract(sc * 22.0);
  vec2 sp = hash22(cell) * 0.8 + 0.1;
  float mag = hash12(cell + 7.7);
  float star = smoothstep(0.06 + mag * 0.05, 0.0, length(f - sp)) * step(0.72, mag);
  star *= 0.55 + 0.45 * sin(uTime * (1.0 + mag * 2.0) + mag * 40.0);
  col += vec3(0.8, 0.9, 1.0) * star * (1.0 - uAlt) * smoothstep(0.02, 0.3, h);
  // aurora ribbons (seam-free: noise fed by direction, not angle)
  vec2 ap = d.xz * 2.2 + vec2(0.0, d.y * 4.0);
  float aur = smoothstep(0.55, 0.95, fbm4(ap - uTime * 0.03)) * smoothstep(0.15, 0.55, h) * (1.0 - uAlt);
  col += mix(vec3(0.05, 0.55, 0.42), vec3(0.30, 0.20, 0.65), fbm4(ap * 0.4 + uTime * 0.02)) * aur * 0.35;
  // division accent breathing in the atmosphere
  col += uAccent * pow(max(0.0, 1.0 - abs(h) * 2.6), 3.0) * 0.05;
  // moon
  float dm = dot(d, normalize(vec3(0.55, 0.34, -0.72)));
  float disc = smoothstep(0.99930, 0.99965, dm);
  float glow = pow(max(dm, 0.0), 700.0);
  col += (disc * vec3(0.85, 0.9, 1.0) + glow * vec3(0.35, 0.45, 0.65)) * (0.35 + 0.65 * (1.0 - uAlt));
  gl_FragColor = vec4(col, 1.0);
}
`
export function makeSkyMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uAlt: shared.uAlt, uAccent: shared.uAccent },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
  })
}

/* ============================================================================
   9 · Veil — clip-space fullscreen quad for the cloud-breakthrough whiteout
   and landing flash. Drawn last, ignores the camera entirely.
   ========================================================================== */
const VEIL_VERT = /* glsl */ `
varying vec2 vVuv;
void main(){
  vVuv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`
const VEIL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vVuv;
uniform float uTime;
uniform float uVeil;
${HASH}
${VNOISE}
void main(){
  float n = fbm4(vVuv * 3.0 + uTime * 0.35);
  float a = uVeil * (0.75 + 0.25 * n);
  gl_FragColor = vec4(vec3(0.80, 0.88, 1.0), a);
}
`
export function makeVeilMaterial(shared: Shared) {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uVeil: shared.uVeil },
    vertexShader: VEIL_VERT,
    fragmentShader: VEIL_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
}
