# Hanflux AI — Immersive WebGL Portfolio

An award-style, real-time WebGL experience for **Hanflux AI** — the ultimate workflow
automation & AI voice-agent ecosystem. Dark "DEEP SIGNAL" aesthetic: an abyssal
obsidian void, bioluminescent teal→ultraviolet neon, GPU particles, an AI-chat
navigator, and a 3D capability carousel with particle-dissolve transitions.

> Visual north star: the real-time-3D feel of studios like Active Theory & Lusion.
> All brand, copy, and content are original to Hanflux AI.

## Stack

| Layer | Tech |
|---|---|
| Build | Vite 8 · React 19 · TypeScript 6 |
| 3D | three 0.184 · @react-three/fiber · drei · @react-three/postprocessing |
| Animation | GSAP 3 (ScrollTrigger + SplitText, now free) |
| Scroll / State | Lenis · Zustand |
| Debug | Tweakpane (press **G**) |
| Chat (optional LLM) | Vercel AI SDK + @ai-sdk/anthropic |

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
npm run preview  # preview the build
```

Press **G** in dev to open the Tweakpane debug panel.

## Where things live

- `src/config/config.ts` — every 3D/visual tunable (colors, particles, bloom, camera). Tweakpane binds to it live.
- `src/config/content.ts` — all brand copy, capabilities, about, chat chips. **Edit here to rebrand / add real projects + images.**
- `src/scene/` — R3F scene (particle field, carousel).
- `src/components/` — DOM overlay, cursor, chat, debug, post-processing.
- `src/shaders/` — GLSL for the particle field and dissolve transitions.

## Chat navigator

Works fully offline via local keyword matching. To enable optional LLM
free-text interpretation, copy `.env.example` → `.env` and set the flag + key
(see the security note in that file).

## Build phases

0. Scaffold + post-processing + cursor + debug ✅
1. Preloader + GSAP intro (real load progress)
2. GPGPU particle backdrop (mouse/scroll reactive)
3. AI-chat navigator (keyword-first, LLM optional)
4. 3D capability carousel + particle-dissolve transitions
5. DOM overlay / SplitText reveals / About + Contact
6. Perf-tiering · mobile · reduced-motion · WebGL fallback
