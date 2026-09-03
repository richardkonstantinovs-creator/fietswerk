import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money } from '../lib/format'
import { tNL } from '../i18n'

/**
 * Factuur. Altijd Nederlands: de klant en de boekhouder lezen dit (sectie 10.1).
 * Bij de margeregeling staat er GEEN btw apart op — dat mag niet (sectie 4.2).
 * Opslaan als PDF gaat via het afdrukvenster van de browser; een eigen
 * PDF-bibliotheek is voor fase 1 niet nodig.
 */
export default function Factuur() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useDbVersion()

  const inv = db.invoice(id)
  const shop = db.settings()

  if (!inv) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <p className="text-2xl font-semibold">{tNL('factuur.none')}</p>
      </main>
    )
  }

  const customer = db.customer(inv.customer_id)
  const wo = inv.work_order_id ? db.workOrder(inv.work_order_id) : null
  const lines = wo ? db.linesOf(wo.id) : []
  const stb = inv.stock_bike_id ? db.stockBike(inv.stock_bike_id) : null
  const bike = stb ? db.bike(stb.bike_id) : (wo ? db.bike(wo.bike_id) : null)
  const payment = wo ? db.paymentsOf(wo.id)[0] : null
  const isMargin = inv.vat_scheme === 'margin'

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="no-print mb-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="press min-h-touch px-5 rounded-xl border-2 border-ink bg-white font-semibold text-left hover:bg-shell"
        >
          {tNL('common.close')}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-touch px-5 rounded-xl border-2 border-brand bg-brand text-white font-semibold"
        >
          {tNL('factuur.print')}
        </button>
      </div>

      <article className="print-sheet bg-white border-2 border-ink rounded-2xl p-6">
        <h1 className="text-3xl font-semibold mb-4">{tNL('factuur.title')}</h1>

        <div className="flex justify-between gap-6 flex-wrap mb-6">
          <div>
            <p className="font-semibold">{tNL('factuur.shop')}</p>
            <p>{shop.shop_name}</p>
            <p>{shop.address}</p>
            <p>{tNL('factuur.kvk')}: {shop.kvk}</p>
            <p>{tNL('factuur.btw_id')}: {shop.btw_id}</p>
          </div>
          <div>
            <p className="font-semibold">{tNL('factuur.to')}</p>
            <p>{customer ? `${customer.first_name} ${customer.last_name}` : '—'}</p>
            {customer?.street && <p>{customer.street}</p>}
            {customer?.postcode && <p>{customer.postcode} {customer.city}</p>}
          </div>
        </div>

        <p className="flex justify-between"><span>{tNL('factuur.number')}</span><strong>{inv.number}</strong></p>
        <p className="flex justify-between mb-6"><span>{tNL('factuur.date')}</span><strong>{date(inv.issued_at)}</strong></p>

        {bike && (
          <p className="mb-4">{tNL('werkbon.bike')}: {bike.brand} {bike.model} · {bike.frame_number}</p>
        )}

        <table className="w-full mb-6">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="py-2">{tNL('factuur.line')}</th>
              <th className="py-2 text-right">{tNL('factuur.qty')}</th>
              <th className="py-2 text-right">{tNL('factuur.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b-2 border-shell">
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right">{l.qty}</td>
                <td className="py-2 text-right">{money(l.line_total_ex_vat_cents)}</td>
              </tr>
            ))}
            {stb && (
              <tr className="border-b-2 border-shell">
                <td className="py-2">{bike?.brand} {bike?.model}</td>
                <td className="py-2 text-right">1</td>
                <td className="py-2 text-right">{money(inv.total_incl_vat_cents)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {isMargin ? (
          <>
            <p className="flex justify-between text-3xl font-semibold">
              <span>{tNL('common.total')}</span><span>{money(inv.total_incl_vat_cents)}</span>
            </p>
            <p className="mt-4">{tNL('factuur.margin_note')}</p>
          </>
        ) : (
          <>
            <p className="flex justify-between">
              <span>{tNL('common.total')} {tNL('common.excl_vat')}</span>
              <span>{money(inv.total_ex_vat_cents)}</span>
            </p>
            <p className="flex justify-between">
              <span>{tNL('common.vat')}</span><span>{money(inv.total_vat_cents)}</span>
            </p>
            <p className="flex justify-between text-3xl font-semibold mt-2">
              <span>{tNL('common.total')}</span><span>{money(inv.total_incl_vat_cents)}</span>
            </p>
          </>
        )}

        {payment && (
          <p className="mt-6">{tNL('factuur.paid_with')}: {tNL(`payment.${payment.method}`)}</p>
        )}
      </article>
    </main>
  )
}
