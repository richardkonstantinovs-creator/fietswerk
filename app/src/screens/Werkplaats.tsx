import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { BOARD_STATUSES } from '../lib/workflow'
import { useT } from '../i18n'
import { Button, Card, TextInput } from '../components/ui'
import { WorkOrderCard } from '../components/WorkOrderCard'

/**
 * Hoofdscherm (sectie 7.1): secties per status met grote koppen, geen kanban
 * met slepen. Bovenaan één zoekbalk, daaronder de ene grote knop.
 */
export default function Werkplaats() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [query, setQuery] = useState('')

  const hits = db.search(query)
  const orders = db.data().work_orders

  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-4">{t('werkplaats.title')}</h1>

      <label htmlFor="zoek" className="block font-semibold mb-1">{t('common.search')}</label>
      {/* Een veld leegmaken door twintig keer op backspace te drukken is geen
          werk voor iemand met een fiets in zijn handen. De knop staat er alleen
          als er iets te wissen valt, en er staat een woord op (sectie 2.2). */}
      <div className="flex gap-3">
        <TextInput
          id="zoek"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('common.search_placeholder')}
          autoComplete="off"
        />
        {query !== '' && (
          <Button className="shrink-0" onClick={() => setQuery('')}>{t('common.clear')}</Button>
        )}
      </div>
      <p className="text-sm text-muted mt-2">{t('common.search_hint')}</p>

      {query.trim().length >= 2 && (
        <div className="mt-4">
          {hits.length === 0 ? (
            <Card>{t('common.no_results')}</Card>
          ) : (
            hits.map((hit) => (
              <Card
                key={`${hit.kind}_${hit.id}`}
                className="mb-3"
                onClick={() => {
                  if (hit.kind === 'werkbon') navigate(`/werkbon/${hit.id}`)
                  else if (hit.kind === 'klant') navigate(`/klant/${hit.id}`)
                  else {
                    const bikeOrders = db.workOrdersOfBike(hit.id)
                    if (bikeOrders[0]) navigate(`/werkbon/${bikeOrders[0].id}`)
                  }
                }}
              >
                <span className="block text-2xl font-semibold leading-snug">{hit.title}</span>
                <span className="block text-muted text-sm">{hit.subtitle}</span>
              </Card>
            ))
          )}
        </div>
      )}

      <div className="my-6">
        <Button variant="primary" full onClick={() => navigate('/aanname')}>
          {t('werkplaats.new')}
        </Button>
      </div>

      {BOARD_STATUSES.map((status) => {
        const list = orders
          .filter((w) => w.status === status)
          .sort((a, b) => a.intake_at.localeCompare(b.intake_at))
        return (
          <section key={status} className="mb-8">
            {/* Op tablet en pc blijft de kop van de sectie staan tijdens het
                scrollen: bij vijftien bonnen onder elkaar weet je anders na
                een halve bladzijde niet meer welke rij je leest. Op de telefoon
                niet: daar staat de kop met printer en opslag al bovenaan. */}
            <h2 className="text-2xl font-semibold mb-3 sm:sticky sm:top-0 sm:z-10 bg-shell py-2 sm:-mx-2 sm:px-2">
              {t('werkplaats.section_count', { status: t(`status.${status}`), count: list.length })}
            </h2>
            {list.length === 0
              ? (
                <p className="text-muted text-sm border-2 border-dashed border-[#D6D6D6] rounded-2xl px-4 py-5">
                  {t('werkplaats.empty_section')}
                </p>
              )
              : list.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
          </section>
        )
      })}
    </div>
  )
}
