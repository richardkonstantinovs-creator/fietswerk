// Geld en datums worden ALTIJD in nl-NL getoond, ook als het scherm op Engels staat
// (sectie 10.2) — anders praten de eigenaar en de ontwikkelaar over andere getallen.

const euro = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const number2 = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Centen -> "€ 1.234,50". Alles in de app is integer-centen (sectie 14). */
export function money(cents: number): string {
  return euro.format(cents / 100).replace(/\u00A0/g, ' ')
}

/** Centen -> "1.234,50" zonder valutateken, voor invoervelden. */
export function moneyPlain(cents: number): string {
  return number2.format(cents / 100)
}

/** "60", "60,50", "60.50", "€ 60,50" -> centen. Ongeldige invoer -> null. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** BTW over een bedrag exclusief btw. */
export function vatOf(exVatCents: number, rate: number): number {
  return Math.round(exVatCents * rate)
}

/** Prijs van arbeid: minuten x uurtarief, afgerond op hele centen. */
export function laborCents(minutes: number, ratePerHourCents: number): number {
  return Math.round((minutes / 60) * ratePerHourCents)
}

const dateFmt = new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  timeZone: 'Europe/Amsterdam',
})
const timeFmt = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})

/** ISO -> "01-09-2026" */
export function date(iso: string | null | undefined): string {
  if (!iso) return '—'
  return dateFmt.format(new Date(iso))
}

/** ISO -> "01-09-2026 14:35" */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`
}

/** Hele dagen tussen een moment en nu (nooit negatief). */
export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * Datum plus een aantal werkdagen (zaterdag en zondag tellen niet mee).
 * Gebruikt voor de wettelijke bewaartermijn bij inkoop van tweedehands
 * fietsen: verkopen mag pas na 5 werkdagen (sectie 4.1).
 */
export function addWorkingDays(iso: string, workingDays: number): string {
  const d = new Date(iso)
  let left = workingDays
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) left -= 1
  }
  return d.toISOString()
}

/** Hele dagen tot een moment in de toekomst; negatief als het al voorbij is. */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/** Telefoonnummer normaliseren naar E.164 voor Nederland. */
export function toE164NL(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0031')) return `+${digits.slice(2)}`
  if (digits.startsWith('31') && digits.length >= 11) return `+${digits}`
  if (digits.startsWith('0')) return `+31${digits.slice(1)}`
  return digits ? `+31${digits}` : ''
}

/** E.164 -> "06 12 34 56 78" voor op het scherm. */
export function phoneDisplay(e164: string): string {
  if (!e164.startsWith('+31')) return e164
  const rest = e164.slice(3)
  const local = `0${rest}`
  if (local.startsWith('06') && local.length === 10) {
    return `${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`
  }
  return `${local.slice(0, 3)}-${local.slice(3)}`
}

/** Alleen cijfers, voor wa.me links. */
export function whatsappNumber(e164: string): string {
  return e164.replace(/\D/g, '')
}

export function minutesDisplay(minutes: number | null | undefined): string {
  if (minutes == null) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} u` : `${h} u ${m} min`
}
