import { BIKE_CATEGORIES } from '../jobs'

/**
 * Het enige bestand dat weet dat er een leesdienst bestaat, net zoals
 * printer/index.ts het enige bestand is dat ESC/POS kent (regel 14.7). De rest
 * van de app ziet alleen readPage() en de vormen hieronder.
 *
 * De leesdienst en zijn schemabibliotheek worden pas binnengehaald op het
 * moment dat er echt een bladzijde gelezen wordt. Dat scheelt een halve
 * megabyte bij elke keer dat de winkel de app opent, en een monteur die nooit
 * bij het schrift komt haalt hem dus nooit op.
 */

const MODEL = 'claude-opus-5'
const KEY_STORAGE = 'fietswerk.schrift.sleutel'

export function apiKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) ?? '' } catch { return '' }
}

export function saveApiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim())
    else localStorage.removeItem(KEY_STORAGE)
  } catch { /* privémodus */ }
}

export interface Regel {
  /** Woord voor woord zoals het op het papier stond; hier vergelijkt de eigenaar op. */
  bron_tekst: string
  zekerheid: 'hoog' | 'laag'
  datum: string | null
  klant: {
    voornaam: string | null
    achternaam: string | null
    telefoon: string | null
    straat: string | null
    postcode: string | null
    plaats: string | null
  }
  fiets: {
    merk: string | null
    model: string | null
    categorie: string | null
    framenummer: string | null
    kleur: string | null
  }
  werk: Array<{ omschrijving: string; bedrag_euro: number | null }>
  totaal_euro: number | null
  betaald: 'pin' | 'contant' | 'onbekend'
}

export interface Page {
  bladzijde_datum: string | null
  ruwe_tekst: string
  regels: Regel[]
}

const PROMPT = `Dit is een foto van een bladzijde uit het papieren schrift van een
Nederlandse fietsenmaker in Groningen. Meestal handgeschreven, vaak slordig, soms
scheef gefotografeerd.

Lees de bladzijde en geef elke aparte klus terug als een regel. Eén regel is één
klant die één keer langs is geweest. Hoeveel regels er op een bladzijde staan
weet je van tevoren niet — dat bepaal je zelf uit wat je ziet.

Belangrijke regels:
- bron_tekst is letterlijk wat er staat, zoals jij het leest. Verzin daar niets
  bij en corrigeer niets. De eigenaar vergelijkt dit met het papier.
- Weet je iets niet, dan is het null. Nooit gokken, nooit invullen.
- Twijfel je ergens aan in een regel, zet dan zekerheid op "laag".
- Bedragen komen terug als getal in euro's: "24,50" wordt 24.5.
- Datums als JJJJ-MM-DD. Staat er alleen "12-3" of niets, dan null.
- Telefoonnummers exact overnemen, met of zonder streepjes.
- categorie mag alleen een van deze woorden zijn, anders null:
  ${BIKE_CATEGORIES.join(', ')}.
- ruwe_tekst is de hele bladzijde woord voor woord, van boven naar beneden.
- bladzijde_datum is de datum die los bovenaan de bladzijde staat, als die er is.`

export type OcrFout =
  | { soort: 'geen_sleutel' }
  | { soort: 'sleutel_fout' }
  | { soort: 'te_druk' }
  | { soort: 'netwerk' }
  | { soort: 'onleesbaar' }
  | { soort: 'api'; status: number }

export class OcrError extends Error {
  fout: OcrFout
  constructor(fout: OcrFout) {
    super(fout.soort)
    this.fout = fout
  }
}

/** Eén bladzijde laten lezen. Gooit OcrError; de foto blijft bij de aanroeper. */
export async function readPage(base64: string): Promise<Page> {
  const key = apiKey()
  if (!key) throw new OcrError({ soort: 'geen_sleutel' })

  const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('zod'),
    import('@anthropic-ai/sdk/helpers/zod'),
  ]).catch(() => { throw new OcrError({ soort: 'netwerk' }) })

  const PageSchema = z.object({
    bladzijde_datum: z.string().nullable(),
    ruwe_tekst: z.string(),
    regels: z.array(z.object({
      bron_tekst: z.string(),
      zekerheid: z.enum(['hoog', 'laag']),
      datum: z.string().nullable(),
      klant: z.object({
        voornaam: z.string().nullable(),
        achternaam: z.string().nullable(),
        telefoon: z.string().nullable(),
        straat: z.string().nullable(),
        postcode: z.string().nullable(),
        plaats: z.string().nullable(),
      }),
      fiets: z.object({
        merk: z.string().nullable(),
        model: z.string().nullable(),
        categorie: z.string().nullable(),
        framenummer: z.string().nullable(),
        kleur: z.string().nullable(),
      }),
      werk: z.array(z.object({
        omschrijving: z.string(),
        bedrag_euro: z.number().nullable(),
      })),
      totaal_euro: z.number().nullable(),
      betaald: z.enum(['pin', 'contant', 'onbekend']),
    })),
  })

  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { format: zodOutputFormat(PageSchema), effort: 'high' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    if (!res.parsed_output) throw new OcrError({ soort: 'onleesbaar' })
    return res.parsed_output as Page
  } catch (err) {
    if (err instanceof OcrError) throw err
    if (err instanceof Anthropic.AuthenticationError) throw new OcrError({ soort: 'sleutel_fout' })
    if (err instanceof Anthropic.RateLimitError) throw new OcrError({ soort: 'te_druk' })
    if (err instanceof Anthropic.APIConnectionError) throw new OcrError({ soort: 'netwerk' })
    if (err instanceof Anthropic.APIError) throw new OcrError({ soort: 'api', status: err.status ?? 0 })
    throw new OcrError({ soort: 'netwerk' })
  }
}
