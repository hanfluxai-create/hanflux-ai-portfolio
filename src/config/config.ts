/**
 * Single source of truth for every tunable in the experience.
 * The Tweakpane debug panel (press "g") binds directly to this object,
 * and the scene reads from it each frame — so changes are live.
 */
export const CONFIG = {
  colors: {
    background: '#05060A', // abyssal obsidian
    fog: '#070912',
    particleA: '#27F2C0', // electric teal
    particleB: '#7C5CFF', // ultraviolet
    particleC: '#FF3D7F', // signal pink (sparse accent)
  },
  camera: {
    position: [0, 0, 7] as [number, number, number],
    fov: 50,
  },
  fog: {
    near: 4,
    far: 18,
  },
  particles: {
    count: 14000,
    radius: 3.2,
    size: 0.022,
    rotationSpeed: 0.04,
    pointerInfluence: 0.6,
    sparkChance: 0.08, // fraction that flare pink
  },
  bloom: {
    intensity: 1.2,
    luminanceThreshold: 0.12,
    luminanceSmoothing: 0.9,
    mipmapBlur: true,
  },
  chromaticAberration: {
    offset: 0.0014,
  },
  vignette: {
    offset: 0.22,
    darkness: 0.9,
  },
}

export type Config = typeof CONFIG
