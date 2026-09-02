import { drawQr } from '../qr'
import { formatTagCode } from '../code'

/**
 * Sectie 9.5 en 9.6 — het label wordt getekend op een canvas van precies
 * 384 pixels breed (48 mm bij 203 dpi) en daarna hard op 50% gedrempeld.
 * GEEN dithering: Floyd-Steinberg over een QR maakt de code onleesbaar.
 */

export const PRINT_WIDTH = 384

export interface LabelContent {
  /** URL die in de QR komt. Hoofdletters => alphanumeric-modus => grotere modules. */
  qrText: string
  /** De code zoals een mens hem overtypt, bijvoorbeeld W7K-3QM. */
  code: string
  lines: string[]
  /** Regel onderaan: winkelnaam en telefoon. */
  footer: string
  /** Extra regel boven de voettekst, bijvoorbeeld "Akkoord tot: € 80,00". */
  note?: string
}

const MODULE_PX = 8

export function renderLabel(content: LabelContent): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_WIDTH
  // Hoogte wordt na het tekenen bijgesneden; ruim beginnen.
  canvas.height = 900
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  let y = 16

  // QR gecentreerd, hele coördinaten.
  const qrSize = drawQr(
    ctx, content.qrText,
    Math.floor((PRINT_WIDTH - (25 + 8) * MODULE_PX) / 2), y, MODULE_PX,
  )
  y += qrSize + 8

  // De code groot eronder: op een vervaagd label is dit de hoofdweg,
  // niet de terugvaloptie (sectie 8.2).
  ctx.font = 'bold 56px "Arial Black", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(formatTagCode(content.code), PRINT_WIDTH / 2, y)
  y += 66

  ctx.textAlign = 'left'
  ctx.font = 'bold 28px Arial, sans-serif'
  for (const line of content.lines) {
    if (!line) continue
    ctx.fillText(clip(ctx, line, PRINT_WIDTH - 32), 16, y)
    y += 34
  }

  if (content.note) {
    y += 6
    ctx.font = 'bold 30px Arial, sans-serif'
    ctx.fillText(clip(ctx, content.note, PRINT_WIDTH - 32), 16, y)
    y += 38
  }

  y += 8
  ctx.font = 'bold 24px Arial, sans-serif'
  ctx.fillText(clip(ctx, content.footer, PRINT_WIDTH - 32), 16, y)
  y += 40

  // Bijsnijden op de werkelijke hoogte.
  const out = document.createElement('canvas')
  out.width = PRINT_WIDTH
  out.height = Math.ceil(y)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = false
  octx.fillStyle = '#FFFFFF'
  octx.fillRect(0, 0, out.width, out.height)
  octx.drawImage(canvas, 0, 0)
  return out
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

/**
 * Canvas -> printerregels. Drempel op 50%, één bit per punt,
 * LSB first (sectie 9.2: bit 0 is de linkerpunt).
 */
export function canvasToRows(canvas: HTMLCanvasElement): Uint8Array[] {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const img = ctx.getImageData(0, 0, width, height).data
  const bytesPerRow = PRINT_WIDTH / 8
  const rows: Uint8Array[] = []

  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(bytesPerRow)
    for (let x = 0; x < PRINT_WIDTH; x++) {
      const i = (y * width + x) * 4
      const alpha = img[i + 3]
      const luminance = alpha === 0
        ? 255
        : 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]
      if (luminance < 128) row[x >> 3] |= 1 << (x & 7)
    }
    rows.push(row)
  }
  return rows
}
