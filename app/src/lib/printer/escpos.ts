/**
 * Driver voor de Crafts&Co bonprinter en alle andere printers die ESC/POS
 * over Bluetooth spreken.
 *
 * Sectie 9.3 zegt: eerst uitzoeken tot welke familie een exemplaar hoort, dan
 * pas de driver. Dat is gedaan met tools/printer-probe.html. Deze printer
 * meldt geen service ae30 en spreekt dus niet het cat-printerprotocol uit
 * sectie 9.2; hij luistert op drie kanalen die allemaal hetzelfde doen:
 *
 *   CRAFTS&CO|4777_BLE
 *     service 000018f0  characteristic 00002af1   <- eerste keus
 *     service 0000ff00  characteristic 0000ff02
 *     service e7810a71  characteristic bef8d6c9
 *
 * Alle drie drukten de proefbon af, ook het rasterblokje. Op ff01 kwam niets
 * uit de printer: dat kanaal is alleen om te luisteren.
 *
 * Buiten deze map weet niets in de app iets over Bluetooth (regel 14.7).
 */

/** Kanalen in volgorde van voorkeur; het eerste dat bestaat, wordt gebruikt. */
export const KANALEN = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', write: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', write: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', write: '0000ffe1-0000-1000-8000-00805f9b34fb' },
] as const

export const SERVICES = [...new Set(KANALEN.map((k) => k.service))]

/** 384 punten breed, net als het label uit render.ts: 48 byte per regel. */
export const BYTES_PER_ROW = 48

const ESC = 0x1b
const GS = 0x1d

/** ESC @ — de printer terug op nul zetten. */
export const INIT = new Uint8Array([ESC, 0x40])

/**
 * ESC/POS zet bit 7 links, het label uit render.ts zet bit 0 links
 * (sectie 9.2, het cat-protocol). Zonder deze spiegeling komt elke regel
 * omgekeerd uit de printer en is de QR-code onleesbaar.
 */
const GESPIEGELD = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let byte = 0
    for (let bit = 0; bit < 8; bit++) if (i & (1 << bit)) byte |= 0x80 >> bit
    table[i] = byte
  }
  return table
})()

export function spiegelBits(row: Uint8Array): Uint8Array {
  const out = new Uint8Array(row.length)
  for (let i = 0; i < row.length; i++) out[i] = GESPIEGELD[row[i]]
  return out
}

/**
 * GS v 0 — rasterafdruk. Eén blok per keer, want een printer met een klein
 * geheugen slikt geen label van zeshonderd regels in één commando: dan komt
 * de onderste helft er niet uit.
 */
export function rasterBlok(rows: Uint8Array[]): Uint8Array {
  const hoogte = rows.length
  const out = new Uint8Array(8 + hoogte * BYTES_PER_ROW)
  out.set([
    GS, 0x76, 0x30, 0x00,
    BYTES_PER_ROW & 0xff, (BYTES_PER_ROW >> 8) & 0xff,
    hoogte & 0xff, (hoogte >> 8) & 0xff,
  ])
  rows.forEach((row, i) => { out.set(spiegelBits(row), 8 + i * BYTES_PER_ROW) })
  return out
}

/** ESC J n — n punten papier doorvoeren; meer dan 255 in meerdere keren. */
export function papierDoorvoeren(punten: number): Uint8Array {
  const stukken: number[] = []
  let rest = Math.max(0, Math.round(punten))
  while (rest > 0) {
    const n = Math.min(rest, 255)
    stukken.push(ESC, 0x4a, n)
    rest -= n
  }
  return new Uint8Array(stukken)
}

export interface PrinterEvents {
  onStatus?: (status: 'connected' | 'disconnected') => void
}

/** Hoogte van één rasterblok. Ruim onder het geheugen van deze printers. */
const BLOK_REGELS = 64

export class EscPosPrinter {
  private device: BluetoothDevice | null = null
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null
  private events: PrinterEvents

