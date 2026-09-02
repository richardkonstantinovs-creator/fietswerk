import { useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { useT } from '../i18n'
import { Button, Card, ChoiceButton, Field, FieldError, Notice, NumberInput } from '../components/ui'

/**
 * Aanmelden met een pincode (fase 1, rollen). Geen wachtwoorden en geen
 * automatische uitlog tijdens de werkdag (sectie 2.2): je meldt je 's ochtends
 * één keer aan en daarna staat de app de hele dag open.
 */
export default function Aanmelden() {
  const t = useT()
  useDbVersion()
  const [userId, setUserId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = db.users()

  function submit() {
    if (!userId) return
    if (db.login(userId, pin)) {
      setError(null)
      window.location.reload()
    } else {
      setError(t('login.wrong'))
      setPin('')
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-3xl font-semibold mt-6 mb-2">{t('login.title')}</h1>
      <p className="text-muted mb-6">{t('login.help')}</p>

      <p className="font-semibold mb-3">{t('login.pick')}</p>
      <div className="grid gap-3 mb-6">
        {list.map((u) => (
          <ChoiceButton
            key={u.id}
            selected={userId === u.id}
            label={u.name}
            sub={t(`role.${u.role}`)}
            onClick={() => { setUserId(u.id); setError(null) }}
          />
        ))}
      </div>

      {/* Prototype: zonder deze regel staat de eigenaar tijdens de demonstratie
          buiten. Bij een echte winkel gaat hij eruit. */}
      <div className="mb-6"><Notice tone="warn">{t('login.demo_pins')}</Notice></div>

      {userId && (
        <Card>
          <Field label={t('login.pin')} htmlFor="pin">
            <NumberInput
              id="pin"
              value={pin}
              autoFocus
              maxLength={4}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              className="text-4xl tracking-widest text-center"
            />
          </Field>
          {error && <FieldError message={error} />}
          <Button variant="primary" full disabled={pin.length < 4} onClick={submit}>
            {t('login.enter')}
          </Button>
        </Card>
      )}
    </main>
  )
}
