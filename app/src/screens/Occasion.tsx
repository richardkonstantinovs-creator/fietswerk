import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import type { PaymentMethod, StockBikeStatus } from '../lib/types'
import { date, minutesDisplay, money, parseMoneyToCents } from '../lib/format'
import { useT } from '../i18n'
import {
  Button, Card, ChoiceButton, Field, Notice, NumberInput, PrimaryBar, SectionTitle,
} from '../components/ui'
import { BackLink } from '../components/Layout'

const STATUSES: StockBikeStatus[] = ['binnen', 'opknappen', 'te_koop', 'gereserveerd']

/** Occasionkaart: naleving, echte marge, opknapkosten en verkoop. */
export default function Occasion() {
  const t = useT()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useDbVersion()

  const stb = db.stockBike(id)
  const [parts, setParts] = useState(stb ? (stb.refurb_parts_cents / 100).toFixed(2).replace('.', ',') : '')
  const [minutes, setMinutes] = useState(stb ? String(stb.refurb_minutes) : '')
  const [selling, setSelling] = useState(false)
  const [price, setPrice] = useState(stb ? (stb.asking_price_cents / 100).toFixed(2).replace('.', ',') : '')
  const [method, setMethod] = useState<PaymentMethod>('pin')
  const [buyerId, setBuyerId] = useState<string | null>(null)

  if (!stb) {
    return (
      <div>
        <BackLink to="/occasions" labelKey="back.occasions" />
        <Notice tone="danger">{t('common.no_results')}</Notice>
      </div>
    )
  }

  const bike = db.bike(stb.bike_id)
  const seller = db.customer(stb.seller_customer_id)
  const margin = db.occasionMargin(stb)
  const sellable = db.mayBeSold(stb)
  const sold = stb.status === 'verkocht'

  return (
    <div>
      <BackLink to="/occasions" labelKey="back.occasions" />
      <h1 className="text-3xl font-semibold mb-2">{bike?.brand} {bike?.model}</h1>
      <p className="text-lg mb-4">{[bike?.color, bike?.model_year, bike?.frame_number].filter(Boolean).join(' · ')}</p>

      {!sellable && !sold && (
        <div className="mb-4">
          <Notice tone="warn">{t('occasions.blocked', { date: date(stb.sellable_from) })}</Notice>
        </div>
      )}
      {db.needsInkoopverklaring(stb) && (
        <div className="mb-4">
          <Notice tone="warn">{t('occasions.inkoopverklaring_needed')}</Notice>
        </div>
      )}

      <Card>
        <p className="flex justify-between"><span>{t('occasions.purchase_price')}</span><span>{money(margin.purchase_cents)}</span></p>
        <p className="flex justify-between"><span>{t('occasions.parts_cost')}</span><span>{money(margin.parts_cents)}</span></p>
        <p className="flex justify-between">
          <span>{t('occasions.labor_cost')} ({minutesDisplay(stb.refurb_minutes)})</span>
          <span>{money(margin.labor_cents)}</span>
        </p>
        <p className="flex justify-between font-semibold pt-3 mt-2 border-t-2 border-line">
          <span>{t('occasions.invested')}</span><span>{money(margin.invested_cents)}</span>
        </p>
        <p className="flex justify-between mt-3">
          <span>{sold ? t('occasions.sold_for') : t('occasions.asking')}</span>
          <span className="font-semibold">{money(margin.price_cents)}</span>
        </p>
        <p className="flex justify-between"><span>{t('occasions.margin_vat')}</span><span>{money(margin.margin_vat_cents)}</span></p>
        <p className="flex justify-between text-3xl font-semibold mt-2">
          <span>{t('occasions.real_margin')}</span>
          <span className={margin.net_margin_cents < 0 ? 'text-danger' : 'text-ok'}>
            {money(margin.net_margin_cents)}
          </span>
        </p>
        <p className="text-sm text-muted mt-1">{t('occasions.margin_help')}</p>
        <p className="mt-3">{t('occasions.days_in_stock')}: <strong>{margin.days_in_stock}</strong></p>
      </Card>

      <SectionTitle>{t('inkoop.legal')}</SectionTitle>
      <Card>
        <p className="flex justify-between gap-3"><span>{t('inkoop.source')}</span><span>{t(`source.${stb.source}`)}</span></p>
        <p className="flex justify-between gap-3"><span>{t('inkoop.seller')}</span><span>{seller ? `${seller.first_name} ${seller.last_name}` : '—'}</span></p>
        <p className="flex justify-between gap-3"><span>{t('inkoop.id_checked')}</span><span>{stb.id_checked ? '✓' : '⚠'}</span></p>
        <p className="flex justify-between gap-3"><span>{t('inkoop.stopheling')}</span><span>{stb.stopheling_checked_at ? '✓' : '⚠'}</span></p>
        <p className="flex justify-between gap-3"><span>{t('inkoop.vat_scheme')}</span><span>{stb.vat_scheme === 'margin' ? t('inkoop.vat_margin') : t('inkoop.vat_standard')}</span></p>
        <p className="flex justify-between gap-3"><span>{t('occasions.blocked_short')}</span><span>{date(stb.sellable_from)}</span></p>
      </Card>
      <div className="mt-3">
        <Button full onClick={() => navigate(`/inkoopverklaring/${stb.id}`)}>
          {t('occasions.open_inkoopverklaring')}
        </Button>
      </div>

      {!sold && (
        <>
          <SectionTitle>{t('occasions.refurb')}</SectionTitle>
          <Field label={t('occasions.refurb_parts')} htmlFor="refurb-parts">
            <NumberInput id="refurb-parts" value={parts} onChange={(e) => setParts(e.target.value)} />
          </Field>
          <Field label={t('occasions.refurb_minutes')} htmlFor="refurb-min">
            <NumberInput id="refurb-min" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Button
            full
            onClick={() => db.updateStockBike(stb.id, {
              refurb_parts_cents: parseMoneyToCents(parts) ?? 0,
              refurb_minutes: Number(minutes) || 0,
            })}
          >
            {t('occasions.refurb_save')}
          </Button>

          <SectionTitle>{t('occasions.status_set')}</SectionTitle>
          <div className="grid gap-3">
            {STATUSES.map((s) => (
              <ChoiceButton
                key={s}
                selected={stb.status === s}
                label={t(`stockbike.${s}`)}
                sub={s === 'te_koop' && !sellable ? t('occasions.blocked_short') : undefined}
                onClick={() => {
                  if (s === 'te_koop' && !sellable) return
                  db.updateStockBike(stb.id, { status: s })
                }}
              />
            ))}
          </div>
        </>
      )}

      {sold && (
        <div className="mt-6">
          <Notice tone="ok">
            {t('occasions.sold_for')}: {money(stb.sold_price_cents ?? 0)} · {t('occasions.sold_at')}: {date(stb.sold_at)}
          </Notice>
        </div>
      )}

      {selling && (
        <>
          <SectionTitle>{t('occasions.sell')}</SectionTitle>
          <Card>
            <Field label={t('occasions.sold_for')} htmlFor="verkoopprijs">
              <NumberInput
                id="verkoopprijs" value={price} autoFocus
                onChange={(e) => setPrice(e.target.value)}
                className="text-3xl font-semibold"
              />
            </Field>
            <Field label={t('werkbon.payment_method')}>
              <div className="grid gap-3">
                {(['pin', 'contant', 'ideal', 'factuur'] as PaymentMethod[]).map((m) => (
                  <ChoiceButton
                    key={m} selected={method === m} label={t(`payment.${m}`)}
                    onClick={() => setMethod(m)}
                  />
                ))}
              </div>
            </Field>
            <Field label={t('inkoop.seller_pick')} hint={t('common.optional')}>
              <div className="grid gap-3">
                {db.data().customers.slice(0, 5).map((c) => (
                  <ChoiceButton
                    key={c.id} selected={buyerId === c.id}
                    label={`${c.first_name} ${c.last_name}`}
                    onClick={() => setBuyerId(buyerId === c.id ? null : c.id)}
                  />
                ))}
              </div>
            </Field>
            {stb.vat_scheme === 'margin' && (
              <Notice tone="warn">{t('factuur.margin_note')}</Notice>
            )}
          </Card>
        </>
      )}

      {!sold && (
        <PrimaryBar>
          {selling ? (
            <>
              <Button
                variant="primary" full
                disabled={parseMoneyToCents(price) == null}
                onClick={() => {
                  const cents = parseMoneyToCents(price)
                  if (cents == null) return
                  const inv = db.sellStockBike(stb.id, cents, buyerId, method)
                  setSelling(false)
                  if (inv) navigate(`/factuur/${inv.id}`)
                }}
              >
                {t('confirm.checkout.yes')}
              </Button>
              <Button full onClick={() => setSelling(false)}>{t('common.no_back')}</Button>
            </>
          ) : (
            <Button variant="primary" full disabled={!sellable} onClick={() => setSelling(true)}>
              {t('occasions.sell')}
            </Button>
          )}
        </PrimaryBar>
      )}
    </div>
  )
}
