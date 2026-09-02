import { useEffect, useRef } from 'react'
import { isTagCode, normalizeTagCode } from './code'

/**
 * Sectie 8.5 — de balie gebruikt een gewone 2D-scanner die zich voordoet als
 * toetsenbord. Een reeks aanslagen sneller dan 100 ms met Enter erachter is
 * een scan, geen mens die typt.
 */
const MAX_GAP_MS = 100
const MIN_LENGTH = 4

export function useHidScanner(onScan: (code: string) => void, enabled = true) {
  const buffer = useRef('')
  const lastAt = useRef(0)
  const handler = useRef(onScan)
  useEffect(() => { handler.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // Typt iemand in een veld, dan is Enter gewoon Enter.
      const inField = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      const now = Date.now()
      const gap = now - lastAt.current
      lastAt.current = now

      if (e.key === 'Enter') {
        const candidate = buffer.current
        buffer.current = ''
        if (!inField && candidate.length >= MIN_LENGTH && isTagCode(candidate)) {
          e.preventDefault()
          handler.current(normalizeTagCode(candidate))
        }
        return
      }
      if (e.key.length !== 1) return
      if (gap > MAX_GAP_MS) buffer.current = ''
      buffer.current += e.key
      if (buffer.current.length > 32) buffer.current = buffer.current.slice(-32)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [enabled])
}

/** Camerascan in de werkplaats. BarcodeDetector is er in Chromium; Safari heeft het niet. */
export function barcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }

export async function scanFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (!barcodeDetectorSupported()) return null
  const Ctor = (window as unknown as {
    BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike
  }).BarcodeDetector
  const detector = new Ctor({ formats: ['qr_code'] })
  try {
    const found = await detector.detect(video)
    return found.length > 0 ? found[0].rawValue : null
  } catch {
    return null
  }
}

/** De QR bevat een URL; hieruit halen we de labelcode. */
export function codeFromScan(raw: string): string | null {
  const match = raw.match(/\/W\/([0-9A-Za-z-]{6,8})\s*$/i)
  const candidate = match ? match[1] : raw
  return isTagCode(candidate) ? normalizeTagCode(candidate) : null
}
