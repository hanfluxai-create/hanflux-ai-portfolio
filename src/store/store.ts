import { create } from 'zustand'

export type Section = 'intro' | 'work' | 'about' | 'services' | 'contact'
export type Quality = 'high' | 'medium' | 'low'

interface AppState {
  // load / intro
  loaded: boolean
  progress: number // 0..1 real asset-load progress (Phase 1)
  intro: number // 0 = dark/cold, 1 = fully ignited (drives particle ignition)

  // navigation
  section: Section
  flyTo: Section | null // set by chat/nav; the scene reads + clears it
  chatOpen: boolean

  // carousel (Phase 4)
  selected: number | null // expanded card, or null
  activeIndex: number // snapped centered card

  // perf / debug
  quality: Quality
  debug: boolean

  // setters
  setLoaded: (v: boolean) => void
  setProgress: (v: number) => void
  setIntro: (v: number) => void
  setSection: (s: Section) => void
  requestFlyTo: (s: Section) => void
  clearFlyTo: () => void
  setChatOpen: (v: boolean) => void
  setSelected: (i: number | null) => void
  setActiveIndex: (i: number) => void
  setQuality: (q: Quality) => void
  toggleDebug: () => void
}

export const useStore = create<AppState>((set) => ({
  loaded: false,
  progress: 0,
  intro: 0,
  section: 'intro',
  flyTo: null,
  chatOpen: false,
  selected: null,
  activeIndex: 0,
  quality: 'high',
  debug: false,

  setLoaded: (v) => set({ loaded: v }),
  setProgress: (v) => set({ progress: v }),
  setIntro: (v) => set({ intro: v }),
  setSection: (s) => set({ section: s }),
  // requestFlyTo also sets section so callers need only one call
  requestFlyTo: (s) => set({ flyTo: s, section: s }),
  clearFlyTo: () => set({ flyTo: null }),
  setChatOpen: (v) => set({ chatOpen: v }),
  setSelected: (selected) => set({ selected }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setQuality: (quality) => set({ quality }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}))
