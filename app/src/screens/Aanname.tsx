import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { BIKE_CATEGORIES, chipsFor, JOB_TEMPLATES } from '../lib/jobs'
import type { BikeCategory, Customer, Photo, WorkOrder } from '../lib/types'
import { fileToPhoto } from '../lib/photos'
import { formatTagCode, publicUrl, tagUrl } from '../lib/code'
import { date, laborCents, minutesDisplay, money, parseMoneyToCents, phoneDisplay, toE164NL, vatOf } from '../lib/format'
import { printer } from '../lib/printer'
import { useT } from '../i18n'
import {
  Button, Card, ChoiceButton, Field, FieldError, Notice, NumberInput,
  PrimaryBar, TextArea, TextInput,
} from '../components/ui'
import { BackLink } from '../components/Layout'
import { Qr } from '../components/Qr'

/**
 * Aanname in zes stappen (sectie 7.2). De volgorde volgt het fysieke proces
 * aan de balie en mag niet veranderen. Doel: binnen 60 seconden klaar.
 */

const TOTAL_STEPS = 6

const LEFT_BEHIND = ['slot', 'sleutels', 'tas', 'kinderzitje', 'lamp', 'accu'] as const
const QUICK_LIMITS = [5000, 8000, 12000, 20000]
const QUICK_DAYS = [0, 1, 2, 5]

export default function Aanname() {
  // Nieuwe aanname = schoon formulier: de sleutel dwingt een verse start af.
  const [attempt, setAttempt] = useState(0)
  return <AannameForm key={attempt} onNew={() => setAttempt((a) => a + 1)} />
}

