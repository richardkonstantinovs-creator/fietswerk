import { useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import {
  addDays, clockTime, dayDisplay, dayKey, differenceDisplay, entryMinutes,
  hoursDisplay, mondayOf, monthRange, shiftMinutes, weekNumber, weekdayIndex,
} from '../lib/rooster'
import type { TimeEntry } from '../lib/types'
import { useT } from '../i18n'
import { RoosterTabs } from '../components/RoosterTabs'
import { Button, Card, Field, Notice, SectionTitle, TextInput } from '../components/ui'

/**
 * Urenstaat (fase 3). Feit naast plan, en het verschil ernaast — dat is de
 * som die de eigenaar wilde: wie is er geweest, hoe lang, en wie heeft
 * overgewerkt. Geen cao-regels en geen automatische pauze: wat hier staat,
 * heeft iemand geklokt of ingetypt.
 *
 * De knop die het echt scheelt staat onderaan: het bestand voor de boekhouder.
 */
export default function Uren() {
  const t = useT()
  useDbVersion()
  const [monday, setMonday] = useState(() => mondayOf(dayKey()))
  const [month, setMonth] = useState(() => dayKey().slice(0, 7))
  const [perMonth, setPerMonth] = useState(false)
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ entry: TimeEntry | null; user_id: string; date: string } | null>(null)

  const owner = db.maySeeReports()
  const me = db.currentUser()
  const range = perMonth ? monthRange(month) : { from: monday, to: addDays(monday, 6) }
  const rows = db.periodTotals(range.from, range.to)
    .filter((r) => owner || r.user.id === me?.id)
  const forgotten = owner ? db.forgottenEntries() : []

  function download() {
    const csv = db.exportHoursCsv(range.from, range.to)
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `uren-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <RoosterTabs />
      <h1 className="text-3xl font-semibold mb-1">{t('uren.title')}</h1>
      <p className="text-muted mb-4">{t('uren.subtitle')}</p>

      {forgotten.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">{t('uren.forgotten', { count: forgotten.length })}</Notice>
        </div>
      )}
      {forgotten.map((e) => (
        <Card key={e.id} className="mb-3">
          <p className="font-semibold">
            {db.staffMember(e.user_id)?.name} · {dayDisplay(e.date)} · {clockTime(e.clock_in)}
          </p>
          <p className="text-muted mb-3">{t('uren.forgotten_help')}</p>
          <Button onClick={() => setEdit({ entry: e, user_id: e.user_id, date: e.date })}>
            {t('uren.fix')}
          </Button>
        </Card>
      ))}

      <Card className="mb-4">
        <p className="text-2xl font-semibold mb-3">
          {perMonth
            ? `${dayDisplay(range.from)} — ${dayDisplay(range.to)}`
            : `${t('rooster.week', { number: weekNumber(monday) })} · ${dayDisplay(range.from)} — ${dayDisplay(range.to)}`}
        </p>
        {perMonth ? (
          <Field label={t('uren.month')} htmlFor="uren-maand">
            <TextInput id="uren-maand" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        ) : (
          <div className="grid gap-3 grid-cols-3 mb-4">
            <Button onClick={() => setMonday(addDays(monday, -7))}>{t('rooster.previous')}</Button>
            <Button onClick={() => setMonday(mondayOf(dayKey()))}>{t('rooster.this_week')}</Button>
            <Button onClick={() => setMonday(addDays(monday, 7))}>{t('rooster.next')}</Button>
          </div>
        )}
        <Button full onClick={() => setPerMonth(!perMonth)}>
          {perMonth ? t('uren.per_week') : t('uren.per_month')}
        </Button>
      </Card>

      {rows.map((row) => (
        <Card key={row.user.id} className="mb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold">{row.user.name}</p>
            {row.open && <span className="font-semibold text-ok">{t('uren.inside')}</span>}
          </div>
          <p className="text-muted">
            {t('uren.planned')}: {hoursDisplay(row.planned_minutes)}
            {' · '}
            {t('uren.worked')}: {hoursDisplay(row.worked_minutes)}
          </p>
          <p className={row.difference_minutes > 0 ? 'text-xl font-semibold text-brand' : 'text-xl font-semibold'}>
            {t('uren.overtime')}: {differenceDisplay(row.difference_minutes)}
          </p>
          <div className="mt-3">
            <Button onClick={() => setOpenUser(openUser === row.user.id ? null : row.user.id)}>
              {openUser === row.user.id ? t('common.hide') : t('uren.per_day')}
            </Button>
          </div>

          {openUser === row.user.id && (
            <div className="mt-4 grid gap-3">
              {dagen(range.from, range.to).map((day) => {
                const entries = db.entriesOn(row.user.id, day)
                const planned = db.shiftsOn(row.user.id, day).reduce((s, x) => s + shiftMinutes(x), 0)
                const worked = entries.reduce((s, e) => s + entryMinutes(e), 0)
                if (entries.length === 0 && planned === 0) return null
                return (
                  <div key={day} className="border-t-2 border-shell pt-2">
                    <p className="font-semibold">
                      {t(`weekday.${weekdayIndex(day)}`)} {dayDisplay(day)}
                    </p>
                    <p className="text-muted text-sm">
                      {t('uren.planned')}: {hoursDisplay(planned)}
                      {' · '}
                      {t('uren.worked')}: {hoursDisplay(worked)}
                      {' · '}
                      {differenceDisplay(worked - planned)}
                    </p>
                    {entries.map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <span>
                          {clockTime(e.clock_in)} — {e.clock_out ? clockTime(e.clock_out) : t('klok.now')}
                          {' · '}
                          {t(`klok.source.${e.source}`)}
                          {e.edited_by ? ` · ${t('uren.edited')}` : ''}
                        </span>
                        {owner && (
                          <Button
                            className="text-sm px-4 py-2"
                            onClick={() => setEdit({ entry: e, user_id: row.user.id, date: day })}
                          >
                            {t('uren.change')}
                          </Button>
                        )}
                      </div>
                    ))}
                    {owner && entries.length === 0 && (
                      <div className="mt-2">
                        <Button
                          className="text-sm px-4 py-2"
                          onClick={() => setEdit({ entry: null, user_id: row.user.id, date: day })}
                        >
                          {t('uren.add')}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ))}

      {edit && (
        <UurFormulier
          key={edit.entry?.id ?? `${edit.user_id}-${edit.date}`}
          entry={edit.entry}
          userId={edit.user_id}
          date={edit.date}
          onClose={() => setEdit(null)}
        />
      )}

      {owner && (
        <>
          <SectionTitle>{t('uren.export_title')}</SectionTitle>
          <p className="mb-3 text-muted">{t('uren.export_help')}</p>
          <Button variant="primary" full onClick={download}>{t('uren.export')}</Button>
        </>
      )}
    </div>
  )
}

function dagen(from: string, to: string): string[] {
  const out: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day)
  return out
}

/**
 * Een uur met de hand rechtzetten. Zonder deze knop staat er een fout getal
 * onder het loon zodra iemand vergeet te klokken, en dat is geen theorie:
 * dat gebeurt in elke winkel, elke week.
 */
function UurFormulier({
  entry, userId, date, onClose,
}: { entry: TimeEntry | null; userId: string; date: string; onClose: () => void }) {
  const t = useT()
  const [start, setStart] = useState(entry ? clockTime(entry.clock_in) : '09:00')
  const [end, setEnd] = useState(entry?.clock_out ? clockTime(entry.clock_out) : '17:00')
  const [pause, setPause] = useState(String(entry?.break_minutes ?? 30))
  const [note, setNote] = useState(entry?.note ?? '')
  const user = db.staffMember(userId)

  function save() {
    db.saveTimeEntry({
      id: entry?.id, user_id: userId, date, start, end,
      break_minutes: Number(pause) || 0,
      note: note.trim() === '' ? null : note.trim(),
    })
    onClose()
  }

  return (
    <Card className="mt-6">
      <h2 className="text-2xl font-semibold mb-4">{user?.name} · {dayDisplay(date)}</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('uren.start')} htmlFor="uur-start">
          <TextInput id="uur-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('uren.end')} htmlFor="uur-eind">
          <TextInput id="uur-eind" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label={t('rooster.break')} htmlFor="uur-pauze">
          <TextInput
            id="uur-pauze" inputMode="numeric" value={pause}
            onChange={(e) => setPause(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
      </div>

      <Field label={t('rooster.note')} htmlFor="uur-notitie">
        <TextInput id="uur-notitie" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="mb-4"><Notice tone="warn">{t('uren.edit_warning')}</Notice></div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="primary" onClick={save}>{t('common.save')}</Button>
        {entry && (
          <Button variant="danger" onClick={() => { db.deleteTimeEntry(entry.id); onClose() }}>
            {t('uren.delete')}
          </Button>
        )}
        <Button variant="quiet" onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Card>
  )
}
