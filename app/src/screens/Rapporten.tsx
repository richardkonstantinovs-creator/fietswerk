import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import type { Bookkeeping } from '../lib/db'
import type { Reminder } from '../lib/types'
import { date, daysSince, money, phoneDisplay, whatsappNumber } from '../lib/format'
import { formatTagCode } from '../lib/code'
import { useT } from '../i18n'
import { Button, Card, ChoiceButton, Notice, SectionTitle } from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Rapporten voor de eigenaar (fase 2): fietsen die blijven staan, btw over de
 * marge en de export naar de boekhouding. Geen eigen boekhouding — dat staat
 * op de anti-scopelijst (sectie 13).
 */

const STEPS: Array<{ step: Reminder['step']; key: string }> = [
  { step: 'herinnering_1', key: 'rapporten.reminder_1' },
  { step: 'herinnering_2', key: 'rapporten.reminder_2' },
  { step: 'aangetekende_brief', key: 'rapporten.reminder_letter' },
  { step: 'termijn_verstreken', key: 'rapporten.reminder_final' },
]

const PERIODS = ['month', 'quarter', 'year'] as const
type Period = typeof PERIODS[number]

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const from = period === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : period === 'quarter'
      ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      : new Date(now.getFullYear(), 0, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export default function Rapporten() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [period, setPeriod] = useState<Period>('quarter')
  const [target, setTarget] = useState<Bookkeeping>('moneybird')
  const [exported, setExported] = useState<string | null>(null)

  if (!db.maySeeReports()) {
    return (
      <div>
        <BackLink to="/" labelKey="back.werkplaats" />
        <Notice tone="warn">{t('role.only_owner')}</Notice>
      </div>
    )
  }

  const buckets = db.uncollectedBuckets()
  const range = periodRange(period)
  const margin = db.marginVatReport(range.from, range.to)
  const shop = db.settings()

  function download() {
    const csv = db.exportInvoicesCsv(target, range.from, range.to)
    if (csv.split('\r\n').length <= 1) { setExported(t('rapporten.export_empty')); return }
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facturen-${target}-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExported(null)
  }

  return (
    <div>
      <BackLink to="/overzicht" labelKey="nav.overzicht" />
      <h1 className="text-3xl font-semibold mb-4">{t('rapporten.title')}</h1>

      <SectionTitle>{t('rapporten.uncollected')}</SectionTitle>
      <p className="text-muted mb-4">{t('rapporten.uncollected_help')}</p>

      {buckets.map((bucket) => (
        <div key={bucket.days} className="mb-6">
          <h3 className="text-2xl font-semibold mb-3">{t('rapporten.bucket', { days: bucket.days })}</h3>
          {bucket.orders.length === 0 && <p className="text-muted">{t('rapporten.bucket_empty')}</p>}
          {bucket.orders.map((wo) => {
            const customer = db.customer(wo.customer_id)
            const bike = db.bike(wo.bike_id)
            const done = db.remindersOf(wo.id)
            const body = db.renderTemplate('herinnering', {
              naam: customer?.first_name ?? '',
              fiets: `${bike?.brand ?? ''} ${bike?.model ?? ''}`.trim(),
              winkel: shop.shop_name,
              telefoon: phoneDisplay(shop.phone),
            })
            return (
              <Card key={wo.id} className="mb-3">
                <button
                  type="button"
                  onClick={() => navigate(`/werkbon/${wo.id}`)}
                  className="text-left w-full"
                >
                  <span className="text-2xl font-semibold">
                    {formatTagCode(wo.tag_code ?? wo.number)}
                  </span>
                  <span className="block">{bike?.brand} {bike?.model} — {customer?.last_name}</span>
                  <span className="block text-danger font-semibold">
                    {daysSince(wo.ready_at ?? wo.intake_at)} {t('overzicht.days')}
                  </span>
                </button>

                <p className="mt-3 font-semibold">{t('rapporten.reminder_log')}</p>
                <div className="grid gap-3 mt-2">
                  {STEPS.map((s) => {
                    const at = done.find((r) => r.step === s.step)
                    return (
                      <ChoiceButton
                        key={s.step}
                        selected={at != null}
                        label={t(s.key)}
                        sub={at ? date(at.at) : undefined}
                        onClick={() => {
                          if (at) return
                          db.addReminder(wo.id, s.step, s.step === 'aangetekende_brief' ? 'brief' : 'whatsapp')
                        }}
                      />
                    )
                  })}
                  <a
                    href={`https://wa.me/${whatsappNumber(customer?.phone ?? '')}?text=${encodeURIComponent(body)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => db.logNotification('whatsapp', 'herinnering', body, wo.id, wo.customer_id)}
                    className="min-h-touch flex items-center justify-center px-5 rounded-xl border-2 border-ink bg-white font-semibold no-underline text-ink"
                  >
                    {t('werkbon.whatsapp')}
                  </a>
                </div>
              </Card>
            )
          })}
        </div>
      ))}

      <SectionTitle>{t('rapporten.margin_vat')}</SectionTitle>
      <p className="text-muted mb-3">{t('rapporten.margin_vat_help')}</p>
      <div className="grid gap-3 mb-4">
        {PERIODS.map((p) => (
          <ChoiceButton
            key={p} selected={period === p} label={t(`rapporten.period_${p}`)}
            onClick={() => setPeriod(p)}
          />
        ))}
      </div>
      <Card>
        <p className="flex justify-between"><span>{t('rapporten.margin_count')}</span><span className="font-semibold">{margin.count}</span></p>
        <p className="flex justify-between"><span>{t('rapporten.margin_gross')}</span><span className="font-semibold">{money(margin.gross_margin_cents)}</span></p>
        <p className="flex justify-between text-3xl font-semibold mt-2">
          <span>{t('common.vat')}</span><span>{money(margin.vat_cents)}</span>
        </p>
      </Card>

      <SectionTitle>{t('rapporten.export')}</SectionTitle>
      <p className="text-muted mb-3">{t('rapporten.export_help')}</p>
      <div className="grid gap-3 mb-4">
        {(['moneybird', 'eboekhouden', 'snelstart'] as Bookkeeping[]).map((b) => (
          <ChoiceButton
            key={b}
            selected={target === b}
            label={b === 'moneybird' ? 'Moneybird' : b === 'eboekhouden' ? 'e-Boekhouden' : 'SnelStart'}
            onClick={() => setTarget(b)}
          />
        ))}
      </div>
      <p className="mb-3">
        {t('rapporten.export_from')} {date(range.from)} — {t('rapporten.export_to')} {date(range.to)}
      </p>
      <Button variant="primary" full onClick={download}>{t('rapporten.export_download')}</Button>
      {exported && <div className="mt-4"><Notice tone="warn">{exported}</Notice></div>}
    </div>
  )
}
