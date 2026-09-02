import QRCode from 'qrcode'

/**
 * Sectie 8.3 en 9.6 — QR met de hand tekenen, want de standaardrenderer
 * schaalt met anti-aliasing en dan zijn de modules op thermopapier grijs.
 * Regels: hele coördinaten, geen smoothing, foutcorrectie Q, stille zone
 * van 4 modules.
 */

export interface QrMatrix {
  size: number
  get(x: number, y: number): boolean
}

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' })
  const size = qr.modules.size
  const bits = qr.modules.data
  return {
    size,
    get: (x, y) => bits[y * size + x] === 1,
  }
}

export const QUIET_ZONE = 4

/**
 * Tekent de QR op een canvas met een vast aantal pixels per module.
 * Geeft de gebruikte pixelgrootte terug (inclusief stille zone).
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  originX: number,
  originY: number,
  modulePx: number,
): number {
  const m = qrMatrix(text)
  ctx.imageSmoothingEnabled = false
  const total = (m.size + QUIET_ZONE * 2) * modulePx
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(originX, originY, total, total)
  ctx.fillStyle = '#000000'
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.get(x, y)) continue
      ctx.fillRect(
        originX + (x + QUIET_ZONE) * modulePx,
        originY + (y + QUIET_ZONE) * modulePx,
        modulePx, modulePx,
      )
    }
  }
  return total
}

/** Aantal modules van deze tekst; handig om te controleren of we op versie 2 zitten. */
export function qrVersionInfo(text: string): { modules: number } {
  return { modules: qrMatrix(text).size }
}
