/**
 * Een bladzijde uit het schrift klaarmaken voor de leesdienst. Bewust niet
 * photos.ts hergebruiken: die verkleint naar 900px voor de browseropslag, en
 * handschrift is dan niet meer te lezen. Deze foto gaat nergens heen behalve
 * naar de leesdienst en wordt daarna weggegooid, dus mag hij groter blijven.
 */
const MAX_EDGE = 1600
const QUALITY = 0.8

export interface PageImage {
  /** Volledige data-URL, voor het scherm. */
  dataUrl: string
  /** Alleen de base64 zonder kop, want dat wil de leesdienst. */
  base64: string
}

export function pageToImage(file: File): Promise<PageImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('geen canvas')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
      resolve({ dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kan foto niet lezen')) }
    img.src = url
  })
}
