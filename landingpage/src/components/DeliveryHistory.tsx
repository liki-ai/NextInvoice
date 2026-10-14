import { History } from 'lucide-react'
import { useI18n } from '../i18n'
import { deliveryErrorText, deliveryState, printDay, printMoment, todayIso } from '../lib/delivery'
import { formatMoney, type Invoice } from '../lib/invoice'
import { DeliveryBadge } from './DeliveryQueue'
import { Card } from './ui'

/** The invoice's way out and what followed: scheduled, sent, failed, paid, notified, newest first. */
export function DeliveryHistory({ invoice }: { invoice: Invoice }) {
  const { t } = useI18n()
  const events = [...(invoice.events || [])].reverse()
  const delivery = invoice.delivery
  const state = deliveryState(invoice, todayIso())
  if (!events.length && !delivery) return null

  const describe = (type: string, detail: Record<string, unknown> = {}) => {
    const key = `recurring.events.${type}`
    const text = t(key, {
      period: printDay(String(detail.period || '')),
      date: printDay(String(detail.date || '')),
      to: Array.isArray(detail.to) ? (detail.to as string[]).join(', ') : '',
      error: deliveryErrorText(String(detail.code || ''), t),
      amount: typeof detail.amount === 'number' ? formatMoney(detail.amount, invoice.currency || 'EUR') : '',
    })
    return text === key ? type : text
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">
          <History className="h-3.5 w-3.5" />
          {t('recurring.delivery.historyTitle')}
        </h2>
        <DeliveryBadge invoice={invoice} />
      </div>
      {delivery?.scheduledFor && (state === 'scheduled' || state === 'ready') ? (
        <p className="mt-2 text-sm text-brand-ink/70">
          {t('recurring.events.scheduled', { date: printDay(delivery.scheduledFor) })}
          {delivery.to?.length ? ` · ${delivery.to.join(', ')}` : ''}
        </p>
      ) : null}
      {state === 'failed' && delivery?.lastError ? <p className="mt-2 text-sm text-[#C0503A]">{deliveryErrorText(delivery.lastError, t)}</p> : null}
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-brand-ink/50">{t('recurring.delivery.noHistory')}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {events.slice(0, 30).map((entry, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span className="w-[132px] shrink-0 tabular-nums text-xs leading-5 text-brand-ink/45">{printMoment(entry.at)}</span>
              <span className="min-w-0 break-words text-brand-ink/75">{describe(entry.type, entry.detail)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
