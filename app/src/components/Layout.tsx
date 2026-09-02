import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useI18n, useT } from '../i18n'
import { printer } from '../lib/printer'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { Button } from './ui'
import { useHidScanner } from '../lib/scanner'
import { useOnline } from '../lib/useOnline'
import { setStaffSession } from '../lib/session'

export function usePrinterStatus() {
  useSyncExternalStore(printer.subscribe, printer.snapshot, printer.snapshot)
  return { status: printer.status, error: printer.error, deviceName: printer.deviceName }
}

const CHIP = 'inline-flex items-center gap-2 px-3 py-1 rounded-xl border-2 font-semibold text-xs'
const CHIP_OK = 'bg-[#E3F0E7] border-ok text-[#0B4A22]'

/**
 * Sectie 9.7 — grote, permanente printerindicator met één knop. Geen jargon.
 *
 * Eén uitzondering: een browser zonder bluetooth (Safari op de iPhone) kan
 * nooit printen. Een rode plaat die de monteur de hele dag niet kan wegwerken
 * is geen indicator meer maar behang, en hij nam boven elk scherm twee regels.
 * Op zo'n toestel staat de uitleg in het menu "Meer".
 */
function PrinterBadge() {
  const t = useT()
  const { status } = usePrinterStatus()
  useDbVersion()
  const waiting = db.pendingPrintJobs().length

  if (status === 'unsupported') return null

  const ready = status === 'ready' || status === 'printing'
  return (
    <>
      <span className={[CHIP, ready ? CHIP_OK : 'bg-[#FBEAE9] border-danger text-[#7A1610]'].join(' ')}>
        <span aria-hidden="true">{ready ? '●' : '○'}</span>
        {status === 'connecting' ? t('printer.connecting')
          : ready ? t('printer.ready') : t('printer.disconnected')}
      </span>
      {!ready && (
        <Button variant="secondary" className="text-sm px-4" onClick={() => { void printer.connect() }}>
          {t('printer.connect')}
        </Button>
      )}
      {waiting > 0 && (
        <span className="text-xs font-semibold text-warn">{t('printer.queue', { count: waiting })}</span>
      )}
    </>
  )
}

/** De uitleg over de printer, alleen daar waar hij niet in de weg staat. */
function PrinterNote() {
  const t = useT()
  const { status } = usePrinterStatus()
  if (status !== 'unsupported') return null
  return <p className="text-sm text-muted">{t('printer.unsupported')}</p>
}

/**
 * Sectie 8.8 — de staat van de verbinding in gewone woorden. Nooit een
 * wolkje zonder tekst: dan weet niemand wat er aan de hand is.
 */
