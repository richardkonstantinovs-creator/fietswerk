import type { BikeCategory } from './types'

/**
 * Sectie 11 — normtijden. Dit zijn startwaarden [CONTROLEREN bij de eigenaar];
 * de bedoeling is dat hij ze zelf bijstelt. Nergens hardcoden buiten dit bestand.
 */
export interface JobTemplate {
  key: string
  nl: string
  en: string
  minutes: number
  /** Op het aannamescherm als grote knop tonen (sectie 7.2, stap 3). */
  chip?: boolean
  /** Alleen tonen bij dit soort fiets. */
  onlyFor?: BikeCategory[]
  /** Vaste onderdelenpost die er praktisch altijd bij hoort, excl. btw. */
  partHint?: { nl: string; en: string; cents: number }
}

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    key: 'lekke_band_voor', nl: 'Lekke band voor', en: 'Flat tyre front',
    minutes: 15, chip: true,
    partHint: { nl: 'Binnenband 28 inch', en: 'Inner tube 28 inch', cents: 750 },
  },
  {
    key: 'lekke_band_achter_derailleur', nl: 'Lekke band achter (derailleur)',
    en: 'Flat tyre rear (derailleur)', minutes: 25, chip: true,
    partHint: { nl: 'Binnenband 28 inch', en: 'Inner tube 28 inch', cents: 750 },
  },
  {
    key: 'lekke_band_achter_naaf', nl: 'Lekke band achter (naafversnelling)',
    en: 'Flat tyre rear (hub gear)', minutes: 35,
    partHint: { nl: 'Binnenband 28 inch', en: 'Inner tube 28 inch', cents: 750 },
  },
  {
    key: 'lekke_band_achter_ebike', nl: 'Lekke band achter e-bike met naafmotor',
    en: 'Flat tyre rear e-bike with hub motor', minutes: 50, onlyFor: ['ebike'],
    partHint: { nl: 'Binnenband 28 inch versterkt', en: 'Inner tube 28 inch reinforced', cents: 1050 },
  },
  {
    key: 'remblokken', nl: 'Remblokken vervangen', en: 'Replace brake pads',
    minutes: 25, chip: true,
    partHint: { nl: 'Set remblokken', en: 'Brake pad set', cents: 1200 },
  },
  {
    key: 'ketting_tandwiel', nl: 'Ketting + tandwiel vervangen',
    en: 'Replace chain + sprocket', minutes: 40, chip: true,
    partHint: { nl: 'Ketting + tandwiel', en: 'Chain + sprocket', cents: 3200 },
  },
  {
    key: 'versnelling_afstellen', nl: 'Versnelling afstellen', en: 'Adjust gears',
    minutes: 15, chip: true,
  },
  {
    key: 'spaak_wiel_richten', nl: 'Spaak vervangen + wiel richten',
    en: 'Replace spoke + true wheel', minutes: 30,
    partHint: { nl: 'Spaak', en: 'Spoke', cents: 250 },
  },
  {
    key: 'verlichting', nl: 'Verlichting / dynamo storing', en: 'Lighting / dynamo fault',
    minutes: 30, chip: true,
  },
  { key: 'kleine_beurt', nl: 'Kleine beurt', en: 'Small service', minutes: 45 },
  {
    key: 'grote_beurt', nl: 'Grote onderhoudsbeurt', en: 'Full service',
    minutes: 90, chip: true,
  },
  { key: 'trapas_lagers', nl: 'Trapas / lagers', en: 'Bottom bracket / bearings', minutes: 50 },
  {
    key: 'ebike_diagnose', nl: 'E-bike storing (diagnose)', en: 'E-bike fault (diagnosis)',
    minutes: 30, chip: true, onlyFor: ['ebike'],
  },
]

export function template(key: string): JobTemplate | undefined {
  return JOB_TEMPLATES.find((t) => t.key === key)
}

export function chipsFor(category: BikeCategory | null): JobTemplate[] {
  return JOB_TEMPLATES.filter(
    (t) => t.chip && (!t.onlyFor || (category != null && t.onlyFor.includes(category))),
  )
}
