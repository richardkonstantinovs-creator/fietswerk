// Domeinmodel volgens sectie 6 van de specificatie.
// ENUM-waarden staan in het Nederlands en worden NOOIT vertaald in de data.
// Vertalen gebeurt alleen bij het renderen (sectie 10.2).

export type Role = 'owner' | 'monteur' | 'balie'
export type Lang = 'nl' | 'en'

export interface User {
  id: string
  name: string
  role: Role
  pin_code: string
  ui_language: Lang
  active: boolean
}

export interface Settings {
  shop_name: string
  address: string
  phone: string
  kvk: string
  btw_id: string
  labor_rate_cents_per_hour: number
  /** Wat een werkplaatsuur de winkel zelf kost; nodig voor de echte marge
   *  op occasions (sectie 3.3). Zonder dit getal rekent de winkel zich rijk. */
  labor_cost_cents_per_hour: number
  default_approved_limit_cents: number
  vat_rate: number
  dor_enabled: boolean
  margin_scheme_enabled: boolean
  /** Aantal werkdagen dat een ingekochte fiets moet blijven staan (sectie 4.1). */
  dor_hold_working_days: number
  printer_config: {
    device_name: string | null
    energy: number
    feed_steps: number
    auto_print_afhaalbon: boolean
  }
}

export type CustomerType = 'particulier' | 'zakelijk'

export interface Customer {
  id: string
  type: CustomerType
  first_name: string
  last_name: string
  company: string | null
  phone: string // E.164, belangrijkste zoeksleutel
  email: string | null
  street: string | null
  postcode: string | null
  city: string | null
  notes: string | null
  marketing_consent: boolean
  created_at: string
  deleted_at: string | null
}

export type BikeCategory =
  | 'stadsfiets' | 'ebike' | 'racefiets' | 'mtb'
  | 'bakfiets' | 'kinderfiets' | 'vouwfiets' | 'overig'

export interface Bike {
  id: string
  customer_id: string | null
  brand: string
  model: string | null
  category: BikeCategory
  frame_number: string | null
  color: string | null
  model_year: number | null
  gears_type: 'naaf' | 'derailleur' | 'single' | null
  brake_type: string | null
  is_ebike: boolean
  motor_system: string | null
  battery_serial: string | null
  battery_wh: number | null
  battery_cycles: number | null
  display_type: string | null
  firmware_version: string | null
  last_diagnose_at: string | null
  lock_brand: string | null
  key_numbers: string[]
  accessories: string[]
  photos: Photo[]
  purchased_here_at: string | null
  warranty_until: string | null
  notes: string | null
}

export interface Photo {
  id: string
  data_url: string
  at: string
  label?: string
}

export type WorkOrderStatus =
  | 'aanname'
  | 'wachtrij'
  | 'wacht_op_akkoord'
  | 'wacht_op_onderdeel'
  | 'in_werkplaats'
  | 'gereed'
  | 'opgehaald'
  | 'geannuleerd'

export type Priority = 'normaal' | 'spoed' | 'wacht_klant'

export interface WorkOrder {
  id: string
  number: string // W-2026-0412
  bike_id: string
  customer_id: string
  status: WorkOrderStatus
  complaint: string
  diagnosis: string | null
  approved_limit_cents: number | null
  quote_cents: number | null
  quote_sent_at: string | null
  approved_at: string | null
  approved_by_channel: string | null
  mechanic_id: string | null
  rack_location: string | null
  tag_code: string | null
  public_token: string
  priority: Priority
  intake_at: string
  promised_at: string | null
  ready_at: string | null
  picked_up_at: string | null
  estimated_minutes: number | null
  actual_minutes: number | null
  total_ex_vat_cents: number
  total_vat_cents: number
  total_incl_vat_cents: number
  photos: Photo[]
  internal_notes: string | null
  left_behind: string[] // slot, sleutels, tassen, kinderzitje
  key_numbers: string[]
  /** Overgezet uit het papieren schrift: telt niet mee in omzet en boekhouding. */
  imported_at: string | null
}

export type LineKind = 'arbeid' | 'onderdeel' | 'overig'

export interface WorkOrderLine {
  id: string
  work_order_id: string
  kind: LineKind
  description: string
  part_id: string | null
  qty: number
  unit_price_ex_vat_cents: number
  vat_rate: number
  discount_pct: number
  line_total_ex_vat_cents: number
  minutes: number | null
}

export type WorkOrderEventType =
  | 'created' | 'status_changed' | 'quote_sent' | 'approved' | 'rejected'
  | 'customer_contacted' | 'part_ordered' | 'part_arrived' | 'printed'
  | 'note' | 'paid'

