import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '../db'
import { addWorkingDays, laborCents, toE164NL, vatOf } from '../format'

/**
 * Doorlopen van fase 1 (voorraad, bestellen, betalen, factureren) en fase 2
 * (occasions met echte marge, margeregeling, abonnementen, accu's, export).
 */

beforeEach(() => {
  localStorage.clear()
  db.resetDemoData()
  db.login('usr_owner', '1111')
})

function nieuweBon() {
  const klant = db.createCustomer({ phone: toE164NL('0612345678'), last_name: 'de Vries' })
  const fiets = db.createBike({ customer_id: klant.id, brand: 'Gazelle' })
  return db.createWorkOrder({
    customer_id: klant.id, bike_id: fiets.id, complaint: 'Lekke band achter',
    approved_limit_cents: 8000, estimated_minutes: 25, promised_at: null,
  })
}

describe('rollen en aanmelden', () => {
  it('laat alleen de juiste pincode door', () => {
    db.logout()
    expect(db.isLoggedIn()).toBe(false)
    expect(db.login('usr_monteur', '0000')).toBe(false)
    expect(db.login('usr_monteur', '2222')).toBe(true)
    expect(db.currentUser()?.role).toBe('monteur')
    // Omzet en rapporten zijn voor de eigenaar (sectie 7.7).
    expect(db.maySeeReports()).toBe(false)
    db.login('usr_owner', '1111')
    expect(db.maySeeReports()).toBe(true)
  })
})

describe('voorraad', () => {
  it('boekt een onderdeel van de voorraad af als het op de bon komt', () => {
    const wo = nieuweBon()
    const deel = db.parts()[0]
    const voor = deel.stock_qty

    db.addPartToWorkOrder(wo.id, deel.id, 2)

    expect(db.part(deel.id)!.stock_qty).toBe(voor - 2)
    const beweging = db.movementsOf(deel.id)[0]
    expect(beweging.delta).toBe(-2)
    expect(beweging.reason).toBe('reparatie')
    expect(beweging.work_order_id).toBe(wo.id)

    const bon = db.workOrder(wo.id)!
    const regels = db.linesOf(wo.id)
    const ex = regels.reduce((s, l) => s + l.line_total_ex_vat_cents, 0)
    expect(bon.total_ex_vat_cents).toBe(ex)
    expect(bon.total_incl_vat_cents).toBe(bon.total_ex_vat_cents + bon.total_vat_cents)
  })

  it('zet alles onder het minimum op een conceptbestelling, en niet twee keer', () => {
    const laag = db.partsBelowMin()
    expect(laag.length).toBeGreaterThan(0)

    const eerste = db.buildOrderList()
    expect(eerste.length).toBeGreaterThan(0)
    const regels = eerste.flatMap((po) => db.poLinesOf(po.id))
    expect(regels.length).toBeGreaterThan(0)
    // Elke bestelling gaat naar één leverancier.
    for (const po of eerste) {
      const leveranciers = new Set(
        db.poLinesOf(po.id).map((l) => db.part(l.part_id ?? '')?.supplier_id),
      )
      expect(leveranciers.size).toBe(1)
    }

    const tweede = db.buildOrderList()
    expect(tweede.length).toBe(0)
  })
})

describe('onderdeel bestellen en binnenkomst', () => {
  it('houdt de bon vast tot het onderdeel er is en geeft hem dan vrij', () => {
    const wo = nieuweBon()
    const leverancier = db.suppliers()[0]
    const deel = db.parts()[3]

    db.orderPartForWorkOrder(wo.id, deel.name, leverancier.id, deel.id)

    expect(db.workOrder(wo.id)!.status).toBe('wacht_op_onderdeel')
    const open = db.openPoLinesForWorkOrder(wo.id)
    expect(open.length).toBe(1)

    const voorraadVoor = db.part(deel.id)!.stock_qty
    const vrijgegeven = db.receivePoLine(open[0].id, 1)

    expect(vrijgegeven.map((w) => w.id)).toContain(wo.id)
    expect(db.part(deel.id)!.stock_qty).toBe(voorraadVoor + 1)
    expect(db.openPoLinesForWorkOrder(wo.id).length).toBe(0)
    expect(db.eventsOf(wo.id).map((e) => e.event)).toContain('part_arrived')
  })

  it('boekt een gescande streepjescode bij op de juiste bestelregel', () => {
    const wo = nieuweBon()
    const bezet = new Set(db.data().po_lines.map((l) => l.part_id))
    const deel = db.parts().find((p) => !bezet.has(p.id))!
    db.orderPartForWorkOrder(wo.id, deel.name, db.suppliers()[0].id, deel.id)

    const resultaat = db.receiveByEan(deel.ean!)

    expect(resultaat.part?.id).toBe(deel.id)
    expect(resultaat.resumable.map((w) => w.id)).toContain(wo.id)
    expect(db.receiveByEan('0000000000000').part).toBeNull()
  })
})

