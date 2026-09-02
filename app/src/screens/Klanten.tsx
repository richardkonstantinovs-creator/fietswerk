import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { phoneDisplay } from '../lib/format'
import { useT } from '../i18n'
import { Card, TextInput } from '../components/ui'

/** Klantenlijst (sectie 7.6). Zoeken op naam of telefoon, verder niets. */
export default function Klanten() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()
  const [query, setQuery] = useState('')

  const all = db.data().customers.filter((c) => !c.deleted_at)
  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const list = q.length < 2
    ? [...all].sort((a, b) => a.last_name.localeCompare(b.last_name, 'nl'))
    : all.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.company ?? ''}`.toLowerCase().includes(q)
      || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))

  return (
    <div>
      <h1 className="text-3xl font-semibold mt-6 mb-4">{t('klanten.title')}</h1>
      <label htmlFor="klant-zoek" className="block font-semibold mb-2">{t('klanten.search')}</label>
      <TextInput
        id="klant-zoek" value={query} autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('common.search_placeholder')}
      />
      <p className="my-4 font-semibold">{t('klanten.count', { count: list.length })}</p>
      {list.map((c) => (
        <Card key={c.id} className="mb-3" onClick={() => navigate(`/klant/${c.id}`)}>
          <span className="text-2xl font-semibold">{c.first_name} {c.last_name}</span>
          {c.company && <span className="block">{c.company}</span>}
          <span className="block">{phoneDisplay(c.phone)}</span>
          <span className="block text-muted">{[c.street, c.city].filter(Boolean).join(', ')}</span>
        </Card>
      ))}
      {list.length === 0 && <Card>{t('common.no_results')}</Card>}
    </div>
  )
}
