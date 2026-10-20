import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, Eye, StickyNote, FileText, MapPin, Phone, Plus, Repeat, Send, Trash2, UserPlus, Users } from 'lucide-react'
import { FREQUENCIES, nextRenewal, type Frequency, type SendMode } from '../../lib/recurring'
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
import { UnsignedToggle } from '../../components/UnsignedToggle'
import { SignerPicker } from '../../components/SignerPicker'
import { useAuth } from '../../context/AuthContext'
import { proposedSigner } from '../../lib/signers'
import { clientDisplayName, clientMatchesQuery, composeClient, frequentClients } from '../../lib/client'
import { invoiceLineFromCatalog } from '../../lib/catalog'

/** A price as shown in its box: at most two decimals. The full value stays in the form until it is retyped. */
/** The calendar day of a date, as plans keep it (2026-10-20). */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

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
          className={`flex-1 rounded-lg border px-2 py-1 text-xs font-semibold transition ${value === option.value ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/65 hover:border-brand/30'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// The tighter spacing of the fields in the invoice details card.
const tight = 'mb-3.5 gap-1.5'

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
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const existing = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null
  const isEditing = Boolean(invoiceId)
  const location = useLocation()
  const persistedIdRef = useRef(invoiceId || '')
  const skipAutosaveRef = useRef(false)
  const persistLock = useRef<Promise<unknown> | null>(null)
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
    unsigned: Boolean(existing?.unsigned),
    signerId: existing?.signerId || '',
    contractName: existing?.contractName || '',
    contractNumber: existing?.contractNumber || '',
    notes: existing?.notes || '',
    canSaveOnly: true,
  })

  const [client, setClient] = useState(existing?.client || { fullName: '', address: '', phone: '', email: '', businessId: '' })
  const [clientId, setClientId] = useState(existing?.clientId || searchParams.get('clientId') || '')
  const [invoiceNumber, setInvoiceNumber] = useState(() => existing?.number || generateInvoiceNumber(invoices))
  const [date, setDate] = useState(() => existing?.date || formatDateForInvoice(new Date()))
  const [dueDate, setDueDate] = useState(() => existing?.dueDate || '')
  const [items, setItems] = useState<InvoiceItem[]>(() => (existing?.items?.length ? formItems(existing) : [emptyItem()]))
  // Prices typed with VAT included: the total is what was typed and the subtotal is worked back from it.
  const [unsigned, setUnsigned] = useState(() => Boolean(existing?.unsigned))
  // A new invoice proposes the signature of the person making it, when they sign for the company; otherwise the default signer's.
  const proposedSignerId = proposedSigner(profile, user?.accountId || user?.id)?.id || ''
  const [signerId, setSignerId] = useState(() => (existing ? existing.signerId || '' : proposedSignerId))
  const signerTouched = useRef(Boolean(existing))
  useEffect(() => {
    if (!signerTouched.current) setSignerId(proposedSignerId)
  }, [proposedSignerId])
  const [contractName, setContractName] = useState(existing?.contractName || '')
  const [contractNumber, setContractNumber] = useState(existing?.contractNumber || '')
  const [contractOpen, setContractOpen] = useState(true)
  const [pricesIncludeTax, setPricesIncludeTax] = useState(() =>
    existing ? Boolean(existing.pricesIncludeTax) : localStorage.getItem('nextinvoice.pricesIncludeTax') === '1',
  )
  const [discount, setDiscount] = useState(String(existing?.discount ?? '0'))
  // Notes stay behind a small button until asked for, or until the invoice has some.
  const [notesOpen, setNotesOpen] = useState(false)
  // Repeating: saving the invoice also starts a plan that makes the next ones by itself.
  const [repeat, setRepeat] = useState(false)
  const [repeatFrequency, setRepeatFrequency] = useState<Frequency>('monthly')
  const [repeatSend, setRepeatSend] = useState<SendMode>('auto')
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
    setUnsigned(Boolean(existing.unsigned))
    signerTouched.current = true
    setSignerId(existing.signerId || '')
    setContractName(existing.contractName || '')
    setContractNumber(existing.contractNumber || '')
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
    setUnsigned(Boolean(source.unsigned))
    setContractName(source.contractName || '')
    setContractNumber(source.contractNumber || '')
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
  // A new invoice or a draft can start a plan; one a plan made already belongs to it.
  const canRepeat = !issued && !existing?.recurring
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
    unsigned,
    signerId,
    contractName,
    contractNumber,
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
        unsigned: snap.unsigned,
        signerId: snap.signerId,
        contractName: snap.contractName.trim(),
        contractNumber: snap.contractNumber.trim(),
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
  }, [canSaveOnly, clientId, client, items, pricesIncludeTax, unsigned, signerId, contractName, contractNumber, discount, taxRate, notes, invoiceNumber, date, dueDate, persistDraft])

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
      unsigned,
      signerId,
      contractName,
      contractNumber,
      subtotal,
      total,
    }),
    [invoiceNumber, date, dueDate, client, netItems, discount, appliedTaxRate, notes, unsigned, signerId, contractName, contractNumber, subtotal, total],
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

  function pickSigner(id: string) {
    signerTouched.current = true
    setSignerId(id)
  }

  function updateItem(id: string, field: keyof InvoiceItem, value: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)))
  }

  const repeatStart = parseLooseDate(date)
  const repeatNext = repeat && repeatStart ? nextRenewal(repeatStart, repeatFrequency) : null

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
      unsigned,
      signerId,
      contractName: contractName.trim(),
      contractNumber: contractNumber.trim(),
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

  /** The plan this invoice starts: its lines and client, every month (or as chosen) from its date, as its first period. */
  function planFromInvoice(saved: { id: string; clientId: string; items: InvoiceItem[]; discount: string; taxRate: number; notes: string; date: string; dueDate: string }) {
    const start = parseLooseDate(saved.date) as Date
    const due = saved.dueDate ? parseLooseDate(saved.dueDate) : null
    const dueDays = due ? Math.min(120, Math.max(0, Math.round((due.getTime() - start.getTime()) / 86400000))) : 0
    return {
      firstInvoiceId: saved.id,
      clientId: saved.clientId,
      kind: 'invoice',
      items: saved.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      discount: toNumber(saved.discount),
      taxRate: saved.taxRate,
      currency,
      frequency: repeatFrequency,
      anchorDate: dayKey(start),
      sendDaysBefore: 0,
      dueDays,
      graceDays: 0,
      sendMode: repeatSend,
      notes: saved.notes,
    }
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
        // A correction carries the figures only; printing without signature and stamp is set apart.
        if (Boolean(existing?.unsigned) !== payload.unsigned) await updateInvoice(invoiceId, { unsigned: payload.unsigned })
        if ((existing?.signerId || '') !== payload.signerId) await updateInvoice(invoiceId, { signerId: payload.signerId })
        if ((existing?.contractName || '') !== payload.contractName || (existing?.contractNumber || '') !== payload.contractNumber) {
          await updateInvoice(invoiceId, { contractName: payload.contractName, contractNumber: payload.contractNumber })
        }
        savedId = invoiceId
      } else if (savedId) {
        await updateInvoice(savedId, payload)
        if (canSaveOnly) await issueInvoice(savedId)
      } else {
        const saved = await createInvoice(payload)
        savedId = saved.id
        persistedIdRef.current = saved.id
      }
      if (repeat && canRepeat && savedId) {
        try {
          await api('/api/recurring', { method: 'POST', body: planFromInvoice({ ...payload, id: savedId }) })
        } catch (err) {
          window.alert(t('recurring.repeatFailed', { error: err instanceof Error ? err.message : t('common.error') }))
        }
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
      </div>

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

          {/* Asked only by companies that turned it on in the invoice settings, or kept when the invoice already has it. */}
          {profile?.showContract || contractName || contractNumber ? (
            <Card className="overflow-hidden p-0">
              <button
                type="button"
                aria-expanded={contractOpen}
                onClick={() => setContractOpen((open) => !open)}
                className={cn('flex w-full items-center justify-between gap-3 px-6 py-4 text-left', contractOpen && 'border-b border-brand-ink/8')}
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/8 text-brand">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="font-semibold">{t('profile.showContract')}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 text-brand-ink/45 transition', contractOpen && 'rotate-180')} />
              </button>
              {contractOpen ? (
                <div className="px-6 pt-4">
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <Field label={t('newInvoice.contractName')} value={contractName} onChange={(e) => setContractName(e.target.value)} />
                    <Field label={t('newInvoice.contractNumber')} value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} />
                  </div>
                  <p className="-mt-2 pb-4 text-xs text-brand-ink/45">{t('newInvoice.contractHint')}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

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
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t('newInvoice.invoiceDetailsSectionTitle')}</h2>
            <Field label={t('newInvoice.invoiceNumber')} value={invoiceNumber} wrapperClassName={tight} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <DateField label={t('newInvoice.date')} value={date} pickLabel={t('newInvoice.pickDate')} wrapperClassName={tight} onChange={setDate} />
            <DateField label={t('newInvoice.dueDate')} value={dueDate} placeholder={t('newInvoice.phDueDate')} pickLabel={t('newInvoice.pickDate')} wrapperClassName={tight} onChange={setDueDate} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('newInvoice.discount')} value={discount} inputMode="decimal" wrapperClassName={tight} onChange={(e) => setDiscount(e.target.value)} />
              <Field
                label={t('newInvoice.taxRate')}
                value={taxRate}
                inputMode="decimal"
                wrapperClassName={tight}
                onChange={(e) => {
                  taxTouched.current = true
                  setTaxFromClient(false)
                  setTaxRate(e.target.value)
                }}
              />
            </div>
            <div className="-mt-1.5 mb-3.5">
              <div className="flex gap-1.5">
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
                    className={`flex-1 rounded-lg border px-2 py-1 text-xs font-semibold transition ${appliedTaxRate === rate ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/65 hover:border-brand/30'}`}
                  >
                    {rate === 0 ? t('newInvoice.taxNone') : `${rate}%`}
                  </button>
                ))}
              </div>
              {taxFromClient ? <p className="mt-1.5 text-xs text-brand-ink/45">{t('newInvoice.taxFromClient')}</p> : null}
              {appliedTaxRate > 0 ? (
                <label title={t('newInvoice.pricesIncludeTaxHint')} className="mt-2.5 flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={pricesIncludeTax}
                    onChange={(e) => {
                      setPricesIncludeTax(e.target.checked)
                      localStorage.setItem('nextinvoice.pricesIncludeTax', e.target.checked ? '1' : '0')
                    }}
                    className="h-4 w-4 accent-[#2C6E7F]"
                  />
                  <span className="text-sm font-semibold">{t('newInvoice.pricesIncludeTax')}</span>
                </label>
              ) : null}
            </div>
            {notesOpen || notes.trim() ? (
              <TextArea label={t('newInvoice.notes')} rows={2} value={notes} autoFocus={notesOpen && !notes} wrapperClassName={tight} onChange={(e) => setNotes(e.target.value)} />
            ) : (
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="mb-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
              >
                <StickyNote className="h-4 w-4" />
                {t('newInvoice.notes')}
              </button>
            )}
            <UnsignedToggle checked={unsigned} onChange={setUnsigned} compact />
            {unsigned ? null : <SignerPicker value={signerId} onChange={pickSigner} className="mt-3" />}
            {canRepeat ? (
              <div className="mt-4 border-t border-brand-ink/8 pt-4">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-4 w-4 accent-[#2C6E7F]" />
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <Repeat className="h-3.5 w-3.5 text-brand" />
                    {t('recurring.repeat')}
                  </span>
                </label>
                {repeat ? (
                  <div className="mt-3 space-y-2">
                    <Choice options={FREQUENCIES.map((value) => ({ value, label: t(`recurring.${value}`) }))} value={repeatFrequency} onChange={setRepeatFrequency} />
                    <Choice
                      options={[
                        { value: 'auto' as const, label: t('recurring.sendAuto') },
                        { value: 'manual' as const, label: t('recurring.sendManual') },
                      ]}
                      value={repeatSend}
                      onChange={setRepeatSend}
                    />
                    {repeatNext ? (
                      <p className="text-xs leading-5 text-brand-ink/50">
                        {t(repeatSend === 'auto' ? 'recurring.repeatNextAuto' : 'recurring.repeatNextManual', { date: formatDateForInvoice(repeatNext) })}
                      </p>
                    ) : null}
                    {repeatSend === 'auto' && !String(client.email || '').trim() ? <p className="text-xs leading-5 text-[#8A5A00]">{t('recurring.repeatNoEmail')}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
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
            <Field label={`${t('newInvoice.phone')} (${t('common.optional')})`} value={addForm.phone} placeholder={t('newInvoice.phPhone')} onChange={(e) => setAddForm((c) => ({ ...c, phone: e.target.value }))} />
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
          <UnsignedToggle checked={unsigned} onChange={setUnsigned} className="border-b border-brand-ink/8 bg-white px-5 py-3" />
          {unsigned ? null : <SignerPicker value={signerId} onChange={pickSigner} className="border-b border-brand-ink/8 bg-white px-5 py-3" />}
          <iframe title="preview" className="h-[70vh] w-full bg-white" srcDoc={previewHtml} />
        </Modal>
      ) : null}
    </div>
  )
}
