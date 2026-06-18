import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useProgress } from '@react-three/drei'
import { useStore } from '../store/store'
import { introProxy } from '../scene/CameraRig'
import { CONFIG } from '../config/config'

gsap.registerPlugin(SplitText, ScrollTrigger) // idempotent at module scope

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Fires ONCE when real asset loading completes (drei useProgress:
 * active === false && total > 0). Runs the cinematic intro:
 * wordmark char reveal -> preloader fade -> camera dolly-in ->
 * particle ignition -> overlay reveal. StrictMode-safe via gsap.context.
 * Reduced-motion users skip straight to the ignited scene.
 */
export function useIntro() {
  const active = useProgress((s) => s.active)
  const total = useProgress((s) => s.total)
  const fired = useRef(false)

  useLayoutEffect(() => {
    if (fired.current) return
    if (active || total === 0) return // wait for genuine load completion
    fired.current = true

    const { setLoaded, setSection, setIntro } = useStore.getState()

    if (prefersReduced()) {
      CONFIG.runtime.reducedMotion = true
      setIntro(1)
      setSection('work')
      setLoaded(true)
      return
    }

    const wordmark = document.querySelector('.preloader__wordmark')

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          setLoaded(true)
          setSection('work')
          ScrollTrigger.refresh()
        },
      })

      // 1) wordmark char reveal
      if (wordmark) {
        const split = new SplitText(wordmark as HTMLElement, {
          type: 'chars',
          charsClass: 'char',
          autoSplit: true,
        })
        tl.set(split.chars, { yPercent: 120, opacity: 0 }, 0).to(
          split.chars,
          {
            yPercent: 0,
            opacity: 1,
            duration: 0.85,
            stagger: { each: 0.05, from: 'start' },
            ease: 'power4.out',
          },
          0.05,
        )
      }

      // 2) preloader fades, revealing the scene
      tl.to('.preloader', { autoAlpha: 0, duration: 0.7, ease: 'power2.inOut' }, 0.85)

      // 3) camera dolly-in (CameraRig mirrors introProxy onto the camera)
      tl.to(
        introProxy.position,
        { z: CONFIG.camera.position[2], duration: 1.7, ease: 'power2.inOut' },
        0.7,
      )

      // 4) particle ignition: store.intro 0 -> 1 (read by ParticleField uIntro)
      tl.to(
        { v: 0 },
        {
          v: 1,
          duration: 1.5,
          ease: 'power2.out',
          onUpdate() {
            setIntro((this.targets()[0] as { v: number }).v)
          },
        },
        0.85,
      )

      // 5) overlay reveal (from the natural visible state -> StrictMode/reduced safe)
      tl.from('.topbar', { autoAlpha: 0, y: -16, duration: 0.8 }, 1.05)
        .from('.hud', { autoAlpha: 0, duration: 0.8 }, 1.2)
        .from('.chatnav', { autoAlpha: 0, y: 18, duration: 0.8 }, 1.3)
    })

    return () => ctx.revert()
  }, [active, total])
}
