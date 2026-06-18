import { create } from 'zustand'

export type Section = 'intro' | 'work' | 'about' | 'services' | 'contact'

interface AppState {
  loaded: boolean
  progress: number // 0..1 real asset-load progress (Phase 1)
  section: Section
  chatOpen: boolean
  debug: boolean
  setLoaded: (v: boolean) => void
  setProgress: (v: number) => void
  setSection: (s: Section) => void
  setChatOpen: (v: boolean) => void
  toggleDebug: () => void
}

export const useStore = create<AppState>((set) => ({
  loaded: false,
  progress: 0,
  section: 'intro',
  chatOpen: false,
  debug: false,
  setLoaded: (v) => set({ loaded: v }),
  setProgress: (v) => set({ progress: v }),
  setSection: (s) => set({ section: s }),
  setChatOpen: (v) => set({ chatOpen: v }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}))
