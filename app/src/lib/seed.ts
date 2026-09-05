import type {
  BatteryLog, Bike, BikeCategory, Customer, Database, Invoice, Notification, Part,
  Payment, PurchaseOrder, PurchaseOrderLine, Reminder, ServiceContract, StockBike,
  StockBikeStatus, StockMovement, Supplier, Tag, WorkOrder, WorkOrderEvent,
  WorkOrderLine, WorkOrderStatus,
  Absence, Availability, Shift, TimeEntry,
} from './types'
import { JOB_TEMPLATES } from './jobs'
import { addWorkingDays, daysSince, laborCents, vatOf } from './format'
import { addDays, dayKey, mondayOf } from './rooster'

/**
 * Demodata voor fase 0 (sectie 13 + regel 14.8): Nederlandse namen, adressen in
 * Groningen, merken die de eigenaar herkent. Op deze data wordt gedemonstreerd,
 * dus Engelse Johns zouden het gesprek meteen bederven.
 */

// Vaste pseudo-random generator: elke demo ziet er hetzelfde uit.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const FIRST = [
  'Jan', 'Piet', 'Anneke', 'Henk', 'Marieke', 'Willem', 'Truus', 'Bert', 'Ingrid',
  'Gerrit', 'Sanne', 'Klaas', 'Wietske', 'Dirk', 'Femke', 'Harm', 'Els', 'Jaap',
  'Roelof', 'Hilde', 'Bram', 'Nienke', 'Tineke', 'Sjoerd', 'Lieke', 'Erik',
  'Margriet', 'Douwe', 'Karin', 'Freek',
]
const LAST = [
  'de Vries', 'Jansen', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer',
  'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker',
  'Brouwer', 'de Wit', 'Dijkstra', 'Postma', 'Wijnstra', 'Huisman', 'Kuipers',
  'Veenstra', 'Hoekstra', 'Wolters', 'Bruins', 'Nijhof', 'Timmerman', 'Boersma',
]
const STREETS = [
  'Oosterstraat', 'Zwanestraat', 'Nieuwe Ebbingestraat', 'Korreweg', 'Peizerweg',
  'Helperzoom', 'Verlengde Hereweg', 'Bedumerweg', 'Damsterdiep', 'Paterswoldseweg',
  'Zuiderdiep', 'Hoornsediep', 'Friesestraatweg', 'Vismarkt', 'Grote Markt',
]
const CITIES: Array<[string, string]> = [
  ['9711', 'Groningen'], ['9712', 'Groningen'], ['9713', 'Groningen'],
  ['9714', 'Groningen'], ['9721', 'Groningen'], ['9722', 'Groningen'],
  ['9727', 'Groningen'], ['9781', 'Bedum'], ['9751', 'Haren'], ['9791', 'Ten Boer'],
]
const BRANDS: Array<[string, string[], BikeCategory[]]> = [
  ['Gazelle', ['Orange C7', 'Paris C7', 'Ultimate C380', 'Grenoble C7 HMB', 'Esprit'], ['stadsfiets', 'ebike']],
  ['Batavus', ['Fonk', 'Dinsdag', 'Quip', 'Altura E-go', 'Finez'], ['stadsfiets', 'ebike']],
  ['Cortina', ['U4', 'Common', 'Roots', 'E-U4'], ['stadsfiets', 'ebike']],
  ['Sparta', ['a-Shine', 'c-Grid', 'Pick-up', 'M8b'], ['ebike', 'stadsfiets']],
  ['Koga', ['F3 4.0', 'Miyata Freedom', 'E-Nova'], ['racefiets', 'ebike']],
  ['Giant', ['Escape 2', 'Talon 3', 'Explore E+'], ['mtb', 'racefiets', 'ebike']],
  ['Trek', ['FX 2', 'Marlin 5', 'Verve+ 2'], ['mtb', 'racefiets', 'ebike']],
  ['Union', ['Comfort', 'Fresh'], ['stadsfiets', 'kinderfiets']],
  ['Babboe', ['City', 'Curve-E'], ['bakfiets']],
  ['Brompton', ['C Line'], ['vouwfiets']],
]
const COLORS = ['zwart', 'donkerblauw', 'grijs', 'wit', 'groen', 'bordeaux', 'zilver', 'oranje']
const MOTORS = ['Bosch Performance Line', 'Bosch Active Line Plus', 'Shimano Steps E6100', 'Bafang M400', 'Yamaha PW-S2']
const RACKS = ['Rek A1', 'Rek A2', 'Rek A3', 'Rek B1', 'Rek B2', 'Rek B3', 'Rek C1', 'Rek C2', 'Buiten 1', 'Buiten 2']
const LOCKS = ['AXA', 'Abus', 'Trelock']
const ACCESSORIES = ['fietstas', 'kinderzitje', 'kratje', 'buggy-koppeling', 'regenhoes']
const FREE_COMPLAINTS = [
  'Fiets maakt een tikkend geluid bij het trappen.',
  'Ketting loopt eraf in de laagste versnelling.',
  'Achterlicht doet het soms wel en soms niet.',
  'Trappers draaien zwaar sinds de winter.',
  'Voorrem piept hard bij nat weer.',
  'Accu haalt nog maar de helft van de afstand.',
  'Zadel zakt langzaam naar beneden tijdens het fietsen.',
]
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const VAT = 0.21
const LABOR_RATE = 5500 // centen per uur, EXCLUSIEF btw (~ € 66,55 incl.) [CONTROLEREN]
// Wat een werkplaatsuur de winkel zelf kost (loon + werkplaats). Zonder dit
// getal lijkt elke occasion winstgevend (sectie 3.3). [CONTROLEREN]
const LABOR_COST = 2800

