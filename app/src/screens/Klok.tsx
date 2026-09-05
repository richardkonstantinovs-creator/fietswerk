import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { clockTime, dayDisplay, dayKey, entryMinutes, hoursDisplay, shiftMinutes } from '../lib/rooster'
import { useT } from '../i18n'
import { RoosterTabs } from '../components/RoosterTabs'
import { Button, Card, Collapse, Notice, SectionTitle } from '../components/ui'
import type { ClockSource } from '../lib/types'
import { Qr } from '../components/Qr'

/**
 * Klokken (fase 3). Dit scherm is het doel van de NFC-tag bij de deur: de
 * telefoon van de medewerker leest de tag, de browser opent deze bladzijde en
 * de dienst begint of eindigt. Dezelfde bladzijde werkt met de duim, voor de
 * dag dat de tag stuk is of de telefoon leeg.
 *
 * Eén knop, niet twee (sectie 2.2). Wie binnenkomt hoeft niet te kiezen tussen
 * "begin" en "einde"; het systeem weet zelf welke van de twee aan de beurt is.
 */
export default function Klok() {
  const t = useT()
  useDbVersion()
  const [params] = useSearchParams()
  const [outcome, setOutcome] = useState<db.ClockOutcome | null>(null)
  const geklopt = useRef(false)

  const me = db.currentUser()
  const open = me ? db.openEntry(me.id) : undefined
  const today = dayKey()
  const mine = me ? db.entriesOn(me.id, today) : []
  const planned = me ? db.shiftsOn(me.id, today) : []

  /**
   * De tag zet ?tik=1 in de link. Dan is de aanraking zelf de handeling en
   * hoeft er niets meer ingedrukt te worden: de telefoon gaat weer in de zak
   * voordat de deur dichtvalt. Eén keer per keer dat de bladzijde opent.
   */
  useEffect(() => {
    if (geklopt.current) return
    if (params.get('tik') !== '1') return
    if (!me) return
    geklopt.current = true
    setOutcome(db.clockToggle(me.id, 'nfc'))
  }, [params, me])

  if (!me) return null

  function stempel(source: ClockSource) {
    setOutcome(db.clockToggle(me!.id, source))
  }

  const worked = mine.reduce((sum, e) => sum + entryMinutes(e), 0)
  const plannedMinutes = planned.reduce((sum, s) => sum + shiftMinutes(s), 0)

  // De link die op de tag komt te staan. Hij hangt aan het adres waar de app
  // draait, zodat programmeren van een tag geen typwerk is.
  const tagLink = `${window.location.origin}/klok?tik=1`

  return (
    <div>
      <RoosterTabs />
      <h1 className="text-3xl font-semibold mb-1">{t('klok.title')}</h1>
      <p className="text-muted mb-4">{me.name}</p>

      {outcome && (
        <div className="mb-4 grid gap-3">
          <Notice tone={outcome.result === 'genegeerd' ? 'warn' : 'ok'}>
            {outcome.result === 'ingeklokt'
              && t('klok.done_in', { time: clockTime(outcome.entry.clock_in) })}
            {outcome.result === 'uitgeklokt'
              && t('klok.done_out', {
                time: clockTime(outcome.entry.clock_out),
                hours: hoursDisplay(entryMinutes(outcome.entry)),
              })}
            {outcome.result === 'genegeerd' && t('klok.ignored')}
          </Notice>
          {outcome.forgotten && (
            <Notice tone="warn">
              {t('klok.forgotten', { date: dayDisplay(outcome.forgotten.date) })}
            </Notice>
          )}
          {outcome.result !== 'genegeerd' && (
            <Button
              variant="secondary"
              onClick={() => { db.undoClock(outcome.entry.id); setOutcome(null) }}
            >
              {t('klok.undo')}
            </Button>
          )}
        </div>
      )}

      <Card className="mb-4">
        <p className="text-2xl font-semibold">
          {open ? t('klok.inside', { time: clockTime(open.clock_in) }) : t('klok.outside')}
        </p>
        <p className="text-muted">
          {t('klok.today_worked')}: {hoursDisplay(worked)}
          {' · '}
          {t('klok.today_planned')}: {hoursDisplay(plannedMinutes)}
        </p>
      </Card>

      <Button variant="primary" full className="text-2xl py-6" onClick={() => stempel('handmatig')}>
        {open ? t('klok.stop') : t('klok.start')}
      </Button>

      <SectionTitle>{t('klok.today')}</SectionTitle>
      {mine.length === 0 && <Card>{t('klok.empty')}</Card>}
      {mine.map((e) => (
        <Card key={e.id} className="mb-3">
          <p className="text-xl font-semibold">
            {clockTime(e.clock_in)} — {e.clock_out ? clockTime(e.clock_out) : t('klok.now')}
          </p>
          <p className="text-muted">
            {hoursDisplay(entryMinutes(e))} · {t(`klok.source.${e.source}`)}
          </p>
        </Card>
      ))}

      {db.maySeeReports() && (
        <Collapse title={t('klok.tag_title')} sub={t('klok.tag_sub')}>
          <Card>
            <p className="mb-3">{t('klok.tag_help')}</p>
            <p className="font-mono text-sm break-all mb-4">{tagLink}</p>
            <div className="flex justify-center mb-4"><Qr text={tagLink} modulePx={6} /></div>
            <p className="text-muted text-sm">{t('klok.tag_qr_help')}</p>
          </Card>
        </Collapse>
      )}
    </div>
  )
}