  constructor(events: PrinterEvents = {}) {
    this.events = events
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  get connected(): boolean {
    return this.characteristic != null && this.device?.gatt?.connected === true
  }

  get deviceName(): string | null {
    return this.device?.name ?? null
  }

  /** Stil opnieuw verbinden met een printer die de gebruiker eerder koos (sectie 9.7). */
  async reconnectKnown(): Promise<boolean> {
    if (!EscPosPrinter.supported()) return false
    const bt = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }
    if (!bt.getDevices) return false
    try {
      const devices = await bt.getDevices()
      for (const device of devices) {
        try {
          await this.attach(device)
          return true
        } catch { /* volgende proberen */ }
      }
    } catch { /* geen toestemming, dan handmatig verbinden */ }
    return false
  }

  /**
   * Vraagt de browser om de printerkiezer. Moet uit een klik komen.
   *
   * Zonder filter: deze printer zet zijn services niet in het reclamepraatje
   * waarmee hij zich meldt, dus een filter op service laat een lege lijst zien
   * en dan lijkt de printer stuk. De gebruiker kiest hem één keer aan zijn
   * naam; daarna verbindt reconnectKnown() vanzelf.
   */
  async connect(): Promise<void> {
    if (!EscPosPrinter.supported()) throw new Error('unsupported')
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [...SERVICES],
    })
    await this.attach(device)
  }

  private async attach(device: BluetoothDevice) {
    this.device = device
    device.addEventListener('gattserverdisconnected', this.handleDisconnect)
    const server = await device.gatt!.connect()
    for (const kanaal of KANALEN) {
      try {
        const service = await server.getPrimaryService(kanaal.service)
        this.characteristic = await service.getCharacteristic(kanaal.write)
        this.events.onStatus?.('connected')
        return
      } catch { /* volgend kanaal proberen */ }
    }
    server.disconnect()
    throw new Error('geen ESC/POS-kanaal op dit apparaat')
  }

  private handleDisconnect = () => {
    this.characteristic = null
    this.events.onStatus?.('disconnected')
  }

  async disconnect() {
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect)
    this.device?.gatt?.disconnect()
    this.characteristic = null
    this.device = null
    this.events.onStatus?.('disconnected')
  }

  /**
   * Deze printers zeggen niet welke schrijfwijze ze aankunnen — in de dump
   * staat bij elke characteristic een lege lijst eigenschappen. Dus: eerst
   * zonder antwoord, en pas als dat niet mag met antwoord.
   */
  private async writeChunk(ch: BluetoothRemoteGATTCharacteristic, chunk: Uint8Array) {
    try {
      await ch.writeValueWithoutResponse(chunk as unknown as BufferSource)
    } catch {
      await ch.writeValue(chunk as unknown as BufferSource)
    }
  }

  private async write(bytes: Uint8Array) {
    const ch = this.characteristic
    if (!ch) throw new Error('disconnected')
    // Sectie 9.6: kleine pakketjes met een pauze ertussen. Sneller schrijven
    // verliest deze printer stilzwijgend data en dan komt het label er
    // gestreept uit.
    const CHUNK = 128
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await this.writeChunk(ch, bytes.slice(i, i + CHUNK))
      await sleep(20)
    }
  }

  async feed(punten: number) {
    await this.write(papierDoorvoeren(punten))
  }

  /** Veilige test uit sectie 9.3, stap 3. */
  async testFeed() {
    await this.write(INIT)
    await this.feed(60)
  }

  /**
   * Het label afdrukken. `energy` hoort bij het cat-protocol en heeft in
   * ESC/POS geen tegenhanger die elke printer kent; de zwarting staat bij deze
   * printer vast. De waarde blijft in de instellingen staan voor het geval er
   * ooit een printer bij komt die er wel iets mee doet.
   */
  async printRows(rows: Uint8Array[], _energy = 12000, feedSteps = 60) {
    await this.write(INIT)
    for (let i = 0; i < rows.length; i += BLOK_REGELS) {
      await this.write(rasterBlok(rows.slice(i, i + BLOK_REGELS)))
    }
    await this.feed(feedSteps)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}
