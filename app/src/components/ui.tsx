import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { useT } from '../i18n'

/**
 * Bouwstenen die de eisen uit sectie 2.2 afdwingen: 56 px raakvlak, tekst bij
 * elk pictogram, label boven het veld, foutmelding met tekst én teken.
 * Wie deze bouwstenen gebruikt, kan de regels moeilijk per ongeluk breken.
 */

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border-brand hover:bg-brandDark',
  secondary: 'bg-white text-ink border-ink hover:bg-shell',
  quiet: 'bg-shell text-ink border-line hover:bg-white',
  danger: 'bg-white text-danger border-danger hover:bg-[#FBEAE9]',
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
        'min-h-touch px-5 py-3 rounded-xl border-2 font-semibold text-lg',
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
    <div className="sticky bottom-0 left-0 right-0 bg-shell border-t-2 border-line px-4 py-4 mt-8 -mx-4">
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
      <label htmlFor={htmlFor} className="block font-semibold mb-2">{label}</label>
      {hint && <p className="text-sm text-muted mb-2">{hint}</p>}
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

const INPUT_CLASS =
  'w-full min-h-touch px-4 py-3 border-2 border-ink rounded-xl bg-white text-lg ' +
  'placeholder:text-muted'

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
        className={`w-full text-left bg-white border-2 border-ink rounded-2xl p-4 hover:bg-shell ${className}`}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={`bg-white border-2 border-line rounded-2xl p-4 ${className}`}>{children}</div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold mt-8 mb-3">{children}</h2>
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
        className="bg-white border-2 border-ink rounded-2xl p-6 w-full max-w-xl fade-in"
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
  return (
    <div className={`border-2 rounded-2xl p-4 font-semibold ${tones[tone]}`} role="status">
      {children}
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
        'min-h-touch w-full text-left px-4 py-3 rounded-xl border-2 font-semibold',
        selected ? 'bg-brand text-white border-brand' : 'bg-white text-ink border-ink hover:bg-shell',
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
