import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money, phoneDisplay } from '../lib/format'
import { tNL } from '../i18n'

/**
 * Publieke statuspagina voor de klant (sectie 7.8), zonder inloggen.
 * ALTIJD Nederlands, ongeacht de taalknop in de winkel (sectie 10.1):
 * de klant is Nederlands en heeft niets te maken met de instelling van de
 * medewerker. Daarom gebruikt dit scherm tNL en niet useT.
 */
export default function PublicStatus() {
  const { token = '' } = useParams()
  useDbVersion()
  const wo = db.workOrderByToken(token)
  const [thanks, setThanks] = useState(false)
  const shop = db.settings()

  if (!wo) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <p className="text-2xl font-semibold">{tNL('public.not_found')}</p>
        <p className="mt-4">{tNL('public.call', { phone: phoneDisplay(shop.phone) })}</p>
      </main>
    )
  }

  const bike = db.bike(wo.bike_id)
  const price = wo.total_incl_vat_cents > 0 ? wo.total_incl_vat_cents : (wo.quote_cents ?? 0)
  const awaiting = wo.status === 'wacht_op_akkoord'

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-1">{tNL('public.title', { shop: shop.shop_name })}</h1>
      <p className="text-muted mb-6">{bike?.brand} {bike?.model}</p>

      <section className="bg-white border-2 border-ink rounded-2xl p-5 mb-4">
        <p className="font-semibold">{tNL('public.status')}</p>
        <p className="text-3xl font-semibold my-2">{tNL(`status.${wo.status}`)}</p>
        <p className="font-semibold mt-4">{tNL('public.what')}</p>
        <p>{wo.complaint}</p>
        {wo.diagnosis && <p className="mt-2">{wo.diagnosis}</p>}
      </section>

      <section className="bg-white border-2 border-ink rounded-2xl p-5 mb-4">
        <p className="font-semibold">{wo.status === 'gereed' ? tNL('public.price') : tNL('public.price_estimate')}</p>
        <p className="text-3xl font-semibold my-2">{money(price)}</p>
        {wo.approved_limit_cents != null && (
          <p>{tNL('public.limit')}: {money(wo.approved_limit_cents)}</p>
        )}
        <p className="mt-3">{tNL('public.ready_when')}: {date(wo.promised_at)}</p>
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

      <p className="mt-8">{tNL('public.call', { phone: phoneDisplay(shop.phone) })}</p>
    </main>
  )
}
