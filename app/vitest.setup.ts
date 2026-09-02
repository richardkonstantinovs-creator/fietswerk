// Node heeft geen localStorage; de opslaglaag van fase 0 gebruikt die wel.
// Een klein geheugenmodel is genoeg om de doorloop te testen.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(key: string) { return this.map.get(key) ?? null }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  removeItem(key: string) { this.map.delete(key) }
  setItem(key: string, value: string) { this.map.set(key, value) }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(), writable: true, configurable: true,
})

// Sommige modules bouwen URL's op window.location.origin. In de rooktest is er
// geen browser; dit is genoeg om de schermen te laten renderen.
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin: 'http://localhost:5173' } },
    writable: true, configurable: true,
  })
}
