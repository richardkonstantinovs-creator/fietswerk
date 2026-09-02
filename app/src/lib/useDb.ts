import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './db'

/**
 * Elk scherm dat data toont abonneert zich hierop. De opslaglaag is bewust
 * één bestand (db.ts), zodat er in fase 1 Supabase achter kan zonder dat de
 * schermen veranderen.
 */
export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
