import type { WorkOrderStatus } from '../lib/types'
import { STATUS_STYLE } from '../lib/workflow'
import { useT } from '../i18n'

/** Statusplaat: grote letters, altijd met het woord erbij, nooit alleen kleur. */
export function StatusPlate({ status, big }: { status: WorkOrderStatus; big?: boolean }) {
  const t = useT()
  const style = STATUS_STYLE[status]
  return (
    <span
      className={`inline-block rounded-xl font-semibold ${big ? 'text-2xl px-5 py-3' : 'text-sm px-3 py-2'}`}
      style={{ background: style.bg, color: style.fg }}
    >
      {t(`status.${status}`)}
    </span>
  )
}
