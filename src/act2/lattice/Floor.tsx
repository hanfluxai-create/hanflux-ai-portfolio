/* ============================================================================
   THE LATTICE · ground + sky.
   Floor: one opaque plane with an analytic neon grid (fwidth-antialiased so it
   never shimmers), scan pulses rolling away down the corridor, a twin-lane
   data highway streaming under the flight path, and a glowing landing ring
   beneath each division construct. It writes depth, so rain never leaks below
   the floor. Sky: a camera-locked dome that fades fog into a faint accent
   horizon band, so far geometry dissolves into atmosphere, not a flat colour.
   ========================================================================== */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
} from 'three'
import { FOG_FRAG_PARS, FOG_VERT_PARS, LATTICE, worldUniforms } from './shared'

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
${FOG_VERT_PARS}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const FLOOR_FRAG = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform vec3 uAccent;
uniform float uSP;
uniform float uSideX;
varying vec3 vWorld;
${FOG_FRAG_PARS}
float gridLine(vec2 p, float scale, float width){
  vec2 g = p / scale;
  vec2 d = abs(fract(g - 0.5) - 0.5) / fwidth(g);
  return 1.0 - min(min(d.x, d.y) / width, 1.0);
}
void main(){
  vec2 p = vWorld.xz;
  float far = smoothstep(140.0, 25.0, vFogDepth);
  float minor = gridLine(p, 2.0, 1.0) * far;
  float major = gridLine(p, 10.0, 1.3);

  // scan pulses rolling away from the eye, down the corridor
  float wave = fract((p.y + uTime * 24.0) / 96.0);
  float pulse = exp(-pow((wave - 0.5) * 16.0, 2.0));

  // twin data-highway lanes streaming under the flight path
  float lane = smoothstep(0.32, 0.0, abs(abs(p.x) - 3.4));
  float dash = step(0.6, fract(p.y * 0.16 + uFlow * 1.4 + step(0.0, p.x) * 0.5));

  vec3 cyan = vec3(0.25, 0.92, 1.0);
  vec3 mag = vec3(1.0, 0.18, 0.62);
  vec3 lineCol = mix(uAccent, mix(cyan, mag, smoothstep(12.0, 70.0, abs(p.x))), 0.4);

  vec3 col = vec3(0.0004, 0.0025, 0.0016);
  col += lineCol * (minor * 0.045 + major * 0.2) * (0.4 + pulse * 1.8);
  col += uAccent * lane * (0.04 + dash * 0.7);

  // landing ring beneath each division construct (stations 1..6)
  float k = floor(-p.y / uSP + 0.5);
  if (k >= 1.0 && k <= 6.0) {
    vec2 q = vec2(p.x - uSideX, p.y + k * uSP);
    float rr = length(q);
    float ring = exp(-pow((rr - 7.0) * 2.2, 2.0)) + exp(-pow((rr - 7.8) * 6.0, 2.0)) * 0.6;
    float tick = step(0.5, fract(atan(q.y, q.x) * 9.5493 + uTime * 0.3));
    col += uAccent * ring * (0.35 + tick * 0.35) + uAccent * exp(-rr * 0.35) * 0.06;
  }

  col = mix(uFogColor, col, fogVis());
  gl_FragColor = vec4(col, 1.0);
}
`

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const SKY_FRAG = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uAccent;
uniform float uTime;
varying vec3 vDir;
void main(){
  float h = vDir.y;
  float band = exp(-pow(h * 5.5, 2.0));
  vec3 col = uFogColor + uAccent * band * 0.009;
  // a slow aurora of signal high above
  float a = sin(vDir.x * 3.0 + uTime * 0.05) * sin(vDir.z * 2.0 - uTime * 0.04);
  col += vec3(0.5, 0.1, 0.45) * smoothstep(0.2, 0.9, h) * max(a, 0.0) * 0.006;
  gl_FragColor = vec4(col, 1.0);
}
`

export function Floor() {
  const { geo, mat, z } = useMemo(() => {
    const len = LATTICE.Z_START - LATTICE.Z_END + 260
    const geo = new PlaneGeometry(420, len, 1, 1)
    geo.rotateX(-Math.PI / 2)
    const mat = new ShaderMaterial({
      uniforms: {
        ...worldUniforms,
        uSP: { value: LATTICE.SP },
        uSideX: { value: LATTICE.SIDE_X },
      },
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      fog: false,
      toneMapped: false,
    })
    return { geo, mat, z: (LATTICE.Z_START + LATTICE.Z_END) / 2 }
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  return <mesh geometry={geo} material={mat} position={[0, LATTICE.FLOOR_Y, z]} renderOrder={0} />
}

export function Sky() {
  const ref = useRef<Mesh>(null)
  const { geo, mat } = useMemo(() => {
    const geo = new SphereGeometry(900, 32, 16)
    const mat = new ShaderMaterial({
      uniforms: { ...worldUniforms },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    return { geo, mat }
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position)
  })
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} />
}
