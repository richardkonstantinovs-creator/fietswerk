import { useNavigate } from 'react-router-dom'
import * as db from '../lib/db'
import { useDbVersion } from '../lib/useDb'
import { dateTime } from '../lib/format'
import { formatTagCode } from '../lib/code'
import { useT } from '../i18n'
import { Card, SectionTitle } from '../components/ui'
import { BackLink } from '../components/Layout'

/**
 * Accu's (sectie 3.4 en 8.6). Accu's gaan los van de fiets naar de laadkast
 * en worden verwisseld. Dit scherm zegt in één blik waar ze liggen en is
 * tegelijk het laadlogboek dat de verzekeraar wil zien.
 */
export default function Accus() {
  const t = useT()
  const navigate = useNavigate()
  useDbVersion()

  const current = db.batteriesOnCharger()
  const onCharger = current.filter((b) => b.event === 'op_lader')
  const inShop = current.filter((b) => b.event === 'aangenomen')

  function row(logs: typeof current) {
    return logs.map((log) => {
      const wo = log.work_order_id ? db.workOrder(log.work_order_id) : null
      const bike = db.bike(log.bike_id)
      return (
        <Card
          key={log.id}
          className="mb-3"
          onClick={wo ? () => navigate(`/werkbon/${wo.id}`) : undefined}
        >
          <span className="text-2xl font-semibold">
            {log.tag_code ? formatTagCode(log.tag_code) : (wo?.number ?? '')}
          </span>
          <span className="block">{bike?.brand} {bike?.model}</span>
          <span className="block text-muted">
            {bike?.battery_serial} · {bike?.battery_wh} Wh
          </span>
          <span className="block text-muted">{t('accus.since')}: {dateTime(log.at)}</span>
        </Card>
      )
    })
  }

  return (
    <div>
      <BackLink to="/overzicht" labelKey="nav.overzicht" />
      <h1 className="text-3xl font-semibold mb-1">{t('accus.title')}</h1>
      <p className="text-muted mb-4">{t('accus.subtitle')}</p>

      {current.length === 0 && <Card>{t('accus.empty')}</Card>}

      {onCharger.length > 0 && (
        <>
          <SectionTitle>{t('accus.on_charger')}</SectionTitle>
          {row(onCharger)}
        </>
      )}
      {inShop.length > 0 && (
        <>
          <SectionTitle>{t('accus.in_shop')}</SectionTitle>
          {row(inShop)}
        </>
      )}
    </div>
  )
}
