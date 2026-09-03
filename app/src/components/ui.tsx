import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useId, useState } from 'react'
import { useT } from '../i18n'

/**
 * Bouwstenen die de eisen uit sectie 2.2 afdwingen: 56 px raakvlak, tekst bij
 * elk pictogram, label boven het veld, foutmelding met tekst én teken.
 * Wie deze bouwstenen gebruikt, kan de regels moeilijk per ongeluk breken.
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border-brand hover:bg-brandDark active:bg-brandDark',
  secondary: 'bg-white text-ink border-ink hover:bg-shell active:bg-[#E6E6E6]',
  quiet: 'bg-shell text-ink border-line hover:bg-white active:bg-[#E6E6E6]',
  danger: 'bg-white text-danger border-danger hover:bg-[#FBEAE9] active:bg-[#F6D9D7]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

export function Button({ variant = 'secondary', full, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        // min-w-0: in een grid krimpt een knop anders niet mee en loopt een
        // lang woord als "Onderhoudsabonnementen" buiten de rand door.
        'press min-h-touch min-w-0 px-5 py-3 rounded-xl border-2 font-semibold text-lg',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANTS[variant], full ? 'w-full' : '', className,
      ].join(' ')}
    />
  )
}

/**
 * Eén hoofdactie per scherm, altijd onderaan, altijd over de volle breedte,
 * altijd op dezelfde plek (sectie 2.2).
 */
export function PrimaryBar({ children }: { children: ReactNode }) {
  return (
    <div className="lift-bar sticky bottom-app left-0 right-0 bg-shell border-t-2 border-line px-4 sm:px-8 py-3 mt-8 -mx-4 sm:-mx-8">
      <div className="mx-auto max-w-3xl flex flex-col gap-3">{children}</div>
    </div>
  )
}

export function Field({
  label, hint, error, children, htmlFor,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="mb-6">
      {/* Label boven het veld; placeholder-als-label is verboden (sectie 2.2). */}
      <label htmlFor={htmlFor} className="block font-semibold mb-1">{label}</label>
      {hint && <p className="text-sm text-muted mb-2 max-w-prose">{hint}</p>}
      {children}
      {error && <FieldError message={error} />}
    </div>
  )
}

/** Fout met woorden, kleur én teken — kleur alleen is niet genoeg. */
export function FieldError({ message }: { message: string }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-danger font-semibold">
      <span aria-hidden="true" className="text-2xl leading-none">⚠</span>
      <span>{message}</span>
    </p>
  )
}

// Een veld zakt niet in als je erop drukt (dat doet een knop); het laat alleen
// zien dat het aan de beurt is.
const INPUT_CLASS =
  'w-full min-h-touch px-4 py-3 border-2 border-ink rounded-xl bg-white text-lg transition-colors ' +
  'placeholder:text-muted hover:border-brand focus:border-brand'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  // Grote cijferklavier op de telefoon (sectie 2.2).
  return <input inputMode="decimal" {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />
}

export function Card({
  children, onClick, className = '',
}: { children: ReactNode; onClick?: () => void; className?: string }) {
  if (onClick) {
    // De hele kaart is één grote knop (sectie 7.1).
    return (
      <button
        type="button"
        onClick={onClick}
        className={`press lift lift-hover w-full text-left bg-white border-2 border-ink rounded-2xl p-4 hover:bg-[#FAFAFA] ${className}`}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={`lift bg-white border-2 border-line rounded-2xl p-4 ${className}`}>{children}</div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold mt-8 mb-3 pt-4 border-t-2 border-shell">{children}</h2>
}

/**
 * Blok dat dicht begint. Een werkbon heeft vijftien onderdelen, maar een
 * monteur gebruikt er drie; de rest hoeft niet de hele dag in de weg te staan.
 * Geen gebaar en geen pijltje alleen: er staat met woorden op de knop wat er
 * gebeurt als je hem indrukt (sectie 2.2).
 */
export function Collapse({
  title, sub, children, open: openDefault,
}: {
  title: string
  sub?: string
  children: ReactNode
  open?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(openDefault ?? false)
  const id = useId()
  return (
    <div className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="press w-full min-h-touch flex items-center justify-between gap-4 px-4 py-3 rounded-xl border-2 border-ink bg-white text-left hover:bg-[#FAFAFA]"
      >
        <span>
          <span className="block text-2xl font-semibold">{title}</span>
          {sub && <span className="block text-sm text-muted">{sub}</span>}
        </span>
        <span className="font-semibold text-brand whitespace-nowrap">
          {open ? t('common.hide') : t('common.show')}
        </span>
      </button>
      {open && <div id={id} className="mt-3 fade-in">{children}</div>}
    </div>
  )
}

/**
 * Bevestiging met woorden in de knoppen, nooit OK/Annuleren (sectie 2.2).
 * Eén laag diep: een modal in een modal bestaat hier niet.
 */
export function Confirm({
  question, explain, yesLabel, onYes, onNo, danger,
}: {
  question: string
  explain?: string
  yesLabel: string
  onYes: () => void
  onNo: () => void
  danger?: boolean
}) {
  const t = useT()
  const titleId = useId()
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white border-2 border-ink rounded-2xl p-6 w-full max-w-xl fade-in shadow-[0_12px_40px_rgba(17,17,17,.25)]"
      >
        <h2 id={titleId} className="text-3xl font-semibold mb-3">{question}</h2>
        {explain && <p className="mb-6 text-muted">{explain}</p>}
        <div className="flex flex-col gap-3">
          <Button variant={danger ? 'danger' : 'primary'} full onClick={onYes}>{yesLabel}</Button>
          <Button variant="secondary" full onClick={onNo}>{t('common.no_back')}</Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Bevestiging die blijft staan. Een toast die vanzelf verdwijnt mag nooit het
 * enige bewijs zijn dat iets gelukt is (sectie 2.2).
 */
export function Notice({
  tone = 'ok', children,
}: { tone?: 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    ok: 'bg-[#E3F0E7] border-ok text-[#0B4A22]',
    warn: 'bg-[#FBEFDB] border-warn text-[#5C3A00]',
    danger: 'bg-[#FBEAE9] border-danger text-[#7A1610]',
  }
  // Het teken staat er voor wie kleuren slecht ziet: groen en rood zijn dan
  // hetzelfde grijs, een vinkje en een uitroepteken niet (sectie 2.2).
  const signs = { ok: '✓', warn: '!', danger: '⚠' }
  return (
    <div className={`lift border-2 rounded-2xl p-4 font-semibold flex items-start gap-3 ${tones[tone]}`} role="status">
      <span aria-hidden="true" className="text-2xl leading-none shrink-0">{signs[tone]}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** Grote keuzeknop; ook de gekozen stand is zonder kleur te zien (vinkje + rand). */
export function ChoiceButton({
  selected, label, sub, onClick,
}: { selected: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'press min-h-touch w-full text-left px-4 py-3 rounded-xl border-2 font-semibold',
        selected
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-ink border-ink hover:bg-[#FAFAFA] hover:border-brand',
      ].join(' ')}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl leading-tight">{selected ? '✓' : '○'}</span>
        <span>
          <span className="block">{label}</span>
          {sub && (
            <span className={`block text-sm ${selected ? 'text-white' : 'text-muted'}`}>{sub}</span>
          )}
        </span>
      </span>
    </button>
  )
}
