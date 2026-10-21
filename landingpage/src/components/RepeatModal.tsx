import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { parseLooseDate } from '../lib/document'
import { DEFAULT_REPEAT, FREQUENCIES, firstRepeat, planFromInvoice, type Frequency, type RepeatSettings, type SendMode } from '../lib/recurring'
import { formatDateForInvoice, type Invoice } from '../lib/invoice'
import { Button, Modal } from './ui'

/** A row of buttons, one of them chosen: how often the invoice repeats, and how it is sent. */
function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${value === option.value ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/65 hover:border-brand/30'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Making an invoice recurring: how often and how the next ones are sent, with when the next one
 * comes. `start` is the invoice's date, the first period. The form only keeps the choice (the plan
 * starts when the invoice is saved); an invoice already saved starts its plan from here.
 */
export function RepeatModal({
  start,
  clientEmail,
  initial,
  note,
  warning,
  confirmLabel,
  busy = false,
  error = '',
  onConfirm,
  onClose,
}: {
  start: Date | null
  clientEmail: string
  initial: RepeatSettings
  /** A line under the next date, e.g. that the plan starts on saving. */
  note?: string
  /** Why the plan cannot start; the confirm button is off while it shows. */
  warning?: string
  confirmLabel: string
  busy?: boolean
  error?: string
  onConfirm: (settings: RepeatSettings) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency)
  const [sendMode, setSendMode] = useState<SendMode>(initial.sendMode)
  const next = start ? firstRepeat(start, frequency) : null
  const nextText = next
    ? next.now
      ? t(sendMode === 'auto' ? 'recurring.repeatNowAuto' : 'recurring.repeatNowManual', { date: formatDateForInvoice(next.date) })
      : t(sendMode === 'auto' ? 'recurring.repeatNextAuto' : 'recurring.repeatNextManual', { date: formatDateForInvoice(next.date) })
    : ''

  return (
    <Modal
      title={t('recurring.repeat')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" disabled={busy || Boolean(warning)} onClick={() => onConfirm({ frequency, sendMode })}>
            <Repeat className="h-4 w-4" />
            {busy ? t('common.loading') : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5 bg-white p-6">
        <p className="text-sm leading-6 text-brand-ink/60">{t('recurring.repeatHint')}</p>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('recurring.frequency')}</p>
          <Choice options={FREQUENCIES.map((value) => ({ value, label: t(`recurring.${value}`) }))} value={frequency} onChange={setFrequency} />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('recurring.sendMode')}</p>
          <Choice
            options={[
              { value: 'auto' as const, label: t('recurring.sendAuto') },
              { value: 'manual' as const, label: t('recurring.sendManual') },
            ]}
            value={sendMode}
            onChange={setSendMode}
          />
        </div>
        {nextText ? <p className="rounded-xl bg-brand-bg px-4 py-3 text-sm leading-6 text-brand-ink/75">{nextText}</p> : null}
        {note ? <p className="text-xs leading-5 text-brand-ink/50">{note}</p> : null}
        {sendMode === 'auto' && !clientEmail.trim() ? <p className="text-sm leading-6 text-[#8A5A00]">{t('recurring.repeatNoEmail')}</p> : null}
        {warning ? <p className="rounded-xl bg-[#FFF6E5] px-4 py-3 text-sm leading-6 text-[#8A5A00]">{warning}</p> : null}
        <div role="alert">{error ? <p className="text-sm leading-6 text-[#C0503A]">{error}</p> : null}</div>
      </div>
    </Modal>
  )
}

/** The plan's message for a failed start, in the user's language when there is one. */
function planError(err: unknown, t: (key: string) => string) {
  const code = (err as { code?: string } | null)?.code
  const key = `recurring.err.${code}`
  if (code && t(key) !== key) return t(key)
  return err instanceof Error ? err.message : t('common.error')
}

/**
 * Making a saved invoice recurring, from its page or its form: a button that opens the modal and
 * starts the plan with this invoice as its first period. An invoice a plan already has shows that
 * instead, as a link to the plans.
 */
export function RepeatInvoiceButton({ invoice, compact = false }: { invoice: Invoice; compact?: boolean }) {
  const { profile, clients, syncInvoices } = useAppData()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)

  if (invoice.lifecycle === 'cancelled' || invoice.status === 'cancelled') return null
  const chip = cn(
    'inline-flex items-center justify-center gap-2 font-semibold transition',
    compact ? 'rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm text-brand hover:bg-brand/10' : 'rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm hover:border-brand/30 hover:bg-brand/5',
  )
  if (invoice.recurring || started) {
    return (
      <Link to="/app/invoices/settings/recurring" className={chip} title={started ? t('recurring.repeatStarted') : undefined}>
        <Repeat className="h-4 w-4 text-brand" />
        {t('recurring.repeatOn')}
      </Link>
    )
  }

  // Imported invoices may carry only the client's name: the one saved client of that name is theirs.
  const name = String(invoice.client?.fullName || '').trim().toLowerCase()
  const sameName = name ? clients.filter((item) => String(item.fullName || '').trim().toLowerCase() === name) : []
  const clientId = invoice.clientId || invoice.client?.id || (sameName.length === 1 ? sameName[0].id : '')
  const start = parseLooseDate(invoice.date)

  async function onStart(settings: RepeatSettings) {
    if (!start) return
    setBusy(true)
    setError('')
    try {
      const due = invoice.dueDate ? parseLooseDate(invoice.dueDate) : null
      await api('/api/recurring', { method: 'POST', body: planFromInvoice({ ...invoice, clientId }, start, settings, invoice.currency || profile?.currency || 'EUR', due) })
      setStarted(true)
      setOpen(false)
      await syncInvoices().catch(() => undefined)
    } catch (err) {
      setError(planError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={chip}>
        <Repeat className="h-4 w-4 text-brand" />
        {t('recurring.repeatMake')}
      </button>
      {open ? (
        <RepeatModal
          start={start}
          clientEmail={String(invoice.client?.email || '')}
          initial={DEFAULT_REPEAT}
          warning={clientId ? undefined : t('recurring.repeatNoClient')}
          confirmLabel={t('recurring.repeatStart')}
          busy={busy}
          error={error}
          onConfirm={(settings) => void onStart(settings)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
