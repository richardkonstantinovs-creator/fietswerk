import type {
  BatteryLog, Bike, Customer, Database, Invoice, MovementReason, Notification,
  OutboxEntry, Part, Payment, PaymentMethod, Photo, PrintJob, PurchaseOrder,
  PurchaseOrderLine, Reminder, ServiceContract, StockBike, StockMovement, Supplier,
  Tag, TagScan, User, WorkOrder, WorkOrderEvent, WorkOrderEventType, WorkOrderLine,
  WorkOrderStatus,
} from './types'
import { buildSeed } from './seed'
import { newPublicToken, newTagCode, nextWorkOrderNumber, normalizeTagCode } from './code'
import { timestampsFor } from './workflow'
import { addWorkingDays, vatOf } from './format'

/**
 * Fase 0 draait op de browser-opslag zodat de demo bij de eigenaar op tafel
 * werkt zonder server en zonder inloggen (sectie 13, fase 0).
 * Alle schrijfacties lopen via dit bestand; in fase 1 wordt hier Supabase
 * ingehangen zonder dat de schermen veranderen.
 */

const KEY = 'fietswerk.db.v1'
/** Bij een nieuwe versie wordt de demo opnieuw gezaaid; fase 0 heeft geen migraties. */
const DB_VERSION = 2
const listeners = new Set<() => void>()

let db: Database = load()
let snapshotVersion = 0

function load(): Database {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed && parsed.version === DB_VERSION) return parsed
    }
  } catch {
    // Kapotte opslag mag de demo niet blokkeren: opnieuw zaaien.
  }
  const seeded = buildSeed()
  try { localStorage.setItem(KEY, JSON.stringify(seeded)) } catch { /* privémodus */ }
  return seeded
}

function persist() {
  snapshotVersion += 1
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* privémodus */ }
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getSnapshot(): number {
  return snapshotVersion
}

export function data(): Database {
  return db
}

export function resetDemoData() {
  db = buildSeed()
  persist()
}

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

// ---------------------------------------------------------------- lezen

export const settings = () => db.settings
/** De ingelogde medewerker; zonder sessie valt de app terug op de eigenaar. */
export const currentUser = (): User | undefined => {
  const uid = currentUserId()
  return db.users.find((u) => u.id === uid && u.active)
    ?? db.users.find((u) => u.role === 'owner')
    ?? db.users[0]
}

export function customer(cid: string | null): Customer | undefined {
  return cid ? db.customers.find((c) => c.id === cid) : undefined
}

export function bike(bid: string | null): Bike | undefined {
  return bid ? db.bikes.find((b) => b.id === bid) : undefined
}

export function workOrder(woid: string): WorkOrder | undefined {
  return db.work_orders.find((w) => w.id === woid)
}

/**
 * Een gescande code kan het label op het stuur zijn of dat op de accu
 * (sectie 8.6). Beide horen bij dezelfde werkbon.
 */
export function workOrderByTag(code: string): WorkOrder | undefined {
  const c = normalizeTagCode(code)
  const direct = db.work_orders.find((w) => w.tag_code === c)
  if (direct) return direct
  const label = db.tags.find((t) => t.code === c && t.work_order_id != null)
  return label ? db.work_orders.find((w) => w.id === label.work_order_id) : undefined
}

/** Het bierkaartje dat aan de accu hangt, als dat er is. */
export function batteryTag(woid: string): Tag | undefined {
  return db.tags.find((t) => t.kind === 'accu' && t.work_order_id === woid && t.status === 'in_gebruik')
}

/**
 * Accu-label maken en printen. De accu gaat los van de fiets naar de laadkast;
 * zonder eigen label worden ze verwisseld (sectie 8.6).
 */
export function printBatteryLabel(woid: string): Tag | undefined {
  const wo = workOrder(woid)
  if (!wo) return undefined
  let label = batteryTag(woid)
  if (!label) {
    let code = newTagCode()
    let guard = 0
    while (db.tags.some((t) => t.code === code) && guard++ < 50) code = newTagCode()
    label = {
      code, kind: 'accu', medium: 'geprint', status: 'in_gebruik',
      work_order_id: woid, bike_id: wo.bike_id, part_id: null,
      bound_at: now(), bound_by: currentUser()?.id ?? null,
    }
    db.tags.push(label)
  }
  queuePrint('accu_label', wo)
  logEvent(woid, 'printed', { kind: 'accu_label', tag_code: label.code })
  track('tags', 'insert', { code: label.code, kind: 'accu' })
  persist()
  return label
}

export function workOrderByToken(token: string): WorkOrder | undefined {
  return db.work_orders.find((w) => w.public_token === token)
}

export function linesOf(woid: string): WorkOrderLine[] {
  return db.work_order_lines.filter((l) => l.work_order_id === woid)
}

export function eventsOf(woid: string): WorkOrderEvent[] {
  return db.work_order_events
    .filter((e) => e.work_order_id === woid)
    .sort((a, b) => b.at.localeCompare(a.at))
}

export function bikesOf(cid: string): Bike[] {
  return db.bikes.filter((b) => b.customer_id === cid)
}

export function workOrdersOfCustomer(cid: string): WorkOrder[] {
  return db.work_orders
    .filter((w) => w.customer_id === cid)
    .sort((a, b) => b.intake_at.localeCompare(a.intake_at))
}

export function workOrdersOfBike(bid: string): WorkOrder[] {
  return db.work_orders
    .filter((w) => w.bike_id === bid)
    .sort((a, b) => b.intake_at.localeCompare(a.intake_at))
}

export function tag(code: string): Tag | undefined {
  return db.tags.find((t) => t.code === normalizeTagCode(code))
}

export function freeTags(): Tag[] {
  return db.tags.filter((t) => t.status === 'vrij')
}

export function pendingPrintJobs(): PrintJob[] {
  return db.print_jobs.filter((j) => j.status === 'wacht')
}

// ------------------------------------------------------------ zoeken (7.1)

