import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '../db'
import type { Regel } from '../schrift/ocr'
import {
  categoryOf, dateOf, editDistance, eurosToCents, findBikeCandidates,
  findCandidates, methodOf, nameKey, namesLookAlike, phoneKey, regelToInvoer,
} from '../schrift/match'

/**
 * Het schrift overzetten. De eigenaar leest elke regel na, dus fouten hier zijn
 * niet fataal — behalve twee: een dubbele klant aanmaken van iemand die er al
 * staat, en oud geld dat in de omzet van deze week terechtkomt. Die twee staan
 * hieronder vast.
 */

function regel(over: Partial<Regel> = {}): Regel {
  return {
    bron_tekst: 'J. de Vries 06-12345678 Gazelle remblokken 24,50',
    zekerheid: 'hoog',
    datum: null,
    klant: {
      voornaam: 'Jan', achternaam: 'de Vries', telefoon: '06-12345678',
      straat: null, postcode: null, plaats: null,
    },
    fiets: { merk: 'Gazelle', model: null, categorie: 'stadsfiets', framenummer: null, kleur: null },
    werk: [{ omschrijving: 'Remblokken vervangen', bedrag_euro: 24.5 }],
    totaal_euro: 24.5,
    betaald: 'contant',
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
  db.resetDemoData()
  db.login('usr_owner', '1111')
})

describe('lezen en omrekenen', () => {
  it('maakt van elk telefoonformaat dezelfde sleutel', () => {
    expect(phoneKey('06-12345678')).toBe(phoneKey('0612345678'))
    expect(phoneKey('06 12 34 56 78')).toBe(phoneKey('+31612345678'))
    expect(phoneKey('123')).toBe('') // te kort om iets mee te matchen
  })

  it('laat tussenvoegsels en hoofdletters buiten de vergelijking', () => {
    expect(nameKey('de Vries')).toBe(nameKey('deVries'))
    expect(nameKey('van der Berg')).toBe('berg')
    expect(nameKey('Jansén')).toBe('jansen')
  })

  it('ziet één tikfout als dezelfde naam, maar twee namen niet als dezelfde', () => {
    expect(editDistance('vries', 'vriens')).toBe(1)
    expect(namesLookAlike('vriesema', 'vriensema')).toBe(true)
    expect(namesLookAlike('jansen', 'hansen')).toBe(false) // andere familie
    expect(namesLookAlike('vries', 'devries')).toBe(false) // nameKey lost dit al op
  })

  it('rekent bedragen uit het schrift om naar hele centen', () => {
    expect(eurosToCents(24.5)).toBe(2450)
    expect(eurosToCents(0.1)).toBe(10)
    expect(eurosToCents(null)).toBeNull()
  })

  it('houdt alleen echte fietssoorten over', () => {
    expect(categoryOf('ebike')).toBe('ebike')
    expect(categoryOf('elektrische fiets')).toBe('overig')
    expect(categoryOf(null)).toBe('overig')
  })

  it('boekt onbekende betaling als geen betaling', () => {
    expect(methodOf('pin')).toBe('pin')
    expect(methodOf('onbekend')).toBeNull()
  })
})

describe('datum van een regel', () => {
  it('neemt de datum van de bladzijde als de regel er zelf geen heeft', () => {
    expect(dateOf(regel({ datum: null }), '2024-03-12')).toContain('2024-03-12')
  })

  it('laat een eigen datum in de regel voorgaan', () => {
    expect(dateOf(regel({ datum: '2023-11-02' }), '2024-03-12')).toContain('2023-11-02')
  })

  it('negeert een datum die geen datum is', () => {
    expect(dateOf(regel({ datum: '12-3' }), '2024-03-12')).toContain('2024-03-12')
  })
})

describe('wie lijkt op wie', () => {
  it('vindt een bestaande klant terug via zijn telefoonnummer', () => {
    const bestaand = db.data().customers[0]
    const hits = findCandidates(
      regel({ klant: { voornaam: null, achternaam: null, telefoon: bestaand.phone, straat: null, postcode: null, plaats: null } }),
      db.data().customers, db.data().bikes,
    )
    expect(hits[0].customer.id).toBe(bestaand.id)
    expect(hits[0].reden).toBe('telefoon')
  })

  it('vindt hem ook als het schrift een ander telefoonformaat gebruikt', () => {
    const bestaand = db.data().customers[0]
    const los = bestaand.phone.replace('+31', '0')
    const hits = findCandidates(
      regel({ klant: { voornaam: null, achternaam: null, telefoon: los, straat: null, postcode: null, plaats: null } }),
      db.data().customers, db.data().bikes,
    )
    expect(hits[0].customer.id).toBe(bestaand.id)
  })

  it('geeft niemand terug voor een klant die er echt niet is', () => {
    const hits = findCandidates(
      regel({ klant: { voornaam: 'Xander', achternaam: 'Kwispedoor', telefoon: '0600000001', straat: null, postcode: null, plaats: null } }),
      db.data().customers, db.data().bikes,
    )
    expect(hits).toHaveLength(0)
  })

  it('kiest nooit zelf: het blijft een lijst om uit te wijzen', () => {
    const bestaand = db.data().customers[0]
    const hits = findCandidates(
      regel({ klant: { voornaam: bestaand.first_name, achternaam: bestaand.last_name, telefoon: null, straat: null, postcode: null, plaats: null } }),
      db.data().customers, db.data().bikes,
    )
    expect(hits.length).toBeLessThanOrEqual(5)
    expect(Array.isArray(hits)).toBe(true)
  })

  it('herkent de fiets van de klant aan het framenummer', () => {
    const fiets = db.data().bikes.find((b) => b.frame_number && b.customer_id)!
    const hits = findBikeCandidates(
      regel({ fiets: { merk: null, model: null, categorie: null, framenummer: fiets.frame_number, kleur: null } }),
      db.data().bikes,
    )
    expect(hits[0].id).toBe(fiets.id)
  })
})

