/**
 * Static, on-brand backdrop shown when WebGL is unavailable, and as the
 * Suspense fallback while the 3D scene chunk loads. Reuses the .canvas
 * fixed-inset box so swapping canvas <-> fallback causes zero layout shift.
 */
export function Fallback() {
  return <div className="canvas fallback-bg" aria-hidden="true" />
}