// APPEND-ONLY (sectie 6 + regel 14.3). Nooit wijzigen of verwijderen.
export interface WorkOrderEvent {
  id: string
  work_order_id: string
  at: string
  user_id: string | null
  event: WorkOrderEventType
  payload: Record<string, unknown>
}

export type TagKind = 'fiets' | 'accu' | 'locatie' | 'onderdeel'
export type TagStatus = 'vrij' | 'in_gebruik' | 'kwijt' | 'kapot'

export interface Tag {
  code: string // 6 tekens Crockford Base32
  kind: TagKind
  medium: 'geprint' | 'herbruikbaar'
  status: TagStatus
  work_order_id: string | null
  bike_id: string | null
  part_id: string | null
  bound_at: string | null
  bound_by: string | null
}

export interface TagScan {
  id: string
  tag_code: string
  at: string
  user_id: string | null
  work_order_id: string | null
  action: string
  device: string
}

export interface PrintJob {
  id: string
  kind: 'werkbon_label' | 'afhaalbon' | 'accu_label' | 'onderdeel_label'
  payload: Record<string, unknown>
  status: 'wacht' | 'gedrukt' | 'mislukt'
  created_at: string
  printed_at: string | null
  error: string | null
  retry_count: number
  user_id: string | null
}

// ---------------------------------------------------------------- fase 1

export type MovementReason =
  | 'verkoop' | 'reparatie' | 'inkoop' | 'correctie' | 'retour' | 'garantie'

export interface Part {
  id: string
  sku: string
  ean: string | null
  name: string
  category: string
  brand: string | null
  cost_price_cents: number
  sell_price_ex_vat_cents: number
  vat_rate: number
  stock_qty: number
  min_qty: number
  bin_location: string | null
  supplier_id: string | null
  supplier_sku: string | null
  active: boolean
}

export interface StockMovement {
  id: string
  part_id: string
  delta: number
  reason: MovementReason
  work_order_id: string | null
  at: string
  user_id: string | null
  note: string | null
}

export interface Supplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  customer_number: string | null
  order_method: 'email' | 'portaal' | 'telefoon'
  lead_time_days: number
}

export type PurchaseOrderStatus = 'concept' | 'besteld' | 'deels' | 'ontvangen'

export interface PurchaseOrder {
  id: string
  number: string
  supplier_id: string
  status: PurchaseOrderStatus
  ordered_at: string | null
  expected_at: string | null
  received_at: string | null
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  part_id: string | null
  description: string
  qty_ordered: number
  qty_received: number
  cost_price_cents: number
  /** De koppeling die de wachttijd zichtbaar maakt (sectie 3.1, punt 5). */
  work_order_id: string | null
}

export type PaymentMethod = 'pin' | 'contant' | 'ideal' | 'factuur' | 'lease'

export interface Payment {
  id: string
  work_order_id: string | null
  stock_bike_id: string | null
  method: PaymentMethod
  amount_cents: number
  at: string
  reference: string | null
  user_id: string | null
}

export interface Notification {
  id: string
  work_order_id: string | null
  customer_id: string | null
  service_contract_id: string | null
  channel: 'whatsapp' | 'sms' | 'email'
  template: string
  body: string
  sent_at: string
  status: 'verzonden' | 'mislukt'
  response_at: string | null
}

export interface Invoice {
  id: string
  number: string
  work_order_id: string | null
  stock_bike_id: string | null
  customer_id: string
  issued_at: string
  /** Margeregeling-facturen tonen GEEN btw apart (sectie 4.2). */
  vat_scheme: 'standard' | 'margin'
  total_ex_vat_cents: number
  total_vat_cents: number
  total_incl_vat_cents: number
}

/**
 * Uitgaande wijzigingen die nog naar de server moeten (sectie 8.8).
 * In fase 1 draait de winkel nog op de browseropslag; deze outbox is de plek
 * waar de Supabase-adapter straks op aansluit. De indicator in de kop leest
 * hier zijn tekst uit: "Alles opgeslagen" of "3 wijzigingen wachten op internet".
 */
export interface OutboxEntry {
  id: string
  at: string
  entity: string
  operation: 'insert' | 'update' | 'delete'
  payload: Record<string, unknown>
  synced_at: string | null
}

// ---------------------------------------------------------------- fase 2

export type StockBikeStatus = 'binnen' | 'opknappen' | 'te_koop' | 'gereserveerd' | 'verkocht'

