import { useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import type { Role, User } from '../lib/types'
import { useT } from '../i18n'
import { RoosterTabs } from '../components/RoosterTabs'
import {
  Button, Card, ChoiceButton, Confirm, Field, FieldError, Notice, NumberInput,
  SectionTitle, TextInput,
} from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Medewerkers (fase 3). Een zaterdaghulp komt in maart en gaat in september;
 * daarvoor mag de eigenaar niet afhankelijk zijn van de bouwer van de app.
 *
 * "Weghalen" is hier uit dienst zetten en niet wissen: over de uren van vorige
 * maand is loon betaald, dus die moeten op de urenstaat blijven staan. Alleen
 * een naam waar nog niets aan hangt — een typefout van vanochtend — gaat er
 * echt uit.
 */
export default function Medewerkers() {
  const t = useT()
  useDbVersion()
  const [edit, setEdit] = useState<User | 'nieuw' | null>(null)
  const [confirming, setConfirming] = useState<User | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!db.maySeeReports()) {
    return (
      <div>
        <BackLink to="/rooster" labelKey="back.rooster" />
        <Notice tone="warn">{t('role.only_owner')}</Notice>
      </div>
    )
  }

  const team = db.staff()
  const archived = db.archivedStaff()
  const me = db.currentUser()

  function remove(user: User) {
    const history = db.staffHistory(user.id)
    // Niets van deze persoon in het systeem: dan mag de naam echt weg.
    if (history.shifts + history.entries + history.wishes === 0) {
      if (db.deleteStaff(user.id)) {
        setMessage(t('team.deleted', { name: user.name }))
        setConfirming(null)
        return
      }
    }
    const problem = db.deactivateStaff(user.id)
    setMessage(problem ? t(`team.error.${problem}`) : t('team.archived', { name: user.name }))
    setConfirming(null)
  }

  return (
    <div>
      <RoosterTabs />
      <h1 className="text-3xl font-semibold mb-1">{t('team.title')}</h1>
      <p className="text-muted mb-4">{t('team.subtitle')}</p>

      {message && <div className="mb-4"><Notice tone="ok">{message}</Notice></div>}

      {team.map((user) => {
        const history = db.staffHistory(user.id)
        return (
          <Card key={user.id} className="mb-3">
            <p className="text-2xl font-semibold">{user.name}</p>
            <p className="text-muted">
              {t(`role.${user.role}`)}
              {' · '}
              {t('team.pin_is', { pin: user.pin_code })}
              {user.id === me?.id ? ` · ${t('team.you')}` : ''}
            </p>
            <p className="text-muted text-sm">
              {t('team.history', { shifts: history.shifts, entries: history.entries })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 mt-3">
              <Button onClick={() => { setMessage(null); setEdit(user) }}>{t('team.change')}</Button>
              <Button variant="danger" onClick={() => { setMessage(null); setConfirming(user) }}>
                {t('team.remove')}
              </Button>
            </div>
          </Card>
        )
      })}

      <div className="mt-4">
        <Button variant="primary" full onClick={() => { setMessage(null); setEdit('nieuw') }}>
          {t('team.add')}
        </Button>
      </div>

      {edit && (
        <Formulier
          key={edit === 'nieuw' ? 'nieuw' : edit.id}
          user={edit === 'nieuw' ? null : edit}
          onDone={(naam) => { setEdit(null); setMessage(t('team.saved', { name: naam })) }}
          onClose={() => setEdit(null)}
        />
      )}

      {archived.length > 0 && (
        <>
          <SectionTitle>{t('team.archived_title')}</SectionTitle>
          <p className="text-muted mb-3">{t('team.archived_help')}</p>
          {archived.map((user) => (
            <Card key={user.id} className="mb-3">
              <p className="text-xl font-semibold">{user.name}</p>
              <p className="text-muted mb-3">{t(`role.${user.role}`)}</p>
              <Button onClick={() => { db.reactivateStaff(user.id); setMessage(t('team.back', { name: user.name })) }}>
                {t('team.reactivate')}
              </Button>
            </Card>
          ))}
        </>
      )}

      {confirming && (
        <Confirm
          question={t('team.remove_question', { name: confirming.name })}
          explain={
            db.staffHistory(confirming.id).entries > 0
              ? t('team.remove_explain_history')
              : t('team.remove_explain_clean')
          }
          yesLabel={t('team.remove_yes')}
          danger
          onYes={() => remove(confirming)}
          onNo={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

/** Naam, rol en pincode. Meer heeft een fietsenwinkel niet nodig. */
function Formulier({
  user, onDone, onClose,
}: { user: User | null; onDone: (name: string) => void; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState(user?.name ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'monteur')
  const [pin, setPin] = useState(user?.pin_code ?? '')
  const [error, setError] = useState<string | null>(null)

  function save() {
    const result = db.saveStaff({ id: user?.id, name, role, pin_code: pin })
    if (typeof result === 'string') { setError(t(`team.error.${result}`)); return }
    onDone(result.name)
  }

  return (
    <Card className="mt-6">
      <h2 className="text-2xl font-semibold mb-4">
        {user ? t('team.change') : t('team.add')}
      </h2>

      <Field label={t('team.name')} htmlFor="team-naam">
        <TextInput
          id="team-naam" value={name} autoFocus
          onChange={(e) => { setName(e.target.value); setError(null) }}
        />
      </Field>

      <Field label={t('team.role')} hint={t('team.role_hint')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['owner', 'monteur', 'balie'] as const).map((r) => (
            <ChoiceButton key={r} selected={role === r} label={t(`role.${r}`)} onClick={() => setRole(r)} />
          ))}
        </div>
      </Field>

      <Field label={t('team.pin')} hint={t('team.pin_hint')} htmlFor="team-pin">
        <NumberInput
          id="team-pin" value={pin} maxLength={4}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }}
          className="text-3xl tracking-widest text-center"
        />
      </Field>

      {error && <FieldError message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <Button variant="primary" onClick={save}>{t('common.save')}</Button>
        <Button variant="quiet" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Card>
  )
}
