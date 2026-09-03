import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '../db'
import { BYTES_PER_ROW, papierDoorvoeren, rasterBlok, spiegelBits } from '../printer/escpos'
import { formatTagCode, isTagCode, nextWorkOrderNumber, normalizeTagCode } from '../code'
import { laborCents, money, parseMoneyToCents, toE164NL, vatOf } from '../format'
import { canTransition, primaryTransition } from '../workflow'
import { qrMatrix } from '../qr'

/**
 * Regel 14.9: na elk groot blok een doorloop — bon aanmaken, door alle
 * statussen halen, afsluiten met betaling en controleren dat de bedragen
 * tot op de cent kloppen.
 */

beforeEach(() => {
  localStorage.clear()
  db.resetDemoData()
})

describe('geld en formaat', () => {
  it('rekent in hele centen, nooit in floats', () => {
    expect(parseMoneyToCents('60')).toBe(6000)
    expect(parseMoneyToCents('60,50')).toBe(6050)
    expect(parseMoneyToCents('€ 1.234,50')).toBe(123450)
    expect(parseMoneyToCents('appel')).toBeNull()
  })

  it('toont bedragen in nl-NL, ook los van de schermtaal', () => {
    expect(money(123450)).toBe('€ 1.234,50')
    expect(money(0)).toBe('€ 0,00')
  })

  it('rekent arbeid om van minuten naar centen', () => {
    expect(laborCents(60, 5500)).toBe(5500)
    expect(laborCents(25, 5500)).toBe(2292)
  })

  it('normaliseert Nederlandse telefoonnummers naar E.164', () => {
    expect(toE164NL('06 12 34 56 78')).toBe('+31612345678')
    expect(toE164NL('0031612345678')).toBe('+31612345678')
    expect(toE164NL('+31612345678')).toBe('+31612345678')
  })
})

describe('labelcodes', () => {
  it('haalt de leesfouten uit een met de hand ingetypte code', () => {
    expect(normalizeTagCode('w7k-3qm')).toBe('W7K3QM')
    expect(normalizeTagCode('l0O1IU')).toBe('10011V')
    expect(isTagCode('W7K-3QM')).toBe(true)
    expect(isTagCode('W7K')).toBe(false)
  })

  it('drukt de code met een streepje af', () => {
    expect(formatTagCode('W7K3QM')).toBe('W7K-3QM')
  })

  it('telt werkbonnummers per jaar op', () => {
    const now = new Date('2026-03-01T10:00:00Z')
    expect(nextWorkOrderNumber(['W-2026-0412', 'W-2025-0999'], now)).toBe('W-2026-0413')
    expect(nextWorkOrderNumber([], now)).toBe('W-2026-0001')
  })
})

describe('werkstroom', () => {
  it('kent per status één hoofdknop', () => {
    expect(primaryTransition('wachtrij')?.to).toBe('in_werkplaats')
    expect(primaryTransition('in_werkplaats')?.to).toBe('gereed')
    expect(primaryTransition('gereed')?.to).toBe('opgehaald')
  })

  it('staat geen sprong toe van de wachtrij naar opgehaald', () => {
    expect(canTransition('wachtrij', 'opgehaald')).toBe(false)
  })
})

