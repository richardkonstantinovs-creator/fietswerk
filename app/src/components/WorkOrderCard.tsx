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
            className="w-[88px] h-[88px] object-cover rounded-xl border-2 border-line shrink-0"
          />
        ) : (
          // Geen foto is ook een antwoord: een leeg vlak van dezelfde maat
          // houdt alle kaarten in de lijst op dezelfde regel beginnen.
          <div
            className="w-[88px] h-[88px] rounded-xl border-2 border-line bg-shell shrink-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#767676" strokeWidth="2">
              <circle cx="5.5" cy="16.5" r="4" />
              <circle cx="18.5" cy="16.5" r="4" />
              <path d="M5.5 16.5 10 8h5l3.5 8.5M8 8h4" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* Het bonnummer is waar iemand op zoekt als hij voor het rek staat,
              dus dat staat vooraan en het grootst. */}
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
          <p className="font-semibold leading-snug">
            {bike?.brand} {bike?.model}
          </p>
          <p className="leading-snug">
            {customer ? `${customer.first_name} ${customer.last_name}` : t('common.unknown_customer')}
          </p>
          <p className="text-muted truncate leading-snug">{wo.complaint}</p>

          {/* Hoe lang hij er staat, waar hij staat en wat hij kost: drie
              gegevens die je met één blik naast elkaar wilt zien, op één
              regel, kleiner dan de naam erboven zodat de volgorde klopt. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={stuck ? 'text-danger font-semibold' : 'text-muted'}>
              {days === 0 ? t('common.today') : days === 1 ? t('common.day_here') : t('common.days_here', { days })}
            </span>
            <span aria-hidden="true" className="text-line">·</span>
            <span className="text-muted">
              {wo.rack_location
                ? `${t('werkplaats.rack')}: ${wo.rack_location}`
                : t('werkplaats.no_rack')}
            </span>
            {wo.total_incl_vat_cents > 0 && (
              <>
                <span aria-hidden="true" className="text-line">·</span>
                <span className="font-semibold">{money(wo.total_incl_vat_cents)}</span>
              </>
            )}
          </p>
          {exceedsApprovedLimit(wo) && (
            <p className="mt-2 flex items-start gap-2 text-danger font-semibold text-sm">
              <span aria-hidden="true">⚠</span>
              <span>{t('werkplaats.over_limit')}</span>
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
