import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money, phoneDisplay } from '../lib/format'
import { STATUS_STYLE } from '../lib/workflow'
import type { WorkOrderStatus } from '../lib/types'
import { tNL } from '../i18n'

/**
 * Publieke statuspagina voor de klant (sectie 7.8), zonder inloggen.
 * ALTIJD Nederlands, ongeacht de taalknop in de winkel (sectie 10.1):
 * de klant is Nederlands en heeft niets te maken met de instelling van de
 * medewerker. Daarom gebruikt dit scherm tNL en niet useT.
 *
 * Dit is het enige scherm dat een klant van de winkel te zien krijgt. Het mag
 * er daarom uitzien als de winkel en niet als het gereedschap van de monteur:
 * een balk met de naam erboven, de fiets herkenbaar in beeld en een balkje dat
 * laat zien hoe ver zijn fiets is. De regels uit sectie 2.2 gelden onverkort —
 * grote letters, echte woorden bij elke kleur, niets kleiner dan 16 px.
 */

/** Eigen pictogram: deze bladzijde hangt met opzet nergens aan de winkelschil. */
function BikeIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <circle cx="5.5" cy="16.5" r="4" />
      <circle cx="18.5" cy="16.5" r="4" />
      <path d="M5.5 16.5 10 8h5l3.5 8.5M8 8h4" />
    </svg>
  )
}

/**
 * De vier stappen die een klant begrijpt. "Wacht op akkoord" en "wacht op
 * onderdeel" krijgen geen eigen bolletje: dat is winkeltaal. Ze blijven bij
 * stap twee staan en het echte woord staat er groot boven.
 */
const STEPS = ['public.step_received', 'status.wachtrij', 'status.in_werkplaats', 'status.gereed']

function stepIndex(status: WorkOrderStatus): number {
  switch (status) {
    case 'aanname': return 0
    case 'wachtrij': case 'wacht_op_akkoord': case 'wacht_op_onderdeel': return 1
    case 'in_werkplaats': return 2
    case 'gereed': return 3
    case 'opgehaald': return STEPS.length
    default: return -1
  }
}

function Shell({ shop, children }: { shop: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-shell">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-xl px-6 py-4 flex items-center gap-3">
          <BikeIcon />
          <span className="text-2xl font-semibold">{shop}</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 pb-12">{children}</main>
    </div>
  )
}

