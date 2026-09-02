import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money } from '../lib/format'
import { useT } from '../i18n'
import { Button, Card, PrimaryBar } from '../components/ui'

/**
 * Occasions (sectie 7.5). De kolom die de winkel zelf nooit uitrekent staat
 * hier vooraan: de echte marge, inclusief de uren die erin zitten.
 */
export default function Occasions() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()

  const list = db.stockBikes()

  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-2">{t('occasions.title')}</h1>
      <p className="text-muted mb-4">{t('occasions.count', { count: list.filter((s) => s.status !== 'verkocht').length })}</p>

      {list.map((stb) => {
        const bike = db.bike(stb.bike_id)
        const margin = db.occasionMargin(stb)
        const blocked = !db.mayBeSold(stb) && stb.status !== 'verkocht'
        return (
          <Card key={stb.id} className="mb-3" onClick={() => navigate(`/occasion/${stb.id}`)}>
            <span className="flex justify-between gap-3 flex-wrap items-baseline">
              <span className="text-2xl font-semibold">{bike?.brand} {bike?.model}</span>
              <span className="font-semibold">{t(`stockbike.${stb.status}`)}</span>
            </span>
            <span className="block text-muted">
              {t('occasions.days_in_stock')}: {margin.days_in_stock} · {t('occasions.invested')}: {money(margin.invested_cents)}
            </span>
            <span className="flex justify-between gap-3 flex-wrap mt-2">
              <span className="text-2xl font-semibold">
                {stb.status === 'verkocht' ? t('occasions.sold_for') : t('occasions.asking')}: {money(margin.price_cents)}
              </span>
              <span
                className={[
                  'text-2xl font-semibold',
                  margin.net_margin_cents < 0 ? 'text-danger' : 'text-ok',
                ].join(' ')}
              >
                {t('occasions.real_margin')}: {money(margin.net_margin_cents)}
              </span>
            </span>
            {blocked && (
              <span className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FBEFDB] border-2 border-warn text-[#5C3A00] font-semibold text-sm">
                <span aria-hidden="true">⚠</span>
                {t('occasions.blocked', { date: date(stb.sellable_from) })}
              </span>
            )}
          </Card>
        )
      })}

      <PrimaryBar>
        <Button variant="primary" full onClick={() => navigate('/occasions/inkoop')}>
          {t('occasions.new')}
        </Button>
      </PrimaryBar>
    </div>
  )
}
