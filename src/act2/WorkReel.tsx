/* ============================================================================
   ACT III · "SIGNALS SHIPPED" — the work reel.
   A WebGL grid of project tiles, each a plane running ImageDistortMaterial:
   on hover it smears RGB + ripples toward the cursor (the Active-Theory signature
   interaction). A synced DOM detail panel + a keyboard-accessible legend carry
   the content + a11y; the tiles carry the spectacle. Canvas is IntersectionObserver-
   gated. Tiles fall back to a procedural hue field until an image texture is set.
   ========================================================================== */
import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { MathUtils, SRGBColorSpace, type Mesh, type Texture, Vector2 } from 'three'
import { ACT3, type Project } from './content3'
import { SplitReveal } from './kinetic'
import './shaders' // registers ImageDistortMaterial

const PROJECTS = ACT3.projects
const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/* --- one tile ------------------------------------------------------------ */
function TileMesh({
  project,
  texture,
  pos,
  size,
  isActive,
  onActivate,
}: {
  project: Project
  texture: Texture | null
  pos: [number, number]
  size: [number, number]
  isActive: boolean
  onActivate: (id: string | null) => void
}) {
  const mat = useRef<any>(null)
  const mesh = useRef<Mesh>(null)
  const targetHover = useRef(0)
  const pointer = useRef(new Vector2(0.5, 0.5))
  const reveal = useRef(0)

  // set the non-animated uniforms imperatively (keeps the JSX free of custom
  // shaderMaterial props, which sidesteps drei↔TS element-typing friction)
  useEffect(() => {
    const m = mat.current
    if (texture) texture.colorSpace = SRGBColorSpace
    if (m) {
      m.uTex = texture
      m.uHasTex = texture ? 1 : 0
      m.uTint.set(project.a)
    }
  }, [texture, project.a])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const m = mat.current
    if (!m) return
    const isReduced = reduced()
    // reduced-motion: freeze the shader's breathing/scanline animation
    if (!isReduced) m.uTime += dt
    targetHover.current = isActive ? 1 : 0
    m.uHover = isReduced ? targetHover.current : MathUtils.damp(m.uHover, targetHover.current, 9, dt)
    m.uPointer.lerp(pointer.current, isReduced ? 1 : 0.2)
    // reveal driven by an IntersectionObserver-set flag on the canvas root is
    // overkill per-tile; ramp on mount with a tiny stagger via z-depth instead
    reveal.current = Math.min(1, reveal.current + dt * 1.1)
    m.uReveal = isReduced ? 1 : reveal.current
    // lift the active tile toward the viewer
    if (mesh.current) {
      const z = isActive ? 0.35 : 0
      mesh.current.position.z = MathUtils.damp(mesh.current.position.z, z, 8, dt)
      const s = isActive ? 1.04 : 1
      const sc = MathUtils.damp(mesh.current.scale.x, s, 8, dt)
      mesh.current.scale.set(sc, sc, 1)
    }
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.uv) pointer.current.set(e.uv.x, e.uv.y)
  }

  return (
    <mesh
      ref={mesh}
      position={[pos[0], pos[1], 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        onActivate(project.id)
      }}
      onPointerMove={onMove}
      onPointerOut={() => onActivate(null)}
    >
      <planeGeometry args={[size[0], size[1], 1, 1]} />
      <imageDistortMaterial ref={mat} transparent depthWrite={false} />
    </mesh>
  )
}

function Tile(props: Parameters<typeof TileMesh>[0]) {
  // separate component types keep hook order stable whether or not a tex loads
  return props.project.tex ? <LoadedTile {...props} /> : <TileMesh {...props} texture={null} />
}
function LoadedTile(props: Parameters<typeof TileMesh>[0]) {
  const tex = useTexture(props.project.tex as string)
  return <TileMesh {...props} texture={tex as Texture} />
}