export interface SearchHit {
  kind: 'werkbon' | 'klant' | 'fiets'
  id: string
  title: string
  subtitle: string
  matched: string
}

/**
 * Eén zoekbalk vindt telefoon, framenummer, bierkaartcode, achternaam en
 * werkbonnummer (sectie 6). Meer zoekvelden bestaan er niet in de app.
 */
export function search(rawQuery: string): SearchHit[] {
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 2) return []
  const digits = q.replace(/\D/g, '')
  const code = normalizeTagCode(q)
  const hits: SearchHit[] = []

  for (const w of db.work_orders) {
    const c = customer(w.customer_id)
    const b = bike(w.bike_id)
    const inNumber = w.number.toLowerCase().includes(q)
    const inTag = w.tag_code != null && code.length >= 3 && w.tag_code.includes(code)
    if (inNumber || inTag) {
      hits.push({
        kind: 'werkbon', id: w.id,
        title: `${w.tag_code ?? w.number}`,
        subtitle: `${b?.brand ?? ''} ${b?.model ?? ''} — ${c?.last_name ?? ''}`,
        matched: inTag ? 'label' : 'number',
      })
    }
  }

  for (const c of db.customers) {
    if (c.deleted_at) continue
    const name = `${c.first_name} ${c.last_name} ${c.company ?? ''}`.toLowerCase()
    const phoneMatch = digits.length >= 4 && c.phone.replace(/\D/g, '').includes(digits)
    if (name.includes(q) || phoneMatch) {
      hits.push({
        kind: 'klant', id: c.id,
        title: `${c.first_name} ${c.last_name}`,
        subtitle: c.phone, matched: phoneMatch ? 'phone' : 'name',
      })
    }
  }

  for (const b of db.bikes) {
    const fn = (b.frame_number ?? '').toLowerCase()
    if (fn && q.length >= 3 && fn.includes(q)) {
      const c = customer(b.customer_id)
      hits.push({
        kind: 'fiets', id: b.id,
        title: `${b.brand} ${b.model ?? ''}`.trim(),
        subtitle: `${b.frame_number} — ${c ? `${c.first_name} ${c.last_name}` : ''}`,
        matched: 'frame_number',
      })
    }
  }

  return hits.slice(0, 25)
}

export function findCustomersByPhone(rawPhone: string): Customer[] {
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.length < 4) return []
  return db.customers.filter(
    (c) => !c.deleted_at && c.phone.replace(/\D/g, '').includes(digits),
  )
}

// ---------------------------------------------------------------- schrijven

export function logEvent(
  woid: string, event: WorkOrderEventType, payload: Record<string, unknown> = {},
) {
  // APPEND-ONLY (regel 14.3): corrigeren doe je met een nieuw event.
  db.work_order_events.push({
    id: id('ev'), work_order_id: woid, at: now(),
    user_id: currentUser()?.id ?? null, event, payload,
  })
}

export function createCustomer(input: Partial<Customer> & { phone: string; last_name: string }): Customer {
  const c: Customer = {
    id: id('cus'), type: input.type ?? 'particulier',
    first_name: input.first_name ?? '', last_name: input.last_name,
    company: input.company ?? null, phone: input.phone, email: input.email ?? null,
    street: input.street ?? null, postcode: input.postcode ?? null, city: input.city ?? null,
    notes: null, marketing_consent: false, created_at: now(), deleted_at: null,
  }
  db.customers.push(c)
  track('customers', 'insert', { id: c.id })
  persist()
  return c
}

export function createBike(input: Partial<Bike> & { brand: string; customer_id: string | null }): Bike {
  const b: Bike = {
    id: id('bike'), customer_id: input.customer_id, brand: input.brand,
    model: input.model ?? null, category: input.category ?? 'stadsfiets',
    frame_number: input.frame_number ?? null, color: input.color ?? null,
    model_year: input.model_year ?? null, gears_type: input.gears_type ?? null,
    brake_type: null, is_ebike: input.category === 'ebike' || input.is_ebike === true,
    motor_system: input.motor_system ?? null, battery_serial: input.battery_serial ?? null,
    battery_wh: input.battery_wh ?? null, battery_cycles: null, display_type: null,
    firmware_version: null, last_diagnose_at: null, lock_brand: input.lock_brand ?? null,
    key_numbers: input.key_numbers ?? [], accessories: input.accessories ?? [],
    photos: input.photos ?? [], purchased_here_at: null, warranty_until: null, notes: null,
  }
  db.bikes.push(b)
  track('bikes', 'insert', { id: b.id })
  persist()
  return b
}

export function updateBike(bid: string, patch: Partial<Bike>) {
  const b = bike(bid)
  if (!b) return
  Object.assign(b, patch)
  persist()
}

export interface NewWorkOrderInput {
  customer_id: string
  bike_id: string
  complaint: string
  approved_limit_cents: number | null
  estimated_minutes: number | null
  promised_at: string | null
  priority?: WorkOrder['priority']
  rack_location?: string | null
  photos?: Photo[]
  left_behind?: string[]
  key_numbers?: string[]
  lines?: Array<Omit<WorkOrderLine, 'id' | 'work_order_id' | 'line_total_ex_vat_cents'>>
}