describe('van gelezen regel naar invoer', () => {
  it('zet de bron uit het schrift in de notitie, zodat het naspeurbaar blijft', () => {
    const inv = regelToInvoer(regel(), '2024-03-12')
    expect(inv.notitie).toContain('Gazelle')
    expect(inv.lines).toEqual([{ description: 'Remblokken vervangen', price_cents: 2450 }])
    expect(inv.paid_cents).toBe(2450)
    expect(inv.method).toBe('contant')
  })

  it('vult een ontbrekend bedrag bij een post aan uit het totaal', () => {
    const inv = regelToInvoer(regel({
      werk: [{ omschrijving: 'Grote beurt', bedrag_euro: null }],
      totaal_euro: 89,
    }), '2024-03-12')
    expect(inv.lines[0].price_cents).toBe(8900)
    expect(inv.paid_cents).toBe(8900)
  })

  it('verzint niets als er alleen een totaal staat', () => {
    const inv = regelToInvoer(regel({ werk: [], totaal_euro: 45 }), '2024-03-12')
    expect(inv.lines).toHaveLength(1)
    expect(inv.lines[0].price_cents).toBe(4500)
  })

  it('laat een regel zonder geld gewoon zonder geld', () => {
    const inv = regelToInvoer(regel({
      werk: [{ omschrijving: 'Band geplakt', bedrag_euro: null }],
      totaal_euro: null, betaald: 'onbekend',
    }), '2024-03-12')
    expect(inv.paid_cents).toBeNull()
    expect(inv.method).toBeNull()
  })
})

describe('een klus uit het schrift in de database', () => {
  function importeer(datum = '2024-03-12T12:00:00.000Z') {
    const c = db.createCustomer({ phone: '+31600000099', last_name: 'Schrift', first_name: 'Test' })
    const b = db.createBike({ customer_id: c.id, brand: 'Gazelle' })
    return db.importWorkOrder({
      customer_id: c.id, bike_id: b.id, complaint: 'Remblokken vervangen',
      datum, lines: [{ description: 'Remblokken vervangen', price_cents: 2450 }],
      paid_cents: 2450, method: 'contant', notitie: 'uit het schrift',
    })
  }

  it('hangt geen bierkaartje aan een fiets van vorig jaar', () => {
    const wo = importeer()
    expect(wo.tag_code).toBeNull()
    expect(db.data().tags.some((t) => t.work_order_id === wo.id)).toBe(false)
  })

  it('stuurt niets naar de bonprinter', () => {
    const voor = db.pendingPrintJobs().length
    importeer()
    expect(db.pendingPrintJobs().length).toBe(voor)
  })

  it('staat meteen als opgehaald, op de datum uit het schrift', () => {
    const wo = importeer('2024-03-12T12:00:00.000Z')
    expect(wo.status).toBe('opgehaald')
    expect(wo.intake_at).toBe('2024-03-12T12:00:00.000Z')
    expect(wo.picked_up_at).toBe('2024-03-12T12:00:00.000Z')
    expect(wo.ready_at).toBeNull() // anders vervuilt het de doorlooptijd
    expect(wo.imported_at).not.toBeNull()
  })

  it('maakt geen factuur, dus de boekhouding blijft schoon', () => {
    const voor = db.data().invoices.length
    importeer()
    expect(db.data().invoices.length).toBe(voor)
    const csv = db.exportInvoicesCsv('moneybird', '2024-01-01', '2024-12-31')
    expect(csv).not.toContain('Schrift')
  })

  it('boekt de betaling wel, op de dag uit het schrift', () => {
    const wo = importeer()
    const betalingen = db.paymentsOf(wo.id)
    expect(betalingen).toHaveLength(1)
    expect(betalingen[0].amount_cents).toBe(2450)
    expect(betalingen[0].at).toBe('2024-03-12T12:00:00.000Z')
  })

  it('telt het totaal van de bon gewoon door', () => {
    const wo = db.workOrder(importeer().id)!
    expect(wo.total_ex_vat_cents).toBe(2450)
    expect(wo.total_incl_vat_cents).toBeGreaterThan(2450)
  })
})

describe('backup en migratie', () => {
  it('zet een bewaarde backup terug', () => {
    const c = db.createCustomer({ phone: '+31600000098', last_name: 'Backup' })
    const tekst = db.exportDatabaseJson()
    db.resetDemoData()
    expect(db.customer(c.id)).toBeUndefined()
    expect(db.importDatabaseJson(tekst)).toBe(true)
    expect(db.customer(c.id)?.last_name).toBe('Backup')
  })

  it('weigert tekst die geen database is, in plaats van alles te wissen', () => {
    const aantal = db.data().customers.length
    expect(db.importDatabaseJson('geen json')).toBe(false)
    expect(db.importDatabaseJson('{"version":4}')).toBe(false)
    expect(db.data().customers.length).toBe(aantal)
  })

  it('werkt een opslag van versie 3 bij in plaats van hem weg te gooien', () => {
    const oud = JSON.parse(db.exportDatabaseJson())
    oud.version = 3
    for (const wo of oud.work_orders) delete wo.imported_at
    expect(db.importDatabaseJson(JSON.stringify(oud))).toBe(true)
    expect(db.data().customers.length).toBeGreaterThan(0)
    expect(db.data().work_orders.every((w) => w.imported_at === null)).toBe(true)
  })
})
