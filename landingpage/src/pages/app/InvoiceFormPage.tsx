import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Camera, Eye, ImagePlus, MapPin, Phone, Plus, Send, Trash2, UserPlus, Users } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal, TextArea } from '../../components/ui'
import { DateField } from '../../components/DateField'
import { parseLooseDate } from '../../lib/document'
import {
  buildInvoiceHtml,
  computeTotals,
  downloadHtmlAsPdf,
  formatDateForInvoice,
  formatMoney,
  generateId,
  generateInvoiceNumber,
  draftFromInvoice,
  grossFromNet,
  netFromGross,
  startingTaxRate,
  toNumber,
  type Invoice,
  type InvoiceItem,
} from '../../lib/invoice'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { localizeCompanyProfile } from '../../lib/companySamples'
import { normalizeTemplate, type InvoiceTemplateId } from '../../lib/invoiceTemplates'
import { TemplateSwitch } from '../../components/TemplateSwitch'
import { clientDisplayName, clientMatchesQuery, composeClient, findMatchingClient, frequentClients } from '../../lib/client'
import { invoiceLineFromCatalog, invoiceLinesFromExtract } from '../../lib/catalog'
import { fileToSupportedImageDataUrl } from '../../lib/proof'

/** A price as shown in its box: at most two decimals. The full value stays in the form until it is retyped. */
function shortAmount(value: string | number) {
  const raw = String(value ?? '').trim()
  if (raw === '' || /^-?\d*([.,]\d{0,2})?$/.test(raw)) return raw
  const amount = toNumber(raw)
  return Number.isFinite(amount) ? amount.toFixed(2) : raw
}

/** The lines reduced to what makes the amounts, for telling whether an issued invoice's amounts were touched. */
function lineSignature(items: { description?: string; quantity?: string | number; unitPrice?: string | number }[] | undefined) {
  return JSON.stringify((items || []).map((it) => [String(it.description || '').trim(), toNumber(it.quantity), Math.round(toNumber(it.unitPrice) * 1e6) / 1e6]))
}

function emptyItem(): InvoiceItem {
  return { id: generateId(), description: '', quantity: '1', unitPrice: '' }
}

/** A saved invoice's lines as the form edits them: with VAT added back if that is how they were typed. */
function formItems(source: { items?: Invoice['items']; taxRate?: number; pricesIncludeTax?: boolean }, freshIds = false): InvoiceItem[] {
  return (source.items || []).map((it) => ({
    id: freshIds ? generateId() : it.id || generateId(),
    description: it.description || '',
    quantity: String(it.quantity ?? '1'),
    unitPrice: source.pricesIncludeTax && String(it.unitPrice ?? '') !== '' ? String(grossFromNet(it.unitPrice, source.taxRate)) : String(it.unitPrice ?? ''),
  }))
}

