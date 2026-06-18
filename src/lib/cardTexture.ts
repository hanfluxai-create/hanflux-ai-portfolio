import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Capability } from '../config/content'

/**
 * Procedurally paints a branded capability card to a CanvasTexture:
 * a diagonal colorA->colorB gradient, a faint tech grid, a ghost index
 * number, and a kicker label. No external image assets required — set a
 * Capability.image URL later to swap in real artwork instead.
 */
export function makeCardTexture(cap: Capability, index: number): CanvasTexture {
  const W = 1024
  const H = 648
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // base diagonal gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, cap.colorA)
  grad.addColorStop(1, cap.colorB)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // deepen toward the bottom for legibility / depth
  const shade = ctx.createLinearGradient(0, 0, 0, H)
  shade.addColorStop(0, 'rgba(5,6,10,0)')
  shade.addColorStop(1, 'rgba(5,6,10,0.72)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)

  // soft radial glow top-left
  const glow = ctx.createRadialGradient(W * 0.28, H * 0.3, 0, W * 0.28, H * 0.3, W * 0.7)
  glow.addColorStop(0, 'rgba(255,255,255,0.16)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // faint grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  const step = 64
  for (let x = step; x < W; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  // ghost index number, bottom-right
  const num = String(index + 1).padStart(2, '0')
  ctx.font = '900 360px "Clash Display", system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fillText(num, W - 36, H - 20)

  // kicker label, top-left
  ctx.font = '600 30px "Satoshi", system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(cap.kicker.toUpperCase(), 44, 66)

  // title, bottom-left (wrapped to 2 lines max)
  ctx.font = '700 58px "Clash Display", system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  const words = cap.title.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > W - 88 && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  lines.push(line)
  const lh = 64
  let ty = H - 56 - (lines.length - 1) * lh
  for (const l of lines) {
    ctx.fillText(l, 44, ty)
    ty += lh
  }

  // thin inner frame
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.strokeRect(10, 10, W - 20, H - 20)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
