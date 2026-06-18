import { lazy, Suspense, useEffect } from 'react'
import { Overlay } from './components/Overlay'
import { Cursor } from './components/Cursor'
import { DebugPanel } from './components/DebugPanel'
import { Preloader } from './components/Preloader'
import { ChatNavigator } from './components/ChatNavigator'
import { Fallback } from './components/Fallback'
import { useWebGLSupported } from './hooks/useWebGLSupported'
import { useIntro } from './intro/useIntro'
import { useStore } from './store/store'

// lazy so three/postprocessing fetch on Canvas mount, not on initial boot
const Scene = lazy(() => import('./scene/Scene'))

export default function App() {
  const webgl = useWebGLSupported()
  const setLoaded = useStore((s) => s.setLoaded)
  useIntro()

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

      <Preloader />
      <Overlay />
      <ChatNavigator />
      <Cursor />
      <DebugPanel />
    </>
  )
}