/** Aanname afronden: bon, bierkaartje, printopdrachten en het eerste event. */
export function createWorkOrder(input: NewWorkOrderInput): WorkOrder {
  const wo: WorkOrder = {
    id: id('wo'),
    number: nextWorkOrderNumber(db.work_orders.map((w) => w.number)),
    bike_id: input.bike_id, customer_id: input.customer_id,
    status: 'wachtrij', complaint: input.complaint, diagnosis: null,
    approved_limit_cents: input.approved_limit_cents,
    quote_cents: null, quote_sent_at: null, approved_at: null, approved_by_channel: null,
    mechanic_id: null, rack_location: input.rack_location ?? null,
    tag_code: null, public_token: newPublicToken(),
    priority: input.priority ?? 'normaal',
    intake_at: now(), promised_at: input.promised_at, ready_at: null, picked_up_at: null,
    estimated_minutes: input.estimated_minutes, actual_minutes: null,
    total_ex_vat_cents: 0, total_vat_cents: 0, total_incl_vat_cents: 0,
    photos: input.photos ?? [], internal_notes: null,
    left_behind: input.left_behind ?? [], key_numbers: input.key_numbers ?? [],
  }
  db.work_orders.push(wo)

  bindFreshTag(wo)

  for (const line of input.lines ?? []) {
    db.work_order_lines.push({
      ...line, id: id('wol'), work_order_id: wo.id,
      line_total_ex_vat_cents: lineTotal(line.qty, line.unit_price_ex_vat_cents, line.discount_pct),
    })
  }
  recalcTotals(wo.id)

  logEvent(wo.id, 'created', { number: wo.number, tag_code: wo.tag_code })
  track('work_orders', 'insert', { id: wo.id, number: wo.number })
  queuePrint('werkbon_label', wo)
  if (db.settings.printer_config.auto_print_afhaalbon) queuePrint('afhaalbon', wo)
  persist()
  return wo
}

function bindFreshTag(wo: WorkOrder) {
  let code = newTagCode()
  let guard = 0
  while (db.tags.some((t) => t.code === code) && guard++ < 50) code = newTagCode()
  db.tags.push({
    code, kind: 'fiets', medium: 'geprint', status: 'in_gebruik',
    work_order_id: wo.id, bike_id: wo.bike_id, part_id: null,
    bound_at: now(), bound_by: currentUser()?.id ?? null,
  })
  wo.tag_code = code
}

/** Sectie 8.7 — herbruikbaar plastic kaartje aan een andere bon hangen. */
export function rebindTag(code: string, woid: string) {
  const c = normalizeTagCode(code)
  const t = tag(c)
  const wo = workOrder(woid)
  if (!wo) return
  if (t) {
    if (t.work_order_id && t.work_order_id !== woid) {
      logEvent(t.work_order_id, 'note', { unbound_tag: c })
    }
    t.work_order_id = woid
    t.bike_id = wo.bike_id
    t.status = 'in_gebruik'
    t.bound_at = now()
    t.bound_by = currentUser()?.id ?? null
  } else {
    db.tags.push({
      code: c, kind: 'fiets', medium: 'herbruikbaar', status: 'in_gebruik',
      work_order_id: woid, bike_id: wo.bike_id, part_id: null,
      bound_at: now(), bound_by: currentUser()?.id ?? null,
    })
  }
  const old = wo.tag_code
  if (old && old !== c) {
    const oldTag = tag(old)
    if (oldTag) { oldTag.status = 'vrij'; oldTag.work_order_id = null; oldTag.bike_id = null }
  }
  wo.tag_code = c
  logEvent(woid, 'note', { tag_bound: c })
  persist()
}

function releaseTag(wo: WorkOrder) {
  if (!wo.tag_code) return
  const t = tag(wo.tag_code)
  if (t) { t.status = 'vrij'; t.work_order_id = null; t.bike_id = null }
}

export function setStatus(woid: string, to: WorkOrderStatus, payload: Record<string, unknown> = {}) {
  const wo = workOrder(woid)
  if (!wo) return
  const from = wo.status
  if (from === to) return
  wo.status = to
  Object.assign(wo, timestampsFor(to, now()))
  if (to === 'opgehaald' || to === 'geannuleerd') releaseTag(wo)
  logEvent(woid, 'status_changed', { from, to, ...payload })
  track('work_orders', 'update', { id: woid, status: to })
  persist()
}

export function updateWorkOrder(woid: string, patch: Partial<WorkOrder>, note?: string) {
  const wo = workOrder(woid)
  if (!wo) return
  Object.assign(wo, patch)
  if (note) logEvent(woid, 'note', { note, ...patch })
  track('work_orders', 'update', { id: woid })
  persist()
}

export function recordPayment(woid: string, method: PaymentMethod, amountCents: number) {
  db.payments.push({
    id: id('pay'), work_order_id: woid, stock_bike_id: null, method,
    amount_cents: amountCents, at: now(), reference: null,
    user_id: currentUser()?.id ?? null,
  })
  logEvent(woid, 'paid', { method, amount_cents: amountCents })
  createInvoiceForWorkOrder(woid)
  track('payments', 'insert', { work_order_id: woid, amount_cents: amountCents })
  persist()
}

function lineTotal(qty: number, unit: number, discountPct: number): number {
  return Math.round(qty * unit * (1 - discountPct / 100))
}

export function addLine(
  woid: string,
  line: Omit<WorkOrderLine, 'id' | 'work_order_id' | 'line_total_ex_vat_cents'>,
) {
  db.work_order_lines.push({
    ...line, id: id('wol'), work_order_id: woid,
    line_total_ex_vat_cents: lineTotal(line.qty, line.unit_price_ex_vat_cents, line.discount_pct),
  })
  recalcTotals(woid)
  track('work_order_lines', 'insert', { work_order_id: woid })
  persist()
}

export function removeLine(lineId: string) {
  const line = db.work_order_lines.find((l) => l.id === lineId)
  if (!line) return
  db.work_order_lines = db.work_order_lines.filter((l) => l.id !== lineId)
  recalcTotals(line.work_order_id)
  track('work_order_lines', 'delete', { id: lineId })
  persist()
}

/**
 * Totalen per regel optellen en de btw per regel afronden. Optellen van
 * afgeronde regels houdt de bon tot op de cent gelijk aan de factuur (regel 14.9).
 */
export function recalcTotals(woid: string) {
  const wo = workOrder(woid)
  if (!wo) return
  const lines = linesOf(woid)
  let ex = 0
  let vat = 0
  let minutes = 0
  for (const l of lines) {
    ex += l.line_total_ex_vat_cents
    vat += vatOf(l.line_total_ex_vat_cents, l.vat_rate)
    minutes += (l.minutes ?? 0) * (l.kind === 'arbeid' ? l.qty : 0)
  }
  wo.total_ex_vat_cents = ex
  wo.total_vat_cents = vat
  wo.total_incl_vat_cents = ex + vat
  wo.actual_minutes = minutes > 0 ? Math.round(minutes) : wo.actual_minutes
}

