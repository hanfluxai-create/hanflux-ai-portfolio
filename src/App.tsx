import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CONFIG } from './config/config'
import { ParticleField } from './scene/ParticleField'
import { Effects } from './components/Effects'
import { Cursor } from './components/Cursor'
import { DebugPanel } from './components/DebugPanel'
import { Overlay } from './components/Overlay'

export default function App() {
  return (
    <>
      <Canvas
        className="canvas"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: CONFIG.camera.position, fov: CONFIG.camera.fov }}
      >
        <color attach="background" args={[CONFIG.colors.background]} />
        <fog attach="fog" args={[CONFIG.colors.fog, CONFIG.fog.near, CONFIG.fog.far]} />
        <Suspense fallback={null}>
          <ParticleField />
        </Suspense>
        <Effects />
      </Canvas>

      <Overlay />
      <Cursor />
      <DebugPanel />
    </>
  )
}
