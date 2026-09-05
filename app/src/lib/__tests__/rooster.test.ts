import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../db'
import {
  addDays, dayKey, differenceDisplay, entryMinutes, hoursDisplay, mondayOf,
  minutesOf, monthRange, shiftMinutes, weekDays, weekNumber, weekdayIndex,
} from '../rooster'

/**
 * Fase 3: rooster, uren en klokken. Onder deze sommen ligt loon, dus ze staan
 * hier vast en niet alleen in een scherm. Regel 14.9: na het blok een doorloop
 * — dienst plannen, klokken, vergeten uit te klokken, rechtzetten, exporteren.
 */

beforeEach(() => {
  localStorage.clear()
  db.resetDemoData()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('weken en dagen', () => {
  it('laat de week op maandag beginnen, ook als het zondag is', () => {
    expect(mondayOf('2026-09-04')).toBe('2026-08-31') // vrijdag -> die maandag
    expect(mondayOf('2026-09-06')).toBe('2026-08-31') // zondag hoort bij de week ervoor
    expect(mondayOf('2026-09-07')).toBe('2026-09-07')
  })

  it('telt zeven dagen in een week en houdt de maandgrens heel', () => {
    expect(weekDays('2026-08-31')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
  })

  it('geeft het weeknummer dat op de loonstrook staat', () => {
    expect(weekNumber('2026-01-01')).toBe(1)
    expect(weekNumber('2026-09-04')).toBe(36)
    expect(weekNumber('2027-01-03')).toBe(53) // zondag hoort nog bij 2026
  })

  it('kent maandag als dag 1 en zondag als dag 7', () => {
    expect(weekdayIndex('2026-08-31')).toBe(1)
    expect(weekdayIndex('2026-09-06')).toBe(7)
  })

  it('geeft de eerste en de laatste dag van een maand, ook in een schrikkeljaar', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('uren rekenen', () => {
  it('trekt de pauze van de geplande dienst af', () => {
    expect(shiftMinutes({ start: '08:30', end: '17:00', break_minutes: 30 })).toBe(480)
    expect(hoursDisplay(480)).toBe('8,00 u')
  })

  it('laat een avonddienst over middernacht lopen in plaats van negatief te worden', () => {
    expect(shiftMinutes({ start: '20:00', end: '00:30', break_minutes: 0 })).toBe(270)
  })

  it('weigert onzin in plaats van er een getal van te maken', () => {
    expect(minutesOf('25:00')).toBeNull()
    expect(minutesOf('half negen')).toBeNull()
    expect(shiftMinutes({ start: 'half negen', end: '17:00', break_minutes: 0 })).toBe(0)
  })

  it('telt een openstaande registratie tot nu, niet als nul', () => {
    const nu = new Date('2026-09-04T14:00:00').getTime()
    const open = { clock_in: '2026-09-04T09:00:00', clock_out: null, break_minutes: 0 }
    expect(entryMinutes(open, nu)).toBe(300)
  })

  it('schrijft overwerk met een teken, zodat + en − niet te verwisselen zijn', () => {
    expect(differenceDisplay(105)).toBe('+1,75 u')
    expect(differenceDisplay(-30)).toBe('−0,50 u')
    expect(differenceDisplay(0)).toBe('0,00 u')
  })
})

describe('klokken bij de tag', () => {
  it('gaat met één handeling naar binnen en weer naar buiten', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T08:55:00'))
    const binnen = db.clockToggle('usr_balie2', 'nfc')
    expect(binnen.result).toBe('ingeklokt')
    expect(db.openEntry('usr_balie2')).toBeDefined()

    vi.setSystemTime(new Date('2026-09-04T17:10:00'))
    const buiten = db.clockToggle('usr_balie2', 'nfc')
    expect(buiten.result).toBe('uitgeklokt')
    expect(db.openEntry('usr_balie2')).toBeUndefined()
    expect(entryMinutes(buiten.entry)).toBe(495) // 8 uur en een kwartier
  })

  it('telt twee keer langs de tag lopen als één handeling', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T08:55:00'))
    db.clockToggle('usr_balie2', 'nfc')
    vi.setSystemTime(new Date('2026-09-04T08:55:20'))
    const nogmaals = db.clockToggle('usr_balie2', 'nfc')
    expect(nogmaals.result).toBe('genegeerd')
    expect(db.entriesOn('usr_balie2', '2026-09-04')).toHaveLength(1)
    expect(db.openEntry('usr_balie2')).toBeDefined()
  })

  it('verzint geen eindtijd voor wie gisteren vergat uit te klokken', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T09:00:00'))
    db.clockToggle('usr_balie2', 'nfc')

    vi.setSystemTime(new Date('2026-09-04T08:50:00'))
    const morgen = db.clockToggle('usr_balie2', 'nfc')
    expect(morgen.result).toBe('ingeklokt')
    expect(morgen.forgotten).not.toBeNull()
    expect(morgen.forgotten?.clock_out).toBeNull()
    expect(db.forgottenEntries().some((e) => e.id === morgen.forgotten?.id)).toBe(true)
    expect(db.entriesOn('usr_balie2', '2026-09-04')).toHaveLength(1)
  })

  it('draait een aanraking terug die niet de bedoeling was', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T08:55:00'))
    const binnen = db.clockToggle('usr_balie2', 'nfc')
    db.undoClock(binnen.entry.id)
    expect(db.openEntry('usr_balie2')).toBeUndefined()
    expect(db.entriesOn('usr_balie2', '2026-09-04')).toHaveLength(0)
  })
})

describe('doorloop: plannen, werken, rechtzetten, exporteren', () => {
  const dag = '2026-09-04'

  it('rekent overwerk als feit min plan', () => {
    db.saveShift({
      id: undefined, user_id: 'usr_balie2', date: dag,
      start: '09:00', end: '17:00', break_minutes: 30, note: null,
    })
    db.saveTimeEntry({
      user_id: 'usr_balie2', date: dag, start: '08:45', end: '18:30',
      break_minutes: 30, note: null,
    })

    const rij = db.periodTotals(dag, dag).find((r) => r.user.id === 'usr_balie2')
    expect(rij?.planned_minutes).toBe(450) // 8 uur min een half uur pauze
    expect(rij?.worked_minutes).toBe(555)
    expect(rij?.difference_minutes).toBe(105) // 1,75 uur overwerk
    expect(differenceDisplay(rij?.difference_minutes ?? 0)).toBe('+1,75 u')
  })

  it('zet een dienst die over middernacht liep goed neer bij handmatig invoeren', () => {
    const entry = db.saveTimeEntry({
      user_id: 'usr_balie2', date: dag, start: '20:00', end: '00:30',
      break_minutes: 0, note: null,
    })
    expect(entryMinutes(entry)).toBe(270)
    expect(entry.edited_by).not.toBeNull()
  })

  it('zet dezelfde dienst in één handeling op de rest van de werkweek', () => {
    const maandag = mondayOf(dag)
    const werkdagen = weekDays(maandag).filter((d) => weekdayIndex(d) <= 5)
    const dienst = {
      user_id: 'usr_balie2', date: maandag,
      start: '09:00', end: '17:00', break_minutes: 30, note: null,
    }
    expect(db.repeatShift(dienst, werkdagen)).toBe(5)
    expect(werkdagen.flatMap((d) => db.shiftsOn('usr_balie2', d))).toHaveLength(5)

    // Twee keer drukken mag nooit twee diensten op dezelfde dag opleveren.
    expect(db.repeatShift(dienst, werkdagen)).toBe(0)
    expect(werkdagen.flatMap((d) => db.shiftsOn('usr_balie2', d))).toHaveLength(5)
  })

  it('geeft de boekhouder een bestand met puntkomma\'s en Nederlandse komma\'s', () => {
    db.saveShift({
      user_id: 'usr_balie2', date: dag,
      start: '09:00', end: '17:00', break_minutes: 30, note: null,
    })
    db.saveTimeEntry({
      user_id: 'usr_balie2', date: dag, start: '08:45', end: '18:30',
      break_minutes: 30, note: null,
    })

    const csv = db.exportHoursCsv(dag, dag)
    const regels = csv.split('\r\n')
    expect(regels[0]).toContain('gewerkt_uren;gepland_uren;verschil_uren')
    const mijn = regels.find((r) => r.startsWith('Douwe Bos'))
    expect(mijn).toBeDefined()
    expect(mijn).toContain('04-09-2026')
    expect(mijn).toContain('08:45;18:30')
    expect(mijn).toContain('9,25;7,50;1,75')
    expect(mijn).toContain('handmatig')
  })
})

describe('beschikbaarheid en afwezigheid', () => {
  it('houdt één wens per dag over, niet twee die elkaar tegenspreken', () => {
    db.setAvailability('usr_balie2', '2026-09-05', false)
    db.setAvailability('usr_balie2', '2026-09-05', true, '12:00', '18:00')
    expect(db.availabilityBetween('2026-09-05', '2026-09-05')
      .filter((a) => a.user_id === 'usr_balie2')).toHaveLength(1)
    expect(db.availabilityOn('usr_balie2', '2026-09-05')?.can_work).toBe(true)
    expect(db.availabilityOn('usr_balie2', '2026-09-05')?.from_time).toBe('12:00')
  })

  it('vindt een vakantiedag ook midden in de reeks', () => {
    db.saveAbsence('usr_balie2', '2026-09-07', '2026-09-11', 'vakantie', null)
    expect(db.absenceOn('usr_balie2', '2026-09-09')?.kind).toBe('vakantie')
    expect(db.absenceOn('usr_balie2', '2026-09-12')).toBeUndefined()
  })

  it('draait een omgekeerd ingevoerde periode om in plaats van hem te laten verdwijnen', () => {
    const afw = db.saveAbsence('usr_balie2', '2026-09-11', '2026-09-07', 'ziek', null)
    expect(afw.from_date).toBe('2026-09-07')
    expect(afw.to_date).toBe('2026-09-11')
  })
})

describe('de winkel van vandaag', () => {
  it('weet wie er binnen is en wie er wordt verwacht', () => {
    // De demodata zet twee mensen binnen; dat is de vraag van half tien.
    expect(db.whoIsIn().length).toBeGreaterThanOrEqual(2)
    expect(db.currentWeek()).toBe(mondayOf(dayKey()))
    expect(addDays(db.currentWeek(), 6) >= dayKey()).toBe(true)
  })
})

describe('medewerkers in en uit dienst', () => {
  it('neemt iemand aan die daarna kan inloggen en in het rooster staat', () => {
    const nieuw = db.saveStaff({ name: '  Femke Boersma ', role: 'balie', pin_code: '7788' })
    expect(typeof nieuw).not.toBe('string')
    const user = nieuw as Exclude<typeof nieuw, string>
    expect(user.name).toBe('Femke Boersma') // spaties eraf
    expect(db.staff().some((u) => u.id === user.id)).toBe(true)
    expect(db.login(user.id, '7788')).toBe(true)
  })

  it('weigert een pincode die al van iemand anders is', () => {
    expect(db.saveStaff({ name: 'Freek', role: 'monteur', pin_code: '2222' })).toBe('pin_bezet')
    expect(db.saveStaff({ name: 'Freek', role: 'monteur', pin_code: '22' })).toBe('pin_ongeldig')
    expect(db.saveStaff({ name: '   ', role: 'monteur', pin_code: '7788' })).toBe('naam_leeg')
  })

  it('haalt iemand uit dienst zonder zijn uren te wissen', () => {
    db.saveTimeEntry({
      user_id: 'usr_balie2', date: '2026-09-04', start: '09:00', end: '17:00',
      break_minutes: 30, note: null,
    })
    expect(db.deactivateStaff('usr_balie2')).toBeNull()

    // Weg uit het rooster en uit de inlogkeuze...
    expect(db.staff().some((u) => u.id === 'usr_balie2')).toBe(false)
    expect(db.users().some((u) => u.id === 'usr_balie2')).toBe(false)
    // ...maar de naam en de uren blijven bestaan, want daar is loon over betaald.
    expect(db.staffMember('usr_balie2')?.name).toBe('Douwe Bos')
    expect(db.entriesOn('usr_balie2', '2026-09-04')).toHaveLength(1)
    expect(db.exportHoursCsv('2026-09-04', '2026-09-04')).toContain('Douwe Bos')

    db.reactivateStaff('usr_balie2')
    expect(db.staff().some((u) => u.id === 'usr_balie2')).toBe(true)
  })

  it('laat de eigenaar zichzelf en de laatste eigenaar niet buitensluiten', () => {
    db.login('usr_owner', '1111')
    expect(db.deactivateStaff('usr_owner')).toBe('jijzelf')
    expect(db.data().users.find((u) => u.id === 'usr_owner')?.active).toBe(true)

    // Ook niet via een omweg: de laatste eigenaar degraderen tot monteur.
    expect(db.saveStaff({
      id: 'usr_owner', name: 'Harm Wijnstra', role: 'monteur', pin_code: '1111',
    })).toBe('laatste_eigenaar')
  })

  it('wist een verkeerd getypte naam echt, maar iemand met uren nooit', () => {
    const vers = db.saveStaff({ name: 'Typfout', role: 'monteur', pin_code: '9911' })
    const id = (vers as Exclude<typeof vers, string>).id
    expect(db.deleteStaff(id)).toBe(true)
    expect(db.staffMember(id)).toBeUndefined()

    // Sanne heeft diensten en geklokte uren staan: die naam gaat er niet uit.
    expect(db.staffHistory('usr_monteur').entries).toBeGreaterThan(0)
    expect(db.deleteStaff('usr_monteur')).toBe(false)
    expect(db.staffMember('usr_monteur')).toBeDefined()
  })
})

describe('de urenstaat vergeet niemand', () => {
  it('houdt wie uit dienst ging op de staat van de maand die hij nog werkte', () => {
    db.saveTimeEntry({
      user_id: 'usr_balie2', date: '2026-09-05', start: '09:30', end: '17:00',
      break_minutes: 30, note: null,
    })
    db.deactivateStaff('usr_balie2')

    const september = db.periodTotals('2026-09-01', '2026-09-30')
    const douwe = september.find((r) => r.user.id === 'usr_balie2')
    expect(douwe).toBeDefined()
    expect(douwe?.worked_minutes).toBe(420)

    // In de maand daarna staat hij er niet meer: hij werkt hier niet meer.
    expect(db.periodTotals('2026-10-01', '2026-10-31')
      .some((r) => r.user.id === 'usr_balie2')).toBe(false)
  })
})
