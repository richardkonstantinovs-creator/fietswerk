import type { Shift, TimeEntry } from './types'

/**
 * Rekenwerk achter het rooster en de urenstaat (fase 3). Alles hier is een
 * pure functie op strings en getallen, zodat de som die onder het loon ligt
 * met een test is vast te leggen en niet in een scherm verstopt zit.
 *
 * Twee soorten tijd, en ze worden nooit door elkaar gehaald:
 *  - een kalenderdag is 'YYYY-MM-DD' in winkeltijd (een dienst van 9 tot 17
 *    verschuift niet mee met de zomertijd);
 *  - een klokslag is een ISO-tijdstempel (dat moment is echt gebeurd).
 */

/** Kalenderdag van een moment, in de tijd van het toestel in de winkel. */
export function dayKey(when: Date = new Date()): string {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 'YYYY-MM-DD' -> middernacht op dat toestel. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(key: string, days: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + days)
  return dayKey(d)
}

/** De maandag van de week waar deze dag in valt. De week begint hier op maandag. */
export function mondayOf(key: string): string {
  const d = parseDay(key)
  const shift = (d.getDay() + 6) % 7 // zondag (0) is de zevende dag, niet de eerste
  d.setDate(d.getDate() - shift)
  return dayKey(d)
}

/** De zeven dagen van een week, maandag eerst. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Weeknummer volgens ISO 8601; dat is het nummer dat op de loonstrook staat. */
export function weekNumber(key: string): number {
  const d = parseDay(key)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)) // donderdag bepaalt het jaar
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

/** Eerste en laatste dag van een maand 'YYYY-MM'. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function isWeekend(key: string): boolean {
  const day = parseDay(key).getDay()
  return day === 0 || day === 6
}

// ------------------------------------------------------------------ kloktijd

/** 'HH:MM' -> minuten na middernacht. Ongeldige invoer geeft null. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minuten na middernacht -> 'HH:MM'. */
export function hhmmOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Het tijdstip van een klokslag, in winkeltijd: 'HH:MM'. */
export function clockTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ------------------------------------------------------------------- rekenen

/**
 * Geplande minuten van een dienst, pauze er af. Een eindtijd die voor de
 * begintijd ligt loopt over middernacht (een avonddienst tot 00:30).
 */
export function shiftMinutes(shift: Pick<Shift, 'start' | 'end' | 'break_minutes'>): number {
  const from = minutesOf(shift.start)
  const to = minutesOf(shift.end)
  if (from == null || to == null) return 0
  const span = to > from ? to - from : to + 1440 - from
  return Math.max(0, span - Math.max(0, shift.break_minutes))
}

/**
 * Gewerkte minuten van één registratie, pauze er af. Een registratie die nog
 * openstaat telt tot nu: anders staat er de hele dag een nul bij iemand die
 * gewoon aan het werk is.
 */
export function entryMinutes(entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>, now = Date.now()): number {
  const start = new Date(entry.clock_in).getTime()
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : now
  if (!Number.isFinite(start) || end <= start) return 0
  return Math.max(0, Math.round((end - start) / 60_000) - Math.max(0, entry.break_minutes))
}

export interface DayTotals {
  planned: number
  worked: number
  /** Verschil in minuten: positief is overwerk, negatief is te vroeg weg. */
  difference: number
}

/**
 * De som waar de eigenaar om vroeg: feit min plan. Geen cao-regels, geen
 * automatische pauze — wat er staat, staat er omdat iemand het zo heeft
 * ingevoerd of geklokt.
 */
export function totals(shifts: Shift[], entries: TimeEntry[], now = Date.now()): DayTotals {
  const planned = shifts.reduce((sum, s) => sum + shiftMinutes(s), 0)
  const worked = entries.reduce((sum, e) => sum + entryMinutes(e, now), 0)
  return { planned, worked, difference: worked - planned }
}

/** Minuten -> '8,25' (Nederlandse komma), voor scherm en export. */
export function hoursPlain(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toFixed(2).replace('.', ',')
}

/** Minuten -> '8,25 u'. */
export function hoursDisplay(minutes: number): string {
  return `${hoursPlain(minutes)} u`
}

/** Minuten -> '+1,75 u' of '−0,50 u'; nul blijft '0,00 u' zonder teken. */
export function differenceDisplay(minutes: number): string {
  if (minutes === 0) return hoursDisplay(0)
  const sign = minutes > 0 ? '+' : '−'
  return `${sign}${hoursDisplay(Math.abs(minutes))}`
}

/** 'YYYY-MM-DD' -> '01-09-2026', dezelfde vorm als elders in de app. */
export function dayDisplay(key: string): string {
  return key.split('-').reverse().join('-')
}

/** 1 = maandag ... 7 = zondag; de sleutel voor de naam van de dag in i18n. */
export function weekdayIndex(key: string): number {
  return ((parseDay(key).getDay() + 6) % 7) + 1
}

/** '01-09' — kop boven een kolom in het rooster, waar geen jaartal bij past. */
export function dayShort(key: string): string {
  const [, m, d] = key.split('-')
  return `${d}-${m}`
}
