/* ============================================================================
   THE LATTICE — shared contract for every piece of the Act II world.

   The world is a forward flight (along -Z) through a 3D Matrix: code-rain
   columns, a neural web, a neon floor and one hero "construct" per station.
   Page scroll is mapped (by DownwardWorld) onto `scrollState.track`, a float in
   station units 0..STATIONS. The camera rig damps it into `worldState.track`,
   which every construct reads in its own useFrame. Station k lives at world
   z = -k * SP; the camera sits D units in front of the station it's at.

   Everything here is a plain module singleton: zero React re-renders per frame.
   ========================================================================== */
import {
  CanvasTexture,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Vector2,
} from 'three'

export type LatticeTier = 'desktop' | 'mobile'

export const LATTICE = {
  SP: 64, // world units between stations
  D: 18, // camera stand-off in front of a station
  STATIONS: 12, // last station index (the singularity)
  FLOOR_Y: -10,
  Z_START: 70, // corridor begins a little behind the entry camera
  get Z_END() {
    return -(this.STATIONS * this.SP + 170)
  },
  SIDE_X: 8, // lateral offset of the division constructs (right of the path)
}

/** world z of a station anchor */
export const stationZ = (k: number) => -k * LATTICE.SP

/**
 * Shared uniforms: ONE object referenced by every custom ShaderMaterial in the
 * world (spread it into `uniforms`). The rig updates it once per frame.
 */
export const worldUniforms = {
  uTime: { value: 0 },
  uFlow: { value: 0 }, // integrated "flow" clock: runs faster while the eye flies fast
  uAccent: { value: new Color('#27f2c0') }, // active chapter accent (linear)
  uFogColor: { value: new Color('#010805') },
  uFogDensity: { value: 0.0105 },
  uVel: { value: 0 }, // smoothed |scroll velocity| in stations/sec, 0..~3
  uTrack: { value: 0 }, // damped track
  uDpr: { value: 1 },
  uRes: { value: new Vector2(1, 1) },
}

/** mutable per-frame state the rig writes and constructs read */
export const worldState = {
  track: 0, // damped displayed track (stations)
  vel: 0, // smoothed signed velocity (stations/sec)
  time: 0, // ambient clock (already scaled for reduced motion)
  reduced: false,
  aspect: 16 / 9,
}

/**
 * 0..1 closeness of the camera to a station: 1 when parked at it, falling to 0
 * about 1.4 stations away. Use it to wake a construct up as it's approached.
 */
export function proximity(station: number, width = 1.4) {
  const d = Math.abs(worldState.track - station) / width
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d)
}

/** true while a station is near enough to be worth rendering/animating */
export const isNear = (station: number, range = 2.6) =>
  Math.abs(worldState.track - station) < range

/** an accent colour pushed above 1.0 so Bloom catches it */
export const hot = (hex: string, k = 2) => new Color(hex).multiplyScalar(k)

/** props every construct receives */
export interface ConstructProps {
  station: number
  /** world-space anchor (the construct's centre) */
  position: [number, number, number]
  accent: string
  tier: LatticeTier
}

/* --- GLSL helpers ----------------------------------------------------------
   three 0.184 ShaderMaterial = #version 300 es with legacy aliases: write
   attribute/varying/texture2D/gl_FragColor, never redeclare position/uv/
   normal/cameraPosition/modelMatrix/viewMatrix/projectionMatrix/instanceMatrix.

   Fog for ADDITIVE passes: multiply colour by visibility (fading to black ==
   fading out). Never mix toward uFogColor in an additive pass.
     vertex:   ${FOG_VERT_PARS} ... vFogDepth = -mvPosition.z;
     fragment: ${FOG_FRAG_PARS} ... col *= fogVis();
   -------------------------------------------------------------------------- */
export const FOG_VERT_PARS = /* glsl */ `
varying float vFogDepth;
`
export const FOG_FRAG_PARS = /* glsl */ `
uniform float uFogDensity;
uniform vec3 uFogColor;
varying float vFogDepth;
float fogVis(){
  float f = uFogDensity * vFogDepth;
  return exp(-f * f);
}
`
export const HASH = /* glsl */ `
float hash11(float n){ return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`

/* --- glyph atlas -----------------------------------------------------------
   8x8 grid of mirrored half-width katakana + digits drawn once into a canvas.
   White glyphs on black: sample `.r` as coverage. Row 0 of the CANVAS is the
   top; CanvasTexture flips Y, so glyph g lives at
     uv = (vec2(mod(g,8), 7 - floor(g/8)) + cellUv) / 8
   -------------------------------------------------------------------------- */
export const ATLAS_GRID = 8
const GLYPHS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝｦ012345678' +
  '9Z:<>=+*'
let atlas: CanvasTexture | null = null
let atlasUsers = 0

/** ref-counted shared glyph atlas — call releaseGlyphAtlas() on unmount */
export function getGlyphAtlas(): CanvasTexture {
  atlasUsers++
  if (atlas) return atlas
  const cell = 64
  const size = cell * ATLAS_GRID
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  const g = cv.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `600 ${cell * 0.78}px "Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","MS Gothic","Noto Sans JP","Noto Sans CJK JP",monospace`
  const chars = Array.from(GLYPHS)
  for (let i = 0; i < ATLAS_GRID * ATLAS_GRID; i++) {
    const ch = chars[i % chars.length]
    const cx = (i % ATLAS_GRID) * cell + cell / 2
    const cy = Math.floor(i / ATLAS_GRID) * cell + cell / 2
    g.save()
    g.translate(cx, cy)
    // the film's rain is mirrored; keep digits readable
    if (!/[0-9Z:<>=+*]/.test(ch)) g.scale(-1, 1)
    g.fillText(ch, 0, cell * 0.04)
    g.restore()
  }
  const tex = new CanvasTexture(cv)
  // coverage mask: keep it linear (NoColorSpace) so AA edges aren't gamma-crushed
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  atlas = tex
  return tex
}

export function releaseGlyphAtlas() {
  atlasUsers = Math.max(0, atlasUsers - 1)
  if (atlasUsers === 0 && atlas) {
    atlas.dispose()
    atlas = null
  }
}

/** deterministic PRNG so layouts are identical across mounts */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
