/**
 * Lightweight module singleton bridging DOM scroll (Lenis + ScrollTrigger) and
 * the R3F render loop. Mutated by DownwardWorld; read inside useFrame in the
 * glass gallery. No React state → no re-renders on scroll.
 */
export const scrollState = {
  galleryProgress: 0, // 0..1 across the pinned glass-gallery section
  inAct2: 0, // 0 at the Act I surface, 1 once fully descended (eased)
  pointerX: 0, // -1..1 normalized pointer, for parallax
  pointerY: 0,
  active: -1, // index of the focused capability card (-1 = none)
  portalProgress: 0, // 0..1 how "open" the Act III portal is (scroll-driven)
}
