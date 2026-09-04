import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal, TextArea } from '../../components/ui'
import {
  buildInvoiceHtml,
  computeTotals,
  formatDateForInvoice,
  formatMoney,
  generateId,
  generateInvoiceNumber,
  uniqueClients,
  draftFromInvoice,
  toNumber,
  type InvoiceItem,
  type InvoiceStatus,
} from '../../lib/invoice'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { localizeCompanyProfile } from '../../lib/companySamples'

function emptyItem(): InvoiceItem {
  return { id: generateId(), description: '', quantity: '1', unitPrice: '' }
}

export function InvoiceFormPage() {
  const { invoiceId } = useParams()
  const { invoices, profile, createInvoice, updateInvoice } = useAppData()
  const { t, dict } = useI18n()
  const navigate = useNavigate()
  const existing = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null
  const isEditing = Boolean(invoiceId)
  const location = useLocation()

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [aiText, setAiText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [client, setClient] = useState(existing?.client || { fullName: '', address: '', phone: '' })
  const [invoiceNumber, setInvoiceNumber] = useState(() => existing?.number || generateInvoiceNumber(invoices))
  const [date, setDate] = useState(() => existing?.date || formatDateForInvoice(new Date()))
  const [dueDate, setDueDate] = useState(() => existing?.dueDate || '')
  const [status, setStatus] = useState<InvoiceStatus>(() => existing?.status || 'unpaid')
  const [items, setItems] = useState<InvoiceItem[]>(() =>
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
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!existing) return
    setClient(existing.client || { fullName: '', address: '', phone: '' })
    setInvoiceNumber(existing.number)
    setDate(existing.date)
    setDueDate(existing.dueDate || '')
    setStatus(existing.status || 'unpaid')
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
  }, [existing?.id])

  useEffect(() => {
    if (isEditing) return
    const duplicateFromId = ((location as any).state as { duplicateFromId?: string } | undefined)?.duplicateFromId
    if (!duplicateFromId) return
    const source = invoices.find((inv) => inv.id === duplicateFromId)
    if (!source) return

    const draftCopy = draftFromInvoice(source, invoices)
    setClient({ ...draftCopy.client })
    setInvoiceNumber(draftCopy.number)
    setDate(draftCopy.date)
    setDueDate(draftCopy.dueDate || '')
    setStatus(draftCopy.status || 'unpaid')
    setItems(
      (source.items || []).map((it) => ({
        id: generateId(),
        description: it.description || '',
        quantity: String(it.quantity ?? '1'),
        unitPrice: String(it.unitPrice ?? ''),
      })),
    )
    setDiscount(String(source.discount ?? '0'))
    setNotes(source.notes || '')
  }, [isEditing, (location as any).state, invoices])

  const currency = profile?.currency || 'EUR'
  const { subtotal, total } = computeTotals(items, discount)
  const saveLabel = isEditing ? t('newInvoice.saveChanges') : t('newInvoice.saveAndShare')
  const recentClients = useMemo(() => uniqueClients(invoices), [invoices])

  const draft = useMemo(
    () => ({
      number: invoiceNumber,
      date,
      dueDate,
      status,
      client,
      items,
      discount,
      notes,
      subtotal,
      total,
    }),
    [invoiceNumber, date, dueDate, status, client, items, discount, notes, subtotal, total],
  )

  const previewHtml = useMemo(() => {
    if (!preview || !profile) return ''
    return buildInvoiceHtml({
      company: localizeCompanyProfile(profile, t),
      client,
      invoice: draft,
      pdfLabels: dict.pdf,
    })
  }, [preview, profile, client, draft, dict.pdf, t])

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
      dueDate,
      status,
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
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message)
      if (message.toLowerCase().includes('free plan') || message.toLowerCase().includes('upgrade')) {
        navigate('/app/upgrade')
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-brand-ink/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15'

  return (
    <div>
      <Link to="/app" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('nav.invoices')}
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          {isEditing ? t('newInvoice.editTitle') : t('newInvoice.title')}
        </h1>
        <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-brand-ink/10">
          {(['manual', 'ai'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold',
                mode === value ? 'bg-brand text-white' : 'text-brand-ink/55 hover:text-brand-ink',
              )}
            >
              {value === 'manual' ? t('newInvoice.modeManual') : t('newInvoice.modeAi')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'ai' ? (
        <Card className="mt-6">
          <TextArea
            label={t('newInvoice.aiInputLabel')}
            rows={3}
            placeholder={t('newInvoice.aiInputPlaceholder')}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
          />
          <Button type="button" disabled={!aiText.trim() || extracting} onClick={extractClient}>
            {extracting ? t('newInvoice.aiExtracting') : t('newInvoice.aiExtractButton')}
          </Button>
        </Card>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">{t('newInvoice.clientSectionTitle')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label={t('newInvoice.fullName')}
                  value={client.fullName}
                  placeholder={t('newInvoice.phFullName')}
                  list="recentClientNames"
                  onChange={(e) => {
                    const value = e.target.value
                    const match = recentClients.find((c) => c.fullName.trim().toLowerCase() === value.trim().toLowerCase())
                    setClient((c) => ({
                      ...c,
                      fullName: value,
                      ...(match ? { address: match.address, phone: match.phone } : {}),
                    }))
                  }}
                />
                <datalist id="recentClientNames">
                  {recentClients.map((c) => (
                    <option key={c.fullName} value={c.fullName} />
                  ))}
                </datalist>
              </div>
              <Field label={t('newInvoice.address')} value={client.address} placeholder={t('newInvoice.phAddress')} onChange={(e) => setClient((c) => ({ ...c, address: e.target.value }))} />
              <Field label={t('newInvoice.phone')} value={client.phone} placeholder={t('newInvoice.phPhone')} onChange={(e) => setClient((c) => ({ ...c, phone: e.target.value }))} />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-brand-ink/8 px-6 py-4">
              <h2 className="font-semibold">{t('newInvoice.itemsSectionTitle')}</h2>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
              >
                <Plus className="h-4 w-4" /> {t('newInvoice.addItem')}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">{t('newInvoice.itemDescription')}</th>
                    <th className="w-24 px-3 py-3 text-left font-semibold">{t('newInvoice.itemQuantity')}</th>
                    <th className="w-32 px-3 py-3 text-left font-semibold">{t('newInvoice.itemUnitPrice')}</th>
                    <th className="w-28 px-3 py-3 text-right font-semibold">{t('newInvoice.itemTotal')}</th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-brand-ink/5">
                      <td className="px-4 py-2">
                        <input className={inputClass} value={item.description} placeholder={t('newInvoice.phItemDescription')} onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={inputClass} value={String(item.quantity)} onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={inputClass} value={String(item.unitPrice)} onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMoney(toNumber(item.quantity) * toNumber(item.unitPrice), currency)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {items.length > 1 ? (
                          <button type="button" onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}>
                            <Trash2 className="h-4 w-4 text-[#C0503A]" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8">
          <Card>
            <h2 className="mb-4 font-semibold">{t('newInvoice.invoiceDetailsSectionTitle')}</h2>
            <Field label={t('newInvoice.invoiceNumber')} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <Field label={t('newInvoice.date')} value={date} onChange={(e) => setDate(e.target.value)} />
            <Field label={t('newInvoice.dueDate')} value={dueDate} placeholder={t('newInvoice.phDueDate')} onChange={(e) => setDueDate(e.target.value)} />
            <Field label={t('newInvoice.discount')} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <TextArea label={t('newInvoice.notes')} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-brand-ink/55">
                <span>{t('newInvoice.subtotal')}</span>
                <span>{formatMoney(subtotal, currency)}</span>
              </div>
              {toNumber(discount) > 0 ? (
                <div className="flex justify-between text-brand-ink/55">
                  <span>{t('newInvoice.discount')}</span>
                  <span>{formatMoney(toNumber(discount), currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-brand-ink/10 pt-3 font-display text-2xl font-medium">
                <span>{t('newInvoice.total')}</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
            </div>
            {error ? <p className="mt-4 text-sm text-[#C0503A]">{error}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              <Button type="button" variant="secondary" onClick={() => (validate() ? setPreview(true) : null)}>
                <Eye className="h-4 w-4" />
                {t('newInvoice.preview')}
              </Button>
              <Button type="button" disabled={saving} onClick={onSave}>
                {saving ? t('common.loading') : saveLabel}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {preview ? (
        <Modal
          title={t('newInvoice.previewTitle')}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.close')}
              </Button>
              <Button type="button" disabled={saving} onClick={onSave}>
                {saveLabel}
              </Button>
            </>
          }
        >
          <iframe title="preview" className="h-[70vh] w-full bg-white" srcDoc={previewHtml} />
        </Modal>
      ) : null}
    </div>
  )
}
