import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money, phoneDisplay } from '../lib/format'
import { tNL } from '../i18n'

/**
 * Inkoopverklaring bij inkoop zonder btw (sectie 4.2): in tweevoud, getekend
 * door de verkoper. Altijd Nederlands — het is een stuk voor de administratie
 * en voor de verkoper.
 */
export default function Inkoopverklaring() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useDbVersion()

  const stb = db.stockBike(id)
  const shop = db.settings()

  if (!stb) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <p className="text-2xl font-semibold">{tNL('common.no_results')}</p>
      </main>
    )
  }

  const bike = db.bike(stb.bike_id)
  const seller = db.customer(stb.seller_customer_id)

  return (
    <main className="max-w-2xl mx-auto p-6">
      <div className="no-print mb-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="min-h-touch px-5 rounded-xl border-2 border-ink bg-white font-semibold text-left"
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
        <h1 className="text-3xl font-semibold mb-4">{tNL('verklaring.title')}</h1>
        <p className="mb-6">{tNL('verklaring.intro')}</p>

        <h2 className="text-2xl font-semibold mb-2">{tNL('verklaring.seller')}</h2>
        <p>{seller ? `${seller.first_name} ${seller.last_name}` : ''}</p>
        {seller?.street && <p>{seller.street}</p>}
        {seller?.postcode && <p>{seller.postcode} {seller.city}</p>}
        {seller && <p>{phoneDisplay(seller.phone)}</p>}
        <p className="mt-2">{tNL('inkoop.id_note')}: {stb.id_check_note ?? '—'}</p>

        <h2 className="text-2xl font-semibold mt-6 mb-2">{tNL('verklaring.buyer')}</h2>
        <p>{shop.shop_name}</p>
        <p>{shop.address}</p>
        <p>{tNL('factuur.kvk')}: {shop.kvk}</p>

        <h2 className="text-2xl font-semibold mt-6 mb-2">{tNL('verklaring.bike')}</h2>
        <p>{bike?.brand} {bike?.model} · {bike?.color} · {bike?.model_year}</p>
        <p className="text-2xl font-semibold mt-2">
          {tNL('verklaring.frame')}: {bike?.frame_number}
        </p>

        <p className="flex justify-between mt-6 text-2xl font-semibold">
          <span>{tNL('verklaring.price')}</span><span>{money(stb.purchase_price_cents)}</span>
        </p>
        <p className="flex justify-between">
          <span>{tNL('verklaring.date')}</span><span>{date(stb.purchase_date)}</span>
        </p>

        <div className="mt-10 pt-10 border-t-2 border-ink">
          <p>{tNL('verklaring.signature')}</p>
          <div className="h-24" />
        </div>
        <p className="mt-6 text-sm">{tNL('verklaring.copies')}</p>
      </article>
    </main>
  )
}