describe('afrekenen en factuur', () => {
  it('legt de betaling vast en maakt één factuur die tot op de cent klopt', () => {
    const wo = nieuweBon()
    db.addPartToWorkOrder(wo.id, db.parts()[0].id, 1)
    db.addLine(wo.id, {
      kind: 'arbeid', description: 'Lekke band achter (derailleur)', part_id: null, qty: 1,
      unit_price_ex_vat_cents: laborCents(25, db.settings().labor_rate_cents_per_hour),
      vat_rate: db.settings().vat_rate, discount_pct: 0, minutes: 25,
    })
    const bon = db.workOrder(wo.id)!

    db.setStatus(wo.id, 'in_werkplaats')
    db.setStatus(wo.id, 'gereed')
    db.recordPayment(wo.id, 'pin', bon.total_incl_vat_cents)
    db.setStatus(wo.id, 'opgehaald')

    const betalingen = db.paymentsOf(wo.id)
    expect(betalingen.length).toBe(1)
    expect(betalingen[0].amount_cents).toBe(bon.total_incl_vat_cents)

    const factuur = db.invoiceOfWorkOrder(wo.id)!
    expect(factuur.number).toMatch(/^F-\d{4}-\d{4}$/)
    expect(factuur.vat_scheme).toBe('standard')
    expect(factuur.total_ex_vat_cents + factuur.total_vat_cents).toBe(factuur.total_incl_vat_cents)
    const btwPerRegel = db.linesOf(wo.id)
      .reduce((s, l) => s + vatOf(l.line_total_ex_vat_cents, l.vat_rate), 0)
    expect(factuur.total_vat_cents).toBe(btwPerRegel)

    // Nog een keer afrekenen mag geen tweede factuurnummer opleveren.
    expect(db.createInvoiceForWorkOrder(wo.id)!.id).toBe(factuur.id)
  })
})

describe('berichten aan de klant', () => {
  it('schrijft het sjabloon in het Nederlands en legt het bericht vast', () => {
    const wo = nieuweBon()
    const body = db.renderTemplate('gereed', {
      naam: 'Jan', fiets: 'Gazelle Orange', winkel: 'Fietswerk', bedrag: '€ 45,00', link: 'https://x/s/1',
    })
    expect(body).toContain('Goedendag Jan')
    expect(body).toContain('klaar')

    db.logNotification('whatsapp', 'gereed', body, wo.id, wo.customer_id)
    expect(db.notificationsOf(wo.id).length).toBe(1)
    expect(db.eventsOf(wo.id).map((e) => e.event)).toContain('customer_contacted')
  })
})

describe('occasions', () => {
  it('blokkeert de verkoop tot 5 werkdagen na de inkoop', () => {
    const stb = db.createStockBike({
      brand: 'Gazelle', model: 'Orange', category: 'stadsfiets',
      frame_number: 'GZ12345678', color: 'zwart', source: 'particulier',
      seller_customer_id: db.data().customers[0].id, purchase_price_cents: 20000,
      id_checked: true, id_check_note: 'Rijbewijs', stopheling_checked: true,
      vat_scheme: 'margin', asking_price_cents: 42500,
    })

    expect(db.mayBeSold(stb)).toBe(false)
    expect(stb.sellable_from).toBe(addWorkingDays(stb.purchase_date, 5))
    expect(db.sellStockBike(stb.id, 42500, null, 'pin')).toBeUndefined()
    expect(db.stockBike(stb.id)!.status).toBe('binnen')
  })

  it('rekent de echte marge inclusief de uren die erin zitten', () => {
    const stb = db.stockBikes().find((s) => s.status === 'te_koop')!
    db.updateStockBike(stb.id, { refurb_parts_cents: 5000, refurb_minutes: 120 })
    const marge = db.occasionMargin(db.stockBike(stb.id)!)

    const uurkosten = db.settings().labor_cost_cents_per_hour
    expect(marge.labor_cents).toBe(Math.round((120 / 60) * uurkosten))
    expect(marge.invested_cents).toBe(marge.purchase_cents + 5000 + marge.labor_cents)
    expect(marge.margin_cents).toBe(marge.price_cents - marge.invested_cents)
    // Btw over de marge: (verkoop - inkoop) x 21/121 (sectie 4.2).
    const bruto = marge.price_cents - marge.purchase_cents
    expect(marge.margin_vat_cents).toBe(Math.round((bruto * 21) / 121))
    expect(marge.net_margin_cents).toBe(marge.margin_cents - marge.margin_vat_cents)
  })

  it('rekent het voorbeeld uit de specificatie na: € 200 inkoop, € 300 verkoop', () => {
    const stb = db.stockBikes()[0]
    db.updateStockBike(stb.id, {
      purchase_price_cents: 20000, asking_price_cents: 30000,
      refurb_parts_cents: 0, refurb_minutes: 0,
    })
    expect(db.occasionMargin(db.stockBike(stb.id)!).margin_vat_cents).toBe(1736)
  })

  it('vraagt een inkoopverklaring vanaf € 500 zonder btw', () => {
    const goedkoop = { ...db.stockBikes()[0], purchase_price_cents: 49900, vat_scheme: 'margin' as const }
    const duur = { ...goedkoop, purchase_price_cents: 50000 }
    expect(db.needsInkoopverklaring(goedkoop)).toBe(false)
    expect(db.needsInkoopverklaring(duur)).toBe(true)
  })

  it('zet op een margefactuur geen btw apart', () => {
    const stb = db.stockBikes().find((s) => s.status === 'te_koop')!
    const factuur = db.sellStockBike(stb.id, 29500, db.data().customers[1].id, 'pin')!
    expect(factuur.vat_scheme).toBe('margin')
    expect(factuur.total_vat_cents).toBe(0)
    expect(factuur.total_incl_vat_cents).toBe(29500)
    expect(db.stockBike(stb.id)!.status).toBe('verkocht')
    // De fiets krijgt een eigenaar zodra hij verkocht is.
    expect(db.bike(stb.bike_id)!.customer_id).toBe(db.data().customers[1].id)
  })
})

