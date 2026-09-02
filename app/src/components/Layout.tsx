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

/** Sectie 9.7 — grote, permanente printerindicator met één knop. Geen jargon. */
function PrinterBadge() {
  const t = useT()
  const { status } = usePrinterStatus()
  useDbVersion()
  const waiting = db.pendingPrintJobs().length

  const ready = status === 'ready' || status === 'printing'
  return (
    <>
      <span className={[CHIP, ready ? CHIP_OK : 'bg-[#FBEAE9] border-danger text-[#7A1610]'].join(' ')}>
        <span aria-hidden="true">{ready ? '●' : '○'}</span>
        {status === 'unsupported' ? t('printer.unsupported')
          : status === 'connecting' ? t('printer.connecting')
          : ready ? t('printer.ready') : t('printer.disconnected')}
      </span>
      {!ready && status !== 'unsupported' && (
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
 * In de kop staat alleen wie er werkt; afmelden en de taal gebeuren een paar
 * keer per jaar en staan daarom achter "Meer". Zo houdt de kop één regel over
 * voor de dingen die de hele dag meekijken: de printer en het opslaan.
 */
function UserBadge({ withLogout }: { withLogout?: boolean }) {
  const t = useT()
  useDbVersion()
  const user = db.currentUser()
  if (!user) return null
  return (
    <span className={withLogout ? 'flex flex-col gap-3' : 'block'}>
      <span className="text-sm font-semibold">
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
 * Op tablet en pc is er ruimte genoeg en staat alles gewoon in de kop.
 * ----------------------------------------------------------------------- */

const TABS = [
  { to: '/', key: 'nav.werkplaats', icon: IconWerkplaats },
  { to: '/scan', key: 'nav.scan_short', icon: IconScan },
]

/** Kop van de app op tablet en pc (sectie 2.2: twee niveaus, alles zichtbaar). */
const NAV = [
  { to: '/', key: 'nav.werkplaats' },
  { to: '/onderdelen', key: 'nav.onderdelen' },
  { to: '/occasions', key: 'nav.occasions' },
  { to: '/klanten', key: 'nav.klanten' },
  { to: '/overzicht', key: 'nav.overzicht' },
  { to: '/scan', key: 'nav.scan_short' },
]

/** Alles wat niet in de onderbalk past. Eén lijst, één plek om aan te passen. */
const MEER = [
  { to: '/onderdelen', key: 'nav.onderdelen' },
  { to: '/klanten', key: 'nav.klanten' },
  { to: '/occasions', key: 'nav.occasions' },
  { to: '/overzicht', key: 'nav.overzicht' },
  { to: '/bestellingen', key: 'bestellingen.title' },
  { to: '/abonnementen', key: 'abonnementen.title' },
  { to: '/accus', key: 'accus.title' },
  { to: '/rapporten', key: 'rapporten.title' },
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="4.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  )
}

function IconScan() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
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

/**
 * "Meer" is één scherm met grote knoppen, geen uitklapmenu: uitklappen is een
 * derde niveau navigatie en dat mag niet (sectie 2.2). Op de pc is het een
 * gewoon venster, op de telefoon vult het het scherm.
 */
function MeerSheet({ onClose }: { onClose: () => void }) {
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
      className="no-print fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => { e.stopPropagation() }}
        className="bg-white w-full sm:max-w-xl sm:rounded-2xl sm:border-2 sm:border-ink flex flex-col overflow-y-auto fade-in"
      >
        <div className="sticky top-0 bg-white border-b-2 border-ink px-4 py-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg sm:text-2xl font-semibold truncate">{db.settings().shop_name}</h2>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>

        <div className="p-4 grid gap-3 sm:grid-cols-2">
          {MEER.map((item) => (
            <Button key={item.to} full onClick={() => { onClose(); navigate(item.to) }}>
              {t(item.key)}
            </Button>
          ))}
        </div>

        <div className="px-4 pb-6 pt-2 flex flex-col gap-4 border-t-2 border-shell">
          <LanguageSwitch />
          <UserBadge withLogout />
        </div>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()
  const [meer, setMeer] = useState(false)

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
      {/* De kop blijft staan: printer en opslag moeten altijd zichtbaar zijn
          (sectie 9.7, 8.8). Op de telefoon is dat één smalle regel; naam,
          taal en gebruiker staan daar achter de knop "Meer". */}
      <header className="no-print sticky top-0 z-30 bg-white border-b-2 border-ink">
        <div className="mx-auto max-w-3xl sm:max-w-5xl px-4 py-2 sm:py-3 flex flex-col gap-2 sm:gap-3">
          <div className="flex items-center justify-between gap-3 gap-y-2 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <Link to="/" className="hidden sm:block text-2xl font-semibold no-underline text-ink">
                {db.settings().shop_name}
              </Link>
              <PrinterBadge />
              <SyncBadge />
            </div>
            <div className="hidden sm:block"><UserBadge /></div>
          </div>
          <nav className="hidden sm:flex gap-3 flex-wrap">
            {NAV.map((item) => {
              const active = isActive(location.pathname, item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'min-h-touch flex items-center px-4 rounded-xl border-2 font-semibold no-underline',
                    active ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink',
                  ].join(' ')}
                >
                  {t(item.key)}
                </Link>
              )
            })}
            <button
              type="button"
              onClick={() => { setMeer(true) }}
              aria-expanded={meer}
              className="min-h-touch flex items-center px-4 rounded-xl border-2 border-ink bg-white text-ink font-semibold"
            >
              {t('nav.meer')}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 pb-app">{children}</main>

      <TabBar onMeer={() => { setMeer(true) }} meerOpen={meer} />
      {meer && <MeerSheet onClose={() => { setMeer(false) }} />}
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
