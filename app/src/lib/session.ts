/**
 * Fase 0 kent nog geen inloggen (dat staat in fase 1). Toch mag een bierkaartje
 * dat een vreemde in de winkel scant geen klantgegevens tonen (sectie 8.1, AVG).
 * Daarom deze minimale schakelaar: wie de app in de winkel gebruikt, zet hem
 * één keer aan; een telefoon van een voorbijganger heeft hem niet.
 */
const KEY = 'fietswerk.session'

export function hasStaffSession(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setStaffSession(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* privémodus */ }
}
