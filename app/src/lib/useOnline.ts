import { useEffect, useState } from 'react'
import { flushOutbox, isOnline } from './db'

/**
 * Sectie 8.8 — de wifi in de werkplaats is slecht. Zodra het net terug is,
 * gaat de wachtrij vanzelf weg; de gebruiker hoeft niets te doen en ziet
 * alleen menselijke tekst in de kop.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)

  useEffect(() => {
    function up() { setOnline(true); flushOutbox() }
    function down() { setOnline(false) }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
