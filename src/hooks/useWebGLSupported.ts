import { useState } from 'react'

/** One-shot WebGL capability probe. */
export function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl =
      c.getContext('webgl2') ||
      c.getContext('webgl') ||
      c.getContext('experimental-webgl')
    return !!gl
  } catch {
    return false
  }
}

export function useWebGLSupported(): boolean {
  const [ok] = useState(detectWebGL) // probe ONCE on mount
  return ok
}
