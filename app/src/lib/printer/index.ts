import { CatPrinter } from './catPrinter'
import { canvasToRows, renderLabel } from './render'
import type { LabelContent } from './render'
import type { PrintJob } from '../types'
import * as db from '../db'
import { tNL } from '../../i18n'
import { date, money } from '../format'
import { publicUrl, tagUrl } from '../code'

/**
 * De rest van de app kent alleen dit bestand (regel 14.7):
 * printer.print(job), printer.status, printer.connect().
 * Wisselt de printer ooit, dan verandert alleen deze map.
 */

export type PrinterStatus = 'unsupported' | 'disconnected' | 'connecting' | 'ready' | 'printing'

type Listener = () => void

class PrinterManager {
  private printer = new CatPrinter({
    onStatus: (s) => this.setStatus(s === 'connected' ? 'ready' : 'disconnected'),
  })

  private listeners = new Set<Listener>()
  private _status: PrinterStatus = CatPrinter.supported() ? 'disconnected' : 'unsupported'
  private _error: string | null = null
  private version = 0
  private draining = false

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  snapshot = () => this.version

  get status(): PrinterStatus { return this._status }
  get error(): string | null { return this._error }
  get deviceName(): string | null { return this.printer.deviceName }

  private setStatus(s: PrinterStatus, error: string | null = null) {
    this._status = s
    this._error = error
    this.version += 1
    this.listeners.forEach((l) => l())
    if (s === 'ready') void this.drain()
  }

  /** Bij het starten stil opnieuw verbinden, zonder dat iemand iets hoeft te doen. */
  async autoConnect() {
    if (this._status === 'unsupported') return
    const ok = await this.printer.reconnectKnown()
    this.setStatus(ok ? 'ready' : 'disconnected')
  }

  async connect() {
    if (this._status === 'unsupported') return
    this.setStatus('connecting')
    try {
      await this.printer.connect()
      this.setStatus('ready')
    } catch (e) {
      this.setStatus('disconnected', errorKey(e))
    }
  }

  async disconnect() {
    await this.printer.disconnect()
  }

  async testFeed() {
    if (!this.printer.connected) return
    await this.printer.testFeed()
  }

  /**
   * Eén opdracht printen. Lukt het niet, dan blijft de opdracht in de wachtrij
   * staan: de aanname is dan al opgeslagen en de gebruiker hoeft niet te kiezen
   * tussen bewaren en printen (sectie 9.7).
   */
  async print(job: PrintJob): Promise<void> {
    if (!this.printer.connected) throw new Error('disconnected')
    const content = labelForJob(job)
    if (!content) { db.markPrinted(job.id, false, 'geen gegevens'); return }
    const rows = canvasToRows(renderLabel(content))
    const cfg = db.settings().printer_config
    this.setStatus('printing')
    try {
      await this.printer.printRows(rows, cfg.energy, cfg.feed_steps)
      db.markPrinted(job.id, true)
      const woid = job.payload.work_order_id as string | undefined
      if (woid) db.logEvent(woid, 'printed', { kind: job.kind })
      this.setStatus('ready')
    } catch (e) {
      db.markPrinted(job.id, false, String(e))
      this.setStatus('disconnected', errorKey(e))
      throw e
    }
  }

  /** Alles wat tijdens de storing is blijven staan alsnog printen. */
  async drain() {
    if (this.draining) return
    this.draining = true
    try {
      for (const job of db.pendingPrintJobs()) {
        if (!this.printer.connected) break
        try { await this.print(job) } catch { break }
      }
    } finally {
      this.draining = false
    }
  }
}

function errorKey(e: unknown): string {
  const msg = String(e)
  if (msg.includes('unsupported')) return 'printer.unsupported'
  return 'printer.error_off'
}

/**
 * Inhoud van het label. Altijd Nederlands, ook als het scherm op Engels staat
 * (sectie 10.1): de klant en de monteur lezen dit, niet de ontwikkelaar.
 */
export function labelForJob(job: PrintJob): LabelContent | null {
  const woid = job.payload.work_order_id as string | undefined
  if (!woid) return null
  const wo = db.workOrder(woid)
  if (!wo || !wo.tag_code) return null
  const customer = db.customer(wo.customer_id)
  const bike = db.bike(wo.bike_id)
  const s = db.settings()
  const footer = `${s.shop_name}  ${s.phone}`
  const lines = [
    `${bike?.brand ?? ''} ${bike?.model ?? ''}`.trim(),
    customer ? `Fam. ${customer.last_name}` : '',
    date(wo.intake_at),
    wo.complaint,
  ]

  if (job.kind === 'accu_label') {
    // Het label op de accu wijst naar dezelfde werkbon als dat op het stuur.
    const label = db.batteryTag(wo.id)
    const code = label?.code ?? wo.tag_code
    return {
      qrText: tagUrl(code),
      code,
      lines: [
        'ACCU',
        `${bike?.brand ?? ''} ${bike?.model ?? ''}`.trim(),
        customer ? `Fam. ${customer.last_name}` : '',
        bike?.battery_serial ?? '',
        date(wo.intake_at),
      ],
      footer,
    }
  }

  if (job.kind === 'afhaalbon') {
    return {
      qrText: publicUrl(wo.public_token),
      code: wo.tag_code,
      lines: [...lines, 'Volg de status van uw fiets', 'met deze QR-code'],
      note: wo.approved_limit_cents != null
        ? `Akkoord tot: ${money(wo.approved_limit_cents)}`
        : undefined,
      footer,
    }
  }

  return {
    qrText: tagUrl(wo.tag_code),
    code: wo.tag_code,
    lines,
    note: wo.approved_limit_cents != null
      ? `Akkoord tot: ${money(wo.approved_limit_cents)}`
      : undefined,
    footer,
  }
}

/** Voorbeeld op het scherm, zodat de eigenaar het label ziet zonder papier. */
export function previewCanvas(job: PrintJob): HTMLCanvasElement | null {
  const content = labelForJob(job)
  return content ? renderLabel(content) : null
}

export const printer = new PrinterManager()

export function printerStatusText(status: PrinterStatus): string {
  return status === 'ready' ? tNL('printer.ready') : tNL('printer.disconnected')
}
