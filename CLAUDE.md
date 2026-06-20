# Hanflux AI — operating manual (READ FIRST)

Immersive WebGL site, two acts. **Live:** https://hydra-portfolio-flax.vercel.app/
Stack: Vite 8 · React 19 · TS · three 0.184 · @react-three/fiber 9 · drei 10 ·
@react-three/postprocessing 3 · gsap 3.15 · lenis · zustand.

## 🔒 ACT I IS SACRED — DO NOT MODIFY
Act I is the fixed, camera-fly hero (particle void + chat nav + 3D capability carousel).
It is shipped and must be preserved at all costs. **Never edit these** (behaviour or markup):
- `src/App.tsx` — EXCEPTION: it already has the one Act II wire-in (a lazy `<DownwardWorld/>`
  sibling). Leave it as-is; do not add more Act I logic here.
- `src/main.tsx`, `src/index.css`
- `src/scene/*` (Scene, ParticleField, Carousel, CameraRig, PreloadAssets)
- `src/components/*` (Overlay, Cursor, ChatNavigator, Effects, Preloader, Fallback, DebugPanel)
- `src/config/config.ts`, `src/config/content.ts` (Act I tunables + copy)
- `src/hooks/*`, `src/intro/*`, `src/lib/*`, `src/store/store.ts`, `src/shaders/dissolve.ts`

If an Act II change *seems* to need an Act I edit, stop and reconsider — there's almost always
an additive way. Act II is layered ON TOP of Act I, never woven into it.

## ✏️ ACT II — make ALL changes here: `src/act2/`
"The Descent" — the vertical scroll world below the hero.
- `content2.ts` — **all Act II copy/data** (capabilities, loop, stack, metrics, CTA). Edit here
  for text/content changes — no component edits needed.
- `act2.css` — **all Act II styles** (plus the additive global overrides for Act I coexistence;
  see gotchas). Never put Act II styles in `index.css`.
- `DownwardWorld.tsx` — DOM sections + Lenis + ScrollTrigger + section reveals + descend/ascend.
- `GlassGallery.tsx` / `GlassCard.tsx` — the R3F floating-glass constellation (its own canvas).
- `scrollState.ts` — module singleton bridging DOM scroll → R3F `useFrame` (no React re-renders).

## How Act II coexists with Act I (the load-bearing tricks — don't break these)
- **Lenis ignores Act I's canvas**: `prevent: (node) => node.closest('.canvas')` so the hero's
  `@use-gesture` carousel keeps its wheel. Driven by `gsap.ticker` (`autoRaf:false`).
- `act2.css` forces `.canvas{position:fixed!important}` — REQUIRED once the document scrolls
  (R3F's inline `position:relative` otherwise steals a viewport of flow). Keep it.
- `body.in-act2` (toggled on scroll past ~45vh) fades Act I's `.canvas/.overlay/.chatnav`.
- The gallery canvas is **IntersectionObserver-gated** (mounts only near view) + WebGL-gated.
- **NO `MeshTransmissionMaterial`** — a transmission pass is an extra full-scene render/frame and
  stalls the GPU stacked on Act I's particle field. Use the frosted `meshPhysicalMaterial`
  (transparent + roughness + iridescence + clearcoat) already in `GlassCard.tsx`.
- **Gradient text** (`background-clip:text`) drops glyphs that overflow the box → use
  `overflow-wrap:break-word; text-wrap:balance` and size so the longest word fits.

## Run / build / deploy
- Dev: `npm run dev` → http://localhost:5173  (press `g` for the Tweakpane debug panel)
- Build (always before shipping): `npm run build` (runs `tsc -b` first — must be green)
- **Deploy needs EXPLICIT per-deploy approval from the user.** Then:
  `npx vercel deploy --prod --yes --token=$VERCEL_TOKEN` (linked dir → project `hydra-portfolio`,
  org `hanfluxai-6146s-projects`; aliases to the live URL). Push `main` first.

## Verify (headless preview gotchas)
Assert structure/behaviour with `preview_eval` (DOM/geometry/mounted flags). Screenshots are
clean only on a FRESH `preview_start` (a shot right AFTER an eval comes back black/sliver; the
tab is often `document.hidden` → rAF throttled to ~2fps, so don't trust FPS here). Hand the
visual pass to the user / a Haiku screenshot pass.

> Deeper playbooks live in the `ultimate-web-builder` skill: `references/recipes.md` (the exact
> Act II patterns), `immersive.md`, `elevation.md`, `3d-webgl.md`.
