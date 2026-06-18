import {
  BufferGeometry,
  Float32BufferAttribute,
  Sphere,
  Vector3,
} from 'three'

/**
 * Particle-dissolve shaders + geometry builder.
 * Verified against three 0.184: ShaderMaterial compiles as #version 300 es and
 * auto-#defines attribute/varying/texture2D/gl_FragColor and injects
 * position/uv/modelViewMatrix/projectionMatrix — so this legacy-style GLSL is
 * correct as written. uProgress 0 = crisp packed image, 1 = full dispersion.
 */
export const DISSOLVE_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aRand;
attribute vec3 aDir;
uniform float uProgress, uSize, uPointScale, uPixelRatio;
varying vec2 vUv;
varying float vProgress;
float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  vUv=aUv;
  float p=clamp((uProgress-aRand*0.35)/0.65,0.0,1.0);
  vProgress=p;
  vec3 pos=position;
  float n=noise(position*3.0+aRand*10.0);
  vec3 wob=vec3(noise(position.yzx*2.5+p*2.0)-0.5,noise(position.zxy*2.5-p*2.0)-0.5,noise(position.xyz*2.5+p*3.0)-0.5);
  float push=pow(p,1.5);
  pos+=aDir*push*(0.6+aRand*1.4);
  pos+=wob*push*0.9;
  pos.z+=(n-0.5)*push*1.2;
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  float size=uSize*(1.0+p*1.2*(1.0-p)*4.0)*uPixelRatio;
  if(projectionMatrix[2][3]!=0.0)size*=(uPointScale/-mv.z);
  gl_PointSize=max(size,0.0);
  gl_Position=projectionMatrix*mv;
}`

export const DISSOLVE_FRAG = /* glsl */ `
uniform sampler2D uTexture;
uniform float uAdditive;
varying vec2 vUv;
varying float vProgress;
void main(){
  vec2 c=gl_PointCoord-0.5;
  float d=dot(c,c);
  if(d>0.25)discard;
  float soft=smoothstep(0.25,0.06,d);
  vec4 tex=texture2D(uTexture,vUv);
  float alpha=tex.a*soft*(1.0-smoothstep(0.55,1.0,vProgress));
  vec3 col=tex.rgb+tex.rgb*uAdditive*vProgress*0.6;
  if(alpha<0.003)discard;
  gl_FragColor=vec4(col,alpha);
}`

/** Builds a packed point-grid plane (cols x rows) centered at the origin in XY. */
export function buildDissolveGeometry(
  cols: number,
  rows: number,
  width: number,
  height: number,
) {
  const count = cols * rows
  const positions = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const rand = new Float32Array(count)
  const dir = new Float32Array(count * 3)
  let i = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = cols === 1 ? 0.5 : x / (cols - 1)
      const v = rows === 1 ? 0.5 : y / (rows - 1)
      positions[i * 3] = (u - 0.5) * width
      positions[i * 3 + 1] = (v - 0.5) * height
      positions[i * 3 + 2] = 0
      uvs[i * 2] = u
      uvs[i * 2 + 1] = v
      rand[i] = Math.random()
      const ang = Math.random() * Math.PI * 2
      const r = 0.35 + Math.random() * 0.65
      const dx = (u - 0.5) * 1.4 + Math.cos(ang) * r
      const dy = (v - 0.5) * 1.4 + Math.sin(ang) * r
      const dz = (Math.random() - 0.5) * 1.2
      const len = Math.hypot(dx, dy, dz) || 1
      dir[i * 3] = dx / len
      dir[i * 3 + 1] = dy / len
      dir[i * 3 + 2] = dz / len
      i++
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('aUv', new Float32BufferAttribute(uvs, 2))
  g.setAttribute('aRand', new Float32BufferAttribute(rand, 1))
  g.setAttribute('aDir', new Float32BufferAttribute(dir, 3))
  // generous bounds so full dispersion never frustum-culls mid-animation
  g.boundingSphere = new Sphere(new Vector3(0, 0, 0), Math.max(width, height) * 2)
  return g
}

export const dissolvePointSize = (
  width: number,
  height: number,
  cols: number,
  rows: number,
) => (Math.max(width, height) / Math.max(cols, rows)) * 36
