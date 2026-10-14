import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, Repeat, Send } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { awaitsDelivery, deliveryErrorText, deliveryOrder, deliveryState, printDay, printMoment, todayIso, type DeliveryState } from '../lib/delivery'
import { visiblePaymentStatus } from '../lib/document'
import { formatMoney, type Invoice } from '../lib/invoice'
import { cn } from '../lib/cn'
import { Button, Field, Modal } from './ui'

const BADGE: Record<DeliveryState, string> = {
  scheduled: 'bg-[#EEF5F7] text-brand',
  ready: 'bg-[#FFF6E5] text-[#8A5A00]',
  sending: 'bg-brand/10 text-brand',
  sent: 'bg-brand text-white',
  failed: 'bg-[#F8E8E4] text-[#C0503A]',
  none: 'bg-brand-ink/6 text-brand-ink/50',
}

export function DeliveryBadge({ invoice, today = todayIso() }: { invoice: Invoice; today?: string }) {
  const { t } = useI18n()
  const state = deliveryState(invoice, today)
  if (state === 'none') return null
  return <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold', BADGE[state])}>{t(`recurring.delivery.${state}`)}</span>
}

/**
 * The invoices waiting to be emailed: scheduled for a day, ready (their day has come, or they were
 * never sent), or failed. Each can be sent at once or moved to another day.
 */