function Steps({ status }: { status: WorkOrderStatus }) {
  const current = stepIndex(status)
  if (current < 0) return null
  return (
    <ol className="mt-2">
      {STEPS.map((key, i) => {
        const done = i < current
        const now = i === current
        const last = i === STEPS.length - 1
        return (
          <li key={key} className="flex gap-4">
            <span className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={[
                  'w-8 h-8 shrink-0 rounded-full border-2 flex items-center justify-center font-semibold',
                  done ? 'bg-ink border-ink text-white'
                    : now ? 'bg-brand border-brand text-white'
                    : 'bg-white border-line text-muted',
                ].join(' ')}
              >
                {done ? '✓' : now ? '●' : '○'}
              </span>
              {!last && <span className={`w-1 flex-1 ${done ? 'bg-ink' : 'bg-line'}`} />}
            </span>
            <span className={[last ? 'pb-0' : 'pb-5', 'pt-1', now ? 'font-semibold' : done ? '' : 'text-muted'].join(' ')}>
              {tNL(key)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function PublicStatus() {
  const { token = '' } = useParams()
  useDbVersion()
  const wo = db.workOrderByToken(token)
  const [thanks, setThanks] = useState(false)
  const shop = db.settings()

  if (!wo) {
    return (
      <Shell shop={shop.shop_name}>
        <section className="bg-white border-2 border-ink rounded-2xl p-6 mt-6">
          <p className="text-2xl font-semibold">{tNL('public.not_found')}</p>
          <a
            href={`tel:${shop.phone}`}
            className="press mt-5 min-h-touch flex items-center justify-center gap-3 px-5 rounded-xl border-2 border-ink bg-white text-ink font-semibold text-lg no-underline hover:bg-shell"
          >
            {tNL('public.call_button')}: {phoneDisplay(shop.phone)}
          </a>
        </section>
      </Shell>
    )
  }

  const bike = db.bike(wo.bike_id)
  const photo = wo.photos[0] ?? bike?.photos[0]
  const price = wo.total_incl_vat_cents > 0 ? wo.total_incl_vat_cents : (wo.quote_cents ?? 0)
  const awaiting = wo.status === 'wacht_op_akkoord'
  const plate = STATUS_STYLE[wo.status]

  return (
    <Shell shop={shop.shop_name}>
      {/* De fiets zelf bovenaan: de klant herkent zijn eigen foto sneller dan
          welk merk of model dan ook. Staat er geen foto, dan het pictogram. */}
      <div className="flex items-center gap-4 mt-6 mb-5">
        {photo ? (
          <img
            src={photo.data_url}
            alt=""
            className="w-20 h-20 shrink-0 object-cover rounded-2xl border-2 border-ink"
          />
        ) : (
          <span className="w-20 h-20 shrink-0 rounded-2xl border-2 border-ink bg-white flex items-center justify-center text-ink">
            <BikeIcon size={40} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block font-semibold text-muted">{tNL('public.your_bike')}</span>
          <span className="block text-3xl font-semibold">{bike?.brand} {bike?.model}</span>
          <span className="block text-muted">
            {[bike?.color, bike?.is_ebike ? tNL('public.ebike') : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>

      <section className="bg-white border-2 border-ink rounded-2xl overflow-hidden mb-4">
        {/* Randje in de kleur van de status. De kleur zegt niets in zijn eentje,
            het woord staat er direct onder (sectie 2.2). */}
        <div className="h-3" style={{ background: plate.bg }} aria-hidden="true" />
        <div className="p-5">
          <p className="font-semibold text-muted">{tNL('public.status')}</p>
          <p
            className="inline-block rounded-xl text-2xl font-semibold px-4 py-2 my-2"
            style={{ background: plate.bg, color: plate.fg }}
          >
            {tNL(`status.${wo.status}`)}
          </p>

          <p className="font-semibold mt-4 mb-1">{tNL('public.progress')}</p>
          <Steps status={wo.status} />

          <p className="font-semibold mt-5">{tNL('public.what')}</p>
          <p>{wo.complaint}</p>
          {wo.diagnosis && <p className="mt-2">{wo.diagnosis}</p>}
        </div>
      </section>

      <section className="bg-white border-2 border-ink rounded-2xl p-5 mb-4">
        <p className="font-semibold text-muted">
          {wo.status === 'gereed' ? tNL('public.price') : tNL('public.price_estimate')}
        </p>
        <p className="text-4xl font-semibold my-2">{money(price)}</p>
        <dl className="mt-4 border-t-2 border-shell pt-3">
          {wo.approved_limit_cents != null && (
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted">{tNL('public.limit')}</dt>
              <dd className="font-semibold">{money(wo.approved_limit_cents)}</dd>
            </div>
          )}
          {/* Staat de fiets klaar, dan is een beloofde datum uit het verleden
              alleen maar verwarrend. Dan telt de dag dat hij klaar was. */}
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-muted">
              {wo.ready_at ? tNL('public.ready_since') : tNL('public.ready_when')}
            </dt>
            <dd className="font-semibold">{date(wo.ready_at ?? wo.promised_at)}</dd>
          </div>
        </dl>
      </section>

      {thanks && (
        <p className="bg-[#E3F0E7] border-2 border-ok text-[#0B4A22] rounded-2xl p-4 font-semibold mb-4">
          {tNL('public.agreed')}
        </p>
      )}

      {awaiting && !thanks && (
        <button
          type="button"
          onClick={() => {
            db.logEvent(wo.id, 'approved', { channel: 'statuspagina', amount_cents: price })
            db.updateWorkOrder(wo.id, {
              approved_at: new Date().toISOString(),
              approved_by_channel: 'statuspagina',
            })
            db.setStatus(wo.id, 'in_werkplaats', { channel: 'statuspagina' })
            setThanks(true)
          }}
          className="w-full min-h-touch px-5 py-4 rounded-xl border-2 border-brand bg-brand text-white font-semibold text-xl"
        >
          {tNL('public.agree', { amount: (price / 100).toFixed(2).replace('.', ',') })}
        </button>
      )}

      <a
        href={`tel:${shop.phone}`}
        className="press mt-8 min-h-touch flex items-center justify-center gap-3 px-5 rounded-xl border-2 border-ink bg-white text-ink font-semibold text-lg no-underline hover:bg-shell"
      >
        {tNL('public.call_button')}: {phoneDisplay(shop.phone)}
      </a>
      <p className="mt-4 text-center text-sm text-muted">{shop.address}</p>
    </Shell>
  )
}