// ---------------------------------------------------------------- printen

export function queuePrint(kind: PrintJob['kind'], wo: WorkOrder): PrintJob {
  const job: PrintJob = {
    id: id('pj'), kind,
    payload: { work_order_id: wo.id, tag_code: wo.tag_code, number: wo.number },
    status: 'wacht', created_at: now(), printed_at: null, error: null,
    retry_count: 0, user_id: currentUser()?.id ?? null,
  }
  db.print_jobs.push(job)
  return job
}

/** Los aangevraagde herdruk (sectie 9.7). */
export function reprint(woid: string, kind: PrintJob['kind']) {
  const wo = workOrder(woid)
  if (!wo) return
  queuePrint(kind, wo)
  logEvent(woid, 'printed', { kind, queued: true })
  persist()
}

export function markPrinted(jobId: string, ok: boolean, error?: string) {
  const job = db.print_jobs.find((j) => j.id === jobId)
  if (!job) return
  job.status = ok ? 'gedrukt' : 'mislukt'
  job.printed_at = ok ? now() : null
  job.error = ok ? null : (error ?? 'onbekend')
  job.retry_count += ok ? 0 : 1
  persist()
}

// ---------------------------------------------------------------- scannen

export function logScan(code: string, action: string, woid: string | null, device: string) {
  const scan: TagScan = {
    id: id('scan'), tag_code: normalizeTagCode(code), at: now(),
    user_id: currentUser()?.id ?? null, work_order_id: woid, action, device,
  }
  db.tag_scans.push(scan)
  persist()
}

// ============================================================ fase 1: voorraad

export const parts = () => db.parts.filter((p) => p.active)
export const part = (pid: string) => db.parts.find((p) => p.id === pid)
export const suppliers = (): Supplier[] => db.suppliers
export const supplier = (sid: string | null) => db.suppliers.find((s) => s.id === sid)

/** Alles wat onder het minimum is gezakt (sectie 7.4, rode plaat "Bijna op"). */
export function partsBelowMin(): Part[] {
  return parts().filter((p) => p.stock_qty < p.min_qty)
}

/** Zoeken op SKU, EAN of naam. De scanner aan de balie typt de EAN in dit veld. */
export function searchParts(rawQuery: string): Part[] {
  const q = rawQuery.trim().toLowerCase()
  if (q === '') return parts()
  return parts().filter(
    (p) => p.name.toLowerCase().includes(q)
      || p.sku.toLowerCase().includes(q)
      || (p.ean ?? '').includes(q)
      || (p.bin_location ?? '').toLowerCase() === q,
  )
}

export function partByEan(ean: string): Part | undefined {
  const clean = ean.replace(/\D/g, '')
  return clean.length >= 8 ? db.parts.find((p) => p.ean === clean) : undefined
}

