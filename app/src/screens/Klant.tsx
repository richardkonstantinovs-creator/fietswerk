import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { formatTagCode } from '../lib/code'
import { date, money, phoneDisplay } from '../lib/format'
import { useT } from '../i18n'
import { Button, Card, Notice, PrimaryBar, SectionTitle } from '../components/ui'
import { BackLink } from '../components/Layout'
import { StatusPlate } from '../components/StatusPlate'

/** Klantkaart (sectie 7.6): contact, fietsen, alle werkbonnen, totaal besteed. */
export default function Klant() {
  const t = useT()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useDbVersion()

  const customer = db.customer(id)
  if (!customer) {
    return (
      <div>
        <BackLink to="/klanten" labelKey="back.klanten" />
        <Notice tone="danger">{t('common.no_results')}</Notice>
      </div>
    )
  }

  const bikes = db.bikesOf(customer.id)
  const orders = db.workOrdersOfCustomer(customer.id)
  const spent = orders
    .filter((w) => w.status === 'opgehaald')
    .reduce((sum, w) => sum + w.total_incl_vat_cents, 0)

  return (
    <div>
      <BackLink to="/klanten" labelKey="back.klanten" />
      <h1 className="text-3xl font-semibold mb-4">{customer.first_name} {customer.last_name}</h1>

      <Card>
        <p className="font-semibold">{t('klant.contact')}</p>
        <p className="text-2xl">{phoneDisplay(customer.phone)}</p>
        {customer.email && <p>{customer.email}</p>}
        <p className="text-muted">{[customer.street, customer.postcode, customer.city].filter(Boolean).join(', ')}</p>
        <p className="mt-3 font-semibold">{t('klant.spent')}: {money(spent)}</p>
      </Card>

      <SectionTitle>{t('klant.bikes')}</SectionTitle>
      {bikes.map((b) => (
        <Card key={b.id} className="mb-3">
          <span className="text-2xl font-semibold">{b.brand} {b.model}</span>
          <span className="block">{[b.color, b.frame_number].filter(Boolean).join(' · ')}</span>
          {b.is_ebike && <span className="block">{b.motor_system} · {b.battery_wh} Wh</span>}
        </Card>
      ))}

      <SectionTitle>{t('klant.history')}</SectionTitle>
      {orders.length === 0 && <Card>{t('klant.no_history')}</Card>}
      {orders.map((w) => (
        <Card key={w.id} className="mb-3" onClick={() => navigate(`/werkbon/${w.id}`)}>
          <span className="flex justify-between gap-3 flex-wrap items-baseline">
            <span className="text-2xl font-semibold">
              {w.tag_code ? formatTagCode(w.tag_code) : w.number}
            </span>
            <StatusPlate status={w.status} />
          </span>
          <span className="block">{w.complaint}</span>
          <span className="block text-muted">{date(w.intake_at)} · {money(w.total_incl_vat_cents)}</span>
        </Card>
      ))}

      <PrimaryBar>
        <Button variant="primary" full onClick={() => navigate(`/aanname?klant=${customer.id}`)}>
          {t('klant.new_workorder')}
        </Button>
      </PrimaryBar>
    </div>
  )
}
