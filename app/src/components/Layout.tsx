import { useEffect, useSyncExternalStore } from 'react'
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

/** Sectie 9.7 — grote, permanente printerindicator met één knop. Geen jargon. */
function PrinterBadge() {
  const t = useT()
  const { status } = usePrinterStatus()
  useDbVersion()
  const waiting = db.pendingPrintJobs().length

  const ready = status === 'ready' || status === 'printing'
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className={[
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-semibold text-sm',
          ready ? 'bg-[#E3F0E7] border-ok text-[#0B4A22]' : 'bg-[#FBEAE9] border-danger text-[#7A1610]',
        ].join(' ')}
      >
        <span aria-hidden="true">{ready ? '●' : '○'}</span>
        {status === 'unsupported' ? t('printer.unsupported')
          : status === 'connecting' ? t('printer.connecting')
          : ready ? t('printer.ready') : t('printer.disconnected')}
      </span>
      {!ready && status !== 'unsupported' && (
        <Button variant="secondary" onClick={() => { void printer.connect() }}>
          {t('printer.connect')}
        </Button>
      )}
      {waiting > 0 && (
        <span className="text-sm font-semibold text-warn">{t('printer.queue', { count: waiting })}</span>
      )}
    </div>
  )
}

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold">{t('lang.switch')}</span>
      <div className="flex gap-2">
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

const NAV = [
  { to: '/', key: 'nav.werkplaats' },
  { to: '/onderdelen', key: 'nav.onderdelen' },
  { to: '/occasions', key: 'nav.occasions' },
  { to: '/klanten', key: 'nav.klanten' },
  { to: '/overzicht', key: 'nav.overzicht' },
  { to: '/scan', key: 'nav.scan' },
]

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
    <span
      className={[
        'inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-semibold text-sm',
        ok ? 'bg-[#E3F0E7] border-ok text-[#0B4A22]' : 'bg-[#FBEFDB] border-warn text-[#5C3A00]',
      ].join(' ')}
    >
      <span aria-hidden="true">{ok ? '●' : '○'}</span>
      {ok ? t('sync.saved') : waiting > 0 ? t('sync.waiting', { count: waiting }) : t('sync.offline')}
    </span>
  )
}

function UserBadge() {
  const t = useT()
  useDbVersion()
  const user = db.currentUser()
  if (!user) return null
  return (
    <span className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-semibold">
        {t('login.logged_in_as', { name: `${user.name} (${t(`role.${user.role}`)})` })}
      </span>
      <Button
        className="text-sm"
        onClick={() => { db.logout(); window.location.assign('/') }}
      >
        {t('login.logout')}
      </Button>
    </span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()

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
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b-2 border-ink">
        <div className="mx-auto max-w-3xl px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link to="/" className="text-2xl font-semibold no-underline text-ink">
              {db.settings().shop_name}
            </Link>
            <LanguageSwitch />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <PrinterBadge />
            <SyncBadge />
          </div>
          <UserBadge />
          <nav className="flex gap-2 flex-wrap">
            {NAV.map((item) => {
              const active = item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    'min-h-touch flex items-center px-4 rounded-xl border-2 font-semibold no-underline',
                    active ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-ink',
                  ].join(' ')}
                >
                  {t(item.key)}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 pb-4">{children}</main>
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