function SyncBadge() {
  const t = useT()
  const online = useOnline()
  useDbVersion()
  const waiting = db.pendingOutbox().length

  const ok = online && waiting === 0
  return (
    <span className={[CHIP, ok ? CHIP_OK : 'bg-[#FBEFDB] border-warn text-[#5C3A00]'].join(' ')}>
      <span aria-hidden="true">{ok ? '●' : '○'}</span>
      {ok ? t('sync.saved') : waiting > 0 ? t('sync.waiting', { count: waiting }) : t('sync.offline')}
    </span>
  )
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold">{t('lang.switch')}</span>
      <div className="flex gap-3">
        {(['nl', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={[
              'min-h-touch min-w-touch px-4 rounded-xl border-2 font-semibold',
              lang === l ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink',
            ].join(' ')}
          >
            {t(`lang.${l}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Wie er werkt staat onderin de zijbalk, op de telefoon achter "Meer".
 * Afmelden en de taal gebeuren een paar keer per jaar en staan daarom achter
 * "Instellingen"; zo houdt de kop van het scherm één regel over voor de dingen
 * die de hele dag meekijken: de printer en het opslaan.
 */
function UserBadge({ withLogout, compact }: { withLogout?: boolean; compact?: boolean }) {
  const t = useT()
  useDbVersion()
  const user = db.currentUser()
  if (!user) return null
  if (compact) {
    return (
      <span className="block min-w-0">
        <span className="block text-sm font-semibold truncate">{user.name}</span>
        <span className="block text-xs text-muted truncate">{t(`role.${user.role}`)}</span>
      </span>
    )
  }
  return (
    <span className={withLogout ? 'flex flex-col gap-3' : 'block min-w-0'}>
      <span className={withLogout ? 'text-sm font-semibold' : 'block text-sm font-semibold truncate'}>
        {t('login.logged_in_as', { name: `${user.name} (${t(`role.${user.role}`)})` })}
      </span>
      {withLogout && (
        <Button onClick={() => { db.logout(); window.location.assign('/') }}>
          {t('login.logout')}
        </Button>
      )}
    </span>
  )
}

/* --------------------------------------------------------------------------
 * Navigatie. Op de telefoon staan alleen de twee schermen die een monteur de
 * hele dag gebruikt onderaan binnen duimbereik; de rest zit achter "Meer".
 * Op tablet en pc is er ruimte naast het scherm en staat alles in de zijbalk.
 * ----------------------------------------------------------------------- */

const TABS = [
  { to: '/', key: 'nav.werkplaats', icon: IconWerkplaats },
  { to: '/scan', key: 'nav.scan_short', icon: IconScan },
]

/**
 * Zijbalk op tablet en pc (sectie 2.2: twee niveaus, alles zichtbaar). Elke
 * bestemming staat onder elkaar aan de linkerkant, altijd allemaal in beeld.
 *
 * Geen kopjes boven groepjes en geen naam van de winkel als knop: elke regel
 * die geen bestemming is, kost een regel die dat wel is, en dan moet er in het
 * menu gescrold worden. De volgorde doet het werk van de kopjes: eerst de twee
 * schermen van de werkdag, dan de winkel, dan de cijfers.
 */
const ZIJBALK: { to: string; key: string; icon: () => ReactNode }[] = [
  { to: '/', key: 'nav.werkplaats', icon: IconWerkplaats },
  { to: '/scan', key: 'nav.scan_short', icon: IconScan },
  { to: '/onderdelen', key: 'nav.onderdelen', icon: IconOnderdelen },
  { to: '/bestellingen', key: 'bestellingen.title', icon: IconBestellingen },
  { to: '/occasions', key: 'nav.occasions', icon: IconOccasions },
  { to: '/accus', key: 'accus.title', icon: IconAccus },
  { to: '/klanten', key: 'nav.klanten', icon: IconKlanten },
  { to: '/abonnementen', key: 'nav.abonnementen', icon: IconAbonnementen },
  { to: '/overzicht', key: 'nav.overzicht', icon: IconOverzicht },
  { to: '/rapporten', key: 'rapporten.title', icon: IconRapporten },
]

/** Alles wat niet in de onderbalk past. Eén lijst, één plek om aan te passen. */
const MEER = [
  { to: '/onderdelen', key: 'nav.onderdelen', icon: IconOnderdelen },
  { to: '/klanten', key: 'nav.klanten', icon: IconKlanten },
  { to: '/occasions', key: 'nav.occasions', icon: IconOccasions },
  { to: '/overzicht', key: 'nav.overzicht', icon: IconOverzicht },
  { to: '/bestellingen', key: 'bestellingen.title', icon: IconBestellingen },
  { to: '/abonnementen', key: 'abonnementen.title', icon: IconAbonnementen },
  { to: '/accus', key: 'accus.title', icon: IconAccus },
  { to: '/rapporten', key: 'rapporten.title', icon: IconRapporten },
]

/**
 * Een kaart hoort bij de lijst waar hij uit komt (sectie 2.2: hoofdscherm ->
 * lijst -> kaart). Zonder deze tabel licht er niets op zodra je een werkbon of
 * een onderdeel opent, en weet niemand meer waar hij is.
 */
const SECTIE_KAARTEN: Record<string, string[]> = {
  '/': ['/werkbon/', '/aanname'],
  '/onderdelen': ['/onderdeel/'],
  '/klanten': ['/klant/'],
  '/occasions': ['/occasion/'],
  '/bestellingen': ['/bestelling/'],
}

function isActive(pathname: string, to: string): boolean {
  if (pathname === to) return true
  if (to !== '/' && pathname.startsWith(to)) return true
  return (SECTIE_KAARTEN[to] ?? []).some((kaart) => pathname.startsWith(kaart))
}

/* Pictogrammen staan nooit alleen: er hoort altijd tekst onder (sectie 2.2). */
function IconWerkplaats() {
  return (
    <svg {...SVG}>
      <circle cx="4.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  )
}

function IconScan() {
  return (
    <svg {...SVG}>
      <path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M3 12h18" />
    </svg>
  )
}

function IconMeer() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

// 60 px hoog + 8 px lucht boven en onder + de rand = de 78 px waar --tabbar in
// index.css mee rekent. Wie dit verandert, verandert daar het getal mee.
const SVG = {
  width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true,
}

function IconOnderdelen() {
  return (
    <svg {...SVG}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </svg>
  )
}

function IconKlanten() {
  return (
    <svg {...SVG}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

function IconOccasions() {
  return (
    <svg {...SVG}>
      <circle cx="5.5" cy="16.5" r="4" />
      <circle cx="18.5" cy="16.5" r="4" />
      <path d="M5.5 16.5 10 8h5l3.5 8.5M8 8h4" />
    </svg>
  )
}

function IconOverzicht() {
  return (
    <svg {...SVG}>
      <path d="M5 20V11M12 20V4M19 20v-6" />
    </svg>
  )
}

function IconBestellingen() {
  return (
    <svg {...SVG}>
      <path d="M8 4h8l1 3H7z" />
      <path d="M5.5 7h13l-1 13h-11z" />
      <path d="M12 11v5M9.5 13.5 12 16l2.5-2.5" />
    </svg>
  )
}

function IconAbonnementen() {
  return (
    <svg {...SVG}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4M9 15l2 2 4-4" />
    </svg>
  )
}

function IconAccus() {
  return (
    <svg {...SVG}>
      <rect x="2.5" y="7.5" width="16" height="9" rx="2" />
      <path d="M21.5 11v2M6 10.5v3M10 10.5v3" />
    </svg>
  )
}

function IconRapporten() {
  return (
    <svg {...SVG}>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5M9 13h6M9 16.5h4" />
    </svg>
  )
}

const TAB_CLASS = 'h-[60px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 border-2 font-semibold text-xs leading-none no-underline'

/** Onderbalk: alleen op de telefoon, altijd zichtbaar, nooit op papier. */
function TabBar({ onMeer, meerOpen }: { onMeer: () => void; meerOpen: boolean }) {
  const t = useT()
  const location = useLocation()
  return (
    <nav
      aria-label={t('nav.menu')}
      className="no-print sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-ink pb-safe"
    >
      <div className="grid grid-cols-3 gap-3 px-3 py-2">
        {TABS.map((tab) => {
          const active = isActive(location.pathname, tab.to)
          const Icon = tab.icon
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={[TAB_CLASS, active ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink'].join(' ')}
            >
              <Icon />
              {t(tab.key)}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMeer}
          aria-expanded={meerOpen}
          className={[TAB_CLASS, meerOpen ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink'].join(' ')}
        >
          <IconMeer />
          {t('nav.meer')}
        </button>
      </div>
    </nav>
  )
}

const ZIJ_LINK =
  'min-h-touch flex items-center gap-3 px-3 py-2 rounded-xl border-2 font-semibold text-sm leading-tight no-underline'

/**
 * De zijbalk staat vast aan de linkerkant en blijft staan waar hij staat, ook
 * als het scherm eronder doorscrollt. Alle tien de bestemmingen passen erin
 * zonder te scrollen: tien regels van 56 px met 12 px ertussen (sectie 2.2) is
 * precies wat er in staat, dus er hoort niets anders bij. Wie er werkt en de
 * instellingen staan daarom in de kop.
 *
 * Alleen op tablet en pc: op de telefoon is er geen ruimte naast het scherm en
 * blijft de onderbalk staan.
 */
function Sidebar() {
  const t = useT()
  const location = useLocation()
  useDbVersion()
  return (
    <aside className="no-print hidden sm:flex fixed inset-y-0 left-0 z-40 w-80 flex-col bg-white border-r-2 border-ink">
      <nav aria-label={t('nav.menu')} className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {ZIJBALK.map((item) => {
          const active = isActive(location.pathname, item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={[
                ZIJ_LINK,
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-ink border-white hover:bg-shell',
              ].join(' ')}
            >
              <span className="shrink-0"><Icon /></span>
              <span className="min-w-0">{t(item.key)}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

/**
 * "Meer" klapt van bovenaf open, over de kop heen en niet over de lijst waar
 * je mee bezig bent. Eén scherm met grote knoppen, geen uitklapmenu in een
 * uitklapmenu: dat zou een derde niveau navigatie zijn (sectie 2.2).
 */
function MeerSheet({ onClose, metNav }: { onClose: () => void; metNav: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-black/60 flex items-start justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => { e.stopPropagation() }}
        className="bg-white w-full sm:max-w-xl rounded-b-2xl sm:rounded-2xl border-b-2 sm:border-2 border-ink flex flex-col max-h-full overflow-y-auto slide-down"
      >
        <div className="sticky top-0 bg-white border-b-2 border-ink px-4 py-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg sm:text-2xl font-semibold truncate">{db.settings().shop_name}</h2>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>

        {/* De lijst met schermen hoort bij de onderbalk van de telefoon. Op
            tablet en pc staat diezelfde lijst links in beeld; hem hier
            herhalen zou alleen maar twee plekken maken om te zoeken. */}
        {metNav && (
          <div className="p-4 grid gap-3 sm:grid-cols-2">
            {MEER.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => { onClose(); navigate(item.to) }}
                  className="min-h-touch min-w-0 flex items-center gap-4 px-4 py-3 rounded-xl border-2 border-ink bg-white text-ink font-semibold text-lg text-left hover:bg-shell"
                >
                  <span className="shrink-0"><Icon /></span>
                  <span className="min-w-0">{t(item.key)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="px-4 pb-6 pt-2 flex flex-col gap-4 border-t-2 border-shell">
          <PrinterNote />
          <LanguageSwitch />
          <UserBadge withLogout />
        </div>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<'meer' | 'instellingen' | null>(null)

  // Balie-scanner werkt overal in de app (sectie 8.5).
  useHidScanner((code) => { navigate(`/W/${code}`) })

  useEffect(() => {
    void printer.autoConnect()
    // Wie de winkelschil opent, werkt in de winkel. Een telefoon van een
    // voorbijganger die alleen /W/<code> opent, komt hier nooit langs en ziet
    // dus geen klantgegevens (sectie 8.1).
    setStaffSession(true)
  }, [])

  return (
    <div className="has-tabbar min-h-full flex flex-col">
      {/* Tablet en pc: het menu staat links en blijft staan. */}
      <Sidebar />

      <div className="flex-1 flex flex-col sm:pl-80">
        {/* De kop blijft staan: printer en opslag moeten altijd zichtbaar zijn
            (sectie 9.7, 8.8). Rechts staat wie er werkt, met de knop naar de
            taal en het afmelden ernaast; op de telefoon staat dat achter
            "Meer". De zijbalk houdt zo alle ruimte voor bestemmingen. */}
        <header className="no-print sticky top-0 z-30 bg-white border-b-2 border-ink">
          <div className="px-4 sm:px-6 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 flex-wrap">
            <PrinterBadge />
            <SyncBadge />
            <div className="hidden sm:flex items-center gap-3 ml-auto">
              <span className="min-w-0"><UserBadge /></span>
              <Button
                className="text-sm px-4 shrink-0"
                onClick={() => { setSheet('instellingen') }}
              >
                {t('nav.instellingen')}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-3xl px-4 pb-app">{children}</main>
      </div>

      <TabBar onMeer={() => { setSheet('meer') }} meerOpen={sheet === 'meer'} />
      {sheet !== null && (
        <MeerSheet metNav={sheet === 'meer'} onClose={() => { setSheet(null) }} />
      )}
    </div>
  )
}

/** Terugknop die altijd zegt waar hij heen gaat (sectie 2.2). */
export function BackLink({ to, labelKey }: { to: string; labelKey: string }) {
  const t = useT()
  return (
    <Link
      to={to}
      className="inline-flex items-center min-h-touch mt-4 mb-2 font-semibold text-brand no-underline"
    >
      {t(labelKey)}
    </Link>
  )
}
