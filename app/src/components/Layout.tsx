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
const DOT_ROW = 'flex items-center gap-2 text-xs font-semibold leading-tight'

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
 *
 * Alleen als er iets aan de hand is. Opgeslagen is de normale gang van zaken;
 * daar een groene plaat voor bovenaan het schermpje van een telefoon opeisen
 * kost een regel die de monteur elke keer weer moet wegkijken.
 */
function SyncBadge() {
  const t = useT()
  const online = useOnline()
  useDbVersion()
  const waiting = db.pendingOutbox().length

  if (online && waiting === 0) return null
  return (
    <span className={[CHIP, 'bg-[#FBEFDB] border-warn text-[#5C3A00]'].join(' ')}>
      <span aria-hidden="true">○</span>
      {waiting > 0 ? t('sync.waiting', { count: waiting }) : t('sync.offline')}
    </span>
  )
}

/**
 * De kop van de telefoon. Staat er niets te melden — geen printer op dit
 * toestel en alles opgeslagen — dan komt er ook geen lege balk met een streep
 * onder: het scherm begint dan gewoon bij het werk.
 */
function PhoneHeader() {
  const online = useOnline()
  const { status } = usePrinterStatus()
  useDbVersion()
  const stil = status === 'unsupported' && online && db.pendingOutbox().length === 0
  if (stil) return null
  return (
    <header className="no-print sm:hidden sticky top-0 z-30 bg-white border-b-2 border-[#E2E2E2]">
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
        <PrinterBadge />
        <SyncBadge />
      </div>
    </header>
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
              'press min-h-touch min-w-touch px-4 rounded-xl border-2 font-semibold',
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
 * "Instellingen"; in de zijbalk zelf staat alleen de naam en de rol, zodat één
 * regel genoeg is.
 */
function UserBadge({ withLogout }: { withLogout?: boolean }) {
  const t = useT()
  useDbVersion()
  const user = db.currentUser()
  if (!user) return null
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
  { to: '/klanten', key: 'nav.klanten', icon: IconKlanten },
  { to: '/rooster', key: 'nav.rooster', icon: IconRooster },
  { to: '/overzicht', key: 'nav.overzicht', icon: IconOverzicht },
  { to: '/rapporten', key: 'rapporten.title', icon: IconRapporten },
]

/** Alles wat niet in de onderbalk past. Eén lijst, één plek om aan te passen. */
const MEER = [
  { to: '/klok', key: 'nav.klok', icon: IconKlok },
  { to: '/rooster', key: 'nav.rooster', icon: IconRooster },
  { to: '/uren', key: 'nav.uren', icon: IconUren },
  { to: '/beschikbaarheid', key: 'nav.beschikbaarheid', icon: IconBeschikbaarheid },
  { to: '/medewerkers', key: 'nav.team', icon: IconTeam },
  { to: '/onderdelen', key: 'nav.onderdelen', icon: IconOnderdelen },
  { to: '/klanten', key: 'nav.klanten', icon: IconKlanten },
  { to: '/occasions', key: 'nav.occasions', icon: IconOccasions },
  { to: '/overzicht', key: 'nav.overzicht', icon: IconOverzicht },
  { to: '/bestellingen', key: 'bestellingen.title', icon: IconBestellingen },
  { to: '/rapporten', key: 'rapporten.title', icon: IconRapporten },
  { to: '/schrift', key: 'nav.schrift', icon: IconSchrift },
]

/**
 * Schermen die breder mogen zijn dan een bladzijde tekst. Voor lezen is
 * max-w-3xl de juiste maat — langere regels leest niemand meer. Maar het
 * rooster is geen tekst: zeven dagen naast elkaar moeten bij het openen alle
 * zeven in beeld staan, anders scrolt de eigenaar elke keer naar zaterdag.
 */
const BREED = ['/rooster']

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
  '/rooster': ['/uren', '/beschikbaarheid', '/medewerkers'],
}

function isActive(pathname: string, to: string): boolean {
  if (pathname === to) return true
  if (to !== '/' && pathname.startsWith(to)) return true
  return (SECTIE_KAARTEN[to] ?? []).some((kaart) => pathname.startsWith(kaart))
}

/* Pictogrammen staan nooit alleen: er hoort altijd tekst onder (sectie 2.2). */
function IconTeam() {
  return (
    <svg {...SVG}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0M16.5 5.5a3.5 3.5 0 0 1 0 6M17 14.5a6 6 0 0 1 4 5.5" />
    </svg>
  )
}

function IconRooster() {
  return (
    <svg {...SVG}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h3M8 17.5h3M14 14h2" />
    </svg>
  )
}

function IconUren() {
  return (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.5l3.5 2" />
    </svg>
  )
}

/* Golven zoals op een contactloze betaalautomaat: dat gebaar kent iedereen. */
function IconKlok() {
  return (
    <svg {...SVG}>
      <rect x="3" y="4" width="9" height="16" rx="2" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

function IconBeschikbaarheid() {
  return (
    <svg {...SVG}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M8.5 15l2.5 2.5 4.5-5" />
    </svg>
  )
}

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

function IconInstellingen() {
  return (
    <svg {...SVG} className="shrink-0 text-muted">
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </svg>
  )
}

/** Een opengeslagen schrift — het papier waar de klantgeschiedenis in staat. */
function IconSchrift() {
  return (
    <svg {...SVG}>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
      <path d="M12 6.5v13" />
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
      className="no-print sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-[#E2E2E2] lift-bar pb-safe"
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
              className={[TAB_CLASS, 'press', active ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink'].join(' ')}
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
          className={[TAB_CLASS, 'press', meerOpen ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink'].join(' ')}
        >
          <IconMeer />
          {t('nav.meer')}
        </button>
      </div>
    </nav>
  )
}

const ZIJ_LINK =
  'min-h-touch flex items-center gap-3 px-3 py-2 rounded-xl border-2 font-semibold text-base leading-tight no-underline'

/**
 * De staat van het gereedschap, onderin de zijbalk. Eén regel, en alleen als
 * er iets te melden is: "alles is opgeslagen" is de gewone gang van zaken en
 * hoeft de hele dag geen groene plaat op te eisen. Zodra er wél iets wacht of
 * de verbinding weg is, staat het er wel — dat is het moment dat het telt.
 */
function SidebarStatus() {
  const t = useT()
  const online = useOnline()
  const { status } = usePrinterStatus()
  useDbVersion()
  const outbox = db.pendingOutbox().length
  const labels = db.pendingPrintJobs().length

  const printerOk = status === 'ready' || status === 'printing'
  const printerHidden = status === 'unsupported'
  const syncOk = online && outbox === 0

  const rows: ReactNode[] = []
  if (!syncOk) {
    rows.push(
      <span key="sync" className={[DOT_ROW, 'text-[#5C3A00]'].join(' ')}>
        <span className="h-2 w-2 rounded-full bg-warn shrink-0" aria-hidden="true" />
        {outbox > 0 ? t('sync.waiting', { count: outbox }) : t('sync.offline')}
      </span>,
    )
  }
  if (!printerHidden && !printerOk) {
    rows.push(
      <span key="printer" className="flex items-center justify-between gap-2">
        <span className={[DOT_ROW, 'text-[#7A1610] min-w-0'].join(' ')}>
          <span className="h-2 w-2 rounded-full bg-danger shrink-0" aria-hidden="true" />
          <span className="truncate">
            {status === 'connecting' ? t('printer.connecting') : t('printer.disconnected')}
          </span>
        </span>
        <button
          type="button"
          onClick={() => { void printer.connect() }}
          className="shrink-0 rounded-lg border-2 border-ink px-2 py-1 text-xs font-semibold hover:bg-shell"
        >
          {t('printer.connect')}
        </button>
      </span>,
    )
  }
  if (labels > 0) {
    rows.push(
      <span key="labels" className={[DOT_ROW, 'text-[#5C3A00]'].join(' ')}>
        <span className="h-2 w-2 rounded-full bg-warn shrink-0" aria-hidden="true" />
        {t('printer.queue', { count: labels })}
      </span>,
    )
  }

  // Niets aan de hand: één rustige regel, zodat de monteur toch kan zien dat
  // er gekeken is. Geen kleurvlak, geen knop, geen twee regels.
  if (rows.length === 0) {
    if (printerHidden) {
      return (
        <span className={[DOT_ROW, 'text-muted'].join(' ')}>
          <span className="h-2 w-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
          {t('sync.saved')}
        </span>
      )
    }
    return (
      <span className={[DOT_ROW, 'text-muted'].join(' ')}>
        <span className="h-2 w-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
        <span className="truncate">{t('sync.saved')} · {t('printer.ready')}</span>
      </span>
    )
  }

  return <span className="flex flex-col gap-2">{rows}</span>
}

/**
 * De zijbalk staat vast aan de linkerkant en blijft staan waar hij staat, ook
 * als het scherm eronder doorscrollt. Alle negen bestemmingen passen erin
 * zonder te scrollen: negen regels van 56 px met 12 px ertussen (sectie 2.2).
 *
 * Negen en niet twaalf: rooster, uren en beschikbaarheid zijn één onderwerp en
 * delen daarom één regel. Wie op "Rooster" staat, springt met de tabrij boven
 * het scherm naar de andere twee. Een vierde regel erbij en er moet gescrold
 * worden, en dan is de zijbalk geen overzicht meer.
 *
 * Onderin staat wat de hele dag meekijkt: de staat van printer en opslag, en
 * wie er werkt met de weg naar de instellingen. Dat is één blok van twee
 * regels in plaats van een balk boven elk scherm, en het staat waar het hoort:
 * bij het gereedschap, niet bij het werk.
 *
 * Alleen op tablet en pc: op de telefoon is er geen ruimte naast het scherm en
 * blijft de onderbalk staan.
 */
function Sidebar({ onSettings }: { onSettings: () => void }) {
  const t = useT()
  const location = useLocation()
  useDbVersion()
  const user = db.currentUser()
  return (
    <aside className="no-print hidden sm:flex fixed inset-y-0 left-0 z-40 w-80 flex-col bg-white border-r-2 border-[#E2E2E2]">
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
                'press',
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-ink border-white hover:bg-shell hover:border-shell',
              ].join(' ')}
            >
              <span className="shrink-0"><Icon /></span>
              <span className="min-w-0">{t(item.key)}</span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t-2 border-shell p-3 flex flex-col gap-3">
        <SidebarStatus />
        <button
          type="button"
          onClick={onSettings}
          className="press min-h-touch flex items-center gap-3 px-3 py-2 rounded-xl border-2 border-white bg-white text-left hover:bg-shell hover:border-shell"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold truncate">{user ? user.name : t('nav.instellingen')}</span>
            <span className="block text-xs text-muted truncate">
              {user ? t(`role.${user.role}`) : db.settings().shop_name}
            </span>
          </span>
          <IconInstellingen />
        </button>
      </div>
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
        className="bg-white w-full sm:max-w-xl rounded-b-2xl sm:rounded-2xl border-b-2 sm:border-2 border-ink flex flex-col max-h-full overflow-y-auto slide-down shadow-[0_12px_40px_rgba(17,17,17,.25)]"
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
                  className="press min-h-touch min-w-0 flex items-center gap-4 px-4 py-3 rounded-xl border-2 border-ink bg-white text-ink font-semibold text-lg text-left hover:bg-shell"
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
  const navigate = useNavigate()
  const location = useLocation()
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
      <Sidebar onSettings={() => { setSheet('instellingen') }} />

      <div className="flex-1 flex flex-col sm:pl-80">
        {/* Alleen op de telefoon: daar is geen zijbalk, dus staan printer en
            opslag boven het scherm (sectie 9.7, 8.8). Op tablet en pc staat
            diezelfde staat onderin de zijbalk en blijft de kop weg — die kostte
            boven elk scherm een regel voor iets wat bijna altijd goed is. */}
        <PhoneHeader />

        <main
          className={[
            'flex-1 mx-auto w-full px-4 sm:px-8 pb-app',
            BREED.includes(location.pathname) ? 'max-w-[1400px]' : 'max-w-3xl',
          ].join(' ')}
        >
          {children}
        </main>
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
