import { useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import {
  addDays, dayDisplay, dayKey, dayShort, hoursDisplay, isWeekend,
  mondayOf, shiftMinutes, weekDays, weekNumber, weekdayIndex,
} from '../lib/rooster'
import type { Shift, User } from '../lib/types'
import { useT } from '../i18n'
import { RoosterTabs } from '../components/RoosterTabs'
import { Button, Card, ChoiceButton, Field, Notice, SectionTitle, TextInput } from '../components/ui'

/**
 * Het rooster (fase 3). De vraag van de eigenaar was letterlijk: wie werkt
 * wanneer, in één beeld. Dus staat er een week op het scherm en geen maand —
 * een maand past niet leesbaar op een tablet en wordt toch per week gepland.
 *
 * Twee opmaken, één waarheid (sectie 2.2): op de telefoon een lijst per dag,
 * op tablet en pc een raster van medewerkers maal dagen.
 */

interface Bewerking {
  shift: Shift | null
  user_id: string
  date: string
}

export default function Rooster() {
  const t = useT()
  useDbVersion()
  const [monday, setMonday] = useState(() => mondayOf(dayKey()))
  const [edit, setEdit] = useState<Bewerking | null>(null)
  const [absenceFor, setAbsenceFor] = useState<string | null>(null)

  const days = weekDays(monday)
  const owner = db.maySeeReports()
  const me = db.currentUser()
  const team = owner ? db.staff() : db.staff().filter((u) => u.id === me?.id)
  const today = dayKey()

  function open(user_id: string, date: string, shift: Shift | null) {
    if (!owner) return
    setAbsenceFor(null)
    setEdit({ shift, user_id, date })
  }

  return (
    <div>
      <RoosterTabs />
      <h1 className="text-3xl font-semibold mb-1">{t('rooster.title')}</h1>
      <p className="text-muted mb-4">{t('rooster.subtitle')}</p>

      <Card className="mb-4">
        <p className="text-2xl font-semibold mb-3">
          {t('rooster.week', { number: weekNumber(monday) })}
          {' · '}
          {dayDisplay(monday)} — {dayDisplay(addDays(monday, 6))}
        </p>
        <div className="grid gap-3 grid-cols-3">
          <Button onClick={() => setMonday(addDays(monday, -7))}>{t('rooster.previous')}</Button>
          <Button onClick={() => setMonday(mondayOf(dayKey()))}>{t('rooster.this_week')}</Button>
          <Button onClick={() => setMonday(addDays(monday, 7))}>{t('rooster.next')}</Button>
        </div>
      </Card>

      {/* Telefoon: per dag onder elkaar. */}
      <div className="sm:hidden">
        {days.map((day) => (
          <DagLijst
            key={day} day={day} team={team} today={today} owner={owner} onOpen={open}
          />
        ))}
      </div>

      {/* Tablet en pc: het raster waar de eigenaar om vroeg. */}
      <div className="hidden sm:block overflow-x-auto">
        {/* table-fixed: de kolommen delen de ruimte gelijk op en kunnen niet
            uitlopen op de langste tekst. Zo staat de hele week in beeld op de
            smalste pc die in een fietsenwinkel staat, en hoeft er niet
            geschoven te worden om zaterdag te zien. */}
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b-2 border-ink w-32">{t('rooster.employee')}</th>
              {days.map((day) => (
                <th
                  key={day}
                  className={[
                    'px-1 py-2 border-b-2 border-ink text-sm',
                    day === today ? 'bg-[#FBEFDB]' : isWeekend(day) ? 'bg-shell' : '',
                  ].join(' ')}
                >
                  <span className="block">{t(`weekday.${weekdayIndex(day)}`)}</span>
                  <span className="block font-normal text-muted">{dayShort(day)}</span>
                </th>
              ))}
              <th className="px-1 py-2 border-b-2 border-ink text-sm w-16">{t('rooster.total')}</th>
            </tr>
          </thead>
          <tbody>
            {team.map((user) => {
              const weekMinutes = days
                .flatMap((d) => db.shiftsOn(user.id, d))
                .reduce((sum, s) => sum + shiftMinutes(s), 0)
              return (
                <tr key={user.id}>
                  <th scope="row" className="text-left align-top p-2 border-b-2 border-line">
                    <span className="block font-semibold text-sm leading-tight">{user.name}</span>
                    <span className="block text-xs text-muted">{t(`role.${user.role}`)}</span>
                  </th>
                  {days.map((day) => (
                    <td
                      key={day}
                      className={[
                        'align-top p-0.5 border-b-2 border-line',
                        day === today ? 'bg-[#FBEFDB]' : isWeekend(day) ? 'bg-shell' : '',
                      ].join(' ')}
                    >
                      <Cel user={user} day={day} owner={owner} onOpen={open} />
                    </td>
                  ))}
                  <td className="align-top px-1 py-2 border-b-2 border-line font-semibold text-sm">
                    {hoursDisplay(weekMinutes)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <DienstFormulier
          key={`${edit.user_id}-${edit.date}-${edit.shift?.id ?? 'nieuw'}`}
          bewerking={edit}
          monday={monday}
          onClose={() => setEdit(null)}
        />
      )}

      {owner && (
        <>
          <SectionTitle>{t('rooster.absence_title')}</SectionTitle>
          <p className="text-muted mb-3">{t('rooster.absence_help')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {team.map((u) => (
              <ChoiceButton
                key={u.id}
                selected={absenceFor === u.id}
                label={u.name}
                sub={t(`role.${u.role}`)}
                onClick={() => { setEdit(null); setAbsenceFor(absenceFor === u.id ? null : u.id) }}
              />
            ))}
          </div>
          {absenceFor && (
            <AfwezigheidFormulier
              key={absenceFor}
              userId={absenceFor}
              monday={monday}
              onClose={() => setAbsenceFor(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Eén vakje in het raster: de dienst, of wat er in plaats daarvan is. */
function Cel({
  user, day, owner, onOpen,
}: {
  user: User
  day: string
  owner: boolean
  onOpen: (userId: string, day: string, shift: Shift | null) => void
}) {
  const t = useT()
  const shifts = db.shiftsOn(user.id, day)
  const absence = db.absenceOn(user.id, day)
  const wish = db.availabilityOn(user.id, day)

  if (absence) {
    return (
      <div className="rounded-lg border-2 border-warn bg-[#FBEFDB] p-2 text-sm font-semibold text-[#5C3A00]">
        {t(`absence.${absence.kind}`)}
      </div>
    )
  }

  return (
    <div className="grid gap-1">
      {shifts.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={!owner}
          onClick={() => onOpen(user.id, day, s)}
          className="press w-full text-left rounded-lg border-2 border-ink bg-white px-1.5 py-1 text-sm font-semibold leading-tight disabled:opacity-100 disabled:cursor-default hover:bg-[#FAFAFA]"
        >
          {/* Twee regels, niet één brede: zo passen alle zeven dagen naast
              elkaar zonder te schuiven. Begintijd boven, eindtijd eronder —
              dat leest iedereen goed in een rooster. */}
          <span className="block">{s.start}</span>
          <span className="block">{s.end}</span>
          <span className="block font-normal text-muted text-xs">{hoursDisplay(shiftMinutes(s))}</span>
        </button>
      ))}

      {wish && shifts.length === 0 && (
        <span
          className={[
            'block rounded-lg border-2 px-1 py-1 text-xs font-semibold leading-tight',
            wish.can_work ? 'border-ok bg-[#E3F0E7] text-[#0B4A22]' : 'border-danger bg-[#FBEAE9] text-[#7A1610]',
          ].join(' ')}
        >
          {wish.can_work
            ? (wish.from_time ? `${wish.from_time} – ${wish.to_time ?? ''}` : t('rooster.can'))
            : t('rooster.cannot')}
        </span>
      )}

      {owner && (
        <button
          type="button"
          onClick={() => onOpen(user.id, day, null)}
          aria-label={t('rooster.add_for', { name: user.name, date: dayDisplay(day) })}
          className="press w-full min-h-touch rounded-lg border-2 border-dashed border-line text-muted font-semibold hover:border-brand hover:text-brand"
        >
          +
        </button>
      )}
    </div>
  )
}

/** Dezelfde week op de telefoon: dag voor dag, wie er die dag staat. */
function DagLijst({
  day, team, today, owner, onOpen,
}: {
  day: string
  team: User[]
  today: string
  owner: boolean
  onOpen: (userId: string, day: string, shift: Shift | null) => void
}) {
  const t = useT()
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold mb-2 pt-3 border-t-2 border-shell">
        {t(`weekday.${weekdayIndex(day)}`)} {dayDisplay(day)}
        {day === today ? ` · ${t('rooster.today')}` : ''}
      </h2>
      <div className="grid gap-2">
        {team.map((user) => (
          <div key={user.id} className="grid grid-cols-[1fr_1.2fr] gap-2 items-start">
            <span className="font-semibold py-2">{user.name}</span>
            <Cel user={user} day={day} owner={owner} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Dienst neerzetten, wijzigen of weghalen. */
function DienstFormulier({
  bewerking, monday, onClose,
}: { bewerking: Bewerking; monday: string; onClose: () => void }) {
  const t = useT()
  const { shift, user_id, date } = bewerking
  const [start, setStart] = useState(shift?.start ?? '09:00')
  const [end, setEnd] = useState(shift?.end ?? '17:00')
  const [pause, setPause] = useState(String(shift?.break_minutes ?? 30))
  const [note, setNote] = useState(shift?.note ?? '')
  const user = db.staffMember(user_id)

  const input = {
    id: shift?.id, user_id, date, start, end,
    break_minutes: Number(pause) || 0,
    note: note.trim() === '' ? null : note.trim(),
  }
  const minutes = shiftMinutes(input)

  function save() {
    db.saveShift(input)
    onClose()
  }

  /** Dezelfde dienst op maandag tot en met vrijdag: scheelt vier keer typen. */
  function repeatWeek() {
    const rest = weekDays(monday).filter((d) => d !== date && weekdayIndex(d) <= 5)
    db.repeatShift({ ...input, id: undefined }, rest)
    onClose()
  }

  return (
    <Card className="mt-6">
      <h2 className="text-2xl font-semibold mb-1">
        {user?.name} · {t(`weekday.${weekdayIndex(date)}`)} {dayDisplay(date)}
      </h2>
      <p className="text-muted mb-4">{t('rooster.form_hours')}: {hoursDisplay(minutes)}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('rooster.start')} htmlFor="dienst-start">
          <TextInput id="dienst-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('rooster.end')} htmlFor="dienst-eind">
          <TextInput id="dienst-eind" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label={t('rooster.break')} htmlFor="dienst-pauze">
          <TextInput
            id="dienst-pauze" inputMode="numeric" value={pause}
            onChange={(e) => setPause(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>

      <Field label={t('rooster.note')} htmlFor="dienst-notitie">
        <TextInput id="dienst-notitie" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {minutes === 0 && <div className="mb-4"><Notice tone="warn">{t('rooster.zero')}</Notice></div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="primary" onClick={save}>{t('common.save')}</Button>
        <Button onClick={repeatWeek}>{t('rooster.repeat_week')}</Button>
        {shift && (
          <Button variant="danger" onClick={() => { db.deleteShift(shift.id); onClose() }}>
            {t('rooster.delete')}
          </Button>
        )}
        <Button variant="quiet" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Card>
  )
}

/** Vakantie, ziek of vrij over een aantal dagen. */
function AfwezigheidFormulier({
  userId, monday, onClose,
}: { userId: string; monday: string; onClose: () => void }) {
  const t = useT()
  const [from, setFrom] = useState(monday)
  const [to, setTo] = useState(monday)
  const [kind, setKind] = useState<'vakantie' | 'ziek' | 'verlof'>('vakantie')
  const user = db.staffMember(userId)
  const running = db.absencesBetween(monday, addDays(monday, 6)).filter((a) => a.user_id === userId)

  return (
    <Card className="mt-4">
      <h2 className="text-2xl font-semibold mb-4">{user?.name}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('rooster.from')} htmlFor="afw-van">
          <TextInput id="afw-van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('rooster.to')} htmlFor="afw-tot">
          <TextInput id="afw-tot" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {(['vakantie', 'ziek', 'verlof'] as const).map((k) => (
          <ChoiceButton key={k} selected={kind === k} label={t(`absence.${k}`)} onClick={() => setKind(k)} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="primary"
          onClick={() => { db.saveAbsence(userId, from, to, kind, null); onClose() }}
        >
          {t('rooster.absence_save')}
        </Button>
        <Button variant="quiet" onClick={onClose}>{t('common.cancel')}</Button>
      </div>

      {running.map((a) => (
        <div key={a.id} className="mt-4 grid gap-2">
          <p className="font-semibold">
            {t(`absence.${a.kind}`)}: {dayDisplay(a.from_date)} — {dayDisplay(a.to_date)}
          </p>
          <Button variant="danger" onClick={() => db.deleteAbsence(a.id)}>{t('rooster.absence_delete')}</Button>
        </div>
      ))}
    </Card>
  )
}
