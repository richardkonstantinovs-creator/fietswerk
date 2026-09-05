import type { Customer } from '../lib/types'
import type { Kandidaat, RegelInvoer } from '../lib/schrift/match'
import { useT } from '../i18n'
import { money, phoneDisplay } from '../lib/format'
import { Button, Card, ChoiceButton, Field, Notice, TextInput } from './ui'

/**
 * Eén klus uit het schrift, klaar om nagekeken te worden. Boven de velden staat
 * letterlijk wat de leesdienst op het papier zag: dat is waar de eigenaar op
 * vergelijkt. De kaart weet niets van de database — hij krijgt alles binnen en
 * geeft wijzigingen terug, zodat hij ook in een test te tekenen is.
 */

export type Keuze =
  | { soort: 'nieuw' }
  | { soort: 'bestaand'; customerId: string }
  | { soort: 'overslaan' }

export interface RegelStand {
  invoer: RegelInvoer
  bron: string
  onzeker: boolean
  kandidaten: Kandidaat[]
  keuze: Keuze
}

export function RegelKaart({
  stand, nummer, totaal, onChange,
}: {
  stand: RegelStand
  nummer: number
  totaal: number
  onChange: (next: RegelStand) => void
}) {
  const t = useT()
  const { invoer, keuze } = stand
  const overgeslagen = keuze.soort === 'overslaan'

  const zetKlant = (patch: Partial<RegelInvoer['klant']>) =>
    onChange({ ...stand, invoer: { ...invoer, klant: { ...invoer.klant, ...patch } } })
  const zetFiets = (patch: Partial<RegelInvoer['fiets']>) =>
    onChange({ ...stand, invoer: { ...invoer, fiets: { ...invoer.fiets, ...patch } } })

  return (
    <Card className={`mb-6 ${overgeslagen ? 'opacity-60' : ''}`}>
      <p className="font-semibold text-muted">
        {t('schrift.regel_van', { nummer, totaal })}
      </p>

      {/* Woord voor woord zoals het op het papier stond. */}
      <blockquote className="my-3 border-l-4 border-line pl-4 text-lg italic whitespace-pre-wrap break-words">
        {stand.bron}
      </blockquote>

      {stand.onzeker && <Notice tone="warn">{t('schrift.onzeker')}</Notice>}

      {!overgeslagen && (
        <div className="mt-4">
          <Field label={t('schrift.veld_voornaam')} htmlFor={`vn-${nummer}`}>
            <TextInput
              id={`vn-${nummer}`} value={invoer.klant.first_name}
              onChange={(e) => zetKlant({ first_name: e.target.value })}
            />
          </Field>
          <Field label={t('schrift.veld_achternaam')} htmlFor={`an-${nummer}`}>
            <TextInput
              id={`an-${nummer}`} value={invoer.klant.last_name}
              onChange={(e) => zetKlant({ last_name: e.target.value })}
            />
          </Field>
          <Field label={t('schrift.veld_telefoon')} htmlFor={`tel-${nummer}`}>
            <TextInput
              id={`tel-${nummer}`} value={invoer.klant.phone} inputMode="tel"
              onChange={(e) => zetKlant({ phone: e.target.value })}
            />
          </Field>
          <Field label={t('schrift.veld_merk')} htmlFor={`merk-${nummer}`}>
            <TextInput
              id={`merk-${nummer}`} value={invoer.fiets.brand}
              onChange={(e) => zetFiets({ brand: e.target.value })}
            />
          </Field>
          <Field label={t('schrift.veld_werk')} htmlFor={`werk-${nummer}`}>
            <TextInput
              id={`werk-${nummer}`} value={invoer.complaint}
              onChange={(e) => onChange({ ...stand, invoer: { ...invoer, complaint: e.target.value } })}
            />
          </Field>

          <p className="font-semibold">
            {t('schrift.bedrag')}{' '}
            {invoer.paid_cents == null ? t('schrift.geen_bedrag') : money(invoer.paid_cents)}
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-2">{t('schrift.wie_is_dit')}</h3>
          <div className="flex flex-col gap-3">
            <ChoiceButton
              selected={keuze.soort === 'nieuw'}
              label={t('schrift.nieuwe_klant')}
              sub={t('schrift.nieuwe_klant_sub')}
              onClick={() => onChange({ ...stand, keuze: { soort: 'nieuw' } })}
            />
            {stand.kandidaten.map((k) => (
              <ChoiceButton
                key={k.customer.id}
                selected={keuze.soort === 'bestaand' && keuze.customerId === k.customer.id}
                label={naamVan(k.customer)}
                sub={`${phoneDisplay(k.customer.phone)} · ${t(`schrift.reden_${k.reden}`)}`}
                onClick={() => onChange({ ...stand, keuze: { soort: 'bestaand', customerId: k.customer.id } })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <Button
          variant={overgeslagen ? 'secondary' : 'quiet'}
          full
          onClick={() => onChange({ ...stand, keuze: overgeslagen ? { soort: 'nieuw' } : { soort: 'overslaan' } })}
        >
          {overgeslagen ? t('schrift.toch_meenemen') : t('schrift.overslaan')}
        </Button>
      </div>
    </Card>
  )
}

function naamVan(c: Customer): string {
  return `${c.first_name} ${c.last_name}`.trim()
}