export function movementsOf(pid: string): StockMovement[] {
  return db.stock_movements
    .filter((m) => m.part_id === pid)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** Elke voorraadwijziging loopt hierlangs, zodat het verschil verklaarbaar blijft. */
export function adjustStock(
  pid: string, delta: number, reason: MovementReason,
  woid: string | null = null, note: string | null = null,
) {
  const p = part(pid)
  if (!p || delta === 0) return
  p.stock_qty += delta
  db.stock_movements.push({
    id: id('sm'), part_id: pid, delta, reason, work_order_id: woid,
    at: now(), user_id: currentUser()?.id ?? null, note,
  })
  track('stock_movements', 'insert', { part_id: pid, delta, reason })
  persist()
}

/** Onderdeel op een werkbon zetten: regel erbij en voorraad eraf, in één stap. */
export function addPartToWorkOrder(woid: string, pid: string, qty = 1) {
  const p = part(pid)
  if (!p) return
  db.work_order_lines.push({
    id: id('wol'), work_order_id: woid, kind: 'onderdeel', description: p.name,
    part_id: pid, qty, unit_price_ex_vat_cents: p.sell_price_ex_vat_cents,
    vat_rate: p.vat_rate, discount_pct: 0,
    line_total_ex_vat_cents: p.sell_price_ex_vat_cents * qty, minutes: null,
  })
  p.stock_qty -= qty
  db.stock_movements.push({
    id: id('sm'), part_id: pid, delta: -qty, reason: 'reparatie', work_order_id: woid,
    at: now(), user_id: currentUser()?.id ?? null, note: null,
  })
  recalcTotals(woid)
  logEvent(woid, 'note', { part_used: p.sku, qty })
  track('work_order_lines', 'insert', { work_order_id: woid, part_id: pid, qty })
  persist()
}

// ------------------------------------------------------------ bestellingen

export function purchaseOrders(): PurchaseOrder[] {
  return [...db.purchase_orders].sort((a, b) => (b.ordered_at ?? '').localeCompare(a.ordered_at ?? ''))
}

export const purchaseOrder = (poid: string) => db.purchase_orders.find((p) => p.id === poid)

export function poLinesOf(poid: string): PurchaseOrderLine[] {
  return db.po_lines.filter((l) => l.purchase_order_id === poid)
}

/** Openstaande bestelregels die aan een werkbon hangen: dit houdt bonnen tegen. */
export function openPoLinesForWorkOrder(woid: string): PurchaseOrderLine[] {
  return db.po_lines.filter((l) => l.work_order_id === woid && l.qty_received < l.qty_ordered)
}

function nextPoNumber(): string {
  const year = new Date().getFullYear()
  const prefix = `B-${year}-`
  const highest = db.purchase_orders
    .filter((p) => p.number.startsWith(prefix))
    .map((p) => Number(p.number.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/**
 * "Bestellijst maken" (sectie 7.4): alles onder het minimum plus alles wat een
 * open werkbon nodig heeft, gegroepeerd per leverancier. Levert concepten op
 * die de eigenaar zelf verstuurt.
 */
export function buildOrderList(): PurchaseOrder[] {
  const needed = partsBelowMin()
  const created: PurchaseOrder[] = []
  const bySupplier = new Map<string, Part[]>()
  for (const p of needed) {
    const alreadyOrdered = db.po_lines.some(
      (l) => l.part_id === p.id && l.qty_received < l.qty_ordered
        && purchaseOrder(l.purchase_order_id)?.status !== 'ontvangen',
    )
    if (alreadyOrdered) continue
    const key = p.supplier_id ?? 'onbekend'
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), p])
  }
  for (const [supplierId, list] of bySupplier) {
    const po: PurchaseOrder = {
      id: id('po'), number: nextPoNumber(), supplier_id: supplierId,
      status: 'concept', ordered_at: null, expected_at: null, received_at: null,
    }
    db.purchase_orders.push(po)
    for (const p of list) {
      db.po_lines.push({
        id: id('pol'), purchase_order_id: po.id, part_id: p.id, description: p.name,
        qty_ordered: Math.max(p.min_qty - p.stock_qty, 1), qty_received: 0,
        cost_price_cents: p.cost_price_cents, work_order_id: null,
      })
    }
    created.push(po)
  }
  track('purchase_orders', 'insert', { created: created.length })
  persist()
  return created
}

/** Onderdeel bestellen voor één werkbon; de bon gaat op wacht_op_onderdeel. */
export function orderPartForWorkOrder(
  woid: string, description: string, supplierId: string, partId: string | null,
) {
  let po = db.purchase_orders.find((p) => p.supplier_id === supplierId && p.status === 'concept')
  if (!po) {
    po = {
      id: id('po'), number: nextPoNumber(), supplier_id: supplierId,
      status: 'concept', ordered_at: null, expected_at: null, received_at: null,
    }
    db.purchase_orders.push(po)
  }
  db.po_lines.push({
    id: id('pol'), purchase_order_id: po.id, part_id: partId, description,
    qty_ordered: 1, qty_received: 0,
    cost_price_cents: partId ? (part(partId)?.cost_price_cents ?? 0) : 0,
    work_order_id: woid,
  })
  logEvent(woid, 'part_ordered', { description, supplier_id: supplierId })
  setStatus(woid, 'wacht_op_onderdeel', { description })
  track('po_lines', 'insert', { work_order_id: woid, description })
  persist()
}

export function markOrdered(poid: string, expectedAt: string | null) {
  const po = purchaseOrder(poid)
  if (!po) return
  po.status = 'besteld'
  po.ordered_at = now()
  po.expected_at = expectedAt
  track('purchase_orders', 'update', { id: poid, status: 'besteld' })
  persist()
}

/**
 * Binnenkomst verwerken. Geeft de werkbonnen terug die weer verder kunnen —
 * dat is precies het zinnetje dat de werkplaats wil zien: "er kwamen 3
 * onderdelen binnen, W-2026-0412, 0417 en 0431 kunnen door".
 */
export function receivePoLine(lineId: string, qty: number): WorkOrder[] {
  const line = db.po_lines.find((l) => l.id === lineId)
  if (!line || qty <= 0) return []
  line.qty_received = Math.min(line.qty_ordered, line.qty_received + qty)
  if (line.part_id) {
    const p = part(line.part_id)
    if (p) {
      p.stock_qty += qty
      db.stock_movements.push({
        id: id('sm'), part_id: p.id, delta: qty, reason: 'inkoop',
        work_order_id: line.work_order_id, at: now(),
        user_id: currentUser()?.id ?? null, note: null,
      })
    }
  }

  const po = purchaseOrder(line.purchase_order_id)
  if (po) {
    const lines = poLinesOf(po.id)
    const all = lines.every((l) => l.qty_received >= l.qty_ordered)
    po.status = all ? 'ontvangen' : 'deels'
    po.received_at = all ? now() : po.received_at
  }

  const resumable: WorkOrder[] = []
  if (line.work_order_id) {
    const wo = workOrder(line.work_order_id)
    if (wo) {
      logEvent(wo.id, 'part_arrived', { description: line.description })
      if (wo.status === 'wacht_op_onderdeel' && openPoLinesForWorkOrder(wo.id).length === 0) {
        resumable.push(wo)
      }
    }
  }
  track('po_lines', 'update', { id: lineId, qty_received: line.qty_received })
  persist()
  return resumable
}

/** Scan van de EAN op de doos van de leverancier (sectie 8.6). */
export function receiveByEan(ean: string): { part: Part | null; resumable: WorkOrder[] } {
  const p = partByEan(ean)
  if (!p) return { part: null, resumable: [] }
  // Wacht er een klant op dit onderdeel, dan gaat die regel voor; anders
  // is het gewoon aanvulling van de voorraad.
  const open = db.po_lines.filter((l) => l.part_id === p.id && l.qty_received < l.qty_ordered)
  const line = open.find((l) => l.work_order_id != null) ?? open[0]
  if (line) return { part: p, resumable: receivePoLine(line.id, 1) }
  adjustStock(p.id, 1, 'inkoop', null, 'gescand zonder bestelregel')
  return { part: p, resumable: [] }
}

// ------------------------------------------------------- betalen en factureren

export function paymentsOf(woid: string): Payment[] {
  return db.payments.filter((p) => p.work_order_id === woid)
}

export function invoiceOfWorkOrder(woid: string): Invoice | undefined {
  return db.invoices.find((i) => i.work_order_id === woid)
}

export const invoice = (iid: string) => db.invoices.find((i) => i.id === iid)

function nextInvoiceNumber(): string {
  const year = new Date().getFullYear()
  const prefix = `F-${year}-`
  const highest = db.invoices
    .filter((i) => i.number.startsWith(prefix))
    .map((i) => Number(i.number.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/** Afrekenen: betaling vastleggen en de factuur aanmaken (bewaarplicht 7 jaar). */
export function createInvoiceForWorkOrder(woid: string): Invoice | undefined {
  const wo = workOrder(woid)
  if (!wo) return undefined
  const existing = invoiceOfWorkOrder(woid)
  if (existing) return existing
  const inv: Invoice = {
    id: id('inv'), number: nextInvoiceNumber(), work_order_id: woid, stock_bike_id: null,
    customer_id: wo.customer_id, issued_at: now(), vat_scheme: 'standard',
    total_ex_vat_cents: wo.total_ex_vat_cents,
    total_vat_cents: wo.total_vat_cents,
    total_incl_vat_cents: wo.total_incl_vat_cents,
  }
  db.invoices.push(inv)
  track('invoices', 'insert', { id: inv.id, number: inv.number })
  persist()
  return inv
}

// ------------------------------------------------------------- berichten

const TEMPLATES: Record<string, (v: Record<string, string>) => string> = {
  // Altijd Nederlands: de klant leest dit (sectie 10.1).
  gereed: (v) => `Goedendag ${v.naam}, uw fiets (${v.fiets}) is klaar bij ${v.winkel}. `
    + `Het bedrag is ${v.bedrag}. Volg de status: ${v.link}`,
  offerte: (v) => `Goedendag ${v.naam}, wij hebben uw fiets (${v.fiets}) nagekeken. `
    + `De reparatie komt op ${v.bedrag}. Gaat u akkoord? ${v.link}`,
  onderdeel: (v) => `Goedendag ${v.naam}, het onderdeel voor uw fiets (${v.fiets}) is besteld. `
    + `Wij verwachten het binnen enkele dagen. Status: ${v.link}`,
  herinnering: (v) => `Goedendag ${v.naam}, uw fiets (${v.fiets}) staat al een tijd klaar bij `
    + `${v.winkel}. Wilt u hem ophalen? Bel ${v.telefoon} als het niet lukt.`,
  onderhoud: (v) => `Goedendag ${v.naam}, volgens onze administratie is uw fiets (${v.fiets}) `
    + `toe aan een onderhoudsbeurt. Bel ${v.telefoon} voor een afspraak bij ${v.winkel}.`,
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  const fn = TEMPLATES[template]
  return fn ? fn(vars) : ''
}

export function logNotification(
  channel: Notification['channel'], template: string, body: string,
  woid: string | null, customerId: string | null, contractId: string | null = null,
) {
  db.notifications.push({
    id: id('not'), work_order_id: woid, customer_id: customerId,
    service_contract_id: contractId, channel, template, body,
    sent_at: now(), status: 'verzonden', response_at: null,
  })
  if (woid) logEvent(woid, 'customer_contacted', { channel, template })
  track('notifications', 'insert', { template, channel })
  persist()
}

export function notificationsOf(woid: string): Notification[] {
  return db.notifications
    .filter((n) => n.work_order_id === woid)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}

// --------------------------------------------------------------- outbox

/**
 * Sectie 8.8 — wijzigingen worden lokaal opgeschreven en gaan later naar de
 * server. In fase 1 draait alles nog lokaal; deze rij is de aansluiting voor
 * de Supabase-adapter en voedt de indicator in de kop.
 */
/** In de test en op de server bestaat navigator niet; dan doen we alsof er net is. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function track(entity: string, operation: OutboxEntry['operation'], payload: Record<string, unknown>) {
  db.outbox.push({
    id: id('out'), at: now(), entity, operation, payload,
    synced_at: isOnline() ? now() : null,
  })
  // De rij mag niet oneindig groeien op een demotoestel.
  if (db.outbox.length > 500) db.outbox = db.outbox.slice(-200)
}

export function pendingOutbox(): OutboxEntry[] {
  return db.outbox.filter((o) => o.synced_at == null)
}

/** Wordt aangeroepen zodra het internet terug is. */
export function flushOutbox() {
  const stamp = now()
  let changed = false
  for (const entry of db.outbox) {
    if (entry.synced_at == null) { entry.synced_at = stamp; changed = true }
  }
  if (changed) persist()
}

// ================================================= fase 1: gebruikers en rollen

const USER_KEY = 'fietswerk.user'

export function users(): User[] {
  return db.users.filter((u) => u.active)
}

export function login(userId: string, pin: string): boolean {
  const user = db.users.find((u) => u.id === userId && u.active)
  if (!user || user.pin_code !== pin) return false
  try { localStorage.setItem(USER_KEY, user.id) } catch { /* privémodus */ }
  persist()
  return true
}

export function logout() {
  try { localStorage.removeItem(USER_KEY) } catch { /* privémodus */ }
  persist()
}

/** Geen automatische uitlog tijdens de werkdag (sectie 2.2): dit blijft staan. */
export function currentUserId(): string | null {
  try { return localStorage.getItem(USER_KEY) } catch { return null }
}

export function isLoggedIn(): boolean {
  const uid = currentUserId()
  return uid != null && db.users.some((u) => u.id === uid && u.active)
}

/** Alleen de eigenaar ziet omzet en rapporten. */
export function maySeeReports(): boolean {
  return (currentUser()?.role ?? 'owner') === 'owner'
}

// ================================================ fase 2: occasions (tweedehands)

export function stockBikes(): StockBike[] {
  return [...db.stock_bikes].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
}

export const stockBike = (sid: string) => db.stock_bikes.find((s) => s.id === sid)

export interface OccasionMargin {
  purchase_cents: number
  parts_cents: number
  labor_cents: number
  invested_cents: number
  /** Verkoopprijs of vraagprijs als er nog niet verkocht is. */
  price_cents: number
  margin_cents: number
  /** Btw over de marge: (verkoop - inkoop) x 21/121 (sectie 4.2). */
  margin_vat_cents: number
  net_margin_cents: number
  days_in_stock: number
}

/**
 * De echte marge, inclusief de uren die erin zitten (sectie 3.3). Zonder de
 * arbeid lijkt elke occasion winstgevend; dat is precies de fout die de winkel
 * zelf niet ziet.
 */
export function occasionMargin(stb: StockBike): OccasionMargin {
  const rate = db.settings.labor_cost_cents_per_hour
  const labor = Math.round((stb.refurb_minutes / 60) * rate)
  const invested = stb.purchase_price_cents + stb.refurb_parts_cents + labor
  const price = stb.sold_price_cents ?? stb.asking_price_cents
  const grossMargin = price - stb.purchase_price_cents
  const marginVat = stb.vat_scheme === 'margin' && grossMargin > 0
    ? Math.round((grossMargin * 21) / 121)
    : 0
  const end = stb.sold_at ? new Date(stb.sold_at).getTime() : Date.now()
  const days = Math.max(0, Math.floor((end - new Date(stb.purchase_date).getTime()) / 86_400_000))
  return {
    purchase_cents: stb.purchase_price_cents,
    parts_cents: stb.refurb_parts_cents,
    labor_cents: labor,
    invested_cents: invested,
    price_cents: price,
    margin_cents: price - invested,
    margin_vat_cents: marginVat,
    net_margin_cents: price - invested - marginVat,
    days_in_stock: days,
  }
}

export interface NewStockBikeInput {
  brand: string
  model: string | null
  category: Bike['category']
  frame_number: string
  color: string | null
  source: StockBike['source']
  seller_customer_id: string | null
  purchase_price_cents: number
  id_checked: boolean
  id_check_note: string | null
  stopheling_checked: boolean
  vat_scheme: StockBike['vat_scheme']
  asking_price_cents: number
  photos?: Photo[]
}

/**
 * Inkoop van een tweedehands fiets. Het formulier eist framenummer, gegevens
 * en ID van de verkoper en een stopheling-controle; de verkoopdatum wordt
 * geblokkeerd tot inkoopdatum + 5 werkdagen (sectie 4.1).
 */
export function createStockBike(input: NewStockBikeInput): StockBike {
  const bike = createBike({
    customer_id: null, brand: input.brand, model: input.model,
    category: input.category, frame_number: input.frame_number, color: input.color,
    photos: input.photos ?? [],
  })
  const purchaseDate = now()
  const stb: StockBike = {
    id: id('stb'), bike_id: bike.id, source: input.source,
    seller_customer_id: input.seller_customer_id,
    purchase_price_cents: input.purchase_price_cents, purchase_date: purchaseDate,
    id_checked: input.id_checked, id_check_note: input.id_check_note,
    stopheling_checked_at: input.stopheling_checked ? purchaseDate : null,
    dor_registered_at: db.settings.dor_enabled ? purchaseDate : null,
    sellable_from: addWorkingDays(purchaseDate, db.settings.dor_hold_working_days),
    vat_scheme: input.vat_scheme, inkoopverklaring_url: null,
    refurb_parts_cents: 0, refurb_minutes: 0,
    asking_price_cents: input.asking_price_cents, status: 'binnen',
    sold_price_cents: null, sold_at: null, sold_to_customer_id: null,
    photos: input.photos ?? [], notes: null,
  }
  db.stock_bikes.push(stb)
  track('stock_bikes', 'insert', { id: stb.id, frame_number: input.frame_number })
  persist()
  return stb
}

export function updateStockBike(sid: string, patch: Partial<StockBike>) {
  const stb = stockBike(sid)
  if (!stb) return
  Object.assign(stb, patch)
  track('stock_bikes', 'update', { id: sid })
  persist()
}

/** Verkopen mag pas na de bewaartermijn; hierop blokkeert de app (sectie 4.1). */
export function mayBeSold(stb: StockBike): boolean {
  return new Date(stb.sellable_from).getTime() <= Date.now()
}

/** Boven dit bedrag hoort een getekende inkoopverklaring bij de inkoop. */
export const INKOOPVERKLARING_LIMIT_CENTS = 50000

export function needsInkoopverklaring(stb: StockBike): boolean {
  return stb.vat_scheme === 'margin' && stb.purchase_price_cents >= INKOOPVERKLARING_LIMIT_CENTS
}

export function sellStockBike(
  sid: string, priceCents: number, customerId: string | null, method: PaymentMethod,
): Invoice | undefined {
  const stb = stockBike(sid)
  if (!stb || !mayBeSold(stb)) return undefined
  stb.status = 'verkocht'
  stb.sold_price_cents = priceCents
  stb.sold_at = now()
  stb.sold_to_customer_id = customerId
  if (customerId) updateBike(stb.bike_id, { customer_id: customerId })

  db.payments.push({
    id: id('pay'), work_order_id: null, stock_bike_id: sid, method,
    amount_cents: priceCents, at: now(), reference: null,
    user_id: currentUser()?.id ?? null,
  })

  // Bij de margeregeling staat er GEEN btw apart op de factuur (sectie 4.2).
  const margin = occasionMargin({ ...stb, sold_price_cents: priceCents })
  const inv: Invoice = {
    id: id('inv'), number: nextInvoiceNumber(), work_order_id: null, stock_bike_id: sid,
    customer_id: customerId ?? '', issued_at: now(),
    vat_scheme: stb.vat_scheme,
    total_ex_vat_cents: stb.vat_scheme === 'margin'
      ? priceCents
      : Math.round(priceCents / (1 + db.settings.vat_rate)),
    total_vat_cents: stb.vat_scheme === 'margin' ? 0 : priceCents - Math.round(priceCents / (1 + db.settings.vat_rate)),
    total_incl_vat_cents: priceCents,
  }
  db.invoices.push(inv)
  track('stock_bikes', 'update', {
    id: sid, sold: priceCents, margin_vat_cents: margin.margin_vat_cents,
  })
  persist()
  return inv
}

// ------------------------------------------------------ onderhoudsabonnementen

export function serviceContracts(): ServiceContract[] {
  return db.service_contracts.filter((c) => c.active)
}

export const serviceContract = (cid: string) => db.service_contracts.find((c) => c.id === cid)

/**
 * De meest onderschatte functie uit de specificatie (sectie 3.5): een
 * herinnering "tijd voor een beurt" levert geld op zonder advertenties.
 */
export function contractsDue(withinDays = 21): ServiceContract[] {
  const limit = Date.now() + withinDays * 86_400_000
  return serviceContracts()
    .filter((c) => new Date(c.next_due_at).getTime() <= limit)
    .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at))
}

export function markServiceDone(cid: string) {
  const c = serviceContract(cid)
  if (!c) return
  const next = new Date()
  next.setMonth(next.getMonth() + c.interval_months)
  c.last_service_at = now()
  c.next_due_at = next.toISOString()
  track('service_contracts', 'update', { id: cid })
  persist()
}

export function createServiceContract(input: Omit<ServiceContract, 'id'>): ServiceContract {
  const c: ServiceContract = { ...input, id: id('sc') }
  db.service_contracts.push(c)
  track('service_contracts', 'insert', { id: c.id })
  persist()
  return c
}

// ------------------------------------------------------------------- accu's

export function batteryLogsOf(woid: string): BatteryLog[] {
  return db.battery_logs
    .filter((b) => b.work_order_id === woid)
    .sort((a, b) => a.at.localeCompare(b.at))
}

export function batteriesOnCharger(): BatteryLog[] {
  const last = new Map<string, BatteryLog>()
  for (const log of [...db.battery_logs].sort((a, b) => a.at.localeCompare(b.at))) {
    if (log.work_order_id) last.set(log.work_order_id, log)
  }
  return [...last.values()].filter((l) => l.event === 'op_lader' || l.event === 'aangenomen')
}

/** Logboek voor de verzekeraar: accu aangenomen, op de lader, terug, uitgegeven. */
export function logBattery(woid: string, event: BatteryLog['event'], note: string | null = null) {
  const wo = workOrder(woid)
  db.battery_logs.push({
    id: id('bl'), work_order_id: woid, bike_id: wo?.bike_id ?? null,
    tag_code: wo?.tag_code ?? null, event, at: now(),
    user_id: currentUser()?.id ?? null, note,
  })
  logEvent(woid, 'note', { accu: event })
  track('battery_logs', 'insert', { work_order_id: woid, event })
  persist()
}

// ------------------------------------------------- niet-opgehaalde fietsen

export interface UncollectedBucket {
  days: number
  orders: WorkOrder[]
}

/** Rapport per leeftijd (sectie 3.1, punt 6): 14 / 30 / 60 / 90 dagen. */
export function uncollectedBuckets(): UncollectedBucket[] {
  const ready = db.work_orders.filter((w) => w.status === 'gereed' && w.ready_at != null)
  const buckets = [14, 30, 60, 90]
  return buckets.map((days, i) => {
    const upper = buckets[i + 1] ?? Infinity
    return {
      days,
      orders: ready.filter((w) => {
        const age = Math.floor((Date.now() - new Date(w.ready_at!).getTime()) / 86_400_000)
        return age >= days && age < upper
      }),
    }
  })
}

export function remindersOf(woid: string): Reminder[] {
  return db.reminders
    .filter((r) => r.work_order_id === woid)
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** Bewijsketen voor het retentierecht: elke stap wordt vastgelegd (sectie 4.3). */
export function addReminder(woid: string, step: Reminder['step'], channel: Reminder['channel']) {
  db.reminders.push({
    id: id('rem'), work_order_id: woid, step, at: now(), channel,
    note: null, user_id: currentUser()?.id ?? null,
  })
  logEvent(woid, 'customer_contacted', { reminder: step, channel })
  track('reminders', 'insert', { work_order_id: woid, step })
  persist()
}

// ------------------------------------------------------- export boekhouding

export type Bookkeeping = 'moneybird' | 'eboekhouden' | 'snelstart'

/**
 * Export naar de boekhouding (fase 2). Geen eigen boekhouding bouwen — dat
 * staat op de anti-scopelijst; alleen een bestand dat het pakket inleest.
 * Bedragen met komma, datums als dd-MM-yyyy: Nederlandse pakketten willen dat.
 */
export function exportInvoicesCsv(target: Bookkeeping, fromIso: string, toIso: string): string {
  const rows = db.invoices
    .filter((i) => i.issued_at >= fromIso && i.issued_at <= toIso)
    .sort((a, b) => a.issued_at.localeCompare(b.issued_at))

  const amount = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
  const day = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
  }

  const header = target === 'moneybird'
    ? ['factuurnummer', 'datum', 'contact', 'bedrag_excl', 'btw', 'bedrag_incl', 'btw_regeling']
    : target === 'eboekhouden'
      ? ['Factuurnummer', 'Datum', 'Relatie', 'Bedrag excl', 'BTW', 'Bedrag incl', 'Regeling']
      : ['Nummer', 'Datum', 'Debiteur', 'Excl', 'BTW', 'Incl', 'Regeling']

  const lines = [header.join(';')]
  for (const inv of rows) {
    const c = customer(inv.customer_id)
    const name = c ? `${c.first_name} ${c.last_name}`.trim() : 'Onbekend'
    lines.push([
      inv.number, day(inv.issued_at), name,
      amount(inv.total_ex_vat_cents), amount(inv.total_vat_cents),
      amount(inv.total_incl_vat_cents),
      inv.vat_scheme === 'margin' ? 'margeregeling' : 'normaal',
    ].join(';'))
  }
  return lines.join('\r\n')
}

/** Btw over de marge per periode, apart van de gewone omzet (sectie 4.2). */
export function marginVatReport(fromIso: string, toIso: string) {
  const sold = db.stock_bikes.filter(
    (s) => s.sold_at != null && s.sold_at >= fromIso && s.sold_at <= toIso && s.vat_scheme === 'margin',
  )
  let gross = 0
  let vat = 0
  for (const s of sold) {
    const margin = (s.sold_price_cents ?? 0) - s.purchase_price_cents
    if (margin <= 0) continue // Bij een negatieve marge geen btw en geen aftrek.
    gross += margin
    vat += Math.round((margin * 21) / 121)
  }
  return { count: sold.length, gross_margin_cents: gross, vat_cents: vat }
}
