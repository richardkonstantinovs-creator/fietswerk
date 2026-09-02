import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { date } from '../lib/format'
import { formatTagCode } from '../lib/code'
import { useT } from '../i18n'
import { Button, Card, Field, Notice, SectionTitle, TextInput } from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Bestellingen bij de leverancier. Bovenaan het scanveld voor binnenkomst:
 * doos scannen sluit de bestelregel én maakt de wachtende werkbon weer vrij
 * (sectie 7.4 en 8.6).
 */
export default function Bestellingen() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [ean, setEan] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const orders = db.purchaseOrders()

  function receive() {
    const result = db.receiveByEan(ean)
    if (!result.part) {
      setMessage({ tone: 'warn', text: t('bestellingen.scan_unknown') })
    } else {
      const numbers = result.resumable
        .map((w) => formatTagCode(w.tag_code ?? w.number)).join(', ')
      setMessage({
        tone: 'ok',
        text: numbers === ''
          ? t('bestellingen.scan_received', { name: result.part.name })
          : `${t('bestellingen.scan_received', { name: result.part.name })} ${t('bestellingen.resumable', { numbers })}`,
      })
    }
    setEan('')
  }

  return (
    <div>
      <BackLink to="/onderdelen" labelKey="nav.onderdelen" />
      <h1 className="text-3xl font-semibold mb-4">{t('bestellingen.title')}</h1>

      <Field label={t('onderdelen.scan_ean')} hint={t('bestellingen.scan_help')} htmlFor="ean">
        <TextInput
          id="ean" value={ean} autoComplete="off"
          onChange={(e) => { setEan(e.target.value); setMessage(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && ean.trim() !== '') receive() }}
          placeholder="8710000000000"
          className="text-2xl tracking-wide"
        />
      </Field>
      <Button variant="primary" full disabled={ean.trim() === ''} onClick={receive}>
        {t('bestellingen.received')}
      </Button>
      {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <SectionTitle>{t('bestellingen.title')}</SectionTitle>
      {orders.length === 0 && <Card>{t('bestellingen.empty')}</Card>}
      {orders.map((po) => {
        const lines = db.poLinesOf(po.id)
        const open = lines.filter((l) => l.qty_received < l.qty_ordered).length
        return (
          <Card key={po.id} className="mb-3" onClick={() => navigate(`/bestelling/${po.id}`)}>
            <span className="flex justify-between gap-3 flex-wrap items-baseline">
              <span className="text-2xl font-semibold">{po.number}</span>
              <span className="font-semibold">{t(`po.${po.status}`)}</span>
            </span>
            <span className="block">{db.supplier(po.supplier_id)?.name}</span>
            <span className="block text-muted">
              {lines.length} × {t('bestellingen.lines')} · {open} {t('common.open').toLowerCase()}
            </span>
            {po.expected_at && (
              <span className="block text-muted">{t('bestellingen.expected')}: {date(po.expected_at)}</span>
            )}
          </Card>
        )
      })}
    </div>
  )
}
