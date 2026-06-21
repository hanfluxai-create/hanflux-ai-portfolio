/**
 * Bridges page scroll → the Act I capability carousel.
 * DownwardWorld (the scroll owner) writes `index` from the hero region's scroll
 * progress; the Act I Carousel reads it in useFrame WHEN `driven` is true and
 * follows it. When `driven` is false the carousel keeps its original gesture +
 * keyboard behaviour completely untouched — a safe, one-flag rollback.
 */
export const heroNav = {
  index: 0, // 0..(cards-1), fractional, from page-scroll progress
  driven: false, // true once the scroll-driven hero is wired up
}
