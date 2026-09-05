import type { Bike, Customer, PaymentMethod } from '../types'
import type { BikeCategory } from '../types'
import { toE164NL } from '../format'
import { BIKE_CATEGORIES } from '../jobs'
import type { Regel } from './ocr'

/**
 * Rekenwerk voor het overzetten van het schrift: wie lijkt op wie, en wat gaat
 * er precies de database in. Losse functies zonder scherm en zonder netwerk,
 * zodat ze onder test staan. Deze code kiest nooit zelf een klant — hij legt
 * kandidaten voor en de eigenaar wijst aan.
 */

/** Cijfers eruit, zodat 06-12345678, 0612345678 en +31612345678 gelijk zijn. */
export function phoneKey(raw: string | null): string {
  if (!raw) return ''
  const e164 = toE164NL(raw)
  const digits = (e164 || raw).replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : ''
}

const TUSSENVOEGSELS = new Set(['de', 'den', 'der', 'van', 'het', 'ter', 'te', 'op', 'aan'])

/**
 * Namen vergelijkbaar maken: kleine letters, geen leestekens, geen
 * tussenvoegsels. In een schrift staat "de Vries" net zo vaak als "deVries",
 * dus een tussenvoegsel dat aan de naam vastgeplakt is gaat er ook af.
 */
export function nameKey(raw: string | null): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !TUSSENVOEGSELS.has(w))
    .map(stripVastgeplakt)
    .join(' ')
    .trim()
}

/** "devries" -> "vries", maar "denhaag" blijft heel als er te weinig overblijft. */
function stripVastgeplakt(word: string): string {
  for (const tv of TUSSENVOEGSELS) {
    if (word.length > tv.length + 2 && word.startsWith(tv)) return word.slice(tv.length)
  }
  return word
}

/** Levenshtein, klein gehouden: namen zijn kort en het draait per bladzijde. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Twee namen die op elkaar lijken: hooguit één tikfout per vier letters, en de
 * eerste letter moet gelijk zijn. Zonder die tweede eis zijn Jansen en Hansen
 * één tikfout uit elkaar, en dat zijn twee verschillende families.
 */
export function namesLookAlike(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a[0] !== b[0]) return false
  const drempel = Math.floor(Math.max(a.length, b.length) / 4)
  return drempel > 0 && editDistance(a, b) <= drempel
}

export interface Kandidaat {
  customer: Customer
  /** Hoger is een sterkere gelijkenis; alleen om te sorteren. */
  score: number
  /** Waarom hij hier staat — dat leest de eigenaar op het scherm. */
  reden: 'telefoon' | 'naam_straat' | 'naam' | 'framenummer'
}

export const MAX_KANDIDATEN = 5

/**
 * Klanten die op deze regel lijken, sterkste eerst. Nooit meer dan vijf: als
 * er meer lijken, is aanwijzen toch geen doen en klopt de regel niet.
 */
export function findCandidates(
  regel: Regel,
  customers: Customer[],
  bikes: Bike[],
): Kandidaat[] {
  const tel = phoneKey(regel.klant.telefoon)
  const achternaam = nameKey(regel.klant.achternaam)
  const volledig = nameKey(`${regel.klant.voornaam ?? ''} ${regel.klant.achternaam ?? ''}`)
  const straat = nameKey(regel.klant.straat)
  const frame = (regel.fiets.framenummer ?? '').replace(/[\s-]/g, '').toUpperCase()

  const gevonden = new Map<string, Kandidaat>()
  const zet = (customer: Customer, score: number, reden: Kandidaat['reden']) => {
    const bestaand = gevonden.get(customer.id)
    if (!bestaand || bestaand.score < score) gevonden.set(customer.id, { customer, score, reden })
  }

  if (frame.length >= 4) {
    for (const b of bikes) {
      const bf = (b.frame_number ?? '').replace(/[\s-]/g, '').toUpperCase()
      if (!bf || bf !== frame || !b.customer_id) continue
      const c = customers.find((x) => x.id === b.customer_id)
      if (c) zet(c, 100, 'framenummer')
    }
  }

  for (const c of customers) {
    if (c.deleted_at) continue
    if (tel && phoneKey(c.phone) === tel) { zet(c, 90, 'telefoon'); continue }
    if (!achternaam) continue
    const cachter = nameKey(c.last_name)
    const cvol = nameKey(`${c.first_name} ${c.last_name}`)
    if (!namesLookAlike(achternaam, cachter)) continue
    if (straat && nameKey(c.street) && namesLookAlike(straat, nameKey(c.street))) {
      zet(c, 70, 'naam_straat')
    } else if (volledig && namesLookAlike(volledig, cvol)) {
      zet(c, 50, 'naam')
    } else {
      zet(c, 30, 'naam')
    }
  }

  return [...gevonden.values()].sort((a, b) => b.score - a.score).slice(0, MAX_KANDIDATEN)
}

