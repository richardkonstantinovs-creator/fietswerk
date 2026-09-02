import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, daysUntil, money, phoneDisplay, whatsappNumber } from '../lib/format'
import { useT } from '../i18n'
import { Button, Card, Notice, SectionTitle } from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Onderhoudsabonnementen (sectie 3.5). Dit scherm is de meest onderschatte
 * functie uit de specificatie: één herinnering per klant brengt werk binnen
 * zonder dat er een euro reclame tegenover staat.
 */
export default function Abonnementen() {
  const t = useT()
  useDbVersion()

  const due = db.contractsDue(21)
  const shop = db.settings()

  return (
    <div>
      <BackLink to="/overzicht" labelKey="back.overzicht" />
      <h1 className="text-3xl font-semibold mb-1">{t('abonnementen.title')}</h1>
      <p className="text-muted mb-4">{t('abonnementen.subtitle')}</p>

      <SectionTitle>{t('abonnementen.due')}</SectionTitle>
      {due.length === 0 && <Card>{t('abonnementen.empty')}</Card>}

      {due.map((c) => {
        const bike = db.bike(c.bike_id)
        const customer = db.customer(c.customer_id)
        const days = daysUntil(c.next_due_at)
        const body = db.renderTemplate('onderhoud', {
          naam: customer?.first_name ?? '',
          fiets: `${bike?.brand ?? ''} ${bike?.model ?? ''}`.trim(),
          winkel: shop.shop_name,
          telefoon: phoneDisplay(shop.phone),
        })
        return (
          <Card key={c.id} className="mb-3">
            <p className="text-2xl font-semibold">{customer?.first_name} {customer?.last_name}</p>
            <p>{bike?.brand} {bike?.model}</p>
            <p className="text-muted">
              {t('abonnementen.type')}: {t(`contract.${c.type}`)} · {money(c.price_cents)}
            </p>
            <p className={days < 0 ? 'text-danger font-semibold' : 'font-semibold'}>
              {t('abonnementen.next')}: {date(c.next_due_at)}
              {' — '}
              {days < 0
                ? t('abonnementen.overdue', { days: Math.abs(days) })
                : t('abonnementen.in_days', { days })}
            </p>
            <div className="grid gap-3 grid-cols-2 mt-3">
              <a
                href={`https://wa.me/${whatsappNumber(customer?.phone ?? '')}?text=${encodeURIComponent(body)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => db.logNotification('whatsapp', 'onderhoud', body, null, c.customer_id, c.id)}
                className="min-h-touch flex items-center justify-center px-5 rounded-xl border-2 border-ink bg-white font-semibold no-underline text-ink"
              >
                {t('abonnementen.remind')}
              </a>
              <Button variant="primary" onClick={() => db.markServiceDone(c.id)}>
                {t('abonnementen.done')}
              </Button>
            </div>
          </Card>
        )
      })}

      <div className="mt-6">
        <Notice tone="ok">{t('rapporten.export_help')}</Notice>
      </div>
    </div>
  )
}
