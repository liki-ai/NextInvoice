import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, Link2, Plus, StickyNote, Trash2, X } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Select, TextArea } from '../../components/ui'
import { formatDateForInvoice, formatMoney, toNumber } from '../../lib/invoice'
import {
  OBLIGATION_CATEGORIES,
  emptyObligationDraft,
  parseObligationAmount,
  purchaseLinesTotal,
  vendorSummaries,
  type ObligationCategory,
  type ObligationStatus,
  type PurchaseLine,
} from '../../lib/obligation'
import { ProofField } from '../../components/ProofField'
import { VendorPicker } from '../../components/VendorPicker'
import { DateField } from '../../components/DateField'

type LineDraft = { key: string; description: string; quantity: string; unitPrice: string }

function newLine(): LineDraft {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' }
}

function linesFrom(items?: PurchaseLine[]): LineDraft[] {
  return (items || []).map((item) => ({ key: crypto.randomUUID(), description: item.description || '', quantity: String(item.quantity ?? ''), unitPrice: String(item.unitPrice ?? '') }))
}

function toDateInputValue(display: string) {
  if (!display) return ''
  const parsed = new Date(display)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromDateInputValue(iso: string) {
  if (!iso) return ''
  return formatDateForInvoice(new Date(`${iso}T12:00:00`))
}

export function ObligationFormPage() {
  const { obligationId } = useParams()
  const { obligations, invoices, profile, loading, createObligation, updateObligation, removeObligation } = useAppData()
  const { t } = useI18n()
  const navigate = useNavigate()
  const existing = obligationId ? obligations.find((item) => item.id === obligationId) : null
  const isEditing = Boolean(obligationId)
  const currency = profile?.currency || 'EUR'
  const vendors = useMemo(() => vendorSummaries(obligations).filter((item) => item.vendor !== '—'), [obligations])

  const [vendor, setVendor] = useState(existing?.vendor || '')
  const [invoiceNumber, setInvoiceNumber] = useState(existing?.invoiceNumber || '')
  const [lines, setLines] = useState<LineDraft[]>(() => linesFrom(existing?.items))
  const [amount, setAmount] = useState(existing ? String(existing.amount ?? '') : '')
  const [date, setDate] = useState(existing?.date || emptyObligationDraft().date)
  const [dueDate, setDueDate] = useState(existing?.dueDate || '')
  const [status, setStatus] = useState<ObligationStatus>(existing?.status || 'unpaid')
  const [category, setCategory] = useState<ObligationCategory>(existing?.category || 'shipping')
  const [notes, setNotes] = useState(existing?.notes || existing?.description || '')
  const [relatedInvoiceId, setRelatedInvoiceId] = useState(existing?.relatedInvoiceId || '')
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes || existing?.description))
  const [showDueDate, setShowDueDate] = useState(Boolean(existing?.dueDate))
  const [showInvoices, setShowInvoices] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [proof, setProof] = useState({
    proofUri: existing?.proofUri || '',
    proofName: existing?.proofName || '',
    proofMime: existing?.proofMime || '',
    proofData: existing?.proofData || '',
  })

  useEffect(() => {
    if (!existing) return
    setVendor(existing.vendor || '')
    setInvoiceNumber(existing.invoiceNumber || '')
    setLines(linesFrom(existing.items))
    setAmount(String(existing.amount ?? ''))
    setDate(existing.date || emptyObligationDraft().date)
    setDueDate(existing.dueDate || '')
    setStatus(existing.status || 'unpaid')
    setCategory(existing.category || 'other')
    setNotes(existing.notes || existing.description || '')
    setRelatedInvoiceId(existing.relatedInvoiceId || '')
    setShowNotes(Boolean(existing.notes || existing.description))
    setShowDueDate(Boolean(existing.dueDate))
    setShowInvoices(false)
    setProof({
      proofUri: existing.proofUri || '',
      proofName: existing.proofName || '',
      proofMime: existing.proofMime || '',
      proofData: existing.proofData || '',
    })
  }, [existing?.id])

  // With lines that come to something, the amount is their sum; otherwise it is typed.
  const filledLines = lines.filter((line) => line.description.trim() || toNumber(line.quantity) * toNumber(line.unitPrice))
  const linesTotal = purchaseLinesTotal(filledLines)
  const fromLines = linesTotal > 0
  const parsedAmount = fromLines ? linesTotal : parseObligationAmount(amount)
  // The line just added gets the cursor, so a supplier's invoice can be typed in line after line.
  const [focusKey, setFocusKey] = useState('')

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }
  function addLine() {
    const line = newLine()
    setLines((prev) => [...prev, line])
    setFocusKey(line.key)
  }
  const relatedInvoice = invoices.find((inv) => inv.id === relatedInvoiceId)

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
      invoiceNumber: invoiceNumber.trim(),
      items: filledLines.map((line) => ({ description: line.description.trim(), quantity: toNumber(line.quantity), unitPrice: toNumber(line.unitPrice) })),
      description: notes.trim(),
      amount: parsedAmount,
      date,
      dueDate,
      status,
      category,
      notes: notes.trim(),
      relatedInvoiceId,
      ...proof,
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

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 mb-1">
              <VendorPicker
                label={t('obligations.vendor')}
                value={vendor}
                onChange={setVendor}
                options={vendors}
                currency={currency}
                placeholder={t('purchases.pickVendor')}
                autoFocus={!isEditing}
              />
            </div>
            <Field
              label={t('purchases.invoiceNumber')}
              value={invoiceNumber}
              placeholder={t('purchases.phInvoiceNumber')}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
            <DateField label={t('purchases.invoiceDate')} pickLabel={t('purchases.pickDate')} value={date} onChange={setDate} />
            <Select label={t('obligations.categoryLabel')} value={category} onChange={(e) => setCategory(e.target.value as ObligationCategory)}>
              {OBLIGATION_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`obligations.category.${value}`)}
                </option>
              ))}
            </Select>
            <Select label={t('obligations.status')} value={status} onChange={(e) => setStatus(e.target.value as ObligationStatus)}>
              <option value="unpaid">{t('invoiceList.statusUnpaid')}</option>
              <option value="paid">{t('invoiceList.statusPaid')}</option>
            </Select>

            <div className="sm:col-span-2 border-t border-brand-ink/8 pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('purchases.items')}</h2>
                {lines.length === 0 ? <p className="text-xs text-brand-ink/45">{t('purchases.itemsHint')}</p> : null}
              </div>
              {lines.length > 0 ? (
                <div className="mt-3">
                  <div className="hidden grid-cols-[minmax(0,1fr)_80px_110px_110px_36px] gap-2 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40 sm:grid">
                    <span>{t('purchases.item')}</span>
                    <span className="text-right">{t('purchases.quantity')}</span>
                    <span className="text-right">{t('purchases.price')}</span>
                    <span className="text-right">{t('purchases.lineTotal')}</span>
                    <span />
                  </div>
                  <div className="space-y-2">
                    {lines.map((line, index) => {
                      const cell = 'w-full rounded-xl border border-brand-ink/10 bg-white px-3 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand focus:ring-2 focus:ring-brand/15'
                      return (
                        <div key={line.key} className="grid grid-cols-[1fr_1fr_1fr_36px] items-center gap-2 rounded-xl bg-brand-bg/60 p-2 sm:grid-cols-[minmax(0,1fr)_80px_110px_110px_36px] sm:bg-transparent sm:p-0">
                          <input
                            autoFocus={line.key === focusKey}
                            value={line.description}
                            placeholder={t('purchases.phItem')}
                            aria-label={t('purchases.item')}
                            onChange={(e) => setLine(line.key, { description: e.target.value })}
                            className={`${cell} col-span-4 sm:col-span-1`}
                          />
                          <input
                            value={line.quantity}
                            inputMode="decimal"
                            aria-label={t('purchases.quantity')}
                            onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                            className={`${cell} text-right tabular-nums`}
                          />
                          <input
                            value={line.unitPrice}
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={t('purchases.price')}
                            onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && index === lines.length - 1) {
                                e.preventDefault()
                                addLine()
                              }
                            }}
                            className={`${cell} text-right tabular-nums`}
                          />
                          <span className="pr-1 text-right text-sm font-semibold tabular-nums">
                            {formatMoney(Math.round(toNumber(line.quantity) * toNumber(line.unitPrice) * 100) / 100, currency)}
                          </span>
                          <button
                            type="button"
                            title={t('purchases.removeLine')}
                            aria-label={t('purchases.removeLine')}
                            onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-ink/40 hover:bg-[#F8E8E4] hover:text-[#C0503A]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={addLine}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
              >
                <Plus className="h-4 w-4" />
                {t('purchases.addLine')}
              </button>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              {fromLines ? (
                <div className="w-full sm:w-64">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('invoiceList.amount')}</p>
                  <p className="mt-2.5 flex items-baseline justify-between rounded-xl border border-brand-ink/8 bg-brand-bg/70 px-3.5 py-2.5">
                    <span className="text-xs text-brand-ink/50">{t('purchases.amountFromLines')}</span>
                    <span className="text-sm font-bold tabular-nums">{formatMoney(linesTotal, currency)}</span>
                  </p>
                </div>
              ) : (
                <Field
                  wrapperClassName="w-full sm:w-64"
                  label={t('invoiceList.amount')}
                  value={amount}
                  inputMode="decimal"
                  placeholder={t('obligations.phAmount')}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right tabular-nums"
                />
              )}
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {!showDueDate ? (
                <button
                  type="button"
                  onClick={() => setShowDueDate(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
                >
                  <Calendar className="h-4 w-4" />
                  {t('obligations.addDueDate')}
                </button>
              ) : null}
              {!showNotes ? (
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
                >
                  <StickyNote className="h-4 w-4" />
                  {t('obligations.optionalNotes')}
                </button>
              ) : null}
              {!showInvoices ? (
                <button
                  type="button"
                  onClick={() => setShowInvoices(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
                >
                  <Link2 className="h-4 w-4" />
                  {relatedInvoice
                    ? `${relatedInvoice.number} · ${relatedInvoice.client?.fullName || ''}`
                    : t('obligations.noRelatedInvoice')}
                </button>
              ) : null}
            </div>

            {showDueDate ? (
              <div>
                <Field
                  label={t('newInvoice.dueDate')}
                  type="date"
                  value={toDateInputValue(dueDate)}
                  onChange={(e) => setDueDate(fromDateInputValue(e.target.value))}
                />
                {dueDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDueDate('')
                      setShowDueDate(false)
                    }}
                    className="text-xs font-semibold text-brand-ink/50 hover:text-brand"
                  >
                    {t('obligations.clearDueDate')}
                  </button>
                ) : null}
              </div>
            ) : null}

            {showNotes ? (
              <div className="sm:col-span-2">
                <TextArea
                  label={t('obligations.optionalNotes')}
                  rows={3}
                  value={notes}
                  placeholder={t('obligations.phNotes')}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            ) : null}

            {showInvoices ? (
              <div className="sm:col-span-2">
                <Select label={t('obligations.relatedInvoice')} value={relatedInvoiceId} onChange={(e) => setRelatedInvoiceId(e.target.value)}>
                  <option value="">{t('obligations.noRelatedInvoice')}</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.number} · {inv.client?.fullName || ''}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('obligations.proofTitle')}</h2>
          <ProofField
            proof={proof}
            t={t}
            onChange={(next) =>
              setProof({
                proofUri: next.proofUri || '',
                proofName: next.proofName || '',
                proofMime: next.proofMime || '',
                proofData: next.proofData || '',
              })
            }
          />
        </Card>
        </div>

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
