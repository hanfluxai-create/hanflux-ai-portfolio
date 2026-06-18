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

  // Per-section camera positions; CameraRig flies to these on nav/chat intent.
  // Camera always looks at the origin, so these are gentle parallax framings.
  cam: {
    intro: [0, 0, 7] as [number, number, number],
    work: [0, 0, 6] as [number, number, number],
    services: [1.4, 0.2, 6.4] as [number, number, number],
    about: [-2.4, 0.6, 6.6] as [number, number, number],
    contact: [2.2, -0.5, 6.2] as [number, number, number],
  },

  // 3D capability carousel (Phase 4).
  carousel: {
    gap: 2.6, // world units between card centers
    arc: 0.16, // z pushback per |index| step (shallow concave arc)
    yawPerStep: 0.1, // radians off-center cards turn inward
    planeW: 2.3,
    planeH: 1.45,
    dragSpeed: 0.0042, // px -> index units
    wheelSpeed: 0.0016,
    damp: 6, // lerp stiffness (higher = snappier)
    hoverScale: 1.1,
    focusZ: 2.4, // how far a selected card comes toward camera
    dissolve: 0.55, // seconds for a dissolve/reform transition
  },

  // Live, perf-driven runtime flags (mutated by the perf tier system, Phase 6).
  // particles.count above is the desktop-high default; tiers scale DOWN from it.
  runtime: {
    quality: 'high' as 'high' | 'medium' | 'low',
    particleCount: 14000,
    chromaticAberration: true,
    bloomEnabled: true,
    reducedMotion: false,
  },
  tiers: {
    high: { particleCount: 14000, chromaticAberration: true, bloom: true, dpr: [1, 2] as [number, number] },
    medium: { particleCount: 7000, chromaticAberration: false, bloom: true, dpr: [1, 1.5] as [number, number] },
    low: { particleCount: 2500, chromaticAberration: false, bloom: false, dpr: [1, 1] as [number, number] },
  },
}

export type Config = typeof CONFIG
