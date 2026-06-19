import { lazy, Suspense, useEffect } from 'react'
import { Overlay } from './components/Overlay'
import { Cursor } from './components/Cursor'
import { DebugPanel } from './components/DebugPanel'
import { Preloader } from './components/Preloader'
import { ChatNavigator } from './components/ChatNavigator'
import { Fallback } from './components/Fallback'
import { useWebGLSupported } from './hooks/useWebGLSupported'
import { useStore } from './store/store'

// lazy so three/postprocessing fetch on Canvas mount, not on initial boot
const Scene = lazy(() => import('./scene/Scene'))
// lazy so GSAP + SplitText + ScrollTrigger stream off the critical path
const IntroController = lazy(() => import('./intro/IntroController'))
// Act II — the vertical "Descent" world below the hero. Lazy: keeps GSAP + Lenis
// + the glass-gallery canvas off the initial Act I boot path. Additive only.
const DownwardWorld = lazy(() =>
  import('./act2/DownwardWorld').then((m) => ({ default: m.DownwardWorld })),
)

export default function App() {
  const webgl = useWebGLSupported()
  const setLoaded = useStore((s) => s.setLoaded)

  // no WebGL -> no scene to load, so clear the preloader and show the fallback
  useEffect(() => {
    if (!webgl) setLoaded(true)
  }, [webgl, setLoaded])

  return (
    <>
      {webgl ? (
        <Suspense fallback={<Fallback />}>
          <Scene />
        </Suspense>
      ) : (
        <Fallback />
      )}

      {webgl && (
        <Suspense fallback={null}>
          <IntroController />
        </Suspense>
      )}

      <Preloader />
      <Overlay />
      <ChatNavigator />
      <Cursor />
      <DebugPanel />

      {/* Act II — built around Act I, scrolls downward from it. Never mutates Act I. */}
      <Suspense fallback={null}>
        <DownwardWorld webgl={webgl} />
      </Suspense>
    </>
  )
}
