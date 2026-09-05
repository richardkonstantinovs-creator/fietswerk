import { useMemo, useState } from 'react'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { pageToImage } from '../lib/schrift/foto'
import { apiKey, OcrError, readPage, saveApiKey } from '../lib/schrift/ocr'
import type { Page } from '../lib/schrift/ocr'
import { findCandidates, regelToInvoer } from '../lib/schrift/match'
import type { RegelStand } from '../components/RegelKaart'
import { RegelKaart } from '../components/RegelKaart'
import { useT } from '../i18n'
import { toE164NL } from '../lib/format'
import {
  Button, Card, Collapse, Field, Notice, PrimaryBar, SectionTitle, TextInput,
} from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Het schrift van de eigenaar overzetten. De volgorde is met opzet traag: eerst
 * lezen, dan nakijken, dan pas opslaan. Er bestaat geen knop die een hele
 * bladzijde ongezien in de database zet — een verkeerde klant eruit halen kost
 * meer tijd dan hem één keer goed nakijken.
 */

interface Bladzijde {
  naam: string
  dataUrl: string
  base64: string
}

type Fase = 'kiezen' | 'lezen' | 'nakijken' | 'klaar'

export default function Schrift() {
  const t = useT()
  useDbVersion()

  const [sleutel, setSleutel] = useState(apiKey())
  const [pagina, setPagina] = useState<Bladzijde | null>(null)
  const [wachtrij, setWachtrij] = useState<Bladzijde[]>([])
  const [datum, setDatum] = useState(vandaag())
  const [fase, setFase] = useState<Fase>('kiezen')
  const [fout, setFout] = useState<string | null>(null)
  const [gelezen, setGelezen] = useState<Page | null>(null)
  const [standen, setStanden] = useState<RegelStand[]>([])
  const [opgeslagen, setOpgeslagen] = useState(0)

  const klanten = db.data().customers
  const fietsen = db.data().bikes
  const gedaan = useMemo(
    () => standen.filter((s) => s.keuze.soort !== 'overslaan').length,
    [standen],
  )

  if (!db.maySeeReports()) {
    return (
      <div>
        <BackLink to="/" labelKey="back.werkplaats" />
        <Notice tone="warn">{t('role.only_owner')}</Notice>
      </div>
    )
  }

  async function kiesBestanden(files: FileList | null) {
    if (!files || files.length === 0) return
    setFout(null)
    try {
      const beelden: Bladzijde[] = []
      for (const file of Array.from(files)) {
        const beeld = await pageToImage(file)
        beelden.push({ naam: file.name, dataUrl: beeld.dataUrl, base64: beeld.base64 })
      }
      setPagina(beelden[0])
      setWachtrij(beelden.slice(1))
      void lees(beelden[0])
    } catch {
      setFout(t('schrift.fout_foto'))
    }
  }

  async function lees(bladzijde: Bladzijde) {
    setFase('lezen')
    setFout(null)
    try {
      const page = await readPage(bladzijde.base64)
      const paginaDatum = page.bladzijde_datum ?? datum
      if (page.bladzijde_datum) setDatum(page.bladzijde_datum)
      setGelezen(page)
      setStanden(page.regels.map((r) => ({
        invoer: regelToInvoer(r, paginaDatum),
        bron: r.bron_tekst,
        onzeker: r.zekerheid === 'laag',
        kandidaten: findCandidates(r, klanten, fietsen),
        keuze: { soort: 'nieuw' },
      })))
      setFase('nakijken')
    } catch (err) {
      setFout(foutTekst(err, t))
      setFase('kiezen')
    }
  }

  function bewaar() {
    let aantal = 0
    for (const stand of standen) {
      if (stand.keuze.soort === 'overslaan') continue
      const { invoer } = stand

      const klant = stand.keuze.soort === 'bestaand'
        ? db.customer(stand.keuze.customerId)
        : undefined
      const cust = klant ?? db.createCustomer({
        first_name: invoer.klant.first_name,
        last_name: invoer.klant.last_name || t('schrift.naam_onbekend'),
        phone: invoer.klant.phone ? toE164NL(invoer.klant.phone) : '',
        street: invoer.klant.street, postcode: invoer.klant.postcode, city: invoer.klant.city,
      })

      const bestaandeFiets = db.bikesOf(cust.id).find(
        (b) => b.brand.toLowerCase() === invoer.fiets.brand.toLowerCase() && invoer.fiets.brand !== '',
      )
      const fiets = bestaandeFiets ?? db.createBike({
        customer_id: cust.id,
        brand: invoer.fiets.brand || t('schrift.merk_onbekend'),
        model: invoer.fiets.model, category: invoer.fiets.category,
        frame_number: invoer.fiets.frame_number, color: invoer.fiets.color,
      })

      db.importWorkOrder({
        customer_id: cust.id, bike_id: fiets.id,
        complaint: invoer.complaint || t('schrift.werk_onbekend'),
        datum: invoer.datum, lines: invoer.lines,
        paid_cents: invoer.paid_cents, method: invoer.method,
        notitie: invoer.notitie,
      })
      aantal += 1
    }
    setOpgeslagen(aantal)
    setGelezen(null)
    setStanden([])
    setFase('klaar')
  }

  function volgende() {
    const [next, ...rest] = wachtrij
    setPagina(next ?? null)
    setWachtrij(rest)
    setOpgeslagen(0)
    if (next) void lees(next)
    else setFase('kiezen')
  }

  return (
    <div>
      <BackLink to="/" labelKey="back.werkplaats" />
      <h1 className="text-3xl font-semibold mt-6 mb-4">{t('schrift.title')}</h1>
      <p className="mb-4 max-w-prose">{t('schrift.uitleg')}</p>

      {fout && <div className="mb-4"><Notice tone="danger">{fout}</Notice></div>}

      <Collapse title={t('schrift.instellingen')} sub={t('schrift.instellingen_sub')} open={!sleutel}>
        <Field label={t('schrift.sleutel')} hint={t('schrift.sleutel_hint')} htmlFor="sleutel">
          <TextInput
            id="sleutel" type="password" value={sleutel} autoComplete="off"
            onChange={(e) => { setSleutel(e.target.value); saveApiKey(e.target.value) }}
          />
        </Field>
      </Collapse>

      {fase === 'kiezen' && (
        <>
          <SectionTitle>{t('schrift.bladzijde_kiezen')}</SectionTitle>
          <Field label={t('schrift.datum')} hint={t('schrift.datum_hint')} htmlFor="paginadatum">
            <TextInput
              id="paginadatum" type="date" value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </Field>
          <Field label={t('schrift.fotos')} hint={t('schrift.fotos_hint')} htmlFor="schriftfoto">
            <input
              id="schriftfoto" type="file" accept="image/*" capture="environment" multiple
              onChange={(e) => void kiesBestanden(e.target.files)}
              className="w-full min-h-touch text-lg"
            />
          </Field>
        </>
      )}

      {fase === 'lezen' && (
        <Card className="mt-6">
          <p className="text-2xl font-semibold">{t('schrift.bezig')}</p>
          <p className="text-muted mt-2">{t('schrift.bezig_sub')}</p>
        </Card>
      )}

      {fase === 'nakijken' && pagina && (
        <>
          <SectionTitle>{t('schrift.nakijken')}</SectionTitle>
          <p className="mb-3">{t('schrift.nakijken_uitleg')}</p>
          {/* De foto blijft ernaast staan zolang er nagekeken wordt. */}
          <img
            src={pagina.dataUrl} alt={t('schrift.foto_alt')}
            className="w-full rounded-2xl border-2 border-line mb-6"
          />
          {gelezen && (
            <Collapse title={t('schrift.ruwe_tekst')}>
              <pre className="whitespace-pre-wrap break-words text-base">{gelezen.ruwe_tekst}</pre>
            </Collapse>
          )}
          <div className="mt-6">
            {standen.map((stand, i) => (
              <RegelKaart
                key={i} stand={stand} nummer={i + 1} totaal={standen.length}
                onChange={(next) => setStanden((all) => all.map((s, j) => (j === i ? next : s)))}
              />
            ))}
          </div>
          {standen.length === 0 && <Card>{t('schrift.niets_gevonden')}</Card>}
          <PrimaryBar>
            <Button variant="primary" full onClick={bewaar} disabled={gedaan === 0}>
              {t('schrift.opslaan', { aantal: gedaan })}
            </Button>
          </PrimaryBar>
        </>
      )}

      {fase === 'klaar' && (
        <>
          <div className="mt-6">
            <Notice tone="ok">{t('schrift.klaar', { aantal: opgeslagen })}</Notice>
          </div>
          <PrimaryBar>
            <Button variant="primary" full onClick={volgende}>
              {wachtrij.length > 0
                ? t('schrift.volgende', { over: wachtrij.length })
                : t('schrift.opnieuw')}
            </Button>
          </PrimaryBar>
        </>
      )}
    </div>
  )
}

function vandaag(): string {
  return new Date().toISOString().slice(0, 10)
}

function foutTekst(err: unknown, t: (key: string) => string): string {
  if (!(err instanceof OcrError)) return t('schrift.fout_onbekend')
  switch (err.fout.soort) {
    case 'geen_sleutel': return t('schrift.fout_geen_sleutel')
    case 'sleutel_fout': return t('schrift.fout_sleutel')
    case 'te_druk': return t('schrift.fout_druk')
    case 'netwerk': return t('schrift.fout_netwerk')
    case 'onleesbaar': return t('schrift.fout_onleesbaar')
    default: return t('schrift.fout_api')
  }
}
