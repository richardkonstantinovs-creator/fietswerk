import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import type { BikeCategory, StockBike } from '../lib/types'
import { date, parseMoneyToCents, phoneDisplay, toE164NL } from '../lib/format'
import { useT } from '../i18n'
import {
  Button, Card, ChoiceButton, Field, FieldError, Notice, NumberInput,
  PrimaryBar, SectionTitle, TextInput,
} from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Inkoop van een tweedehands fiets (sectie 4.1). Dit formulier is streng met
 * opzet: zonder framenummer, ID-controle en stopheling-controle mag er niet
 * ingekocht worden, en daarna blokkeert het systeem de verkoop 5 werkdagen.
 */

const CATEGORIES: BikeCategory[] = [
  'stadsfiets', 'ebike', 'racefiets', 'mtb', 'bakfiets', 'kinderfiets', 'vouwfiets', 'overig',
]
const SOURCES: StockBike['source'][] = ['particulier', 'inruil', 'handelaar']

export default function Inkoop() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [category, setCategory] = useState<BikeCategory>('stadsfiets')
  const [frame, setFrame] = useState('')
  const [color, setColor] = useState('')
  const [source, setSource] = useState<StockBike['source']>('particulier')
  const [sellerQuery, setSellerQuery] = useState('')
  const [sellerId, setSellerId] = useState<string | null>(null)
  const [idChecked, setIdChecked] = useState(false)
  const [idNote, setIdNote] = useState('')
  const [stopheling, setStopheling] = useState(false)
  const [price, setPrice] = useState('')
  const [asking, setAsking] = useState('')
  const [scheme, setScheme] = useState<'margin' | 'standard'>('margin')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<StockBike | null>(null)

  const matches = db.findCustomersByPhone(sellerQuery)
  const seller = sellerId ? db.customer(sellerId) : null

  function save() {
    if (brand.trim() === '') { setError(t('aanname.step2.brand_required')); return }
    if (frame.trim().length < 4) { setError(t('inkoop.frame_required')); return }
    if (!idChecked) { setError(t('inkoop.id_required')); return }
    if (!stopheling) { setError(t('inkoop.stopheling_required')); return }
    const purchase = parseMoneyToCents(price)
    if (purchase == null) { setError(t('inkoop.price_required')); return }

    const stb = db.createStockBike({
      brand: brand.trim(), model: model.trim() || null, category,
      frame_number: frame.trim().toUpperCase(), color: color.trim() || null,
      source, seller_customer_id: sellerId,
      purchase_price_cents: purchase,
      id_checked: idChecked, id_check_note: idNote.trim() || null,
      stopheling_checked: stopheling,
      vat_scheme: scheme,
      asking_price_cents: parseMoneyToCents(asking) ?? Math.round(purchase * 2),
    })
    setSaved(stb)
  }

  if (saved) {
    return (
      <div>
        <h1 className="text-3xl font-semibold mt-6 mb-4">{t('inkoop.saved')}</h1>
        <Notice tone="warn">{t('inkoop.saved_hold', { date: date(saved.sellable_from) })}</Notice>
        <PrimaryBar>
          <Button variant="primary" full onClick={() => navigate(`/occasion/${saved.id}`)}>
            {t('common.open')}
          </Button>
          {db.needsInkoopverklaring(saved) && (
            <Button full onClick={() => navigate(`/inkoopverklaring/${saved.id}`)}>
              {t('occasions.open_inkoopverklaring')}
            </Button>
          )}
          <Button variant="quiet" full onClick={() => navigate('/occasions')}>
            {t('occasions.title')}
          </Button>
        </PrimaryBar>
      </div>
    )
  }

  return (
    <div>
      <BackLink to="/occasions" labelKey="occasions.title" />
      <h1 className="text-3xl font-semibold mb-4">{t('inkoop.title')}</h1>
      <Notice tone="warn">{t('inkoop.legal')}</Notice>

      <SectionTitle>{t('inkoop.bike')}</SectionTitle>
      <Field label={t('aanname.step2.brand')} htmlFor="ink-merk">
        <TextInput id="ink-merk" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Gazelle" />
      </Field>
      <Field label={t('aanname.step2.model')} hint={t('common.optional')} htmlFor="ink-model">
        <TextInput id="ink-model" value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
      <Field label={t('aanname.step2.category')}>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => (
            <ChoiceButton key={c} selected={category === c} label={t(`bike.category.${c}`)} onClick={() => setCategory(c)} />
          ))}
        </div>
      </Field>
      <Field label={t('aanname.step2.frame')} hint={t('inkoop.frame_required')} htmlFor="ink-frame">
        <TextInput
          id="ink-frame" value={frame}
          onChange={(e) => { setFrame(e.target.value); setError(null) }}
          className="text-2xl tracking-wide"
        />
      </Field>
      <Field label={t('aanname.step2.color')} hint={t('common.optional')} htmlFor="ink-kleur">
        <TextInput id="ink-kleur" value={color} onChange={(e) => setColor(e.target.value)} />
      </Field>

      <SectionTitle>{t('inkoop.seller')}</SectionTitle>
      <Field label={t('inkoop.source')}>
        <div className="grid gap-3">
          {SOURCES.map((s) => (
            <ChoiceButton key={s} selected={source === s} label={t(`source.${s}`)} onClick={() => setSource(s)} />
          ))}
        </div>
      </Field>
      {seller ? (
        <Card>
          <p className="text-2xl font-semibold">{seller.first_name} {seller.last_name}</p>
          <p>{phoneDisplay(seller.phone)}</p>
          <p className="text-muted">{[seller.street, seller.postcode, seller.city].filter(Boolean).join(', ')}</p>
          <div className="mt-3">
            <Button onClick={() => setSellerId(null)}>{t('common.cancel')}</Button>
          </div>
        </Card>
      ) : (
        <>
          <Field label={t('aanname.step1.label')} hint={t('inkoop.seller_pick')} htmlFor="ink-tel">
            <NumberInput
              id="ink-tel" value={sellerQuery}
              onChange={(e) => setSellerQuery(e.target.value)}
              placeholder="06 12 34 56 78"
            />
          </Field>
          {matches.slice(0, 5).map((c) => (
            <Card key={c.id} className="mb-3" onClick={() => setSellerId(c.id)}>
              <span className="text-2xl font-semibold">{c.first_name} {c.last_name}</span>
              <span className="block">{phoneDisplay(c.phone)}</span>
            </Card>
          ))}
          {sellerQuery.replace(/\D/g, '').length >= 6 && matches.length === 0 && (
            <Button
              full
              onClick={() => {
                const c = db.createCustomer({
                  phone: toE164NL(sellerQuery), last_name: '', first_name: '',
                })
                setSellerId(c.id)
              }}
            >
              {t('aanname.step1.new_customer')}
            </Button>
          )}
        </>
      )}

      <SectionTitle>{t('inkoop.id_checked')}</SectionTitle>
      <div className="grid gap-3">
        <ChoiceButton
          selected={idChecked} label={t('inkoop.id_checked')}
          onClick={() => { setIdChecked(!idChecked); setError(null) }}
        />
        <Field label={t('inkoop.id_note')} hint={t('common.optional')} htmlFor="ink-idnote">
          <TextInput id="ink-idnote" value={idNote} onChange={(e) => setIdNote(e.target.value)} placeholder="Rijbewijs" />
        </Field>
        <ChoiceButton
          selected={stopheling} label={t('inkoop.stopheling')}
          onClick={() => { setStopheling(!stopheling); setError(null) }}
        />
        <a
          href="https://www.stopheling.nl"
          target="_blank"
          rel="noreferrer"
          className="min-h-touch flex items-center justify-center px-5 rounded-xl border-2 border-ink bg-white font-semibold no-underline text-ink"
        >
          {t('inkoop.stopheling_open')}
        </a>
      </div>

      <SectionTitle>{t('inkoop.price')}</SectionTitle>
      <Field label={t('inkoop.price')} htmlFor="ink-prijs">
        <NumberInput
          id="ink-prijs" value={price}
          onChange={(e) => { setPrice(e.target.value); setError(null) }}
          className="text-3xl font-semibold"
        />
      </Field>
      <Field label={t('inkoop.asking')} hint={t('common.optional')} htmlFor="ink-vraag">
        <NumberInput id="ink-vraag" value={asking} onChange={(e) => setAsking(e.target.value)} />
      </Field>
      <Field label={t('inkoop.vat_scheme')}>
        <div className="grid gap-3">
          <ChoiceButton selected={scheme === 'margin'} label={t('inkoop.vat_margin')} onClick={() => setScheme('margin')} />
          <ChoiceButton selected={scheme === 'standard'} label={t('inkoop.vat_standard')} onClick={() => setScheme('standard')} />
        </div>
      </Field>
      {scheme === 'margin' && (parseMoneyToCents(price) ?? 0) >= db.INKOOPVERKLARING_LIMIT_CENTS && (
        <Notice tone="warn">{t('occasions.inkoopverklaring_needed')}</Notice>
      )}

      {error && <FieldError message={error} />}

      <PrimaryBar>
        <Button variant="primary" full onClick={save}>{t('inkoop.save')}</Button>
        <Button variant="quiet" full onClick={() => navigate('/occasions')}>{t('common.cancel')}</Button>
      </PrimaryBar>
    </div>
  )
}
