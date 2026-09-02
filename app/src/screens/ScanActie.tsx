import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { formatTagCode, normalizeTagCode } from '../lib/code'
import { isOpen, primaryTransition } from '../lib/workflow'
import { money, phoneDisplay } from '../lib/format'
import { hasStaffSession, setStaffSession } from '../lib/session'
import { useT } from '../i18n'
import { Button, Card, Notice, PrimaryBar } from '../components/ui'
import { BackLink } from '../components/Layout'
import { StatusPlate } from '../components/StatusPlate'

/**
 * Sectie 8.4 — een scan opent geen kaart maar één handeling. Van telefoon
 * omhoog tot statuswissel moet onder de 3 seconden blijven, dus staat hier
 * precies één grote knop en verder niets dat afleidt.
 */
export default function ScanActie() {
  const t = useT()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  useDbVersion()

  const clean = normalizeTagCode(code)
  const wo = db.workOrderByTag(clean)
  const staff = hasStaffSession()
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    db.logScan(clean, wo ? 'geopend' : 'onbekend', wo?.id ?? null, 'app')
  }, [clean, wo])

  // Sectie 8.1 — een vreemde die het kaartje scant ziet geen naam en geen
  // telefoonnummer van de klant.
  if (!staff) {
    const s = db.settings()
    return (
      <main className="mx-auto w-full max-w-xl px-4 pb-4">
        <h1 className="text-3xl font-semibold mt-8 mb-4">{t('scan.anonymous_title')}</h1>
        <Card>
          <p className="text-lg">{t('scan.anonymous_body', { shop: s.shop_name, phone: phoneDisplay(s.phone) })}</p>
          <p className="mt-4 text-3xl font-semibold tracking-widest">{formatTagCode(clean)}</p>
        </Card>
        <div className="mt-6">
          <Button full onClick={() => { setStaffSession(true); navigate(0) }}>
            {t('scan.staff_mode')}
          </Button>
        </div>
      </main>
    )
  }

  if (!wo) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-4">
        <BackLink to="/" labelKey="back.werkplaats" />
        <h1 className="text-3xl font-semibold mb-4">{formatTagCode(clean)}</h1>
        <Notice tone="warn">{t('scan.not_found', { code: formatTagCode(clean) })}</Notice>
        <div className="mt-6">
          <Button variant="primary" full onClick={() => navigate('/')}>{t('back.werkplaats')}</Button>
        </div>
      </main>
    )
  }

  const customer = db.customer(wo.customer_id)
  const bike = db.bike(wo.bike_id)
  const primary = isOpen(wo.status) ? primaryTransition(wo.status) : null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-4">
      <BackLink to="/" labelKey="back.werkplaats" />
      <h1 className="text-5xl font-semibold tracking-widest mb-3">{formatTagCode(clean)}</h1>
      <p className="mb-4"><StatusPlate status={wo.status} big /></p>

      <Card>
        <p className="text-2xl font-semibold">{bike?.brand} {bike?.model}</p>
        <p>{customer?.first_name} {customer?.last_name}</p>
        <p className="text-muted">{wo.complaint}</p>
        {wo.rack_location && <p className="mt-2">{t('werkplaats.rack')}: <strong>{wo.rack_location}</strong></p>}
        {wo.total_incl_vat_cents > 0 && (
          <p className="mt-2 text-2xl font-semibold">{money(wo.total_incl_vat_cents)}</p>
        )}
      </Card>

      {done && <div className="mt-4"><Notice tone="ok">{done}</Notice></div>}

      {primary && (
        <div className="mt-6">
          <Button full onClick={() => navigate(`/werkbon/${wo.id}`)}>{t('werkbon.title')}</Button>
        </div>
      )}

      <PrimaryBar>
        {primary ? (
          <Button
            variant="primary"
            full
            onClick={() => {
              if (primary.to === 'opgehaald') { navigate(`/werkbon/${wo.id}`); return }
              db.setStatus(wo.id, primary.to)
              setDone(t(`status.${primary.to}`))
            }}
          >
            {t(primary.labelKey)}
          </Button>
        ) : (
          <Button variant="primary" full onClick={() => navigate(`/werkbon/${wo.id}`)}>
            {t('werkbon.title')}
          </Button>
        )}
      </PrimaryBar>
    </main>
  )
}
