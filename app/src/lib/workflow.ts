import type { WorkOrder, WorkOrderStatus } from './types'

// Regel 14.6 — alle statussen en overgangen staan hier, nergens anders.

export const STATUS_ORDER: WorkOrderStatus[] = [
  'aanname',
  'wachtrij',
  'wacht_op_akkoord',
  'wacht_op_onderdeel',
  'in_werkplaats',
  'gereed',
  'opgehaald',
  'geannuleerd',
]

/** Statussen die op het werkplaatsscherm als sectie verschijnen (sectie 7.1). */
export const BOARD_STATUSES: WorkOrderStatus[] = [
  'wachtrij',
  'in_werkplaats',
  'wacht_op_akkoord',
  'wacht_op_onderdeel',
  'gereed',
]

export const OPEN_STATUSES: WorkOrderStatus[] = [
  'aanname', 'wachtrij', 'wacht_op_akkoord', 'wacht_op_onderdeel', 'in_werkplaats', 'gereed',
]

export function isOpen(status: WorkOrderStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

/** Kleuren van de statusplaat. Alle combinaties halen 7:1 op wit (sectie 2.2). */
export const STATUS_STYLE: Record<WorkOrderStatus, { bg: string; fg: string }> = {
  aanname: { bg: '#E6E6E6', fg: '#111111' },
  wachtrij: { bg: '#DCE7F7', fg: '#08386F' },
  wacht_op_akkoord: { bg: '#F6E4C8', fg: '#5C3A00' },
  wacht_op_onderdeel: { bg: '#F3DAD8', fg: '#7A1610' },
  in_werkplaats: { bg: '#DCE9DE', fg: '#0B4A22' },
  gereed: { bg: '#0F6D31', fg: '#FFFFFF' },
  opgehaald: { bg: '#E6E6E6', fg: '#3A3A3A' },
  geannuleerd: { bg: '#E6E6E6', fg: '#3A3A3A' },
}

export interface Transition {
  to: WorkOrderStatus
  /** i18n-sleutel voor het knoplabel. */
  labelKey: string
  /** true = dit is de ene grote knop onderaan het scherm (sectie 2.2, 7.3). */
  primary?: boolean
  /** Bevestiging vragen, want de stap is niet zomaar terug te draaien. */
  confirmKey?: string
}

/**
 * Toegestane overgangen per status. De eerste met primary: true is de
 * hoofdknop van het werkbonscherm en van het scanscherm (sectie 8.4).
 */
export const TRANSITIONS: Record<WorkOrderStatus, Transition[]> = {
  aanname: [
    { to: 'wachtrij', labelKey: 'action.to_wachtrij', primary: true },
    { to: 'geannuleerd', labelKey: 'action.cancel', confirmKey: 'confirm.cancel' },
  ],
  wachtrij: [
    { to: 'in_werkplaats', labelKey: 'action.start_work', primary: true },
    { to: 'wacht_op_akkoord', labelKey: 'action.send_quote' },
    { to: 'wacht_op_onderdeel', labelKey: 'action.order_part' },
    { to: 'geannuleerd', labelKey: 'action.cancel', confirmKey: 'confirm.cancel' },
  ],
  wacht_op_akkoord: [
    { to: 'in_werkplaats', labelKey: 'action.customer_agreed', primary: true },
    { to: 'wachtrij', labelKey: 'action.back_to_queue' },
    { to: 'geannuleerd', labelKey: 'action.customer_declined', confirmKey: 'confirm.cancel' },
  ],
  wacht_op_onderdeel: [
    { to: 'in_werkplaats', labelKey: 'action.part_arrived', primary: true },
    { to: 'wachtrij', labelKey: 'action.back_to_queue' },
    { to: 'geannuleerd', labelKey: 'action.cancel', confirmKey: 'confirm.cancel' },
  ],
  in_werkplaats: [
    { to: 'gereed', labelKey: 'action.mark_ready', primary: true },
    { to: 'wacht_op_onderdeel', labelKey: 'action.order_part' },
    { to: 'wacht_op_akkoord', labelKey: 'action.send_quote' },
    { to: 'wachtrij', labelKey: 'action.back_to_queue' },
  ],
  gereed: [
    { to: 'opgehaald', labelKey: 'action.checkout', primary: true },
    { to: 'in_werkplaats', labelKey: 'action.back_to_workshop' },
  ],
  opgehaald: [
    { to: 'wachtrij', labelKey: 'action.reopen', confirmKey: 'confirm.reopen' },
  ],
  geannuleerd: [
    { to: 'wachtrij', labelKey: 'action.reopen', confirmKey: 'confirm.reopen' },
  ],
}

export function primaryTransition(status: WorkOrderStatus): Transition | null {
  return TRANSITIONS[status].find((t) => t.primary) ?? null
}

export function otherTransitions(status: WorkOrderStatus): Transition[] {
  return TRANSITIONS[status].filter((t) => !t.primary)
}

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].some((t) => t.to === to)
}

/** Tijdstempels die bij een statuswissel horen. */
export function timestampsFor(to: WorkOrderStatus, now: string): Partial<WorkOrder> {
  switch (to) {
    case 'gereed': return { ready_at: now }
    case 'opgehaald': return { picked_up_at: now }
    case 'wacht_op_akkoord': return { quote_sent_at: now }
    case 'in_werkplaats': return { approved_at: now }
    default: return {}
  }
}

/** Hoeveel dagen mag een bon in deze status staan voordat het rood wordt (sectie 7.1). */
export const STUCK_DAYS = 3
/** Grens voor "vastgelopen" in het overzicht van de eigenaar (sectie 7.7). */
export const STUCK_DAYS_OWNER = 7

/** Sinds wanneer staat de bon in de huidige status. */
export function statusSince(wo: WorkOrder): string {
  if (wo.status === 'opgehaald' && wo.picked_up_at) return wo.picked_up_at
  if (wo.status === 'gereed' && wo.ready_at) return wo.ready_at
  if (wo.status === 'in_werkplaats' && wo.approved_at) return wo.approved_at
  if (wo.status === 'wacht_op_akkoord' && wo.quote_sent_at) return wo.quote_sent_at
  return wo.intake_at
}

/** Overschrijdt de bon het bedrag waarvoor de klant toestemming gaf (sectie 3.1)? */
export function exceedsApprovedLimit(wo: WorkOrder): boolean {
  if (wo.approved_limit_cents == null) return false
  if (wo.approved_at) return false
  return wo.total_incl_vat_cents > wo.approved_limit_cents
}
