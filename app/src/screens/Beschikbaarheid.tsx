import { useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import {
  addDays, dayDisplay, dayKey, mondayOf, weekDays, weekNumber, weekdayIndex,
} from '../lib/rooster'
import { useT } from '../i18n'
import { RoosterTabs } from '../components/RoosterTabs'
import { Button, Card, Field, Notice, SectionTitle, TextInput } from '../components/ui'

/**
 * Beschikbaarheid (fase 3). De medewerker geeft zelf op wanneer hij kan; het
 * rooster maken blijft van de eigenaar. Dat onderscheid is met opzet: een
 * winkel waarin iedereen zichzelf inroostert, staat op zaterdag leeg.
 *
 * Wat hier ingevuld wordt, verschijnt als hint in het vakje van het rooster.
 */
export default function Beschikbaarheid() {
  const t = useT()
  useDbVersion()
  // Volgende week: over deze week valt niets meer te wensen, die staat er al.
  const [monday, setMonday] = useState(() => addDays(mondayOf(dayKey()), 7))

  const me = db.currentUser()
  const owner = db.maySeeReports()
  const days = weekDays(monday)
  if (!me) return null

  return (
    <div>
      <RoosterTabs />
      <h1 className="text-3xl font-semibold mb-1">{t('besch.title')}</h1>
      <p className="text-muted mb-4">{t('besch.subtitle')}</p>

      <Card className="mb-4">
        <p className="text-2xl font-semibold mb-3">
          {t('rooster.week', { number: weekNumber(monday) })}
          {' · '}
          {dayDisplay(monday)} — {dayDisplay(addDays(monday, 6))}
        </p>
        <div className="grid gap-3 grid-cols-2">
          <Button onClick={() => setMonday(addDays(monday, -7))}>{t('rooster.previous')}</Button>
          <Button onClick={() => setMonday(addDays(monday, 7))}>{t('rooster.next')}</Button>
        </div>
      </Card>

      <div className="mb-4"><Notice tone="ok">{t('besch.help')}</Notice></div>

      {days.map((day) => (
        <DagKaart key={day} day={day} userId={me.id} />
      ))}

      {owner && (
        <>
          <SectionTitle>{t('besch.overview')}</SectionTitle>
          {days.map((day) => {
            const wishes = db.availabilityBetween(day, day)
            if (wishes.length === 0) return null
            return (
              <Card key={day} className="mb-3">
                <p className="font-semibold">
                  {t(`weekday.${weekdayIndex(day)}`)} {dayDisplay(day)}
                </p>
                {wishes.map((w) => (
                  <p key={w.id} className={w.can_work ? 'text-[#0B4A22]' : 'text-danger'}>
                    {db.staffMember(w.user_id)?.name}
                    {': '}
                    {w.can_work
                      ? (w.from_time ? `${w.from_time} — ${w.to_time ?? ''}` : t('besch.can'))
                      : t('besch.cannot')}
                    {w.note ? ` · ${w.note}` : ''}
                  </p>
                ))}
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}

function DagKaart({ day, userId }: { day: string; userId: string }) {
  const t = useT()
  const wish = db.availabilityOn(userId, day)
  const [from, setFrom] = useState(wish?.from_time ?? '')
  const [to, setTo] = useState(wish?.to_time ?? '')
  const [note, setNote] = useState(wish?.note ?? '')

  const state = wish == null ? 'leeg' : wish.can_work ? 'kan' : 'niet'

  return (
    <Card className="mb-3">
      <p className="text-xl font-semibold mb-1">
        {t(`weekday.${weekdayIndex(day)}`)} {dayDisplay(day)}
      </p>
      <p className="text-muted mb-3">
        {state === 'leeg' && t('besch.state_empty')}
        {state === 'kan' && (wish?.from_time
          ? t('besch.state_window', { from: wish.from_time, to: wish.to_time ?? '' })
          : t('besch.state_can'))}
        {state === 'niet' && t('besch.state_cannot')}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          variant={state === 'kan' ? 'primary' : 'secondary'}
          onClick={() => db.setAvailability(
            userId, day, true,
            from === '' ? null : from, to === '' ? null : to,
            note.trim() === '' ? null : note.trim(),
          )}
        >
          {t('besch.can')}
        </Button>
        <Button
          variant={state === 'niet' ? 'danger' : 'secondary'}
          onClick={() => db.setAvailability(userId, day, false, null, null, note.trim() === '' ? null : note.trim())}
        >
          {t('besch.cannot')}
        </Button>
        <Button variant="quiet" onClick={() => db.clearAvailability(userId, day)}>
          {t('besch.clear')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mt-4">
        <Field label={t('besch.from')} htmlFor={`besch-van-${day}`}>
          <TextInput id={`besch-van-${day}`} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('besch.to')} htmlFor={`besch-tot-${day}`}>
          <TextInput id={`besch-tot-${day}`} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={t('rooster.note')} htmlFor={`besch-notitie-${day}`}>
          <TextInput id={`besch-notitie-${day}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Card>
  )
}
