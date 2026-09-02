import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import nl from './nl.json'
import en from './en.json'
import type { Lang } from '../lib/types'

// Sectie 10 — NL is de standaard, EN is de stand voor de ontwikkelaar.
// Alles wat de klant ziet (bon, label, publieke statuspagina) blijft altijd NL.

type Dict = Record<string, string>
const DICTS: Record<Lang, Dict> = { nl: nl as Dict, en: en as Dict }

const STORAGE_KEY = 'fietswerk.lang'

export type Vars = Record<string, string | number>

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const raw = DICTS[lang][key] ?? DICTS.nl[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  )
}

/** Vertaler die altijd Nederlands geeft: labels, bonnen en de klantpagina. */
export function tNL(key: string, vars?: Vars): string {
  return translate('nl', key, vars)
}

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Vars) => string
}

const I18nContext = createContext<Ctx | null>(null)

function initialLang(): Lang {
  // Uit localStorage lezen vóór het profiel geladen is (sectie 10.2),
  // anders flikkert het scherm van taal.
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'nl' || saved === 'en') return saved
  } catch { /* privémodus */ }
  return 'nl'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* privémodus */ }
  }, [])

  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}

export function useT() {
  return useI18n().t
}