function AannameForm({ onNew }: { onNew: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  useDbVersion()
  const settings = db.settings()

  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Stap 1 — klant
  const preset = params.get('klant')
  const [phone, setPhone] = useState(preset ? (db.customer(preset)?.phone ?? '') : '')
  const [customer, setCustomer] = useState<Customer | null>(preset ? (db.customer(preset) ?? null) : null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Stap 2 — fiets
  const [bikeId, setBikeId] = useState<string | null>(null)
  const [newBike, setNewBike] = useState({
    brand: '', model: '', category: 'stadsfiets' as BikeCategory, frame: '', color: '',
  })

  // Stap 3 — klacht
  const [jobKeys, setJobKeys] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')

  // Stap 4 — tijd
  const [promisedDays, setPromisedDays] = useState(2)

  // Stap 5 — akkoord tot
  const [limitInput, setLimitInput] = useState(
    (settings.default_approved_limit_cents / 100).toFixed(2).replace('.', ','),
  )

  // Stap 6 — foto's en spullen
  const [photos, setPhotos] = useState<Photo[]>([])
  const [leftBehind, setLeftBehind] = useState<string[]>([])
  const [keyNumber, setKeyNumber] = useState('')
  const [rack, setRack] = useState('')

  const [saved, setSaved] = useState<WorkOrder | null>(null)
  const [printQueued, setPrintQueued] = useState(false)

  const matches = useMemo(
    () => (customer ? [] : db.findCustomersByPhone(phone)),
    [phone, customer],
  )
  const bikes = customer ? db.bikesOf(customer.id) : []
  const chosenBike = bikeId ? db.bike(bikeId) : null
  const category: BikeCategory | null = chosenBike?.category ?? (bikeId ? null : newBike.category)

  const jobs = jobKeys
    .map((k) => JOB_TEMPLATES.find((j) => j.key === k))
    .filter((j): j is NonNullable<typeof j> => j != null)
  const minutes = jobs.reduce((m, j) => m + j.minutes, 0)
  const exVat = jobs.reduce((c, j) => c + laborCents(j.minutes, settings.labor_rate_cents_per_hour), 0)
  const inclVat = exVat + vatOf(exVat, settings.vat_rate)
  const limitCents = parseMoneyToCents(limitInput)

  function goNext() {
    const problem = validate(step)
    if (problem) { setError(problem); return }
    setError(null)
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }

  function validate(current: number): string | null {
    if (current === 1) {
      if (customer) return null
      if (toE164NL(phone).length < 8) return t('aanname.step1.phone_required')
      if (lastName.trim() === '') return t('aanname.step1.name_required')
      return null
    }
    if (current === 2) {
      if (bikeId) return null
      if (newBike.brand.trim() === '') return t('aanname.step2.brand_required')
      return null
    }
    if (current === 3) {
      if (jobKeys.length === 0 && freeText.trim() === '') return t('aanname.step3.required')
      return null
    }
    return null
  }

  async function save() {
    const problem = validate(1) ?? validate(2) ?? validate(3)
    if (problem) { setError(problem); return }

    const cust = customer ?? db.createCustomer({
      phone: toE164NL(phone),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    })

    const bike = chosenBike ?? db.createBike({
      customer_id: cust.id,
      brand: newBike.brand.trim(),
      model: newBike.model.trim() || null,
      category: newBike.category,
      frame_number: newBike.frame.trim() || null,
      color: newBike.color.trim() || null,
      key_numbers: keyNumber.trim() ? [keyNumber.trim()] : [],
    })

    const complaint = [jobs.map((j) => j.nl).join(', '), freeText.trim()]
      .filter(Boolean).join(' — ')

    const promised = new Date()
    promised.setDate(promised.getDate() + promisedDays)

    const wo = db.createWorkOrder({
      customer_id: cust.id,
      bike_id: bike.id,
      complaint,
      approved_limit_cents: limitCents,
      estimated_minutes: minutes || null,
      promised_at: promised.toISOString(),
      rack_location: rack.trim() || null,
      photos,
      left_behind: leftBehind,
      key_numbers: keyNumber.trim() ? [keyNumber.trim()] : [],
      lines: jobs.map((j) => ({
        kind: 'arbeid' as const,
        description: j.nl,
        part_id: null,
        qty: 1,
        unit_price_ex_vat_cents: laborCents(j.minutes, settings.labor_rate_cents_per_hour),
        vat_rate: settings.vat_rate,
        discount_pct: 0,
        minutes: j.minutes,
      })),
    })

    setSaved(wo)
    // Printen is een bijwerking van opslaan, geen aparte handeling (sectie 9.7).
    // Staat de printer uit, dan blijft de opdracht gewoon in de wachtrij staan.
    setPrintQueued(printer.status !== 'ready')
    void printer.drain()
  }

  if (saved) return <SavedScreen wo={saved} queued={printQueued} onNew={onNew} />

  return (
    <div>
      <BackLink to="/" labelKey="back.werkplaats" />
      <p className="text-sm font-semibold text-muted">
        {t('aanname.step', { current: step, total: TOTAL_STEPS })}
      </p>
      <h1 className="text-3xl font-semibold mb-6">{t('aanname.title')}</h1>

      {step === 1 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step1.title')}</h2>
          {customer ? (
            <Card>
              <p className="text-2xl font-semibold">{customer.first_name} {customer.last_name}</p>
              <p>{phoneDisplay(customer.phone)}</p>
              <div className="mt-3">
                <Button onClick={() => { setCustomer(null); setBikeId(null) }}>
                  {t('common.cancel')}
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Field label={t('aanname.step1.label')} hint={t('aanname.step1.help')} htmlFor="tel">
                <NumberInput
                  id="tel"
                  value={phone}
                  autoFocus
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 12 34 56 78"
                />
              </Field>
              {matches.length > 0 && (
                <div className="mb-6">
                  <p className="font-semibold mb-2">{t('aanname.step1.found')}</p>
                  {matches.slice(0, 5).map((c) => (
                    <Card key={c.id} className="mb-3" onClick={() => { setCustomer(c); setError(null) }}>
                      <span className="text-2xl font-semibold">{c.first_name} {c.last_name}</span>
                      <span className="block">{phoneDisplay(c.phone)}</span>
                    </Card>
                  ))}
                </div>
              )}
              {phone.replace(/\D/g, '').length >= 6 && matches.length === 0 && (
                <div className="mb-2">
                  <Notice tone="warn">{t('aanname.step1.not_found')}</Notice>
                  <h3 className="text-2xl font-semibold mt-6 mb-3">{t('aanname.step1.new_customer')}</h3>
                  <Field label={t('aanname.step1.first_name')} htmlFor="voornaam">
                    <TextInput id="voornaam" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </Field>
                  <Field label={t('aanname.step1.last_name')} htmlFor="achternaam">
                    <TextInput id="achternaam" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step2.title')}</h2>
          {bikes.length > 0 && (
            <div className="mb-6">
              <p className="font-semibold mb-2">{t('aanname.step2.existing')}</p>
              {bikes.map((b) => (
                <div key={b.id} className="mb-3">
                  <ChoiceButton
                    selected={bikeId === b.id}
                    label={`${b.brand} ${b.model ?? ''}`.trim()}
                    sub={[t(`bike.category.${b.category}`), b.color, b.frame_number].filter(Boolean).join(' · ')}
                    onClick={() => { setBikeId(bikeId === b.id ? null : b.id); setError(null) }}
                  />
                </div>
              ))}
            </div>
          )}
          {!bikeId && (
            <div>
              <h3 className="text-2xl font-semibold mb-3">{t('aanname.step2.new_bike')}</h3>
              <Field label={t('aanname.step2.brand')} htmlFor="merk">
                <TextInput
                  id="merk" value={newBike.brand}
                  onChange={(e) => setNewBike({ ...newBike, brand: e.target.value })}
                  placeholder="Gazelle"
                />
              </Field>
              <Field label={t('aanname.step2.model')} hint={t('common.optional')} htmlFor="type">
                <TextInput
                  id="type" value={newBike.model}
                  onChange={(e) => setNewBike({ ...newBike, model: e.target.value })}
                />
              </Field>
              <Field label={t('aanname.step2.category')}>
                <div className="grid grid-cols-2 gap-3">
                  {BIKE_CATEGORIES.map((c) => (
                    <ChoiceButton
                      key={c} selected={newBike.category === c} label={t(`bike.category.${c}`)}
                      onClick={() => setNewBike({ ...newBike, category: c })}
                    />
                  ))}
                </div>
              </Field>
              <Field label={t('aanname.step2.frame')} hint={t('common.optional')} htmlFor="frame">
                <TextInput
                  id="frame" value={newBike.frame}
                  onChange={(e) => setNewBike({ ...newBike, frame: e.target.value })}
                />
              </Field>
              <Field label={t('aanname.step2.color')} hint={t('common.optional')} htmlFor="kleur">
                <TextInput
                  id="kleur" value={newBike.color}
                  onChange={(e) => setNewBike({ ...newBike, color: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step3.title')}</h2>
          <p className="font-semibold mb-3">{t('aanname.step3.chips')}</p>
          <div className="grid gap-3 mb-6">
            {chipsFor(category).map((j) => (
              <ChoiceButton
                key={j.key}
                selected={jobKeys.includes(j.key)}
                label={j.nl}
                sub={`${minutesDisplay(j.minutes)} · ${money(laborCents(j.minutes, settings.labor_rate_cents_per_hour))} ${t('common.excl_vat')}`}
                onClick={() => {
                  setError(null)
                  setJobKeys((keys) =>
                    keys.includes(j.key) ? keys.filter((k) => k !== j.key) : [...keys, j.key])
                }}
              />
            ))}
          </div>
          <Field label={t('aanname.step3.free')} htmlFor="klacht">
            <TextArea id="klacht" value={freeText} onChange={(e) => setFreeText(e.target.value)} />
          </Field>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step4.title')}</h2>
          {jobs.length === 0 ? (
            <Notice tone="warn">{t('aanname.step4.no_lines')}</Notice>
          ) : (
            <Card>
              <p className="font-semibold mb-2">{t('aanname.step4.lines')}</p>
              {jobs.map((j) => (
                <p key={j.key} className="flex justify-between gap-4">
                  <span>{j.nl}</span>
                  <span className="font-semibold whitespace-nowrap">
                    {money(laborCents(j.minutes, settings.labor_rate_cents_per_hour))}
                  </span>
                </p>
              ))}
              <p className="flex justify-between gap-4 mt-3 pt-3 border-t-2 border-line">
                <span>{t('aanname.step4.minutes')}</span>
                <span className="font-semibold">{minutesDisplay(minutes)}</span>
              </p>
              <p className="flex justify-between gap-4 text-2xl font-semibold">
                <span>{t('aanname.step4.estimate')}</span>
                <span>{money(inclVat)}</span>
              </p>
              <p className="text-sm text-muted">{t('common.incl_vat')}</p>
            </Card>
          )}
          <div className="mt-6">
            <p className="font-semibold mb-3">{t('aanname.step4.promised')}</p>
            <div className="grid gap-3">
              {QUICK_DAYS.map((d) => {
                const when = new Date()
                when.setDate(when.getDate() + d)
                return (
                  <ChoiceButton
                    key={d} selected={promisedDays === d}
                    label={date(when.toISOString())}
                    sub={d === 0 ? t('aanname.step4.today')
                      : d === 1 ? t('aanname.step4.tomorrow')
                      : t('aanname.step4.in_days', { days: d })}
                    onClick={() => setPromisedDays(d)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step5.title')}</h2>
          <Field label={t('aanname.step5.label')} hint={t('aanname.step5.help')} htmlFor="limiet">
            <NumberInput
              id="limiet" value={limitInput} autoFocus
              onChange={(e) => setLimitInput(e.target.value)}
              className="text-4xl font-semibold"
            />
          </Field>
          <p className="font-semibold mb-3">{t('aanname.step5.quick')}</p>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LIMITS.map((c) => (
              <ChoiceButton
                key={c} selected={limitCents === c} label={money(c)}
                onClick={() => setLimitInput((c / 100).toFixed(2).replace('.', ','))}
              />
            ))}
          </div>
        </div>
      )}

      {step === 6 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4">{t('aanname.step6.title')}</h2>
          <Field label={t('aanname.step6.photos')} hint={t('aanname.step6.photo_help')} htmlFor="fotos">
            <input
              id="fotos" type="file" accept="image/*" capture="environment" multiple
              className="block w-full min-h-touch text-lg"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? [])
                const next: Photo[] = []
                for (const f of files) {
                  try { next.push(await fileToPhoto(f)) } catch { /* onleesbaar bestand overslaan */ }
                }
                setPhotos((p) => [...p, ...next])
                e.target.value = ''
              }}
            />
          </Field>
          {photos.length > 0 && (
            <div className="flex gap-3 flex-wrap mb-6">
              {photos.map((p) => (
                <div key={p.id}>
                  <img src={p.data_url} alt="" className="w-28 h-28 object-cover rounded-xl border-2 border-line" />
                  <Button
                    className="mt-2 w-28 text-sm"
                    onClick={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                  >
                    {t('werkbon.remove_line')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Field label={t('aanname.step6.left_behind')}>
            <div className="grid grid-cols-2 gap-3">
              {LEFT_BEHIND.map((item) => (
                <ChoiceButton
                  key={item} selected={leftBehind.includes(item)} label={t(`aanname.left.${item}`)}
                  onClick={() => setLeftBehind((l) =>
                    l.includes(item) ? l.filter((x) => x !== item) : [...l, item])}
                />
              ))}
            </div>
          </Field>
          <Field label={t('aanname.step6.keys')} hint={t('common.optional')} htmlFor="sleutel">
            <TextInput id="sleutel" value={keyNumber} onChange={(e) => setKeyNumber(e.target.value)} />
          </Field>
          <Field label={t('aanname.step6.rack')} hint={t('common.optional')} htmlFor="plek">
            <TextInput id="plek" value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Rek A2" />
          </Field>
        </div>
      )}

      {error && <FieldError message={error} />}

      <div className="mt-6 grid gap-3 grid-cols-2">
        {step > 1 && (
          <Button full onClick={() => { setError(null); setStep((s) => s - 1) }}>
            {t('common.previous')}
          </Button>
        )}
        <Button variant="quiet" full onClick={() => navigate('/')}>{t('common.cancel')}</Button>
      </div>

      <PrimaryBar>
        {step < TOTAL_STEPS
          ? <Button variant="primary" full onClick={goNext}>{t('common.next')}</Button>
          : <Button variant="primary" full onClick={() => { void save() }}>{t('aanname.save')}</Button>}
      </PrimaryBar>
    </div>
  )
}

/**
 * Bevestiging die blijft staan tot de gebruiker zelf verder gaat (sectie 2.2),
 * met de code groot en de QR op het scherm als het label niet gedrukt is.
 */
function SavedScreen({ wo, queued, onNew }: { wo: WorkOrder; queued: boolean; onNew: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-4">{t('aanname.saved')}</h1>
      <Notice tone={queued ? 'warn' : 'ok'}>
        {queued ? t('aanname.saved_print_queued') : t('aanname.saved_print')}
      </Notice>
      <Card className="mt-6 text-center">
        <p className="font-semibold">{t('aanname.saved_label')}</p>
        <p className="text-5xl font-semibold tracking-widest my-3">
          {wo.tag_code ? formatTagCode(wo.tag_code) : wo.number}
        </p>
        <div className="flex justify-center my-4">
          {wo.tag_code && <Qr text={tagUrl(wo.tag_code)} modulePx={8} />}
        </div>
        <p className="text-muted">{t('qr.help')}</p>
      </Card>
      <Card className="mt-4">
        <p className="font-semibold">{t('qr.customer_link')}</p>
        <p className="text-muted mb-3">{t('qr.customer_help')}</p>
        <div className="flex justify-center">
          <Qr text={publicUrl(wo.public_token)} modulePx={5} />
        </div>
      </Card>
      <div className="mt-6">
        <Button full onClick={onNew}>{t('aanname.saved_new')}</Button>
      </div>

      <PrimaryBar>
        <Button variant="primary" full onClick={() => navigate(`/werkbon/${wo.id}`)}>
          {t('aanname.saved_open')}
        </Button>
      </PrimaryBar>
    </div>
  )
}
