import { customAlphabet } from 'nanoid'

// Sectie 8.2 — Crockford Base32 zonder I, L, O, U.
// Die lijken op 1 en 0 en dat kost de oudere gebruiker de belangrijkste
// terugvaloptie: de code met de hand overtypen.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const makeTagCode = customAlphabet(CROCKFORD, 6)
const makePublicToken = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-', 21,
)

export function newTagCode(): string {
  return makeTagCode()
}

export function newPublicToken(): string {
  return makePublicToken()
}

/** 'W7K3QM' -> 'W7K-3QM'. Zo staat de code ook op de bierkaartjes gedrukt. */
export function formatTagCode(code: string): string {
  const c = normalizeTagCode(code)
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}

/**
 * Invoer van mens of scanner opschonen: hoofdletters, streepjes weg,
 * en de klassieke leesfouten corrigeren (I/L -> 1, O -> 0, U -> V).
 * De route op de server is hoofdletterongevoelig (sectie 8.3).
 */
export function normalizeTagCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
}

export function isTagCode(raw: string): boolean {
  return /^[0-9A-Z]{6}$/.test(normalizeTagCode(raw))
}

/** Werkbonnummer W-2026-0412: leesbaar en oplopend per jaar. */
export function nextWorkOrderNumber(existing: string[], now = new Date()): string {
  const year = now.getFullYear()
  const prefix = `W-${year}-`
  const highest = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/** Basispad van de app: '/' op een eigen domein, '/fietswerk/' in de demo. */
function base(): string {
  const value = import.meta.env.BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

/**
 * URL op het bierkaartje. Op een eigen domein staat alles in hoofdletters:
 * dan valt de QR in de alphanumeric-modus en blijft hij versie 2 met grotere
 * modules (sectie 8.3). Staat de app in een submap (demo), dan mag het pad
 * niet van hoofdletters veranderen, want die server is wél hoofdlettergevoelig.
 */
export function tagUrl(code: string): string {
  const path = `${base()}W/${normalizeTagCode(code)}`
  return base() === '/'
    ? `${window.location.origin}${path}`.toUpperCase()
    : `${window.location.origin}${path}`
}

/** Publieke statuspagina voor de klant. */
export function publicUrl(token: string): string {
  return `${window.location.origin}${base()}s/${token}`
}
