import { useEffect, useRef } from 'react'
import { drawQr, QUIET_ZONE, qrMatrix } from '../lib/qr'

/**
 * QR op het scherm. Zelfde regels als bij het printen: hele pixels, geen
 * anti-aliasing, stille zone van 4 modules (sectie 8.3).
 */
export function Qr({ text, modulePx = 8 }: { text: string; modulePx?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const size = (qrMatrix(text).size + QUIET_ZONE * 2) * modulePx
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawQr(ctx, text, 0, 0, modulePx)
  }, [text, modulePx])

  return (
    <canvas
      ref={ref}
      aria-label={text}
      role="img"
      className="border-2 border-ink bg-white max-w-full h-auto"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