/** Fietsen van deze klant die op de fiets in het schrift lijken, beste eerst. */
export function findBikeCandidates(regel: Regel, bikes: Bike[]): Bike[] {
  const merk = nameKey(regel.fiets.merk)
  const frame = (regel.fiets.framenummer ?? '').replace(/[\s-]/g, '').toUpperCase()
  return bikes
    .map((b) => {
      const bf = (b.frame_number ?? '').replace(/[\s-]/g, '').toUpperCase()
      if (frame.length >= 4 && bf === frame) return { b, score: 100 }
      if (merk && namesLookAlike(merk, nameKey(b.brand))) return { b, score: 50 }
      return { b, score: 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.b)
}

/** "24,50", "€ 24.50" en 24.5 komen allemaal uit op 2450 cent. */
export function eurosToCents(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function categoryOf(raw: string | null): BikeCategory {
  const c = (raw ?? '').toLowerCase().trim()
  return (BIKE_CATEGORIES as string[]).includes(c) ? (c as BikeCategory) : 'overig'
}

export function methodOf(betaald: Regel['betaald']): PaymentMethod | null {
  return betaald === 'pin' ? 'pin' : betaald === 'contant' ? 'contant' : null
}

/**
 * De datum van een regel als ISO-tijdstip. Staat er in het schrift niets bij de
 * regel zelf, dan geldt de datum die de eigenaar bovenaan de bladzijde zette.
 */
export function dateOf(regel: Regel, pageDate: string): string {
  const raw = regel.datum && /^\d{4}-\d{2}-\d{2}$/.test(regel.datum) ? regel.datum : pageDate
  return `${raw}T12:00:00.000Z`
}

export interface RegelInvoer {
  klant: { first_name: string; last_name: string; phone: string; street: string | null; postcode: string | null; city: string | null }
  fiets: { brand: string; model: string | null; category: BikeCategory; frame_number: string | null; color: string | null }
  complaint: string
  datum: string
  lines: Array<{ description: string; price_cents: number }>
  paid_cents: number | null
  method: PaymentMethod | null
  notitie: string
}

/**
 * Van een gelezen regel naar precies wat db.createCustomer, db.createBike en
 * db.importWorkOrder nodig hebben. Ontbreekt er een bedrag bij een losse post,
 * dan wordt het verschil met het totaal er niet bij verzonnen: die post kost
 * dan nul en het totaal komt als aparte post terug.
 */
export function regelToInvoer(regel: Regel, pageDate: string): RegelInvoer {
  const lines = regel.werk.map((w) => ({
    description: w.omschrijving,
    price_cents: eurosToCents(w.bedrag_euro) ?? 0,
  }))
  const somRegels = lines.reduce((sum, l) => sum + l.price_cents, 0)
  const totaal = eurosToCents(regel.totaal_euro)
  if (totaal != null && totaal !== somRegels) {
    if (lines.length === 0) lines.push({ description: 'Werk uit het schrift', price_cents: totaal })
    else if (somRegels === 0) lines[0].price_cents = totaal
    else lines.push({ description: 'Verschil met totaal in het schrift', price_cents: totaal - somRegels })
  }

  return {
    klant: {
      first_name: (regel.klant.voornaam ?? '').trim(),
      last_name: (regel.klant.achternaam ?? '').trim(),
      phone: regel.klant.telefoon ? toE164NL(regel.klant.telefoon) : '',
      street: regel.klant.straat, postcode: regel.klant.postcode, city: regel.klant.plaats,
    },
    fiets: {
      brand: (regel.fiets.merk ?? '').trim(),
      model: regel.fiets.model,
      category: categoryOf(regel.fiets.categorie),
      frame_number: regel.fiets.framenummer,
      color: regel.fiets.kleur,
    },
    complaint: regel.werk.map((w) => w.omschrijving).filter(Boolean).join(', '),
    datum: dateOf(regel, pageDate),
    lines,
    paid_cents: totaal ?? (somRegels > 0 ? somRegels : null),
    method: methodOf(regel.betaald),
    notitie: regel.bron_tekst,
  }
}
