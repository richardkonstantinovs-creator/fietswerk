import type { Photo } from './types'

/**
 * Aannamefoto's (sectie 3.1, punt 3) worden verkleind opgeslagen: in fase 0
 * staat alles in de browseropslag, en volle telefoonfoto's lopen die binnen
 * een paar aannames vol. In fase 1 gaat dit naar Supabase Storage.
 */
const MAX_EDGE = 900
const QUALITY = 0.65

export async function fileToPhoto(file: File, label?: string): Promise<Photo> {
  const dataUrl = await shrink(file)
  return {
    id: `ph_${Math.random().toString(36).slice(2, 10)}`,
    data_url: dataUrl,
    at: new Date().toISOString(),
    label,
  }
}

function shrink(file: File): Promise<string> {
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
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kan foto niet lezen')) }
    img.src = url
  })
}
