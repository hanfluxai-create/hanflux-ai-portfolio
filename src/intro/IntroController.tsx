import { useIntro } from './useIntro'

/**
 * Thin wrapper so App can lazy-import the intro (and therefore GSAP +
 * SplitText + ScrollTrigger) into a separate chunk, keeping ~42KB of
 * animation code off the initial critical path.
 */
export default function IntroController() {
  useIntro()
  return null
}