export function DeliveryQueue({ invoices }: { invoices: Invoice[] }) {
  const { deliverInvoice, scheduleInvoice, unscheduleInvoice, mail } = useAppData()
  const { t } = useI18n()
  const today = todayIso()
  const rows = useMemo(() => invoices.filter((item) => awaitsDelivery(item, today)).sort((a, b) => deliveryOrder(a, b, today)), [invoices, today])
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [date, setDate] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key)
    setNotice('')
    setError('')
    try {
      const message = await action()
      if (message) setNotice(message)
      return true
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code ? deliveryErrorText(code, t) : err instanceof Error ? err.message : t('common.error'))
      return false
    } finally {
      setBusy('')
    }
  }

  function openDate(invoice: Invoice) {
    setEditing(invoice)
    setDate(invoice.delivery?.scheduledFor && invoice.delivery.scheduledFor >= today ? invoice.delivery.scheduledFor : today)
    setTo((invoice.delivery?.to || []).join(', '))
    setCc((invoice.delivery?.cc || []).join(', '))
    setError('')
  }

  const mailReady = Boolean(mail?.mail.ready)

  return (
    <div className="border-t border-brand-ink/8">
      <p className="px-5 pt-3 text-xs leading-5 text-brand-ink/50">{t('recurring.delivery.queueHint')}</p>
      {mail && !mailReady ? (
        <p className="mx-5 mt-3 rounded-xl bg-[#FFF6E5] px-4 py-2.5 text-sm text-[#8A5A00]">
          {t('recurring.mailMissing')}{' '}
          <Link to="/app/profile#email" className="font-semibold underline underline-offset-2">
            {t('send.connectAction')}
          </Link>
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="px-5">
        {notice ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand/8 px-4 py-2.5 text-sm font-semibold text-brand">
            <Check className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        ) : null}
        {error && !editing ? <p className="mt-3 rounded-xl bg-[#F8E8E4] px-4 py-2.5 text-sm font-medium text-[#C0503A]">{error}</p> : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('recurring.delivery.empty')}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-y border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
              <tr>
                <th className="py-3 pl-5 pr-3 font-semibold">{t('recurring.delivery.number')}</th>
                <th className="px-3 py-3 font-semibold">{t('recurring.delivery.client')}</th>
                <th className="px-3 py-3 font-semibold">{t('recurring.delivery.sendOn')}</th>
                <th className="px-3 py-3 text-right font-semibold">{t('recurring.delivery.amount')}</th>
                <th className="px-3 py-3 font-semibold">{t('recurring.delivery.status')}</th>
                <th className="px-3 py-3 font-semibold">{t('recurring.delivery.payment')}</th>
                <th className="py-3 pl-3 pr-5 text-right font-semibold" aria-label={t('common.edit')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const state = deliveryState(invoice, today)
                const payment = visiblePaymentStatus(invoice)
                const delivery = invoice.delivery
                return (
                  <tr key={invoice.id} className="border-b border-brand-ink/5 align-top last:border-0">
                    <td className="whitespace-nowrap py-3 pl-5 pr-3">
                      <Link to={invoice.lifecycle === 'draft' ? `/app/invoices/${invoice.id}/edit` : `/app/invoices/${invoice.id}`} className="font-semibold text-brand hover:underline">
                        {invoice.lifecycle === 'draft' ? t('recurring.delivery.draft') : invoice.number}
                      </Link>
                      {invoice.recurring ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-ink/45">
                          <Repeat className="h-3 w-3" />
                          {t('recurring.delivery.recurringTag')} · {printDay(invoice.recurring.period)}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-3 font-medium">{invoice.client?.fullName}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-brand-ink/70">
                      {delivery?.scheduledFor ? printDay(delivery.scheduledFor) : <span className="text-brand-ink/40">{t('recurring.delivery.notScheduled')}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(Number(invoice.total) || 0, invoice.currency || 'EUR')}</td>
                    <td className="px-3 py-3">
                      <DeliveryBadge invoice={invoice} today={today} />
                      {state === 'failed' ? (
                        <span className="mt-1 block max-w-[220px] text-[11px] leading-4 text-[#C0503A]">
                          {deliveryErrorText(delivery?.lastError, t)}
                          {delivery?.nextRetryAt ? <span className="block text-brand-ink/45">{t('recurring.delivery.retryAt', { time: printMoment(delivery.nextRetryAt) })}</span> : null}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold',
                          payment === 'paid' ? 'bg-brand/10 text-brand' : payment === 'partial' ? 'bg-[#FFF6E5] text-[#8A5A00]' : 'bg-brand-ink/6 text-brand-ink/55',
                        )}
                      >
                        {payment === 'paid' ? t('invoiceList.statusPaid') : payment === 'partial' ? t('docs.statusPartial') : t('invoiceList.statusUnpaid')}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 pr-5">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          className="px-3 py-1.5 text-xs"
                          disabled={busy !== '' || state === 'sending' || !mailReady}
                          onClick={() =>
                            void run(`send:${invoice.id}`, async () => {
                              const sent = await deliverInvoice(invoice.id)
                              return t('recurring.delivery.sentOk', { number: sent.number, to: (sent.emails?.[sent.emails.length - 1]?.to || []).join(', ') })
                            })
                          }
                        >
                          <Send className="h-3.5 w-3.5" />
                          {busy === `send:${invoice.id}` ? t('send.sending') : t('recurring.delivery.sendNow')}
                        </Button>
                        <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy !== '' || state === 'sending'} onClick={() => openDate(invoice)}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {delivery?.scheduledFor ? t('recurring.delivery.changeDate') : t('recurring.delivery.schedule')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <Modal
          size="sm"
          title={t('recurring.delivery.dateTitle', { number: editing.lifecycle === 'draft' ? t('recurring.delivery.draft') : editing.number })}
          onClose={() => setEditing(null)}
          footer={
            <>
              {editing.delivery?.status === 'scheduled' || editing.delivery?.status === 'failed' ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto"
                  disabled={busy !== ''}
                  onClick={() =>
                    void run('unschedule', async () => {
                      await unscheduleInvoice(editing.id)
                      setEditing(null)
                    })
                  }
                >
                  {t('recurring.delivery.unschedule')}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={busy !== '' || !date}
                onClick={() =>
                  void run('date', async () => {
                    await scheduleInvoice(editing.id, { date, to, cc })
                    setEditing(null)
                  })
                }
              >
                {t('recurring.delivery.saveDate')}
              </Button>
            </>
          }
        >
          <div className="bg-white p-6">
            <Field label={t('recurring.delivery.date')} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            <Field label={t('send.to')} type="text" inputMode="email" value={to} placeholder={editing.client?.email || t('recurring.delivery.toPlaceholder')} onChange={(e) => setTo(e.target.value)} />
            <Field label={t('send.cc')} type="text" inputMode="email" value={cc} placeholder={t('send.ccPlaceholder')} onChange={(e) => setCc(e.target.value)} />
            {error ? <p className="text-sm text-[#C0503A]">{error}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
