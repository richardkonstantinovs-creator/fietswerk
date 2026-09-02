/**
 * Driver voor de Karsten Mini Pocket Printer (sectie 9.2).
 * Het apparaat hoort bij de familie "cat printers" (GB01/GB02/MX05/...).
 * Bevestig dit met tools/printer-probe.html VOORDAT u hierop bouwt:
 * als service ae30 er niet is, klopt dit protocol niet voor dit exemplaar.
 *
 * Buiten deze map weet niets in de app iets over Bluetooth (regel 14.7).
 */

export const SERVICE_UUID = '0000ae30-0000-1000-8000-00805f9b34fb'
export const WRITE_UUID = '0000ae01-0000-1000-8000-00805f9b34fb'
export const NOTIFY_UUID = '0000ae02-0000-1000-8000-00805f9b34fb'

const CMD = {
  RETRACT_PAPER: 0xa0,
  FEED_PAPER: 0xa1,
  DRAW_BITMAP: 0xa2,
  GET_DEVICE_STATE: 0xa3,
  SET_QUALITY: 0xa4,
  CONTROL_LATTICE: 0xa6,
  SET_ENERGY: 0xaf,
  DRAWING_MODE: 0xbe,
} as const

const LATTICE_START = [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c]
const LATTICE_END = [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17]

// CRC8, polynoom 0x07, over de payload.
const CRC_TABLE = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
    }
    table[i] = crc
  }
  return table
})()

export function crc8(data: ArrayLike<number>): number {
  let crc = 0
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[crc ^ data[i]]
  return crc
}

/** 0x51 0x78 <cmd> 0x00 <len_lo> <len_hi> <payload> <crc8> 0xFF */
export function packet(cmd: number, payload: ArrayLike<number>): Uint8Array {
  const len = payload.length
  const out = new Uint8Array(8 + len)
  out[0] = 0x51
  out[1] = 0x78
  out[2] = cmd
  out[3] = 0x00
  out[4] = len & 0xff
  out[5] = (len >> 8) & 0xff
  out.set(payload as ArrayLike<number>, 6)
  out[6 + len] = crc8(payload)
  out[7 + len] = 0xff
  return out
}

export interface PrinterEvents {
  onStatus?: (status: 'connected' | 'disconnected') => void
}

export class CatPrinter {
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
    if (!CatPrinter.supported()) return false
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

  /** Vraagt de browser om de printerkiezer. Moet uit een klik komen. */
  async connect(): Promise<void> {
    if (!CatPrinter.supported()) throw new Error('unsupported')
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    })
    await this.attach(device)
  }

  private async attach(device: BluetoothDevice) {
    this.device = device
    device.addEventListener('gattserverdisconnected', this.handleDisconnect)
    const server = await device.gatt!.connect()
    const service = await server.getPrimaryService(SERVICE_UUID)
    this.characteristic = await service.getCharacteristic(WRITE_UUID)
    this.events.onStatus?.('connected')
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

  private async write(bytes: Uint8Array) {
    const ch = this.characteristic
    if (!ch) throw new Error('disconnected')
    // Sectie 9.6: pakketjes van maximaal 180 byte met pauze ertussen.
    // Sneller schrijven verliest deze printer stilzwijgend data en dan
    // komt het label er gestreept uit.
    const CHUNK = 160
    for (let i = 0; i < bytes.length; i += CHUNK) {
      await ch.writeValueWithoutResponse(bytes.slice(i, i + CHUNK) as unknown as BufferSource)
      await sleep(15)
    }
  }

  async feed(steps: number) {
    await this.write(packet(CMD.FEED_PAPER, [steps & 0xff, (steps >> 8) & 0xff]))
  }

  /** Veilige test uit sectie 9.3, stap 3. */
  async testFeed() {
    await this.feed(30)
  }

  async printRows(rows: Uint8Array[], energy = 12000, feedSteps = 60) {
    await this.write(packet(CMD.SET_QUALITY, [0x33]))
    await this.write(packet(CMD.CONTROL_LATTICE, LATTICE_START))
    await this.write(packet(CMD.DRAWING_MODE, [0x00]))
    await this.write(packet(CMD.SET_ENERGY, [energy & 0xff, (energy >> 8) & 0xff]))
    for (const row of rows) {
      await this.write(packet(CMD.DRAW_BITMAP, row))
    }
    await this.feed(feedSteps)
    await this.write(packet(CMD.CONTROL_LATTICE, LATTICE_END))
  }

  async requestState() {
    await this.write(packet(CMD.GET_DEVICE_STATE, [0x00]))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}