/* --- the grid ------------------------------------------------------------ */
function Grid({
  activeId,
  onActivate,
}: {
  activeId: string | null
  onActivate: (id: string | null) => void
}) {
  const { viewport } = useThree()
  const cols = viewport.width < 6 ? 1 : viewport.width < 9 ? 2 : 3
  const rows = Math.ceil(PROJECTS.length / cols)
  const gap = viewport.width * 0.025
  const tileW = (viewport.width * 0.9 - gap * (cols - 1)) / cols
  const tileH = tileW / 1.5
  const totalH = tileH * rows + gap * (rows - 1)

  const layout = PROJECTS.map((_, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = -(viewport.width * 0.9) / 2 + tileW / 2 + c * (tileW + gap)
    const y = totalH / 2 - tileH / 2 - r * (tileH + gap)
    return { x, y }
  })

  return (
    <group>
      {PROJECTS.map((p, i) => (
        <Tile
          key={p.id}
          project={p}
          texture={null}
          pos={[layout[i].x, layout[i].y]}
          size={[tileW, tileH]}
          isActive={activeId === p.id || (activeId === null && false)}
          onActivate={onActivate}
        />
      ))}
    </group>
  )
}

function ReelCanvas({
  activeId,
  onActivate,
}: {
  activeId: string | null
  onActivate: (id: string | null) => void
}) {
  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7], fov: 42 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.6} />
      <Suspense fallback={null}>
        <Grid activeId={activeId} onActivate={onActivate} />
      </Suspense>
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.5} luminanceThreshold={0.4} luminanceSmoothing={0.9} />
        <ChromaticAberration radialModulation={false} modulationOffset={0} offset={[0.0006, 0.0006]} />
      </EffectComposer>
    </Canvas>
  )
}

/* --- section ------------------------------------------------------------- */
export function WorkReel({ webgl = true }: { webgl?: boolean }) {
  const section = useRef<HTMLElement>(null)
  const [live, setLive] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(PROJECTS[0].id)

  // NOTE: deliberately NO useTexture.preload here. Preloading at mount injects the
  // tile images into three's GLOBAL DefaultLoadingManager during boot, which Act I's
  // intro waits on (drei useProgress: active===false && total>0). That extra load
  // batch broke the "load complete" edge on some browsers → the intro never fired and
  // the preloader hung at 100. The tiles load lazily when the gated canvas mounts
  // (well after the intro), so Act II assets never touch Act I's boot path.
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setLive(webgl && e.isIntersecting),
      { rootMargin: '25% 0px 25% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  const active = PROJECTS.find((p) => p.id === activeId) ?? PROJECTS[0]

  return (
    <section className={`reel${webgl ? '' : ' no-webgl'}`} ref={section} id="work">
      <div className="reel-head">
        <p className="kicker kreveal-instant">{ACT3.reel.kicker}</p>
        <SplitReveal as="h2" className="k-head k-sm">
          {ACT3.reel.title.join(' ')}
        </SplitReveal>
        <p className="lede">{ACT3.reel.sub}</p>
      </div>

      <div className="reel-stage">
        <div className="reel-canvas" aria-hidden="true">
          {live && <ReelCanvas activeId={activeId} onActivate={(id) => setActiveId(id ?? active.id)} />}
        </div>

        {/* fallback grid — shown on mobile + when WebGL is unavailable (CSS-gated) */}
        <ul className="reel-fallback">
          {PROJECTS.map((p) => (
            <li key={p.id} style={{ ['--a' as string]: p.a }}>
              <span className="rf-no">{p.no}</span>
              <h3>{p.title}</h3>
              <p>{p.blurb}</p>
            </li>
          ))}
        </ul>

        <div className="reel-ui">
          <div className="reel-detail" key={active.id}>
            <span className="rd-no">{active.no}</span>
            <span className="rd-sector">{active.sector}</span>
            <h3 className="rd-title">{active.title}</h3>
            <p className="rd-blurb">{active.blurb}</p>
            <span className="rd-metric">{active.metric}</span>
            <ul className="rd-tags">
              {active.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <ol className="reel-legend" aria-label="projects">
            {PROJECTS.map((p) => (
              <li key={p.id}>
                <button
                  className="rl"
                  data-on={p.id === activeId}
                  data-hover
                  onMouseEnter={() => setActiveId(p.id)}
                  onFocus={() => setActiveId(p.id)}
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="rl-no">{p.no}</span>
                  <span className="rl-title">{p.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