export function InvoiceFormPage() {
  const { invoiceId } = useParams()
  const { invoices, clients, items: catalogItems, profile, createInvoice, updateInvoice, issueInvoice, correctInvoice, createClient } = useAppData()
  const { t, dict } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const existing = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null
  const isEditing = Boolean(invoiceId)
  const location = useLocation()
  const persistedIdRef = useRef(invoiceId || '')
  const skipAutosaveRef = useRef(false)
  const persistLock = useRef<Promise<unknown> | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef({
    client: existing?.client || { fullName: '', address: '', phone: '', email: '', businessId: '' },
    clientId: existing?.clientId || '',
    invoiceNumber: existing?.number || '',
    date: existing?.date || '',
    dueDate: existing?.dueDate || '',
    items: existing?.items || [],
    discount: String(existing?.discount ?? '0'),
    taxRate: String(existing?.taxRate ?? '0'),
    pricesIncludeTax: Boolean(existing?.pricesIncludeTax),
    notes: existing?.notes || '',
    canSaveOnly: true,
  })

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [aiText, setAiText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [aiCollapsed, setAiCollapsed] = useState(false)
  const [client, setClient] = useState(existing?.client || { fullName: '', address: '', phone: '', email: '', businessId: '' })
  const [clientId, setClientId] = useState(existing?.clientId || searchParams.get('clientId') || '')
  const [invoiceNumber, setInvoiceNumber] = useState(() => existing?.number || generateInvoiceNumber(invoices))
  const [date, setDate] = useState(() => existing?.date || formatDateForInvoice(new Date()))
  const [dueDate, setDueDate] = useState(() => existing?.dueDate || '')
  const [items, setItems] = useState<InvoiceItem[]>(() => (existing?.items?.length ? formItems(existing) : [emptyItem()]))
  // Prices typed with VAT included: the total is what was typed and the subtotal is worked back from it.
  const [pricesIncludeTax, setPricesIncludeTax] = useState(() =>
    existing ? Boolean(existing.pricesIncludeTax) : localStorage.getItem('nextinvoice.pricesIncludeTax') === '1',
  )
  const [discount, setDiscount] = useState(String(existing?.discount ?? '0'))
  const [taxRate, setTaxRate] = useState(() => String(existing?.taxRate ?? profile?.defaultTaxRate ?? 0))
  // A new invoice starts from the VAT rate in Settings, unless the rate was already set by hand.
  const taxTouched = useRef(Boolean(existing))
  // Set when the rate on screen came from the chosen client's own setting.
  const [taxFromClient, setTaxFromClient] = useState(false)

  // Choosing a client sets the VAT that client is invoiced with; it can still be changed below.
  function applyClientTax(record: { taxRate?: number | null }) {
    const start = startingTaxRate(record, profile?.defaultTaxRate)
    taxTouched.current = true
    setTaxFromClient(start.fromClient)
    setTaxRate(String(start.rate))
  }

  function clientForInvoice(record: (typeof clients)[number]) {
    return {
      fullName: clientDisplayName(record) || record.fullName || '',
      address: record.address || '',
      phone: record.phone || '',
      email: record.email || '',
      businessId: record.businessId || '',
      vatNumber: record.vatNumber || '',
      fiscalNumber: record.fiscalNumber || '',
    }
  }
  useEffect(() => {
    if (taxTouched.current || profile?.defaultTaxRate === undefined) return
    setTaxRate(String(profile.defaultTaxRate))
  }, [profile?.defaultTaxRate])
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!existing) return
    setClient(existing.client || { fullName: '', address: '', phone: '', email: '', businessId: '' })
    setClientId(existing.clientId || '')
    setInvoiceNumber(existing.number)
    setDate(existing.date)
    setDueDate(existing.dueDate || '')
    setItems(existing.items?.length ? formItems(existing) : [emptyItem()])
    setPricesIncludeTax(Boolean(existing.pricesIncludeTax))
    setDiscount(String(existing.discount ?? '0'))
    taxTouched.current = true
    setTaxRate(String(existing.taxRate ?? 0))
    setNotes(existing.notes || '')
  }, [existing?.id])

  useEffect(() => {
    if (isEditing) return
    const duplicateFromId = ((location as any).state as { duplicateFromId?: string } | undefined)?.duplicateFromId
    if (!duplicateFromId) return
    const source = invoices.find((inv) => inv.id === duplicateFromId)
    if (!source) return

    const draftCopy = draftFromInvoice(source, invoices)
    setClient({ ...draftCopy.client, email: draftCopy.client.email || '', businessId: draftCopy.client.businessId || '' })
    setClientId(source.clientId || '')
    setInvoiceNumber(draftCopy.number)
    setDate(draftCopy.date)
    setDueDate(draftCopy.dueDate || '')
    setItems(formItems(source, true))
    setPricesIncludeTax(Boolean(source.pricesIncludeTax))
    setDiscount(String(source.discount ?? '0'))
    taxTouched.current = true
    setTaxRate(String(source.taxRate ?? 0))
    setNotes(source.notes || '')
  }, [isEditing, (location as any).state, invoices])

  useEffect(() => {
    if (isEditing) return
    const id = searchParams.get('clientId')
    if (!id) return
    const match = clients.find((item) => item.id === id)
    if (!match) return
    setClientId(id)
    applyClientTax(match)
    setClient({
      vatNumber: match.vatNumber || '',
      fiscalNumber: match.fiscalNumber || '',
      fullName: clientDisplayName(match) || match.fullName || '',
      address: match.address || '',
      phone: match.phone || '',
      email: match.email || '',
      businessId: match.businessId || '',
    })
  }, [isEditing, searchParams, clients])

  const currency = profile?.currency || 'EUR'
  // The lines as they are stored and invoiced: net of VAT, whichever way they were typed.
  const netItems = useMemo(
    () => (pricesIncludeTax ? items.map((it) => (String(it.unitPrice).trim() === '' ? it : { ...it, unitPrice: netFromGross(it.unitPrice, taxRate) })) : items),
    [items, pricesIncludeTax, taxRate],
  )
  const { subtotal, total, taxAmount, taxRate: appliedTaxRate } = computeTotals(netItems, discount, taxRate)
  const issued = Boolean(existing && existing.lifecycle !== 'draft')
  const canSaveOnly = !issued
  const [correctReason, setCorrectReason] = useState('')
  // Price boxes the user has typed in show exactly what was typed; the others show two decimals.
  const [typedPrices, setTypedPrices] = useState<Set<string>>(() => new Set())
  // On an issued invoice a reason is asked only when the amounts change, not for a new date.
  const amountsChanged = useMemo(() => {
    if (!issued || !existing) return false
    const before = computeTotals(existing.items || [], existing.discount, existing.taxRate)
    return (
      lineSignature(netItems.filter((it) => it.description.trim())) !== lineSignature(existing.items) ||
      subtotal !== before.subtotal ||
      total !== before.total ||
      appliedTaxRate !== before.taxRate
    )
  }, [issued, existing, netItems, subtotal, total, appliedTaxRate])
  const saveLabel = issued ? (amountsChanged ? t('docs.correct') : t('newInvoice.saveChanges')) : t('newInvoice.saveAndShare')
  const [savingDraft, setSavingDraft] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [addForm, setAddForm] = useState({ fullName: '', address: '', phone: '', email: '', businessId: '' })
  const [activeItemId, setActiveItemId] = useState(items[0]?.id || '')

  useEffect(() => {
    if (invoiceId) persistedIdRef.current = invoiceId
  }, [invoiceId])

  formRef.current = {
    client,
    clientId,
    invoiceNumber,
    date,
    dueDate,
    items: netItems,
    pricesIncludeTax,
    discount,
    taxRate,
    notes,
    canSaveOnly,
  }

  const persistDraft = useCallback(async () => {
    if (skipAutosaveRef.current) return null
    if (persistLock.current) await persistLock.current
    if (skipAutosaveRef.current) return null
    const snap = formRef.current
    if (!snap.canSaveOnly) return null
    if (!snap.client?.fullName?.trim() && !snap.clientId) return null
    let release: (() => void) | undefined
    persistLock.current = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      const validItems = (snap.items || []).filter((it) => String(it.description || '').trim() && toNumber(it.unitPrice) >= 0)
      const totals = computeTotals(validItems, snap.discount, snap.taxRate)
      const payload = {
        number: snap.invoiceNumber,
        date: snap.date,
        dueDate: snap.dueDate,
        client: { ...snap.client, id: snap.clientId },
        clientId: snap.clientId,
        items: validItems,
        pricesIncludeTax: snap.pricesIncludeTax,
        discount: snap.discount,
        taxRate: totals.taxRate,
        notes: snap.notes,
        subtotal: totals.subtotal,
        total: totals.total,
        lifecycle: 'draft' as const,
        sent: false as const,
      }
      if (persistedIdRef.current) {
        await updateInvoice(persistedIdRef.current, payload)
        return persistedIdRef.current
      }
      const saved = await createInvoice(payload)
      persistedIdRef.current = saved.id
      return saved.id
    } catch {
      return null
    } finally {
      persistLock.current = null
      release?.()
    }
  }, [createInvoice, updateInvoice])

  useEffect(() => {
    if (!canSaveOnly || !clientId) return
    const timer = window.setTimeout(() => {
      void persistDraft()
    }, 700)
    return () => window.clearTimeout(timer)
  }, [canSaveOnly, clientId, client, items, pricesIncludeTax, discount, taxRate, notes, invoiceNumber, date, dueDate, persistDraft])

  const draft = useMemo(
    () => ({
      number: invoiceNumber,
      date,
      dueDate,
      client,
      items: netItems,
      discount,
      taxRate: appliedTaxRate,
      notes,
      subtotal,
      total,
    }),
    [invoiceNumber, date, dueDate, client, netItems, discount, appliedTaxRate, notes, subtotal, total],
  )

  const [templateChoice, setTemplateChoice] = useState<InvoiceTemplateId | null>(null)
  const template = templateChoice || normalizeTemplate(profile?.invoiceTemplate)

  const previewHtml = useMemo(() => {
    if (!preview || !profile) return ''
    return buildInvoiceHtml({
      company: localizeCompanyProfile(profile, t),
      client,
      invoice: draft,
      pdfLabels: dict.pdf,
      template,
    })
  }, [preview, profile, client, draft, template, dict.pdf, t])

  function updateItem(id: string, field: keyof InvoiceItem, value: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)))
  }

  async function applyExtracted(result: {
    fullName?: string
    address?: string
    phone?: string
    email?: string
    businessId?: string
    items?: { description?: string; quantity?: string | number; unitPrice?: string | number }[]
  }) {
    const extractedClient = {
      fullName: result.fullName || '',
      address: result.address || '',
      phone: result.phone || '',
      email: result.email || '',
      businessId: result.businessId || '',
    }
    const match = findMatchingClient(clients, extractedClient)
    if (match) {
      setClientId(match.id)
      applyClientTax(match)
      setClient({
        vatNumber: match.vatNumber || '',
        fiscalNumber: match.fiscalNumber || '',
        fullName: clientDisplayName(match) || extractedClient.fullName,
        address: extractedClient.address || match.address || '',
        phone: extractedClient.phone || match.phone || '',
        email: extractedClient.email || match.email || '',
        businessId: extractedClient.businessId || match.businessId || '',
      })
    } else if (extractedClient.fullName.trim() || extractedClient.address || extractedClient.phone) {
      setClientId('')
      setClient(extractedClient)
    }
    const lines = invoiceLinesFromExtract(result.items, catalogItems)
    if (lines.length) {
      setItems(lines)
      setActiveItemId(lines[0].id)
    }
    setAiCollapsed(true)
  }

  async function extractClient() {
    if (!aiText.trim()) return
    setExtracting(true)
    setError('')
    try {
      const result = await api<{
        fullName?: string
        address?: string
        phone?: string
        email?: string
        businessId?: string
        items?: { description?: string; quantity?: string | number; unitPrice?: string | number }[]
      }>('/api/extract-client', {
        method: 'POST',
        body: { text: aiText },
      })
      await applyExtracted(result)
    } catch {
      setError(t('newInvoice.aiExtractError'))
    } finally {
      setExtracting(false)
    }
  }

  async function extractFromPhoto(file: File) {
    setExtracting(true)
    setError('')
    try {
      const image = await fileToSupportedImageDataUrl(file)
      const result = await api<{
        fullName?: string
        address?: string
        phone?: string
        email?: string
        businessId?: string
        items?: { description?: string; quantity?: string | number; unitPrice?: string | number }[]
      }>('/api/extract-client', {
        method: 'POST',
        body: { text: aiText.trim(), image },
      })
      await applyExtracted(result)
    } catch {
      setError(t('newInvoice.aiExtractError'))
    } finally {
      setExtracting(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  function validate() {
    if (!client.fullName.trim()) {
      setError(t('newInvoice.validationClient'))
      return null
    }
    const validItems = netItems.filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0)
    if (validItems.length === 0) {
      setError(t('newInvoice.validationItems'))
      return null
    }
    if (!parseLooseDate(date) || (dueDate.trim() && !parseLooseDate(dueDate))) {
      setError(t('newInvoice.validationDate'))
      return null
    }
    const totals = computeTotals(validItems, discount, taxRate)
    return {
      number: invoiceNumber,
      date,
      dueDate,
      client: { ...client, id: clientId },
      clientId,
      items: validItems,
      pricesIncludeTax,
      discount,
      taxRate: totals.taxRate,
      notes,
      subtotal: totals.subtotal,
      total: totals.total,
    }
  }

  const selectedClient = clientId ? clients.find((item) => item.id === clientId) : null
  const suggestedClients = useMemo(() => {
    if (client.fullName.trim()) return clients.filter((item) => clientMatchesQuery(item, client.fullName)).slice(0, 8)
    return frequentClients(clients, invoices, 8)
  }, [clients, invoices, client.fullName])
  const pickerClients = useMemo(
    () => clients.filter((item) => clientMatchesQuery(item, pickerQuery)),
    [clients, pickerQuery],
  )

  function applyClient(item: (typeof clients)[number]) {
    setClientId(item.id)
    setClient(clientForInvoice(item))
    applyClientTax(item)
    setPickerOpen(false)
  }

  function applyCatalogItem(catalogItem: (typeof catalogItems)[number], targetId?: string) {
    setItems((prev) => {
      const line = invoiceLineFromCatalog(catalogItem)
      const target = prev.find((it) => it.id === (targetId || activeItemId)) || prev.find((it) => !String(it.description || '').trim())
      if (!target) return prev
      return prev.map((it) => (it.id === target.id ? { ...line, id: target.id } : it))
    })
  }

  async function persistClient() {
    if (!client.fullName.trim()) return clientId
    if (clientId) return clientId
    const saved = await createClient({
      fullName: client.fullName.trim(),
      address: client.address || '',
      phone: client.phone || '',
      email: client.email || '',
      businessId: client.businessId || '',
    })
    setClientId(saved.id)
    return saved.id
  }

  async function onSave(asDraft = false) {
    const invoice = validate()
    if (!invoice) return
    if (issued && amountsChanged && !correctReason.trim()) {
      setError(t('docs.correctReason'))
      return
    }
    skipAutosaveRef.current = true
    if (persistLock.current) await persistLock.current
    setSaving(true)
    setError('')
    try {
      const savedClientId = await persistClient()
      const sharing = !asDraft && canSaveOnly
      const payload = {
        ...invoice,
        clientId: savedClientId,
        lifecycle: 'issued' as const,
        sent: sharing ? true : asDraft ? false : existing?.sent !== false,
        sentAt: sharing ? new Date().toISOString() : asDraft ? undefined : existing?.sentAt,
      }
      let savedId = persistedIdRef.current || invoiceId
      if (issued && invoiceId) {
        await correctInvoice(invoiceId, {
          items: payload.items,
          discount: payload.discount,
          taxRate: payload.taxRate,
          notes: payload.notes,
          date: payload.date,
          dueDate: payload.dueDate,
          reason: correctReason.trim() || (amountsChanged ? '' : t('docs.dateChangeReason')),
        })
        savedId = invoiceId
      } else if (savedId) {
        await updateInvoice(savedId, payload)
        if (canSaveOnly) await issueInvoice(savedId)
      } else {
        const saved = await createInvoice(payload)
        savedId = saved.id
        persistedIdRef.current = saved.id
      }
      if (sharing && profile) {
        const html = buildInvoiceHtml({
          company: localizeCompanyProfile(profile, t),
          client,
          invoice: { ...payload, number: invoice.number },
          pdfLabels: dict.pdf,
          template,
        })
        downloadHtmlAsPdf(html, `${invoice.number}.pdf`)
      }
      navigate(savedId ? `/app?added=${encodeURIComponent(savedId)}` : '/app')
    } catch (err) {
      skipAutosaveRef.current = false
      const message = err instanceof Error ? err.message : t('common.error')
      setError(message)
      if (message.toLowerCase().includes('free plan') || message.toLowerCase().includes('upgrade')) {
        navigate('/app/upgrade')
      }
    } finally {
      setSaving(false)
      setSavingDraft(false)
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
        aiCollapsed ? (
          <button
            type="button"
            onClick={() => setAiCollapsed(false)}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-brand-ink/8 bg-white px-4 py-3 text-left text-sm font-semibold text-brand-ink shadow-[0_1px_2px_rgba(29,43,46,0.04)]"
          >
            <span className="flex-1">{t('newInvoice.aiFilledCollapsed')}</span>
            <span className="text-brand">▾</span>
          </button>
        ) : (
        <Card className="mt-6">
          <TextArea
            label={t('newInvoice.aiInputLabel')}
            rows={3}
            placeholder={t('newInvoice.aiInputPlaceholder')}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-stretch gap-2">
            <Button type="button" disabled={!aiText.trim() || extracting} onClick={() => void extractClient()}>
              {extracting ? t('newInvoice.aiExtracting') : t('newInvoice.aiExtractButton')}
            </Button>
            <Button type="button" variant="secondary" disabled={extracting} onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-4 w-4" />
              {t('newInvoice.aiTakePhoto')}
            </Button>
            <button
              type="button"
              disabled={extracting}
              onClick={() => photoInputRef.current?.click()}
              title={t('newInvoice.aiChoosePhoto')}
              className="inline-flex min-h-[42px] w-11 items-center justify-center rounded-xl border border-brand text-brand hover:bg-brand/5 disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void extractFromPhoto(file)
              }}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void extractFromPhoto(file)
              }}
            />
          </div>
        </Card>
        )
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">{t('newInvoice.clientSectionTitle')}</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setPickerQuery(''); setPickerOpen(true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand">
                <Users className="h-4 w-4" />
                {t('newInvoice.selectClient')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddForm({ fullName: client.fullName, address: '', phone: '', email: '', businessId: '' })
                  setAddOpen(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand"
              >
                <UserPlus className="h-4 w-4" />
                {t('docs.addClient')}
              </button>
            </div>
            <Field
              label={t('newInvoice.fullName')}
              value={client.fullName}
              placeholder={t('newInvoice.phFullName')}
              onChange={(e) => {
                const v = e.target.value
                if (selectedClient && clientDisplayName(selectedClient) !== v) {
                  setClientId('')
                  setClient({ fullName: v, address: '', phone: '', email: '', businessId: '' })
                  return
                }
                setClient((c) => ({ ...c, fullName: v }))
              }}
            />
            {!clientId && suggestedClients.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {suggestedClients.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyClient(item)}
                    className="rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10"
                  >
                    {clientDisplayName(item)}
                  </button>
                ))}
              </div>
            ) : null}
            {client.address || client.phone || client.email || client.businessId ? (
              <div className="rounded-xl border border-brand-ink/8 bg-[#F7FAFB] p-3 text-sm text-brand-ink/80">
                {client.address ? (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink/40" />
                    {client.address}
                  </p>
                ) : null}
                {client.businessId ? (
                  <p className="mt-1 pl-6">
                    {dict.pdf.nuiLabel}: {client.businessId}
                  </p>
                ) : null}
                {client.phone ? (
                  <p className="mt-1 flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink/40" />
                    {client.phone}
                  </p>
                ) : null}
                {client.email ? <p className="mt-1 pl-6">{client.email}</p> : null}
              </div>
            ) : null}
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
                    <th className="w-32 px-3 py-3 text-left font-semibold">
                      {t('newInvoice.itemUnitPrice')}
                      {pricesIncludeTax && appliedTaxRate > 0 ? <span className="block normal-case tracking-normal text-brand-ink/40">{t('newInvoice.withTax')}</span> : null}
                    </th>
                    <th className="w-28 px-3 py-3 text-right font-semibold">{t('newInvoice.itemTotal')}</th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const typing = Boolean(String(item.description || '').trim())
                    const suggestions =
                      typing || item.id === activeItemId || items.length === 1
                        ? catalogItems
                            .filter((row) =>
                              String(item.description || '').trim()
                                ? String(row.description || '').toLowerCase().includes(String(item.description || '').toLowerCase())
                                : true,
                            )
                            .slice(0, 8)
                        : []
                    return (
                    <tr key={item.id} className="border-t border-brand-ink/5">
                      <td className="px-4 py-2">
                        <input
                          className={inputClass}
                          value={item.description}
                          placeholder={t('newInvoice.phItemDescription')}
                          onFocus={() => setActiveItemId(item.id)}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        />
                        {suggestions.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {suggestions.map((catalogItem) => (
                              <button
                                key={catalogItem.id}
                                type="button"
                                onClick={() => applyCatalogItem(catalogItem, item.id)}
                                className="rounded-lg bg-[#EEF5F7] px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brand/10"
                              >
                                {catalogItem.description}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input className={inputClass} value={String(item.quantity)} onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={typedPrices.has(item.id) ? String(item.unitPrice) : shortAmount(item.unitPrice)}
                          onChange={(e) => {
                            setTypedPrices((prev) => (prev.has(item.id) ? prev : new Set(prev).add(item.id)))
                            updateItem(item.id, 'unitPrice', e.target.value)
                          }}
                        />
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8">
          <Card>
            <h2 className="mb-4 font-semibold">{t('newInvoice.invoiceDetailsSectionTitle')}</h2>
            <Field label={t('newInvoice.invoiceNumber')} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <DateField label={t('newInvoice.date')} value={date} pickLabel={t('newInvoice.pickDate')} onChange={setDate} />
            <DateField label={t('newInvoice.dueDate')} value={dueDate} placeholder={t('newInvoice.phDueDate')} pickLabel={t('newInvoice.pickDate')} onChange={setDueDate} />
            <Field label={t('newInvoice.discount')} value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} />
            <div className="mb-5">
              <Field
                label={t('newInvoice.taxRate')}
                value={taxRate}
                inputMode="decimal"
                onChange={(e) => {
                  taxTouched.current = true
                  setTaxFromClient(false)
                  setTaxRate(e.target.value)
                }}
              />
              <div className="mt-2 flex gap-1.5">
                {[0, 8, 18].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    aria-pressed={appliedTaxRate === rate}
                    onClick={() => {
                      taxTouched.current = true
                      setTaxFromClient(false)
                      setTaxRate(String(rate))
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${appliedTaxRate === rate ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/65 hover:border-brand/30'}`}
                  >
                    {rate === 0 ? t('newInvoice.taxNone') : `${rate}%`}
                  </button>
                ))}
              </div>
              {taxFromClient ? <p className="mt-2 text-xs text-brand-ink/45">{t('newInvoice.taxFromClient')}</p> : null}
              {appliedTaxRate > 0 ? (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={pricesIncludeTax}
                    onChange={(e) => {
                      setPricesIncludeTax(e.target.checked)
                      localStorage.setItem('nextinvoice.pricesIncludeTax', e.target.checked ? '1' : '0')
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#2C6E7F]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{t('newInvoice.pricesIncludeTax')}</span>
                    <span className="block text-xs text-brand-ink/45">{t('newInvoice.pricesIncludeTaxHint')}</span>
                  </span>
                </label>
              ) : null}
            </div>
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
              {appliedTaxRate > 0 ? (
                <div className="flex justify-between text-brand-ink/55">
                  <span>
                    {t('newInvoice.tax')} {appliedTaxRate}%
                  </span>
                  <span>{formatMoney(taxAmount, currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-brand-ink/10 pt-3 font-display text-2xl font-medium">
                <span>{t('newInvoice.total')}</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
            </div>
            {issued && amountsChanged ? <Field label={t('docs.correctReason')} value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} /> : null}
            {error ? <p className="mt-4 text-sm text-[#C0503A]">{error}</p> : null}
            <div className="mt-5 flex flex-col gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => (validate() ? setPreview(true) : null)}>
                  <Eye className="h-4 w-4" />
                  {t('newInvoice.preview')}
                </Button>
                {canSaveOnly ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={saving || savingDraft}
                    onClick={() => {
                      setSavingDraft(true)
                      void onSave(true)
                    }}
                  >
                    {savingDraft ? t('common.loading') : t('docs.saveDraft')}
                  </Button>
                ) : null}
              </div>
              <Button type="button" disabled={saving} onClick={() => void onSave(false)}>
                {saving ? t('common.loading') : saveLabel}
                {!issued ? <Send className="h-4 w-4" /> : null}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {pickerOpen ? (
        <Modal title={t('docs.pickClient')} onClose={() => setPickerOpen(false)}>
          <div className="p-6">
            <input
              className={inputClass}
              value={pickerQuery}
              placeholder={t('newInvoice.searchClients')}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
            <div className="mt-4 space-y-1">
              {pickerClients.length === 0 ? <p className="py-8 text-center text-sm text-brand-ink/50">{t('newInvoice.noMatchingClients')}</p> : null}
              {pickerClients.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyClient(item)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-brand/5',
                    clientId === item.id && 'bg-[#EEF5F7] font-semibold text-brand',
                  )}
                >
                  <span>
                    {clientDisplayName(item)}
                    {item.phone ? <span className="block text-xs font-normal text-brand-ink/45">{item.phone}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {addOpen ? (
        <Modal
          title={t('docs.addClient')}
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const payload = composeClient(addForm)
                  if (!payload.fullName) {
                    setError(t('clients.validationName'))
                    return
                  }
                  if (!payload.phone) {
                    setError(t('clients.validationPhone'))
                    return
                  }
                  const saved = await createClient(payload as Parameters<typeof createClient>[0])
                  applyClient(saved)
                  setAddOpen(false)
                }}
              >
                {t('common.save')}
              </Button>
            </>
          }
        >
          <div className="space-y-1 p-6">
            <Field label={t('newInvoice.fullName')} value={addForm.fullName} placeholder={t('newInvoice.phFullName')} onChange={(e) => setAddForm((c) => ({ ...c, fullName: e.target.value }))} />
            <Field label={t('newInvoice.address')} value={addForm.address} placeholder={t('newInvoice.phAddress')} onChange={(e) => setAddForm((c) => ({ ...c, address: e.target.value }))} />
            <Field label={`${t('docs.businessId')} (${t('common.optional')})`} value={addForm.businessId} inputMode="numeric" onChange={(e) => setAddForm((c) => ({ ...c, businessId: e.target.value }))} />
            <Field label={t('newInvoice.phone')} value={addForm.phone} placeholder={t('newInvoice.phPhone')} onChange={(e) => setAddForm((c) => ({ ...c, phone: e.target.value }))} />
            <Field label={`${t('docs.email')} (${t('common.optional')})`} value={addForm.email} onChange={(e) => setAddForm((c) => ({ ...c, email: e.target.value }))} />
          </div>
        </Modal>
      ) : null}

      {preview ? (
        <Modal
          title={t('newInvoice.previewTitle')}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.close')}
              </Button>
              <Button type="button" disabled={saving} onClick={() => void onSave(false)}>
                {saveLabel}
                {!issued ? <Send className="h-4 w-4" /> : null}
              </Button>
            </>
          }
        >
          <TemplateSwitch value={template} onChange={setTemplateChoice} />
          <iframe title="preview" className="h-[70vh] w-full bg-white" srcDoc={previewHtml} />
        </Modal>
      ) : null}
    </div>
  )
}