describe('abonnementen, accu\'s en niet-opgehaalde fietsen', () => {
  it('schuift de volgende beurt op met het interval', () => {
    const contract = db.serviceContracts()[0]
    db.markServiceDone(contract.id)
    const na = db.serviceContract(contract.id)!
    const maanden = (new Date(na.next_due_at).getFullYear() - new Date().getFullYear()) * 12
      + new Date(na.next_due_at).getMonth() - new Date().getMonth()
    expect(maanden).toBe(contract.interval_months)
    expect(na.last_service_at).not.toBeNull()
  })

  it('houdt een logboek bij van de accu', () => {
    const wo = nieuweBon()
    db.logBattery(wo.id, 'aangenomen')
    db.logBattery(wo.id, 'op_lader', 'brandveilige kast')
    const logboek = db.batteryLogsOf(wo.id)
    expect(logboek.map((l) => l.event)).toEqual(['aangenomen', 'op_lader'])
    expect(db.batteriesOnCharger().some((l) => l.work_order_id === wo.id)).toBe(true)
  })

  it('verdeelt niet-opgehaalde fietsen over 14, 30, 60 en 90 dagen', () => {
    const emmers = db.uncollectedBuckets()
    expect(emmers.map((b) => b.days)).toEqual([14, 30, 60, 90])
    // Een fiets valt in precies één groep.
    const ids = emmers.flatMap((b) => b.orders.map((o) => o.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('legt de herinneringsketen vast als bewijs', () => {
    const wo = db.data().work_orders.find((w) => w.status === 'gereed')!
    db.addReminder(wo.id, 'herinnering_1', 'whatsapp')
    db.addReminder(wo.id, 'aangetekende_brief', 'brief')
    expect(db.remindersOf(wo.id).map((r) => r.step)).toContain('aangetekende_brief')
    expect(db.eventsOf(wo.id).map((e) => e.event)).toContain('customer_contacted')
  })
})

describe('export naar de boekhouding', () => {
  it('levert een CSV met Nederlandse bedragen en datums', () => {
    const van = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const tot = new Date().toISOString()
    const csv = db.exportInvoicesCsv('moneybird', van, tot)
    const regels = csv.split('\r\n')

    expect(regels[0]).toContain('factuurnummer')
    expect(regels.length).toBeGreaterThan(1)
    const velden = regels[1].split(';')
    expect(velden[1]).toMatch(/^\d{2}-\d{2}-\d{4}$/)
    expect(velden[3]).toMatch(/^\d+,\d{2}$/)
  })

  it('rekent de btw over de marge per periode uit', () => {
    const stb = db.stockBikes().find((s) => s.status === 'te_koop')!
    db.sellStockBike(stb.id, stb.purchase_price_cents + 10000, null, 'pin')
    const van = new Date(Date.now() - 86_400_000).toISOString()
    const tot = new Date(Date.now() + 86_400_000).toISOString()
    const rapport = db.marginVatReport(van, tot)
    expect(rapport.count).toBeGreaterThan(0)
    expect(rapport.vat_cents).toBe(Math.round((rapport.gross_margin_cents * 21) / 121))
  })
})

describe('offline werken', () => {
  it('houdt wijzigingen vast tot het internet terug is', () => {
    const wo = nieuweBon()
    // Doen alsof de wifi in de werkplaats wegvalt.
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false }, writable: true, configurable: true,
    })
    db.setStatus(wo.id, 'in_werkplaats')
    expect(db.pendingOutbox().length).toBeGreaterThan(0)

    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true }, writable: true, configurable: true,
    })
    db.flushOutbox()
    expect(db.pendingOutbox().length).toBe(0)
  })
})