export interface StockBike {
  id: string
  bike_id: string
  source: 'particulier' | 'inruil' | 'handelaar'
  seller_customer_id: string | null
  purchase_price_cents: number
  purchase_date: string
  /** Opkopersregister, art. 437 Sr (sectie 4.1). */
  id_checked: boolean
  id_check_note: string | null
  stopheling_checked_at: string | null
  dor_registered_at: string | null
  /** Inkoopdatum + 5 werkdagen; eerder verkopen mag niet. */
  sellable_from: string
  vat_scheme: 'margin' | 'standard'
  inkoopverklaring_url: string | null
  refurb_parts_cents: number
  refurb_minutes: number
  asking_price_cents: number
  status: StockBikeStatus
  sold_price_cents: number | null
  sold_at: string | null
  sold_to_customer_id: string | null
  photos: Photo[]
  notes: string | null
}

export interface ServiceContract {
  id: string
  bike_id: string
  customer_id: string
  type: 'basis' | 'compleet' | 'ebike'
  start_date: string
  interval_months: number
  price_cents: number
  next_due_at: string
  last_service_at: string | null
  active: boolean
}

/**
 * Accu's gaan los van de fiets naar de laadkast. Ze worden verwisseld en
 * kwijtgeraakt, en de verzekeraar wil zien dat er in een brandveilige kast
 * geladen is (sectie 3.4 en 8.6).
 */
export interface BatteryLog {
  id: string
  work_order_id: string | null
  bike_id: string | null
  tag_code: string | null
  event: 'aangenomen' | 'op_lader' | 'van_lader' | 'uitgegeven'
  at: string
  user_id: string | null
  note: string | null
}

/**
 * Bewijsketen voor niet-opgehaalde fietsen (sectie 4.3, retentierecht):
 * herinnering -> aangetekende brief -> termijn -> verkoop.
 */
export interface Reminder {
  id: string
  work_order_id: string
  step: 'herinnering_1' | 'herinnering_2' | 'aangetekende_brief' | 'termijn_verstreken'
  at: string
  channel: 'whatsapp' | 'email' | 'brief'
  note: string | null
  user_id: string | null
}

// ============================================ fase 3: rooster, uren en klokken

/**
 * Een geplande dienst. De dag is een kalenderdag in winkeltijd ('YYYY-MM-DD')
 * en geen tijdstempel: een dienst van 9 tot 17 verschuift niet mee met de
 * zomertijd en staat op de zaterdag waar de eigenaar hem neerzette.
 */
export interface Shift {
  id: string
  user_id: string
  date: string
  /** 'HH:MM' in winkeltijd. */
  start: string
  end: string
  /** Geplande pauze; die telt niet mee in de geplande uren. */
  break_minutes: number
  note: string | null
  created_at: string
}

export type AbsenceKind = 'vakantie' | 'ziek' | 'verlof'

/** Vrij, ziek of vakantie. Blokkeert een dag in het rooster. */
export interface Absence {
  id: string
  user_id: string
  from_date: string
  to_date: string
  kind: AbsenceKind
  note: string | null
  created_at: string
}

/**
 * Wat de medewerker zelf opgeeft: op deze dag kan ik wel of niet werken.
 * Dit is een wens, geen dienst. Roosteren blijft van de eigenaar.
 */
export interface Availability {
  id: string
  user_id: string
  date: string
  can_work: boolean
  /** Leeg = de hele dag; anders het venster waarin het kan. */
  from_time: string | null
  to_time: string | null
  note: string | null
  created_at: string
}

/** Hoe een uur in het systeem kwam. Handmatig is niet fout, maar wel anders. */
export type ClockSource = 'nfc' | 'qr' | 'handmatig'

/**
 * Een gewerkte periode: binnen en weer buiten. Zolang clock_out leeg is,
 * staat de medewerker nog in de winkel.
 */
export interface TimeEntry {
  id: string
  user_id: string
  date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  source: ClockSource
  note: string | null
  /** Wie het uur met de hand heeft rechtgezet. Zonder dit is achteraf niet te
   *  zien of een uur geklokt is of ingetypt, en daar gaat loon overheen. */
  edited_by: string | null
  edited_at: string | null
}

export interface Database {
  version: number
  settings: Settings
  users: User[]
  customers: Customer[]
  bikes: Bike[]
  work_orders: WorkOrder[]
  work_order_lines: WorkOrderLine[]
  work_order_events: WorkOrderEvent[]
  tags: Tag[]
  tag_scans: TagScan[]
  print_jobs: PrintJob[]
  // fase 1
  parts: Part[]
  stock_movements: StockMovement[]
  suppliers: Supplier[]
  purchase_orders: PurchaseOrder[]
  po_lines: PurchaseOrderLine[]
  payments: Payment[]
  notifications: Notification[]
  invoices: Invoice[]
  outbox: OutboxEntry[]
  // fase 2
  stock_bikes: StockBike[]
  service_contracts: ServiceContract[]
  battery_logs: BatteryLog[]
  reminders: Reminder[]
  // fase 3
  shifts: Shift[]
  absences: Absence[]
  availability: Availability[]
  time_entries: TimeEntry[]
}
