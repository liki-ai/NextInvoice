import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Select, TextArea } from '../../components/ui'
import { formatMoney } from '../../lib/invoice'
import {
  OBLIGATION_CATEGORIES,
  emptyObligationDraft,
  parseObligationAmount,
  uniqueVendors,
  type ObligationCategory,
  type ObligationStatus,
} from '../../lib/obligation'

export function ObligationFormPage() {
  const { obligationId } = useParams()
  const { obligations, invoices, profile, loading, createObligation, updateObligation, removeObligation } = useAppData()
  const { t } = useI18n()
  const navigate = useNavigate()
  const existing = obligationId ? obligations.find((item) => item.id === obligationId) : null
  const isEditing = Boolean(obligationId)
  const currency = profile?.currency || 'EUR'
  const vendors = useMemo(() => uniqueVendors(obligations), [obligations])

  const [vendor, setVendor] = useState(existing?.vendor || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [amount, setAmount] = useState(existing ? String(existing.amount ?? '') : '')
  const [date, setDate] = useState(existing?.date || emptyObligationDraft().date)
  const [dueDate, setDueDate] = useState(existing?.dueDate || '')
  const [status, setStatus] = useState<ObligationStatus>(existing?.status || 'unpaid')
  const [category, setCategory] = useState<ObligationCategory>(existing?.category || 'shipping')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [relatedInvoiceId, setRelatedInvoiceId] = useState(existing?.relatedInvoiceId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!existing) return
    setVendor(existing.vendor || '')
    setDescription(existing.description || '')
    setAmount(String(existing.amount ?? ''))
    setDate(existing.date || emptyObligationDraft().date)
    setDueDate(existing.dueDate || '')
    setStatus(existing.status || 'unpaid')
    setCategory(existing.category || 'other')
    setNotes(existing.notes || '')
    setRelatedInvoiceId(existing.relatedInvoiceId || '')
  }, [existing?.id])

  const parsedAmount = parseObligationAmount(amount)

  if (isEditing && !existing) {
    return <p className="text-brand-ink/60">{loading ? t('common.loading') : t('obligations.emptyTitle')}</p>
  }

  function validate() {
    if (!vendor.trim()) {
      setError(t('obligations.validationVendor'))
      return null
    }
    if (!(parsedAmount > 0)) {
      setError(t('obligations.validationAmount'))
      return null
    }
    return {
      vendor: vendor.trim(),
      description: description.trim(),
      amount: parsedAmount,
      date,
      dueDate,
      status,
      category,
      notes,
      relatedInvoiceId,
    }
  }

  async function onSave() {
    const payload = validate()
    if (!payload) return
    setSaving(true)
    setError('')
    try {
      if (isEditing && obligationId) {
        await updateObligation(obligationId, payload)
      } else {
        await createObligation(payload)
      }
      navigate('/app/obligations')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!obligationId) return
    if (!confirm(t('obligations.deleteConfirm'))) return
    setSaving(true)
    try {
      await removeObligation(obligationId)
      navigate('/app/obligations')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/app/obligations" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('nav.obligations')}
      </Link>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
        {isEditing ? t('obligations.editTitle') : t('obligations.newTitle')}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-brand-ink/55">{t('obligations.formHint')}</p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label={t('obligations.vendor')}
                value={vendor}
                placeholder={t('obligations.phVendor')}
                list="obligationVendors"
                onChange={(e) => setVendor(e.target.value)}
              />
              <datalist id="obligationVendors">
                {vendors.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <Field
                label={t('obligations.description')}
                value={description}
                placeholder={t('obligations.phDescription')}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Field
              label={t('invoiceList.amount')}
              value={amount}
              inputMode="decimal"
              placeholder={t('obligations.phAmount')}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Select label={t('obligations.categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value as ObligationCategory)}>
              {OBLIGATION_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`obligations.category.${value}`)}
                </option>
              ))}
            </Select>
            <Field label={t('newInvoice.date')} value={date} onChange={(e) => setDate(e.target.value)} />
            <Field
              label={t('newInvoice.dueDate')}
              value={dueDate}
              placeholder={t('newInvoice.phDueDate')}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Select label={t('obligations.status')} value={status} onChange={(e) => setStatus(e.target.value as ObligationStatus)}>
              <option value="unpaid">{t('invoiceList.statusUnpaid')}</option>
              <option value="paid">{t('invoiceList.statusPaid')}</option>
            </Select>
            <Select label={t('obligations.relatedInvoice')} value={relatedInvoiceId} onChange={(e) => setRelatedInvoiceId(e.target.value)}>
              <option value="">{t('obligations.noRelatedInvoice')}</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} · {inv.client?.fullName || ''}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <TextArea label={t('newInvoice.notes')} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="h-fit lg:sticky lg:top-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceDetail.summary')}</h2>
          <div className="mt-5 flex justify-between border-t border-brand-ink/10 pt-3 font-display text-2xl font-medium">
            <span>{t('newInvoice.total')}</span>
            <span>{formatMoney(parsedAmount, currency)}</span>
          </div>
          {error ? <p className="mt-4 text-sm text-[#C0503A]">{error}</p> : null}
          <div className="mt-5 flex flex-col gap-2">
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? t('common.loading') : isEditing ? t('newInvoice.saveChanges') : t('common.save')}
            </Button>
            {isEditing ? (
              <button
                type="button"
                disabled={saving}
                onClick={onDelete}
                className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#C0503A] hover:underline"
              >
                <Trash2 className="h-4 w-4" />
                {t('obligations.delete')}
              </button>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
