import { useNavigate } from 'react-router-dom'
import type { WorkOrder } from '../lib/types'
import * as db from '../lib/db'
import { formatTagCode } from '../lib/code'
import { daysSince, money } from '../lib/format'
import { exceedsApprovedLimit, statusSince, STUCK_DAYS } from '../lib/workflow'
import { useT } from '../i18n'
import { Card } from './ui'

/** Kaart op het werkplaatsscherm (sectie 7.1). De hele kaart is één knop. */
export function WorkOrderCard({ wo }: { wo: WorkOrder }) {
  const t = useT()
  const navigate = useNavigate()
  const bike = db.bike(wo.bike_id)
  const customer = db.customer(wo.customer_id)
  const days = daysSince(statusSince(wo))
  const stuck = days > STUCK_DAYS
  const photo = wo.photos[0] ?? bike?.photos[0]

  return (
    <Card onClick={() => navigate(`/werkbon/${wo.id}`)} className="mb-3">
      <div className="flex gap-4">
        {photo ? (
          <img
            src={photo.data_url}
            alt=""
            className="w-20 h-20 object-cover rounded-xl border-2 border-line shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl border-2 border-line bg-shell shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-3xl font-semibold tracking-wide">
              {wo.tag_code ? formatTagCode(wo.tag_code) : wo.number}
            </span>
            {wo.priority === 'spoed' && (
              <span className="text-sm font-semibold px-3 py-1 rounded-lg bg-[#FBEAE9] border-2 border-danger text-[#7A1610]">
                {t('priority.spoed')}
              </span>
            )}
          </div>
          <p className="font-semibold">
            {bike?.brand} {bike?.model}
          </p>
          <p>{customer ? `${customer.first_name} ${customer.last_name}` : t('common.unknown_customer')}</p>
          <p className="text-muted truncate">{wo.complaint}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className={stuck ? 'text-danger font-semibold' : ''}>
              {days === 0 ? t('common.today') : days === 1 ? t('common.day_here') : t('common.days_here', { days })}
            </span>
            <span>
              {wo.rack_location
                ? `${t('werkplaats.rack')}: ${wo.rack_location}`
                : t('werkplaats.no_rack')}
            </span>
            {wo.total_incl_vat_cents > 0 && <span>{money(wo.total_incl_vat_cents)}</span>}
          </p>
          {exceedsApprovedLimit(wo) && (
            <p className="mt-2 flex items-start gap-2 text-danger font-semibold">
              <span aria-hidden="true">⚠</span>
              <span>{t('werkplaats.over_limit')}</span>
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
