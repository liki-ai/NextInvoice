import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, Plus, Tag, FileText, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, TextArea } from '../../components/ui'
import {
  buildInvoiceHtml,
  computeTotals,
  formatDateForInvoice,
  formatMoney,
  generateId,
  generateInvoiceNumber,
  toNumber,
  type InvoiceItem,
} from '../../lib/invoice'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

function emptyItem(): InvoiceItem {
  return { id: generateId(), description: 'Fustan Solemn / Dress', quantity: '1', unitPrice: '80' }
}

export function InvoiceFormPage() {
  const { invoiceId } = useParams()
  const { invoices, profile, createInvoice, updateInvoice } = useAppData()
  const { t, dict } = useI18n()
  const navigate = useNavigate()
  const existing = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null
  const isEditing = Boolean(invoiceId)

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [aiText, setAiText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [client, setClient] = useState(
    existing?.client || { fullName: '', address: '', phone: '' },
  )
  const [invoiceNumber, setInvoiceNumber] = useState(
    () => existing?.number || generateInvoiceNumber(invoices),
  )
  const [date, setDate] = useState(() => existing?.date || formatDateForInvoice(new Date()))
  const [items, setItems] = useState<InvoiceItem[]>(
    () =>
      existing?.items?.length
        ? existing.items.map((it) => ({
            id: it.id || generateId(),
            description: it.description || '',
            quantity: String(it.quantity ?? '1'),
            unitPrice: String(it.unitPrice ?? ''),
          }))
        : [emptyItem()],
  )
  const [discount, setDiscount] = useState(String(existing?.discount ?? '0'))
  const [notes, setNotes] = useState(existing?.notes || '')
  const [showDiscount, setShowDiscount] = useState(Number(existing?.discount) > 0)
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes))
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!existing) return
    setClient(existing.client || { fullName: '', address: '', phone: '' })
    setInvoiceNumber(existing.number)
    setDate(existing.date)
    setItems(
      existing.items?.length
        ? existing.items.map((it) => ({
            id: it.id || generateId(),
            description: it.description || '',
            quantity: String(it.quantity ?? '1'),
            unitPrice: String(it.unitPrice ?? ''),
          }))
        : [emptyItem()],
    )
    setDiscount(String(existing.discount ?? '0'))
    setNotes(existing.notes || '')
    setShowDiscount(Number(existing.discount) > 0)
    setShowNotes(Boolean(existing.notes))
  }, [existing?.id])

  const currency = profile?.currency || 'EUR'
  const { subtotal, total } = computeTotals(items, discount)
  const saveLabel = isEditing ? t('newInvoice.saveChanges') : t('newInvoice.saveAndShare')

  const draft = useMemo(
    () => ({
      number: invoiceNumber,
      date,
      client,
      items,
      discount,
      notes,
      subtotal,
      total,
    }),
    [invoiceNumber, date, client, items, discount, notes, subtotal, total],
  )

  const previewHtml = useMemo(() => {
    if (!preview || !profile) return ''
    return buildInvoiceHtml({
      company: profile,
      client,
      invoice: draft,
      pdfLabels: dict.pdf,
    })
  }, [preview, profile, client, draft, dict.pdf])

  function updateItem(id: string, field: keyof InvoiceItem, value: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)))
  }

  async function extractClient() {
    if (!aiText.trim()) return
    setExtracting(true)
    setError('')
    try {
      const result = await api<{ fullName?: string; address?: string; phone?: string }>('/api/extract-client', {
        method: 'POST',
        body: { text: aiText },
      })
      setClient({
        fullName: result.fullName || '',
        address: result.address || '',
        phone: result.phone || '',
      })
    } catch {
      setError(t('newInvoice.aiExtractError'))
    } finally {
      setExtracting(false)
    }
  }

  function validate() {
    if (!client.fullName.trim()) {
      setError(t('newInvoice.validationClient'))
      return null
    }
    const validItems = items.filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0)
    if (validItems.length === 0) {
      setError(t('newInvoice.validationItems'))
      return null
    }
    const totals = computeTotals(validItems, discount)
    return {
      number: invoiceNumber,
      date,
      client,
      items: validItems,
      discount,
      notes,
      subtotal: totals.subtotal,
      total: totals.total,
    }
  }

  async function onSave() {
    const invoice = validate()
    if (!invoice) return
    setSaving(true)
    setError('')
    try {
      if (isEditing && invoiceId) {
        await updateInvoice(invoiceId, invoice)
        navigate(`/app/invoices/${invoiceId}`)
      } else {
        const saved = await createInvoice(invoice)
        navigate(`/app/invoices/${saved.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-medium">
        {isEditing ? t('newInvoice.editTitle') : t('newInvoice.title')}
      </h1>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-full bg-white p-1 ring-1 ring-brand-ink/10">
        {(['manual', 'ai'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'rounded-full py-2 text-sm font-bold',
              mode === value ? 'bg-brand text-white' : 'text-brand-ink/60',
            )}
          >
            {value === 'manual' ? t('newInvoice.modeManual') : t('newInvoice.modeAi')}
          </button>
        ))}
      </div>

      {mode === 'ai' ? (
        <Card className="mt-4">
          <TextArea
            label={t('newInvoice.aiInputLabel')}
            rows={4}
            placeholder={t('newInvoice.aiInputPlaceholder')}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
          />
          <Button type="button" disabled={!aiText.trim() || extracting} onClick={extractClient}>
            {extracting ? t('newInvoice.aiExtracting') : t('newInvoice.aiExtractButton')}
          </Button>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">{t('newInvoice.clientSectionTitle')}</h2>
        <Field label={t('newInvoice.fullName')} value={client.fullName} onChange={(e) => setClient((c) => ({ ...c, fullName: e.target.value }))} />
        <Field label={t('newInvoice.address')} value={client.address} onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))} />
        <Field label={t('newInvoice.phone')} value={client.phone} onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))} />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">{t('newInvoice.invoiceDetailsSectionTitle')}</h2>
        <Field label={t('newInvoice.invoiceNumber')} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <Field label={t('newInvoice.date')} value={date} onChange={(e) => setDate(e.target.value)} />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">{t('newInvoice.itemsSectionTitle')}</h2>
        {items.map((item, idx) => (
          <div key={item.id} className="mb-3 rounded-xl border border-brand-ink/10 bg-brand-bg/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-brand-ink/50">#{idx + 1}</span>
              {items.length > 1 ? (
                <button type="button" onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}>
                  <Trash2 className="h-4 w-4 text-[#C0503A]" />
                </button>
              ) : null}
            </div>
            <Field label={t('newInvoice.itemDescription')} value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('newInvoice.itemQuantity')} value={String(item.quantity)} onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} />
              <Field label={t('newInvoice.itemUnitPrice')} value={String(item.unitPrice)} onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)} />
            </div>
            <p className="text-xs text-brand-ink/50">
              {t('newInvoice.itemTotal')}: {formatMoney(toNumber(item.quantity) * toNumber(item.unitPrice), currency)}
            </p>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand">
            <Plus className="h-4 w-4" /> {t('newInvoice.addItem')}
          </button>
          {!showDiscount ? (
            <button type="button" onClick={() => setShowDiscount(true)} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand">
              <Tag className="h-4 w-4" /> {t('newInvoice.showDiscount')}
            </button>
          ) : null}
          {!showNotes ? (
            <button type="button" onClick={() => setShowNotes(true)} className="inline-flex items-center gap-1 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand">
              <FileText className="h-4 w-4" /> {t('newInvoice.showNotes')}
            </button>
          ) : null}
        </div>
      </Card>

      <Card className="mt-4">
        {showDiscount ? (
          <Field label={t('newInvoice.discount')} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        ) : null}
        {showNotes ? (
          <TextArea label={t('newInvoice.notes')} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        ) : null}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-brand-ink/60">
            <span>{t('newInvoice.subtotal')}</span>
            <span>{formatMoney(subtotal, currency)}</span>
          </div>
          {showDiscount && toNumber(discount) > 0 ? (
            <div className="flex justify-between text-brand-ink/60">
              <span>{t('newInvoice.discount')}</span>
              <span>{formatMoney(toNumber(discount), currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold">
            <span>{t('newInvoice.total')}</span>
            <span>{formatMoney(total, currency)}</span>
          </div>
        </div>
      </Card>

      {error ? <p className="mt-3 text-sm text-[#C0503A]">{error}</p> : null}

      <div className="mt-5 mb-10 flex gap-3">
        <Button type="button" variant="secondary" onClick={() => (validate() ? setPreview(true) : null)}>
          <Eye className="h-4 w-4" />
          {t('newInvoice.preview')}
        </Button>
        <Button type="button" className="flex-1" disabled={saving} onClick={onSave}>
          {saving ? t('common.loading') : saveLabel}
        </Button>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-brand-ink/10 px-4 py-3">
            <h2 className="font-bold">{t('newInvoice.previewTitle')}</h2>
            <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
              {t('common.close')}
            </Button>
          </div>
          <iframe title="preview" className="min-h-0 flex-1" srcDoc={previewHtml} />
          <div className="flex gap-3 border-t border-brand-ink/10 p-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPreview(false)}>
              {t('common.close')}
            </Button>
            <Button type="button" className="flex-[1.4]" disabled={saving} onClick={onSave}>
              {saveLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
