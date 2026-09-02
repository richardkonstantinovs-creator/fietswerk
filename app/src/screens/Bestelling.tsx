import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date, money } from '../lib/format'
import { formatTagCode } from '../lib/code'
import { useT } from '../i18n'
import { Button, Card, Notice, PrimaryBar, SectionTitle } from '../components/ui'
import { BackLink } from '../components/Layout'

/** Eén bestelling: verzenden, binnenkomst afvinken, wachtende bonnen vrijgeven. */
export default function Bestelling() {
  const t = useT()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useDbVersion()
  const [freed, setFreed] = useState<string[]>([])

  const po = db.purchaseOrder(id)
  if (!po) {
    return (
      <div>
        <BackLink to="/bestellingen" labelKey="bestellingen.title" />
        <Notice tone="danger">{t('common.no_results')}</Notice>
      </div>
    )
  }

  const lines = db.poLinesOf(po.id)
  const supplier = db.supplier(po.supplier_id)

  function receive(lineId: string, qty: number) {
    const resumable = db.receivePoLine(lineId, qty)
    if (resumable.length > 0) {
      setFreed((old) => [
        ...old,
        ...resumable.map((w) => formatTagCode(w.tag_code ?? w.number)),
      ])
    }
  }

  return (
    <div>
      <BackLink to="/bestellingen" labelKey="bestellingen.title" />
      <h1 className="text-3xl font-semibold mb-2">{po.number}</h1>
      <p className="text-2xl mb-4">{supplier?.name}</p>

      <Card>
        <p className="flex justify-between"><span>{t('bestellingen.status')}</span><span className="font-semibold">{t(`po.${po.status}`)}</span></p>
        {po.ordered_at && <p className="flex justify-between"><span>{t('bestellingen.ordered_at')}</span><span>{date(po.ordered_at)}</span></p>}
        {po.expected_at && <p className="flex justify-between"><span>{t('bestellingen.expected')}</span><span>{date(po.expected_at)}</span></p>}
      </Card>

      {freed.length > 0 && (
        <div className="mt-4">
          <Notice tone="ok">{t('bestellingen.resumable', { numbers: freed.join(', ') })}</Notice>
        </div>
      )}

      <SectionTitle>{t('bestellingen.lines')}</SectionTitle>
      {lines.map((line) => {
        const wo = line.work_order_id ? db.workOrder(line.work_order_id) : null
        const done = line.qty_received >= line.qty_ordered
        return (
          <Card key={line.id} className="mb-3">
            <p className="text-2xl font-semibold">{line.description}</p>
            <p>
              {t('bestellingen.received')}: {line.qty_received} {t('bestellingen.of')} {line.qty_ordered}
              {' · '}{money(line.cost_price_cents)}
            </p>
            {wo && (
              <button
                type="button"
                onClick={() => navigate(`/werkbon/${wo.id}`)}
                className="mt-2 min-h-touch w-full text-left px-4 py-2 rounded-xl border-2 border-ink bg-shell font-semibold"
              >
                {t('bestellingen.for_werkbon')} {formatTagCode(wo.tag_code ?? wo.number)}
              </button>
            )}
            {!done && (
              <div className="grid gap-3 mt-3">
                <Button onClick={() => receive(line.id, 1)}>{t('bestellingen.receive_one')}</Button>
                <Button
                  variant="primary"
                  onClick={() => receive(line.id, line.qty_ordered - line.qty_received)}
                >
                  {t('bestellingen.receive_all')}
                </Button>
              </div>
            )}
            {done && <p className="mt-2 font-semibold text-ok">{t('po.ontvangen')}</p>}
          </Card>
        )
      })}

      {po.status === 'concept' && (
        <PrimaryBar>
          <Button
            variant="primary"
            full
            onClick={() => {
              const expected = new Date()
              expected.setDate(expected.getDate() + (supplier?.lead_time_days ?? 3))
              db.markOrdered(po.id, expected.toISOString())
            }}
          >
            {t('bestellingen.mark_ordered')}
          </Button>
        </PrimaryBar>
      )}
    </div>
  )
}
