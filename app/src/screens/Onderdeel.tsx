import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { dateTime, money } from '../lib/format'
import { useT } from '../i18n'
import { Button, Card, Field, Notice, NumberInput, SectionTitle, TextInput } from '../components/ui'
import { BackLink } from '../components/Layout'

/** Onderdeelkaart: voorraad corrigeren en zien wat ermee gebeurd is. */
export default function Onderdeel() {
  const t = useT()
  const { id = '' } = useParams()
  useDbVersion()
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')

  const p = db.part(id)
  if (!p) {
    return (
      <div>
        <BackLink to="/onderdelen" labelKey="nav.onderdelen" />
        <Notice tone="danger">{t('common.no_results')}</Notice>
      </div>
    )
  }

  const movements = db.movementsOf(p.id)
  const sup = db.supplier(p.supplier_id)
  const isLow = p.stock_qty < p.min_qty
  const amount = Number(delta.replace(',', '.'))

  return (
    <div>
      <BackLink to="/onderdelen" labelKey="nav.onderdelen" />
      <h1 className="text-3xl font-semibold mb-4">{p.name}</h1>

      <Card>
        <p className="flex justify-between text-2xl font-semibold">
          <span>{t('onderdelen.stock')}</span>
          <span className={isLow ? 'text-danger' : ''}>{p.stock_qty}</span>
        </p>
        <p className="flex justify-between"><span>{t('onderdelen.min')}</span><span>{p.min_qty}</span></p>
        <p className="flex justify-between"><span>{t('onderdelen.bin')}</span><span>{p.bin_location}</span></p>
        <p className="flex justify-between"><span>{t('onderdelen.sell_price')}</span><span>{money(p.sell_price_ex_vat_cents)}</span></p>
        <p className="flex justify-between"><span>{t('onderdelen.cost_price')}</span><span>{money(p.cost_price_cents)}</span></p>
        <p className="flex justify-between"><span>{t('onderdelen.supplier')}</span><span>{sup?.name ?? '—'}</span></p>
        <p className="text-muted mt-2">{p.sku} · {p.ean}</p>
      </Card>

      {isLow && <div className="mt-4"><Notice tone="warn">{t('onderdelen.low')}</Notice></div>}

      <SectionTitle>{t('onderdelen.correct')}</SectionTitle>
      <Field label={t('onderdelen.correct')} hint={t('onderdelen.correct_help')} htmlFor="delta">
        <NumberInput
          id="delta" value={delta} placeholder="-1"
          onChange={(e) => setDelta(e.target.value)}
        />
      </Field>
      <Field label={t('line.description')} hint={t('common.optional')} htmlFor="notitie">
        <TextInput id="notitie" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button
        variant="primary"
        full
        disabled={!Number.isFinite(amount) || amount === 0}
        onClick={() => {
          db.adjustStock(p.id, Math.round(amount), 'correctie', null, note || null)
          setDelta('')
          setNote('')
        }}
      >
        {t('common.save')}
      </Button>

      <SectionTitle>{t('onderdelen.movements')}</SectionTitle>
      <Card>
        {movements.length === 0 && <p className="text-muted">{t('common.none')}</p>}
        {movements.slice(0, 25).map((m) => (
          <p key={m.id} className="py-2 border-b-2 border-shell last:border-b-0 flex justify-between gap-3">
            <span>
              <span className="font-semibold">{t(`reason.${m.reason}`)}</span>
              <span className="block text-sm text-muted">{dateTime(m.at)}{m.note ? ` · ${m.note}` : ''}</span>
            </span>
            <span className="text-2xl font-semibold">{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
          </p>
        ))}
      </Card>
    </div>
  )
}