/** Statusverdeling die lijkt op een echte maandagochtend in de werkplaats. */
const STATUS_PLAN: WorkOrderStatus[] = [
  'wachtrij', 'wachtrij', 'wachtrij', 'wachtrij', 'wachtrij', 'wachtrij',
  'in_werkplaats', 'in_werkplaats', 'in_werkplaats',
  'wacht_op_akkoord', 'wacht_op_akkoord',
  'wacht_op_onderdeel', 'wacht_op_onderdeel', 'wacht_op_onderdeel',
  'gereed', 'gereed', 'gereed', 'gereed',
  'opgehaald', 'opgehaald', 'opgehaald', 'opgehaald', 'opgehaald',
  'geannuleerd', 'wachtrij',
]

export function buildSeed(): Database {
  const rand = rng(20260901)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const now = Date.now()
  const daysAgo = (d: number, hourSpread = 8) =>
    new Date(now - d * 86_400_000 - int(0, hourSpread) * 3_600_000).toISOString()

  const customers: Customer[] = []
  for (let i = 0; i < 30; i++) {
    const [postcodeStart, city] = CITIES[i % CITIES.length]
    const first = FIRST[i % FIRST.length]
    const last = LAST[(i * 7) % LAST.length]
    const zakelijk = i === 4 || i === 17
    customers.push({
      id: `cus_${String(i + 1).padStart(3, '0')}`,
      type: zakelijk ? 'zakelijk' : 'particulier',
      first_name: first, last_name: last,
      company: zakelijk ? (i === 4 ? 'Bezorgdienst Stad BV' : 'Zorggroep Helpman') : null,
      phone: `+316${String(int(10_000_000, 49_999_999))}`,
      email: `${first.toLowerCase()}.${last.replace(/[^a-z]/gi, '').toLowerCase()}@example.nl`,
      street: `${pick(STREETS)} ${int(1, 180)}`,
      postcode: `${postcodeStart} ${CROCKFORD[int(10, 31)]}${CROCKFORD[int(10, 31)]}`,
      city,
      notes: null, marketing_consent: rand() > 0.6,
      created_at: daysAgo(int(30, 900)), deleted_at: null,
    })
  }

  const bikes: Bike[] = []
  for (let i = 0; i < 40; i++) {
    const owner = customers[i % customers.length]
    const [brand, models, cats] = BRANDS[i % BRANDS.length]
    const category = cats[i % cats.length]
    const isEbike = category === 'ebike'
    bikes.push({
      id: `bike_${String(i + 1).padStart(3, '0')}`,
      customer_id: owner.id,
      brand, model: models[i % models.length], category,
      frame_number: `${brand.slice(0, 2).toUpperCase()}${int(100000, 999999)}${int(10, 99)}`,
      color: pick(COLORS), model_year: int(2014, 2026),
      gears_type: isEbike ? 'naaf' : (rand() > 0.5 ? 'derailleur' : 'naaf'),
      brake_type: rand() > 0.5 ? 'velgrem' : 'rollerbrake',
      is_ebike: isEbike,
      motor_system: isEbike ? pick(MOTORS) : null,
      battery_serial: isEbike ? `ACCU-${int(100000, 999999)}` : null,
      battery_wh: isEbike ? pick([400, 500, 545, 625, 750]) : null,
      battery_cycles: isEbike ? int(40, 620) : null,
      display_type: isEbike ? pick(['Bosch Intuvia', 'Bosch Purion', 'Shimano SC-E6100']) : null,
      firmware_version: null, last_diagnose_at: null,
      lock_brand: pick(LOCKS),
      key_numbers: rand() > 0.4 ? [`${pick(LOCKS).slice(0, 1)}${int(100000, 999999)}`] : [],
      accessories: rand() > 0.6 ? [pick(ACCESSORIES)] : [],
      photos: [], purchased_here_at: rand() > 0.7 ? daysAgo(int(60, 1200)) : null,
      warranty_until: null, notes: null,
    })
  }

  const work_orders: WorkOrder[] = []
  const work_order_lines: WorkOrderLine[] = []
  const work_order_events: WorkOrderEvent[] = []
  const tags: Tag[] = []

  const usedCodes = new Set<string>()
  const tagCode = () => {
    let c = ''
    do {
      c = Array.from({ length: 6 }, () => CROCKFORD[int(0, 31)]).join('')
    } while (usedCodes.has(c))
    usedCodes.add(c)
    return c
  }
  const token = () => Array.from({ length: 21 }, () => TOKEN_ALPHABET[int(0, 61)]).join('')

  STATUS_PLAN.forEach((status, i) => {
    const bikeRow = bikes[(i * 3) % bikes.length]
    const cust = customers.find((c) => c.id === bikeRow.customer_id)!
    const closed = status === 'opgehaald' || status === 'geannuleerd'
    const ageDays = closed ? int(4, 40) : (i % 7 === 0 ? int(9, 26) : int(0, 8))
    const intake = daysAgo(ageDays)
    const woId = `wo_${String(i + 1).padStart(3, '0')}`

    // Werkregels uit de normtijdentabel, plus soms een onderdeel.
    const jobs = [JOB_TEMPLATES[(i * 5) % JOB_TEMPLATES.length]]
    if (rand() > 0.55) jobs.push(JOB_TEMPLATES[(i * 11 + 3) % JOB_TEMPLATES.length])
    const uniqueJobs = jobs.filter((j, idx) => jobs.findIndex((x) => x.key === j.key) === idx)

    let ex = 0
    for (const job of uniqueJobs) {
      const price = laborCents(job.minutes, LABOR_RATE)
      work_order_lines.push({
        id: `wol_${woId}_a${job.key}`, work_order_id: woId, kind: 'arbeid',
        description: job.nl, part_id: null, qty: 1,
        unit_price_ex_vat_cents: price, vat_rate: VAT, discount_pct: 0,
        line_total_ex_vat_cents: price, minutes: job.minutes,
      })
      ex += price
      if (job.partHint && rand() > 0.35) {
        work_order_lines.push({
          id: `wol_${woId}_p${job.key}`, work_order_id: woId, kind: 'onderdeel',
          description: job.partHint.nl, part_id: null, qty: 1,
          unit_price_ex_vat_cents: job.partHint.cents, vat_rate: VAT, discount_pct: 0,
          line_total_ex_vat_cents: job.partHint.cents, minutes: null,
        })
        ex += job.partHint.cents
      }
    }
    const vat = work_order_lines
      .filter((l) => l.work_order_id === woId)
      .reduce((sum, l) => sum + vatOf(l.line_total_ex_vat_cents, l.vat_rate), 0)

    const minutes = uniqueJobs.reduce((m, j) => m + j.minutes, 0)
    const complaint = rand() > 0.6
      ? pick(FREE_COMPLAINTS)
      : uniqueJobs.map((j) => j.nl).join(', ')

    const limitOptions = [6000, 8000, 10000, 15000, 20000]
    const wo: WorkOrder = {
      id: woId, number: `W-2026-${String(400 + i).padStart(4, '0')}`,
      bike_id: bikeRow.id, customer_id: cust.id, status,
      complaint,
      diagnosis: ['in_werkplaats', 'gereed', 'opgehaald'].includes(status)
        ? 'Nagekeken en afgesteld, klacht verholpen.' : null,
      approved_limit_cents: pick(limitOptions),
      quote_cents: status === 'wacht_op_akkoord' ? ex + vat : null,
      quote_sent_at: status === 'wacht_op_akkoord' ? daysAgo(Math.max(0, ageDays - 1)) : null,
      approved_at: ['in_werkplaats', 'gereed', 'opgehaald'].includes(status)
        ? daysAgo(Math.max(0, ageDays - 1)) : null,
      approved_by_channel: null, mechanic_id: null,
      rack_location: closed ? null : pick(RACKS),
      tag_code: null, public_token: token(),
      priority: i % 9 === 0 ? 'spoed' : 'normaal',
      intake_at: intake,
      promised_at: new Date(new Date(intake).getTime() + int(1, 6) * 86_400_000).toISOString(),
      ready_at: ['gereed', 'opgehaald'].includes(status) ? daysAgo(Math.max(0, ageDays - 2)) : null,
      picked_up_at: status === 'opgehaald' ? daysAgo(Math.max(0, ageDays - 3)) : null,
      estimated_minutes: minutes,
      actual_minutes: ['gereed', 'opgehaald'].includes(status) ? minutes + int(-10, 20) : null,
      total_ex_vat_cents: ex, total_vat_cents: vat, total_incl_vat_cents: ex + vat,
      photos: [], internal_notes: null,
      left_behind: rand() > 0.5 ? ['slot'] : [],
      key_numbers: bikeRow.key_numbers,
    }

    if (!closed) {
      const code = tagCode()
      wo.tag_code = code
      tags.push({
        code, kind: 'fiets',
        medium: ageDays > 20 ? 'herbruikbaar' : 'geprint',
        status: 'in_gebruik', work_order_id: woId, bike_id: bikeRow.id, part_id: null,
        bound_at: intake, bound_by: 'usr_owner',
      })
    }

    work_orders.push(wo)
    work_order_events.push({
      id: `ev_${woId}_1`, work_order_id: woId, at: intake, user_id: 'usr_balie',
      event: 'created', payload: { number: wo.number, tag_code: wo.tag_code },
    })
    if (wo.approved_at) {
      work_order_events.push({
        id: `ev_${woId}_2`, work_order_id: woId, at: wo.approved_at, user_id: 'usr_monteur',
        event: 'status_changed', payload: { from: 'wachtrij', to: 'in_werkplaats' },
      })
    }
    if (wo.ready_at) {
      work_order_events.push({
        id: `ev_${woId}_3`, work_order_id: woId, at: wo.ready_at, user_id: 'usr_monteur',
        event: 'status_changed', payload: { from: 'in_werkplaats', to: 'gereed' },
      })
    }
    if (wo.picked_up_at) {
      work_order_events.push({
        id: `ev_${woId}_4`, work_order_id: woId, at: wo.picked_up_at, user_id: 'usr_owner',
        event: 'paid', payload: { method: 'pin', amount_cents: wo.total_incl_vat_cents },
      })
    }
  })


  // ---------------------------------------------------------- fase 1: voorraad

  const suppliers: Supplier[] = [
    {
      id: 'sup_001', name: 'Tweewieler Groothandel Noord', email: 'orders@groothandelnoord.nl',
      phone: '+31501112233', customer_number: 'K-4471', order_method: 'portaal', lead_time_days: 2,
    },
    {
      id: 'sup_002', name: 'Onderdelen Direct BV', email: 'bestellen@onderdelendirect.nl',
      phone: '+31302223344', customer_number: 'OD-88120', order_method: 'email', lead_time_days: 4,
    },
    {
      id: 'sup_003', name: 'E-bike Techniek Nederland', email: 'service@ebiketechniek.nl',
      phone: '+31203334455', customer_number: 'ET-2210', order_method: 'email', lead_time_days: 7,
    },
  ]

  const PART_SEED: Array<[string, string, string, number, number, number, number, string, string]> = [
    // naam, sku, categorie, inkoop, verkoop excl, voorraad, minimum, bak, leverancier
    ['Binnenband 28 inch Schrader', 'BB-28-SCH', 'Banden', 310, 750, 42, 12, 'A1', 'sup_001'],
    ['Binnenband 28 inch Dunlop', 'BB-28-DUN', 'Banden', 310, 750, 36, 12, 'A1', 'sup_001'],
    ['Binnenband 26 inch', 'BB-26', 'Banden', 300, 700, 18, 8, 'A1', 'sup_001'],
    ['Binnenband 20 inch kinderfiets', 'BB-20', 'Banden', 260, 650, 9, 6, 'A2', 'sup_001'],
    ['Buitenband Schwalbe Marathon 28', 'BU-SM-28', 'Banden', 1450, 2995, 11, 4, 'A3', 'sup_001'],
    ['Buitenband e-bike versterkt 28', 'BU-EB-28', 'Banden', 1890, 3795, 6, 3, 'A3', 'sup_003'],
    ['Set remblokken velgrem', 'RB-VELG', 'Remmen', 420, 1200, 24, 10, 'B1', 'sup_002'],
    ['Remblokken rollerbrake', 'RB-ROLL', 'Remmen', 690, 1750, 8, 4, 'B1', 'sup_002'],
    ['Remkabel voor', 'RK-VOOR', 'Remmen', 180, 650, 15, 6, 'B2', 'sup_002'],
    ['Ketting 1/2 x 1/8', 'KT-118', 'Aandrijving', 640, 1650, 14, 6, 'C1', 'sup_002'],
    ['Ketting 8-speed', 'KT-8S', 'Aandrijving', 890, 2150, 7, 4, 'C1', 'sup_002'],
    ['Tandwiel achter 18T', 'TW-18', 'Aandrijving', 380, 1050, 5, 3, 'C2', 'sup_002'],
    ['Kettingkast klein onderdeelset', 'KK-SET', 'Aandrijving', 240, 850, 4, 2, 'C2', 'sup_002'],
    ['Versnellingskabel Nexus', 'VK-NEX', 'Aandrijving', 320, 950, 9, 4, 'C3', 'sup_001'],
    ['Koplamp dynamo LED', 'VL-KOP', 'Verlichting', 1180, 2650, 6, 4, 'D1', 'sup_001'],
    ['Achterlicht batterij', 'VL-ACH', 'Verlichting', 340, 995, 21, 10, 'D1', 'sup_001'],
    ['Dynamo naaf kabel', 'VL-DYN', 'Verlichting', 260, 750, 3, 4, 'D2', 'sup_001'],
    ['Spaak 292 mm rvs', 'SP-292', 'Wielen', 45, 195, 60, 40, 'E1', 'sup_002'],
    ['Velglint 28 inch', 'VG-28', 'Wielen', 70, 250, 12, 6, 'E1', 'sup_002'],
    ['Trapas Shimano BB', 'TA-SHIM', 'Aandrijving', 1240, 2795, 3, 2, 'C4', 'sup_002'],
    ['Zadel comfort gel', 'ZD-GEL', 'Comfort', 1350, 2995, 5, 2, 'F1', 'sup_001'],
    ['Handvatten set ergo', 'HV-ERGO', 'Comfort', 480, 1295, 8, 4, 'F1', 'sup_001'],
    ['Ringslot AXA Solid Plus', 'SL-AXA-SP', 'Sloten', 1690, 3495, 7, 3, 'G1', 'sup_001'],
    ['Kettingslot Abus 1500', 'SL-ABUS-15', 'Sloten', 1450, 2995, 4, 2, 'G1', 'sup_001'],
    ['Accu-contactset Bosch', 'AC-BOSCH', 'E-bike', 2450, 5495, 2, 2, 'H1', 'sup_003'],
    ['Displayhouder Intuvia', 'DH-INT', 'E-bike', 1890, 3995, 1, 2, 'H1', 'sup_003'],
    ['Snelheidssensor + magneet', 'SS-MAG', 'E-bike', 890, 2295, 3, 3, 'H2', 'sup_003'],
    ['Motorkabel Shimano Steps', 'MK-STEPS', 'E-bike', 1650, 3795, 1, 2, 'H2', 'sup_003'],
    ['Bagagedrager standaard', 'BD-STD', 'Dragers', 1590, 3295, 4, 2, 'I1', 'sup_001'],
    ['Standaard dubbelpoot', 'ST-DUB', 'Dragers', 1290, 2795, 3, 2, 'I1', 'sup_001'],
    ['Jasbeschermer set', 'JB-SET', 'Overig', 620, 1595, 5, 2, 'I2', 'sup_001'],
    ['Bel messing', 'BE-MES', 'Overig', 210, 695, 14, 6, 'I2', 'sup_001'],
    ['Smeermiddel ketting 100 ml', 'SM-KET', 'Werkplaats', 380, 995, 9, 4, 'J1', 'sup_002'],
    ['Ontvetter 500 ml', 'ON-500', 'Werkplaats', 460, 1195, 6, 3, 'J1', 'sup_002'],
    ['Poetsdoeken 10 stuks', 'PD-10', 'Werkplaats', 290, 795, 11, 5, 'J1', 'sup_002'],
  ]

  const parts: Part[] = PART_SEED.map(([name, sku, category, cost, sell, stock, min, bin, sup], i) => ({
    id: `part_${String(i + 1).padStart(3, '0')}`,
    sku, ean: `87${String(10000000 + i * 137).padStart(11, '0')}`,
    name, category, brand: null,
    cost_price_cents: cost, sell_price_ex_vat_cents: sell, vat_rate: VAT,
    stock_qty: stock, min_qty: min, bin_location: bin,
    supplier_id: sup, supplier_sku: `${sku}-L`, active: true,
  }))

  const stock_movements: StockMovement[] = []
  parts.forEach((part, i) => {
    stock_movements.push({
      id: `sm_start_${part.id}`, part_id: part.id, delta: part.stock_qty, reason: 'inkoop',
      work_order_id: null, at: daysAgo(int(40, 120)), user_id: 'usr_owner',
      note: 'beginvoorraad',
    })
    if (i % 3 === 0) {
      stock_movements.push({
        id: `sm_use_${part.id}`, part_id: part.id, delta: -1, reason: 'reparatie',
        work_order_id: work_orders[i % work_orders.length].id, at: daysAgo(int(1, 20)),
        user_id: 'usr_monteur', note: null,
      })
    }
  })

  // Bestellingen: één die loopt en de wachtende werkbonnen blokkeert,
  // één concept dat de eigenaar nog moet versturen.
  const wachtOpOnderdeel = work_orders.filter((w) => w.status === 'wacht_op_onderdeel')
  const purchase_orders: PurchaseOrder[] = [
    {
      id: 'po_001', number: 'B-2026-0031', supplier_id: 'sup_002', status: 'besteld',
      ordered_at: daysAgo(3), expected_at: new Date(now + 2 * 86_400_000).toISOString(),
      received_at: null,
    },
    {
      id: 'po_002', number: 'B-2026-0032', supplier_id: 'sup_003', status: 'concept',
      ordered_at: null, expected_at: null, received_at: null,
    },
  ]
  const po_lines: PurchaseOrderLine[] = wachtOpOnderdeel.map((wo, i) => ({
    id: `pol_${i + 1}`, purchase_order_id: i === 0 ? 'po_002' : 'po_001',
    part_id: parts[(i * 5) % parts.length].id,
    description: parts[(i * 5) % parts.length].name,
    qty_ordered: 1, qty_received: 0,
    cost_price_cents: parts[(i * 5) % parts.length].cost_price_cents,
    work_order_id: wo.id,
  }))
  // Aanvulling onder het minimum, zonder werkbon.
  po_lines.push({
    id: 'pol_min_1', purchase_order_id: 'po_001', part_id: 'part_017',
    description: 'Dynamo naaf kabel', qty_ordered: 5, qty_received: 0,
    cost_price_cents: 260, work_order_id: null,
  })

  // Betalingen en facturen bij de al opgehaalde bonnen.
  const payments: Payment[] = []
  const invoices: Invoice[] = []
  work_orders.filter((w) => w.status === 'opgehaald').forEach((wo, i) => {
    const method = i % 3 === 0 ? 'contant' : 'pin'
    payments.push({
      id: `pay_${wo.id}`, work_order_id: wo.id, stock_bike_id: null,
      method, amount_cents: wo.total_incl_vat_cents, at: wo.picked_up_at!,
      reference: null, user_id: 'usr_owner',
    })
    invoices.push({
      id: `inv_${wo.id}`, number: `F-2026-${String(200 + i).padStart(4, '0')}`,
      work_order_id: wo.id, stock_bike_id: null, customer_id: wo.customer_id,
      issued_at: wo.picked_up_at!, vat_scheme: 'standard',
      total_ex_vat_cents: wo.total_ex_vat_cents, total_vat_cents: wo.total_vat_cents,
      total_incl_vat_cents: wo.total_incl_vat_cents,
    })
  })

  const notifications: Notification[] = work_orders
    .filter((w) => w.status === 'gereed')
    .map((wo) => ({
      id: `not_${wo.id}`, work_order_id: wo.id, customer_id: wo.customer_id,
      service_contract_id: null, channel: 'whatsapp' as const, template: 'gereed',
      body: 'Uw fiets is klaar. U kunt hem ophalen tijdens openingstijden.',
      sent_at: wo.ready_at ?? wo.intake_at, status: 'verzonden' as const,
      response_at: null,
    }))

  // ---------------------------------------------------------- fase 2: occasions

  const OCCASION_SEED: Array<[string, string, BikeCategory, number, number, number, StockBikeStatus]> = [
    // merk, model, soort, inkoop, vraagprijs, dagen geleden gekocht, status
    ['Gazelle', 'Orange Plus', 'stadsfiets', 12000, 27500, 26, 'te_koop'],
    ['Batavus', 'Mambo', 'stadsfiets', 8500, 19500, 41, 'te_koop'],
    ['Cortina', 'U4 Transport', 'stadsfiets', 15000, 32500, 12, 'opknappen'],
    ['Sparta', 'ION RX', 'ebike', 52000, 99500, 2, 'binnen'],
    ['Koga', 'Miyata Alloy', 'racefiets', 22000, 44500, 63, 'te_koop'],
    ['Union', 'Fresh 24 inch', 'kinderfiets', 4000, 9500, 8, 'verkocht'],
  ]

  const stock_bikes: StockBike[] = OCCASION_SEED.map(
    ([brand, model, category, buy, ask, ago, status], i) => {
      const bikeId = `bike_occ_${String(i + 1).padStart(3, '0')}`
      bikes.push({
        id: bikeId, customer_id: null, brand, model, category,
        frame_number: `${brand.slice(0, 2).toUpperCase()}${int(100000, 999999)}${int(10, 99)}`,
        color: pick(COLORS), model_year: int(2015, 2024),
        gears_type: category === 'ebike' ? 'naaf' : 'derailleur',
        brake_type: 'velgrem', is_ebike: category === 'ebike',
        motor_system: category === 'ebike' ? pick(MOTORS) : null,
        battery_serial: category === 'ebike' ? `ACCU-${int(100000, 999999)}` : null,
        battery_wh: category === 'ebike' ? 500 : null,
        battery_cycles: category === 'ebike' ? int(200, 500) : null,
        display_type: null, firmware_version: null, last_diagnose_at: null,
        lock_brand: null, key_numbers: [], accessories: [], photos: [],
        purchased_here_at: null, warranty_until: null, notes: null,
      })
      const purchaseDate = daysAgo(ago, 0)
      const source = i === 2 ? 'inruil' : 'particulier'
      return {
        id: `stb_${String(i + 1).padStart(3, '0')}`,
        bike_id: bikeId, source,
        seller_customer_id: customers[(i * 4) % customers.length].id,
        purchase_price_cents: buy, purchase_date: purchaseDate,
        id_checked: status !== 'binnen', id_check_note: status !== 'binnen' ? 'Rijbewijs gezien' : null,
        stopheling_checked_at: status !== 'binnen' ? purchaseDate : null,
        dor_registered_at: status !== 'binnen' ? purchaseDate : null,
        sellable_from: addWorkingDays(purchaseDate, 5),
        // Inkoop bij een particulier zonder btw: margeregeling (sectie 4.2).
        vat_scheme: 'margin',
        inkoopverklaring_url: buy >= 50000 ? `inkoopverklaring-stb_${i + 1}.pdf` : null,
        refurb_parts_cents: status === 'binnen' ? 0 : int(1500, 6000),
        refurb_minutes: status === 'binnen' ? 0 : int(30, 180),
        asking_price_cents: ask,
        status,
        sold_price_cents: status === 'verkocht' ? ask - 500 : null,
        sold_at: status === 'verkocht' ? daysAgo(2, 0) : null,
        sold_to_customer_id: status === 'verkocht' ? customers[3].id : null,
        photos: [], notes: null,
      }
    },
  )

  // ---------------------------------------------- fase 2: abonnementen en accu's

  const service_contracts: ServiceContract[] = bikes.slice(0, 8).map((b, i) => {
    const start = daysAgo(int(120, 400), 0)
    const interval = b.is_ebike ? 6 : 12
    const due = new Date(now + (i - 3) * 12 * 86_400_000)
    return {
      id: `sc_${String(i + 1).padStart(3, '0')}`,
      bike_id: b.id, customer_id: b.customer_id ?? customers[i].id,
      type: b.is_ebike ? 'ebike' : i % 2 === 0 ? 'compleet' : 'basis',
      start_date: start, interval_months: interval,
      price_cents: b.is_ebike ? 12500 : 8500,
      next_due_at: due.toISOString(),
      last_service_at: daysAgo(int(150, 300), 0), active: true,
    }
  })

  const battery_logs: BatteryLog[] = []
  work_orders
    .filter((w) => bikes.find((b) => b.id === w.bike_id)?.is_ebike && w.status === 'in_werkplaats')
    .forEach((wo, i) => {
      battery_logs.push({
        id: `bl_${wo.id}_1`, work_order_id: wo.id, bike_id: wo.bike_id, tag_code: wo.tag_code,
        event: 'aangenomen', at: wo.intake_at, user_id: 'usr_balie', note: null,
      })
      if (i % 2 === 0) {
        battery_logs.push({
          id: `bl_${wo.id}_2`, work_order_id: wo.id, bike_id: wo.bike_id, tag_code: wo.tag_code,
          event: 'op_lader', at: daysAgo(1), user_id: 'usr_monteur', note: 'brandveilige kast',
        })
      }
    })

  // Herinneringen voor fietsen die al lang klaar staan (sectie 4.3).
  const reminders: Reminder[] = work_orders
    .filter((w) => w.status === 'gereed' && daysSince(w.ready_at ?? w.intake_at) >= 14)
    .map((wo) => ({
      id: `rem_${wo.id}`, work_order_id: wo.id, step: 'herinnering_1' as const,
      at: daysAgo(7), channel: 'whatsapp' as const,
      note: null, user_id: 'usr_owner',
    }))

  // Doos met herbruikbare plastic kaartjes (sectie 8.7): wat er niet in de doos
  // ligt, hangt aan een fiets in de winkel.
  for (let i = 0; i < 12; i++) {
    tags.push({
      code: tagCode(), kind: 'fiets', medium: 'herbruikbaar', status: 'vrij',
      work_order_id: null, bike_id: null, part_id: null, bound_at: null, bound_by: null,
    })
  }

  // -------------------------------------------------- fase 3: rooster en uren
  // Het rooster hangt aan de week van vandaag: een demonstratie waarin de
  // agenda leeg is of vorig jaar staat, overtuigt niemand.
  const maandag = mondayOf(dayKey())
  const vandaag = dayKey()

  const shifts: Shift[] = []
  const dienst = (
    user_id: string, date: string, start: string, end: string, pauze = 30, note: string | null = null,
  ) => {
    shifts.push({
      id: `dnst_${user_id}_${date}`, user_id, date, start, end,
      break_minutes: pauze, note, created_at: daysAgo(14),
    })
  }

  // Twee weken vooruit en één week terug, zodat er iets te zien is in beide
  // richtingen van de weekknoppen.
  for (const week of [-1, 0, 1] as const) {
    const start = addDays(maandag, week * 7)
    for (let i = 0; i < 6; i++) { // maandag t/m zaterdag; zondag is de winkel dicht
      const dag = addDays(start, i)
      if (i < 5) {
        dienst('usr_monteur', dag, '08:30', '17:00')
        dienst('usr_owner', dag, '09:00', '18:00', 45)
      }
      if (i === 1 || i === 3 || i === 5) dienst('usr_balie', dag, '09:00', '17:30')
      if (i >= 2) dienst('usr_monteur2', dag, '10:00', '18:00')
      if (i === 5) dienst('usr_balie2', dag, '09:30', '17:00', 30, 'Zaterdagdrukte')
    }
  }

  const absences: Absence[] = [
    {
      id: 'afw_1', user_id: 'usr_monteur2',
      from_date: addDays(maandag, 8), to_date: addDays(maandag, 12),
      kind: 'vakantie', note: null, created_at: daysAgo(20),
    },
  ]

  const availability: Availability[] = [
    {
      id: 'besch_1', user_id: 'usr_balie2', date: addDays(maandag, 12),
      can_work: false, from_time: null, to_time: null, note: 'Tentamen',
      created_at: daysAgo(3),
    },
    {
      id: 'besch_2', user_id: 'usr_balie2', date: addDays(maandag, 13),
      can_work: true, from_time: '12:00', to_time: '18:00', note: null,
      created_at: daysAgo(3),
    },
    {
      id: 'besch_3', user_id: 'usr_balie', date: addDays(maandag, 9),
      can_work: true, from_time: null, to_time: null, note: null,
      created_at: daysAgo(2),
    },
  ]

  // Gewerkte uren: het plan van vorige week, met de afwijkingen die in een
  // echte winkel voorkomen — een kwartier te laat, een uur overwerk, en één
  // dienst die niemand heeft afgesloten.
  const time_entries: TimeEntry[] = []
  const stempel = (dag: string, hhmm: string) => {
    const [y, m, d] = dag.split('-').map(Number)
    const [h, min] = hhmm.split(':').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0).toISOString()
  }
  const geklokt = (
    user_id: string, dag: string, van: string, tot: string | null, pauze = 30,
  ) => {
    time_entries.push({
      id: `uur_${user_id}_${dag}_${van.replace(':', '')}`, user_id, date: dag,
      clock_in: stempel(dag, van), clock_out: tot ? stempel(dag, tot) : null,
      break_minutes: pauze, source: 'nfc', note: null, edited_by: null, edited_at: null,
    })
  }

  for (const s of shifts.filter((x) => x.date < vandaag && x.date >= addDays(maandag, -7))) {
    // Zaterdag is het druk: dan loopt het uit. Verder een paar minuten speling.
    const uitloop = s.date === addDays(mondayOf(s.date), 5) ? '+60' : '0'
    const eind = uitloop === '+60'
      ? `${String(Number(s.end.slice(0, 2)) + 1).padStart(2, '0')}:${s.end.slice(3)}`
      : s.end
    geklokt(s.user_id, s.date, s.start, eind, s.break_minutes)
  }

  // Vandaag: twee mensen zijn binnen en nog niet weg.
  const tweeUurGeleden = new Date(Date.now() - 2 * 3_600_000)
  const uur = `${String(tweeUurGeleden.getHours()).padStart(2, '0')}:${String(tweeUurGeleden.getMinutes()).padStart(2, '0')}`
  geklokt('usr_monteur', vandaag, uur, null, 0)
  geklokt('usr_owner', vandaag, uur, null, 0)

  return {
    version: 3,
    settings: {
      shop_name: 'Fietswerk Groningen',
      address: 'Oosterstraat 42, 9711 NW Groningen',
      phone: '+31501234567',
      kvk: '01234567',
      btw_id: 'NL001234567B01',
      labor_rate_cents_per_hour: LABOR_RATE,
      labor_cost_cents_per_hour: LABOR_COST,
      default_approved_limit_cents: 8000,
      vat_rate: VAT,
      dor_enabled: true,
      margin_scheme_enabled: true,
      dor_hold_working_days: 5,
      printer_config: {
        device_name: null, energy: 12000, feed_steps: 60, auto_print_afhaalbon: true,
      },
    },
    // Echte namen: een rooster met "Monteur" en "Balie" erin is geen rooster.
    users: [
      { id: 'usr_owner', name: 'Harm Wijnstra', role: 'owner', pin_code: '1111', ui_language: 'nl', active: true },
      { id: 'usr_monteur', name: 'Sanne Dijkstra', role: 'monteur', pin_code: '2222', ui_language: 'nl', active: true },
      { id: 'usr_balie', name: 'Bram Postma', role: 'balie', pin_code: '3333', ui_language: 'nl', active: true },
      { id: 'usr_monteur2', name: 'Lieke Veenstra', role: 'monteur', pin_code: '4444', ui_language: 'nl', active: true },
      { id: 'usr_balie2', name: 'Douwe Bos', role: 'balie', pin_code: '5555', ui_language: 'nl', active: true },
    ],
    customers, bikes, work_orders, work_order_lines, work_order_events,
    tags, tag_scans: [], print_jobs: [],
    parts, stock_movements, suppliers, purchase_orders, po_lines,
    payments, notifications, invoices, outbox: [],
    stock_bikes, service_contracts, battery_logs, reminders,
    shifts, absences, availability, time_entries,
  }
}
