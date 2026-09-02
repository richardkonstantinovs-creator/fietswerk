import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { daysSince, minutesDisplay, money } from '../lib/format'
import { isOpen, statusSince, STUCK_DAYS_OWNER } from '../lib/workflow'
import { useT } from '../i18n'
import { Button, Card, Confirm, SectionTitle } from '../components/ui'

/**
 * Sectie 7.7 — geen grafieken, maar zes grote getallen met gewone woorden
 * eronder. Grafieken pas als de eigenaar er zelf om vraagt.
 */
export default function Overzicht() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [resetting, setResetting] = useState(false)

  const d = db.data()
  const weekAgo = Date.now() - 7 * 86_400_000
  const paidThisWeek = d.work_orders.filter(
    (w) => w.picked_up_at != null && new Date(w.picked_up_at).getTime() >= weekAgo,
  )

  let labor = 0
  let parts = 0
  let minutes = 0
  for (const w of paidThisWeek) {
    for (const l of db.linesOf(w.id)) {
      const incl = l.line_total_ex_vat_cents + Math.round(l.line_total_ex_vat_cents * l.vat_rate)
      if (l.kind === 'arbeid') { labor += incl; minutes += (l.minutes ?? 0) * l.qty } else parts += incl
    }
  }

  // Verkochte occasions horen ook bij de omzet van de week (sectie 7.7).
  const bikesSold = d.stock_bikes.filter(
    (b) => b.sold_at != null && new Date(b.sold_at).getTime() >= weekAgo,
  )
  const bikesRevenue = bikesSold.reduce((sum, b) => sum + (b.sold_price_cents ?? 0), 0)

  const open = d.work_orders.filter((w) => isOpen(w.status))
  const stuck = open.filter((w) => daysSince(statusSince(w)) > STUCK_DAYS_OWNER)

  const done = d.work_orders.filter((w) => w.ready_at != null)
  const leadDays = done.length === 0 ? 0
    : done.reduce((sum, w) =>
      sum + (new Date(w.ready_at!).getTime() - new Date(w.intake_at).getTime()) / 86_400_000, 0) / done.length

  const uncollected = d.work_orders.filter(
    (w) => w.status === 'gereed' && w.ready_at != null && daysSince(w.ready_at) >= 14,
  )
  const waitingParts = open.filter((w) => w.status === 'wacht_op_onderdeel')
  const waitingQuotes = open.filter((w) => w.status === 'wacht_op_akkoord')
  const lowParts = db.partsBelowMin().length

  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-1">{t('overzicht.title')}</h1>
      <p className="text-muted mb-6">{t('overzicht.subtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Big label={t('overzicht.revenue')} value={money(labor + parts + bikesRevenue)}>
          <p>{t('overzicht.revenue_labor')}: {money(labor)}</p>
          <p>{t('overzicht.revenue_parts')}: {money(parts)}</p>
          <p>{t('occasions.title')}: {money(bikesRevenue)}</p>
        </Big>

        <Big label={t('overzicht.open')} value={String(open.length)}>
          <p className={stuck.length > 0 ? 'text-danger font-semibold' : ''}>
            {stuck.length} {t('overzicht.stuck')}
          </p>
        </Big>

        <Big label={t('overzicht.leadtime')} value={leadDays.toFixed(1)}>
          <p>{t('overzicht.leadtime_unit')}</p>
        </Big>

        <Big label={t('overzicht.capacity')} value={minutesDisplay(minutes)}>
          <p>{t('overzicht.capacity_unit')}</p>
        </Big>

        <Big label={t('overzicht.uncollected')} value={String(uncollected.length)}>
          <p>{t('overzicht.uncollected_unit')}</p>
        </Big>

        <Big label={t('overzicht.todo')} value={String(waitingParts.length + waitingQuotes.length + lowParts)}>
          <p>{waitingParts.length} {t('overzicht.todo_parts')}</p>
          <p>{waitingQuotes.length} {t('overzicht.todo_quotes')}</p>
          <p>{t('onderdelen.below_min', { count: lowParts })}</p>
        </Big>
      </div>

      {uncollected.length > 0 && (
        <>
          <SectionTitle>{t('overzicht.uncollected')}</SectionTitle>
          {uncollected.map((w) => {
            const c = db.customer(w.customer_id)
            const b = db.bike(w.bike_id)
            return (
              <Card key={w.id} className="mb-3" onClick={() => navigate(`/werkbon/${w.id}`)}>
                <span className="text-2xl font-semibold">{b?.brand} {b?.model}</span>
                <span className="block">{c?.first_name} {c?.last_name}</span>
                <span className="block text-danger font-semibold">
                  {daysSince(w.ready_at!)} {t('overzicht.days')}
                </span>
              </Card>
            )
          })}
        </>
      )}

      <SectionTitle>{t('overzicht.reset')}</SectionTitle>
      <Button variant="danger" full onClick={() => setResetting(true)}>{t('overzicht.reset')}</Button>

      {resetting && (
        <Confirm
          question={t('overzicht.reset_confirm')}
          explain={t('overzicht.reset_explain')}
          yesLabel={t('overzicht.reset_yes')}
          danger
          onYes={() => { db.resetDemoData(); setResetting(false) }}
          onNo={() => setResetting(false)}
        />
      )}
    </div>
  )
}

function Big({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <Card>
      <p className="font-semibold">{label}</p>
      <p className="text-4xl sm:text-5xl font-semibold my-2">{value}</p>
      <div className="text-muted">{children}</div>
    </Card>
  )
}
