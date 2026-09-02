import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { money } from '../lib/format'
import { useT } from '../i18n'
import { Button, Card, Notice, TextInput } from '../components/ui'

/**
 * Voorraad (sectie 7.4). Eén zoekveld dat ook de streepjescodescanner aan de
 * balie opvangt: die typt de EAN en drukt Enter.
 */
export default function Onderdelen() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [query, setQuery] = useState('')
  const [made, setMade] = useState<number | null>(null)

  const list = db.searchParts(query)
  const low = db.partsBelowMin()

  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-4">{t('onderdelen.title')}</h1>

      <label htmlFor="deel-zoek" className="block font-semibold mb-2">{t('onderdelen.search')}</label>
      <TextInput
        id="deel-zoek"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('onderdelen.search')}
      />

      {low.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn">{t('onderdelen.below_min', { count: low.length })}</Notice>
        </div>
      )}

      <div className="my-4 grid gap-3">
        <Button
          variant="primary"
          full
          onClick={() => setMade(db.buildOrderList().length)}
        >
          {t('onderdelen.make_order_list')}
        </Button>
        {made != null && (
          <Notice tone={made > 0 ? 'ok' : 'warn'}>
            {made > 0
              ? t('onderdelen.order_list_made', { count: made })
              : t('onderdelen.order_list_empty')}
          </Notice>
        )}
        <Button full onClick={() => navigate('/bestellingen')}>{t('bestellingen.title')}</Button>
      </div>

      <p className="font-semibold my-4">{t('onderdelen.count', { count: list.length })}</p>

      {list.map((p) => {
        const isLow = p.stock_qty < p.min_qty
        return (
          <Card key={p.id} className="mb-3" onClick={() => navigate(`/onderdeel/${p.id}`)}>
            <span className="flex justify-between gap-3 flex-wrap items-baseline">
              <span className="text-2xl font-semibold">{p.name}</span>
              <span className="text-2xl font-semibold whitespace-nowrap">
                {p.stock_qty} / {p.min_qty}
              </span>
            </span>
            <span className="block text-muted">
              {p.sku} · {t('onderdelen.bin')} {p.bin_location} · {money(p.sell_price_ex_vat_cents)} {t('common.excl_vat')}
            </span>
            {isLow && (
              <span className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBEAE9] border-2 border-danger text-[#7A1610] font-semibold text-sm">
                <span aria-hidden="true">⚠</span>
                {t('onderdelen.low')}
              </span>
            )}
          </Card>
        )
      })}
      {list.length === 0 && <Card>{t('common.no_results')}</Card>}
    </div>
  )
}
