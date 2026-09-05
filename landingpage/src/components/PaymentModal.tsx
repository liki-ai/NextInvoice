import { useState } from 'react'
import { Button, Field, Modal } from './ui'
import { useI18n } from '../i18n'
import { remainingOf, todayInputValue, type Payment } from '../lib/document'
import { formatMoney } from '../lib/invoice'

type Payable = {
  total?: number
  amount?: number
  payments?: Payment[]
  amountDue?: number
  currency?: string
}

export function PaymentModal({
  doc,
  currency,
  onClose,
  onSave,
}: {
  doc: Payable
  currency: string
  onClose: () => void
  onSave: (payment: { amount: number; date: string; method?: string; note?: string }) => Promise<void> | Promise<unknown>
}) {
  const { t } = useI18n()
  const remaining = remainingOf(doc)
  const [amount, setAmount] = useState(remaining ? remaining.toFixed(2) : '')
  const [date, setDate] = useState(todayInputValue())
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('docs.amount'))
      return
    }
    if (value > remaining + 0.001) {
      setError(t('docs.remaining'))
      return
    }
    if (!date) {
      setError(t('docs.date'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: value, date, method, note })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('docs.recordPayment')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={saving || remaining <= 0} onClick={() => void submit()}>
            {saving ? t('common.loading') : t('docs.recordPayment')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 bg-white p-6">
        <p className="text-sm text-brand-ink/60">
          {t('docs.remaining')}: <strong>{formatMoney(remaining, currency)}</strong>
        </p>
        <Field label={t('docs.amount')} type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field label={t('docs.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label={t('docs.method')} value={method} onChange={(e) => setMethod(e.target.value)} />
        <Field label={t('docs.note')} value={note} onChange={(e) => setNote(e.target.value)} />
        {error ? <p className="text-sm text-[#C0503A]">{error}</p> : null}
      </div>
    </Modal>
  )
}