describe('volledige doorloop van een werkbon', () => {
  it('gaat van aanname tot betaald en de bedragen kloppen tot op de cent', () => {
    const settings = db.settings()
    const klant = db.createCustomer({ phone: toE164NL('0612345678'), last_name: 'de Vries', first_name: 'Jan' })
    const fiets = db.createBike({ customer_id: klant.id, brand: 'Gazelle', model: 'Orange C7' })

    const wo = db.createWorkOrder({
      customer_id: klant.id,
      bike_id: fiets.id,
      complaint: 'Lekke band achter',
      approved_limit_cents: 8000,
      estimated_minutes: 25,
      promised_at: null,
      lines: [{
        kind: 'arbeid', description: 'Lekke band achter (derailleur)', part_id: null, qty: 1,
        unit_price_ex_vat_cents: laborCents(25, settings.labor_rate_cents_per_hour),
        vat_rate: settings.vat_rate, discount_pct: 0, minutes: 25,
      }],
    })

    expect(wo.status).toBe('wachtrij')
    expect(wo.tag_code).toMatch(/^[0-9A-Z]{6}$/)
    expect(db.tag(wo.tag_code!)?.status).toBe('in_gebruik')
    // Aanname zet meteen twee printopdrachten klaar: label en afhaalbon.
    expect(db.pendingPrintJobs().length).toBe(2)

    db.addLine(wo.id, {
      kind: 'onderdeel', description: 'Binnenband 28 inch', part_id: null, qty: 1,
      unit_price_ex_vat_cents: 750, vat_rate: settings.vat_rate, discount_pct: 0, minutes: null,
    })

    const bon = db.workOrder(wo.id)!
    const regels = db.linesOf(wo.id)
    const ex = regels.reduce((s, l) => s + l.line_total_ex_vat_cents, 0)
    const btw = regels.reduce((s, l) => s + vatOf(l.line_total_ex_vat_cents, l.vat_rate), 0)

    expect(bon.total_ex_vat_cents).toBe(ex)
    expect(bon.total_vat_cents).toBe(btw)
    expect(bon.total_incl_vat_cents).toBe(ex + btw)
    expect(bon.total_incl_vat_cents).toBe(bon.total_ex_vat_cents + bon.total_vat_cents)

    db.setStatus(wo.id, 'in_werkplaats')
    db.setStatus(wo.id, 'gereed')
    db.recordPayment(wo.id, 'pin', bon.total_incl_vat_cents)
    db.setStatus(wo.id, 'opgehaald')

    const klaar = db.workOrder(wo.id)!
    expect(klaar.status).toBe('opgehaald')
    expect(klaar.ready_at).not.toBeNull()
    expect(klaar.picked_up_at).not.toBeNull()
    // Kaartje hangt niet meer aan de fiets en ligt weer in de doos.
    expect(db.tag(wo.tag_code!)?.status).toBe('vrij')

    const gebeurtenissen = db.eventsOf(wo.id).map((e) => e.event)
    expect(gebeurtenissen).toContain('created')
    expect(gebeurtenissen).toContain('paid')
    expect(gebeurtenissen.filter((e) => e === 'status_changed').length).toBe(3)
  })

  it('waarschuwt zodra het bedrag boven het akkoord van de klant komt', () => {
    const klant = db.createCustomer({ phone: '+31612345678', last_name: 'Bakker' })
    const fiets = db.createBike({ customer_id: klant.id, brand: 'Batavus' })
    const wo = db.createWorkOrder({
      customer_id: klant.id, bike_id: fiets.id, complaint: 'Grote beurt',
      approved_limit_cents: 5000, estimated_minutes: null, promised_at: null,
    })
    db.addLine(wo.id, {
      kind: 'arbeid', description: 'Grote onderhoudsbeurt', part_id: null, qty: 1,
      unit_price_ex_vat_cents: 9000, vat_rate: 0.21, discount_pct: 0, minutes: 90,
    })
    const bon = db.workOrder(wo.id)!
    expect(bon.total_incl_vat_cents).toBeGreaterThan(bon.approved_limit_cents!)
  })

  it('vindt de bon terug via telefoon, naam en labelcode', () => {
    const klant = db.createCustomer({ phone: '+31698765432', last_name: 'Dijkstra', first_name: 'Femke' })
    const fiets = db.createBike({ customer_id: klant.id, brand: 'Koga', frame_number: 'KO12345678' })
    const wo = db.createWorkOrder({
      customer_id: klant.id, bike_id: fiets.id, complaint: 'Remmen',
      approved_limit_cents: null, estimated_minutes: null, promised_at: null,
    })
    expect(db.search('98765432').some((h) => h.id === klant.id)).toBe(true)
    expect(db.search('Dijkstra').some((h) => h.id === klant.id)).toBe(true)
    expect(db.search('ko12345678').some((h) => h.id === fiets.id)).toBe(true)
    expect(db.search(wo.tag_code!).some((h) => h.id === wo.id)).toBe(true)
    expect(db.workOrderByTag(formatTagCode(wo.tag_code!))?.id).toBe(wo.id)
  })

  it('geeft de demodata waarop de eigenaar de demonstratie ziet', () => {
    const d = db.data()
    expect(d.customers.length).toBe(30)
    expect(d.bikes.filter((b) => b.customer_id != null).length).toBe(40)
    expect(d.stock_bikes.length).toBe(6)
    expect(d.parts.length).toBeGreaterThan(30)
    expect(d.work_orders.length).toBe(25)
    expect(d.customers.every((c) => c.phone.startsWith('+31'))).toBe(true)
    // Elke openstaande bon heeft een labelcode aan de fiets hangen.
    const open = d.work_orders.filter((w) => !['opgehaald', 'geannuleerd'].includes(w.status))
    expect(open.every((w) => w.tag_code != null)).toBe(true)
  })
})

describe('QR-code', () => {
  it('blijft dankzij hoofdletters op versie 2, met grotere modules', () => {
    // Sectie 8.3: hoofdletters komen in de alphanumeric-modus van QR terecht.
    // 25x25 modules leest onder een hoek en in het donker beter dan 29x29.
    expect(qrMatrix('HTTPS://FIETSWERK.NL/W/W7K3QM').size).toBe(25)
    expect(qrMatrix('https://fietswerk.nl/W/W7K3QM').size).toBe(29)
  })
})

describe('printerprotocol', () => {
  it('zet een rasterblok neer volgens GS v 0', () => {
    const rows = [new Uint8Array(BYTES_PER_ROW), new Uint8Array(BYTES_PER_ROW)]
    const blok = rasterBlok(rows)
    expect([...blok.slice(0, 8)]).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0x00, 2, 0x00])
    expect(blok.length).toBe(8 + 2 * BYTES_PER_ROW)
  })

  it('spiegelt de bits, want ESC/POS zet bit 7 links', () => {
    // Het label uit render.ts zet bit 0 links (sectie 9.2). Zonder spiegelen
    // komt elke regel omgekeerd uit de printer en is de QR onleesbaar.
    expect([...spiegelBits(new Uint8Array([0x01]))]).toEqual([0x80])
    expect([...spiegelBits(new Uint8Array([0x80]))]).toEqual([0x01])
    expect([...spiegelBits(new Uint8Array([0b1010_0000]))]).toEqual([0b0000_0101])
    expect([...spiegelBits(new Uint8Array([0xff, 0x00]))]).toEqual([0xff, 0x00])
  })

  it('voert papier door in stukjes van hoogstens 255 punten', () => {
    expect([...papierDoorvoeren(60)]).toEqual([0x1b, 0x4a, 60])
    expect([...papierDoorvoeren(300)]).toEqual([0x1b, 0x4a, 255, 0x1b, 0x4a, 45])
    expect(papierDoorvoeren(0).length).toBe(0)
  })
})
