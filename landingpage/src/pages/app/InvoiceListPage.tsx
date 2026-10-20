import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, BellRing, Eye, FileSpreadsheet, Landmark, FileText, Pencil, PieChart, Plus, Search, Send, Settings, Trash2, Circle, CheckCircle2, Loader2, User, X } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { Button, Modal } from '../../components/ui'
import { RemindPaymentModal } from '../../components/RemindPaymentModal'
import { ImportInvoicesModal } from '../../components/ImportInvoicesModal'
import { BankMatchModal } from '../../components/BankMatchModal'
import { SendInvoiceModal } from '../../components/SendInvoiceModal'
import { InvoicePreviewModal } from '../../components/InvoicePreviewModal'
import { DeliveryQueue } from '../../components/DeliveryQueue'
import { awaitsDelivery } from '../../lib/delivery'
import {
  buildInvoiceListHtml,
  downloadHtmlAsPdf,
  formatMoney,
  formatAmountShort,
  formatStatementFileDate,
  invoiceListFileName,
  invoiceStatus,
  invoiceSubject,
  invoiceYear,
  lastReminderTime,
  statementFileName,
} from '../../lib/invoice'
import { clientInvoiceSummary, invoiceClientGroups, isOwed, matchClientGroups } from '../../lib/clientInvoices'
import { daysOverdue, documentTotals, formatMoneyList, isInvoiceSent, isOverdue, remainingOf, totalsByCurrency, togglePaid, visiblePaymentStatus } from '../../lib/document'
import { localizeCompanyProfile } from '../../lib/companySamples'
import { fullPaymentPayload } from '../../lib/invoiceBalance'

function sendCopy(filter: 'all' | 'paid' | 'unpaid', t: (key: string) => string) {
  if (filter === 'paid') {
    return { kind: 'paid' as const, cta: t('invoiceList.sendPaid'), title: t('invoiceList.sendPaidTitle') }
  }
  if (filter === 'unpaid') {
    return { kind: 'unpaid' as const, cta: t('invoiceList.sendUnpaid'), title: t('invoiceList.sendUnpaidTitle') }
  }
  return { kind: 'all' as const, cta: t('invoiceList.sendList'), title: t('invoiceList.sendAllTitle') }
}

export function InvoiceListPage() {
  const { invoices, clients, loading, profile, removeInvoice, addInvoicePayment, voidInvoicePayment, updateInvoice, issueInvoice, markInvoicesPaid } = useAppData()
  const { t, dict } = useI18n()
  const { user } = useAuth()
  // Cancelled invoices can be deleted only by the company's owner and administrators.
  const manager = user?.role !== 'member'
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue' | 'toSend'>('all')
  const [usage, setUsage] = useState<{ plan: 'free' | 'premium'; used: number; limit: number | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDate, setBulkDate] = useState<'invoice' | 'today'>('invoice')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [remindId, setRemindId] = useState<string | null>(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [sendId, setSendId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [pulseId, setPulseId] = useState<string | null>(null)
  const navigate = useNavigate()
  const currency = profile?.currency || 'EUR'
  // Picking a client from the search shows all of that client's invoices, from every year.
  const [clientKey, setClientKey] = useState<string | null>(null)
  const [clientTab, setClientTab] = useState<'unpaid' | 'all'>('unpaid')
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [suggestHidden, setSuggestHidden] = useState(false)
  const clientGroups = useMemo(() => invoiceClientGroups(invoices, clients), [invoices, clients])
  const client = clientKey ? clientGroups.find((group) => group.key === clientKey) : undefined
  const suggestions = useMemo(() => (client || suggestHidden ? [] : matchClientGroups(clientGroups, query)), [client, suggestHidden, clientGroups, query])
  // A list for one client holds what the chosen tab shows: what is still owed, or everything.
  const send = client
    ? {
        kind: clientTab,
        cta: t('invoiceList.sendList'),
        title: clientTab === 'unpaid' ? t('invoiceList.sendUnpaidTitle') : t('invoiceList.sendAllTitle'),
      }
    : sendCopy(statusFilter === 'overdue' ? 'unpaid' : statusFilter === 'toSend' ? 'all' : statusFilter, t)

  function pickClient(key: string) {
    setClientKey(key)
    setClientTab('unpaid')
    setQuery('')
    setSelected(new Set())
  }
  // Invoices waiting for their email, from every year: the number on the "To send" filter.
  const toSendCount = useMemo(() => invoices.filter((item) => awaitsDelivery(item)).length, [invoices])
  const addedId = searchParams.get('added')

  // The list is split by year. The current year shows unless another is picked; the choice lives in the URL.
  const currentYear = new Date().getFullYear()
  const yearCounts = useMemo(() => {
    const counts = new Map<number, number>([[currentYear, 0]])
    for (const item of invoices) {
      const itemYear = invoiceYear(item) ?? currentYear
      counts.set(itemYear, (counts.get(itemYear) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0])
  }, [invoices, currentYear])
  const yearParam = searchParams.get('year')
  const year: number | 'all' = yearParam === 'all' ? 'all' : yearCounts.some(([value]) => String(value) === yearParam) ? Number(yearParam) : currentYear
  const yearInvoices = useMemo(
    () => (year === 'all' ? invoices : invoices.filter((item) => (invoiceYear(item) ?? currentYear) === year)),
    [invoices, year, currentYear],
  )

  function setYear(next: number | 'all') {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === currentYear) params.delete('year')
        else params.set('year', String(next))
        return params
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if (!addedId) return undefined
    setStatusFilter('all')
    setClientKey(null)
    setPulseId(addedId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const timer = window.setTimeout(() => {
      setPulseId(null)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('added')
        return next
      }, { replace: true })
    }, 1600)
    return () => window.clearTimeout(timer)
  }, [addedId, setSearchParams])

  useEffect(() => {
    void api<{ plan: 'free' | 'premium'; used: number; limit: number | null }>('/api/billing/usage')
      .then((res) => setUsage(res))
      .catch(() => {
        // If usage can't be loaded, we still allow browsing existing invoices.
      })
  }, [])

  const limitReached = usage?.plan === 'free' && usage.limit !== null && usage.used >= usage.limit

  const filtered = useMemo(() => {
    if (client) return clientTab === 'unpaid' ? client.invoices.filter(isOwed) : client.invoices
    const q = query.trim().toLowerCase()
    const list = !q
      ? yearInvoices
      : yearInvoices.filter((item) => {
          const hay = `${item.number} ${item.client?.fullName || ''} ${item.date} ${invoiceSubject(item)}`.toLowerCase()
          return hay.includes(q)
        })

    // What is still owed leads the list; within each group the order stays as it was.
    if (statusFilter === 'all') {
      const owed = (item: (typeof list)[number]) => {
        const status = invoiceStatus(item)
        return status === 'unpaid' || status === 'partial'
      }
      return [...list.filter(owed), ...list.filter((item) => !owed(item))]
    }
    if (statusFilter === 'overdue') return list.filter((item) => isOverdue(item))
    if (statusFilter === 'paid') return list.filter((item) => invoiceStatus(item) === 'paid')
    return list.filter((item) => {
      const status = invoiceStatus(item)
      return status === 'unpaid' || status === 'partial'
    })
  }, [yearInvoices, query, statusFilter, client, clientTab])
  const clientSummary = useMemo(() => (client ? clientInvoiceSummary(filtered) : null), [client, filtered])

  // Rows that can be ticked: issued invoices with something still owed, among those on screen.
  const payable = useMemo(
    () =>
      filtered.filter((item) => {
        const status = invoiceStatus(item)
        return (status === 'unpaid' || status === 'partial') && remainingOf(item) > 0
      }),
    [filtered],
  )
  const chosen = useMemo(() => payable.filter((item) => selected.has(item.id)), [payable, selected])
  const chosenTotal = chosen.reduce((sum, item) => sum + remainingOf(item), 0)
  const allChosen = payable.length > 0 && chosen.length === payable.length

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = chosen.length > 0 && !allChosen
  }, [chosen.length, allChosen])

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onMarkChosenPaid() {
    if (bulkBusy || chosen.length === 0) return
    setBulkBusy(true)
    setBulkError('')
    try {
      await markInvoicesPaid(
        chosen.map((item) => item.id),
        bulkDate === 'today' ? fullPaymentPayload({}).date : undefined,
      )
      setSelected(new Set())
      setBulkOpen(false)
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBulkBusy(false)
    }
  }

  const sendTarget = sendId ? invoices.find((item) => item.id === sendId) : undefined
  const previewTarget = previewId ? invoices.find((item) => item.id === previewId) : undefined
  const remindTarget = remindId ? invoices.find((item) => item.id === remindId) : undefined
  const unpaidInvoiceTotal = formatMoneyList(
    totalsByCurrency(yearInvoices, (item) => (invoiceStatus(item) === 'paid' ? 0 : remainingOf(item))),
    formatMoney,
  )
  const paidInvoiceTotal = formatMoneyList(
    totalsByCurrency(yearInvoices, (item) => (invoiceStatus(item) === 'paid' ? Number(item.total) || 0 : 0)),
    formatMoney,
  )

  async function onDelete(id: string, cancelledNumber?: string) {
    const question = cancelledNumber === undefined ? t('invoiceList.deleteConfirm') : t('invoiceList.deleteCancelledConfirm', { number: cancelledNumber })
    if (!window.confirm(question)) return
    if (busyId) return
    setBusyId(id)
    try {
      await removeInvoice(id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  function paidChipLabel(item: (typeof invoices)[number], status: ReturnType<typeof visiblePaymentStatus>) {
    if (status === 'partial') {
      const totals = documentTotals(item)
      return `${t('invoiceList.statusPaid')} ${formatAmountShort(totals.amountPaid)} (-${formatAmountShort(totals.amountDue)})`
    }
    return statusLabel(status)
  }

  function statusLabel(status: ReturnType<typeof visiblePaymentStatus>) {
    if (status === 'paid') return t('invoiceList.statusPaid')
    if (status === 'partial') return t('docs.statusPartial')
    if (status === 'cancelled') return t('docs.statusCancelled')
    return t('invoiceList.statusUnpaid')
  }

  const previewHtml =
    preview && profile && filtered.length
      ? buildInvoiceListHtml({
          company: localizeCompanyProfile(profile, t),
          invoices: filtered,
          issuedDate: formatStatementFileDate(new Date()),
          client: client?.client,
          pdfLabels: {
            ...dict.pdf,
            listTitle: send.title,
            statusPaid: t('invoiceList.statusPaid'),
            statusUnpaid: t('invoiceList.statusUnpaid'),
            statusPartial: t('docs.statusPartial'),
            statusCancelled: t('docs.statusCancelled'),
            statusLabel: t('obligations.status'),
            invoicedLabel: t('invoiceList.summaryInvoiced'),
            paidLabel: t('invoiceList.summaryPaid'),
            remainingLabel: t('invoiceList.summaryRemaining'),
          },
        })
      : ''

  function onSendList() {
    if (!previewHtml) return
    downloadHtmlAsPdf(previewHtml, client ? statementFileName(client.client.fullName) : invoiceListFileName(send.kind))
    setPreview(false)
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setSuggestIndex((index) => (index + step + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pickClient(suggestions[Math.min(suggestIndex, suggestions.length - 1)].key)
    } else if (e.key === 'Escape') {
      setSuggestHidden(true)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('invoiceList.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('invoiceList.subtitle')}</p>
          {invoices.length > 0 && !client ? (
            <div className="mt-4 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('invoiceList.year')}>
              {yearCounts.map(([value, count]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={year === value}
                  onClick={() => setYear(value)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold tabular-nums transition ${year === value ? 'bg-brand-ink text-white' : 'border border-brand-ink/10 bg-white text-brand-ink/65 hover:border-brand/30 hover:text-brand-ink'}`}
                >
                  {value}
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${year === value ? 'bg-white/15 text-white/85' : 'bg-brand-bg text-brand-ink/50'}`}>{count}</span>
                </button>
              ))}
              {yearCounts.length > 1 ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={year === 'all'}
                  onClick={() => setYear('all')}
                  className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${year === 'all' ? 'bg-brand-ink text-white' : 'border border-brand-ink/10 bg-white text-brand-ink/65 hover:border-brand/30 hover:text-brand-ink'}`}
                >
                  {t('invoiceList.allYears')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/invoices/settings"
            title={t('recurring.settings.open')}
            aria-label={t('recurring.settings.open')}
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-brand-ink/12 bg-white text-brand-ink/70 hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('importer.button')}
          </button>
          {invoices.length > 0 ? (
            <button
              type="button"
              onClick={() => setBankOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
            >
              <Landmark className="h-4 w-4" />
              {t('bank.button')}
            </button>
          ) : null}
          <Link
            to="/app/new"
            onClick={(e) => {
              if (limitReached) {
                e.preventDefault()
                navigate('/app/upgrade')
              }
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark ${limitReached ? 'opacity-60' : ''}`}
          >
            <Plus className="h-4 w-4" />
            {t('nav.newInvoice')}
          </Link>
        </div>
      </div>

      {limitReached ? (
        <div className="mt-5 rounded-2xl border border-[#C0503A]/30 bg-[#F8E8E4] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#C0503A]">{t('invoiceList.limitReached')}</p>
              <p className="mt-1 text-sm font-semibold text-brand-ink">{t('newInvoice.limitReached')}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/upgrade')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C0503A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a84330]"
            >
              {t('invoiceList.upgrade')}
            </button>
          </div>
        </div>
      ) : null}

      {client && clientSummary ? (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            [t('invoiceList.summaryCount'), String(clientSummary.count)],
            [t('invoiceList.summaryInvoiced'), formatMoneyList(clientSummary.invoiced, formatMoney)],
            [t('invoiceList.summaryPaid'), formatMoneyList(clientSummary.paid, formatMoney)],
            [t('invoiceList.summaryRemaining'), formatMoneyList(clientSummary.remaining, formatMoney)],
          ].map(([label, value], index) => (
            <div key={label} className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{label}</p>
              <p className={`mt-1 font-display text-2xl font-medium tabular-nums ${index === 3 && clientSummary.remaining.some((row) => row.amount > 0) ? 'text-[#C0503A]' : ''}`}>{value}</p>
            </div>
          ))}
        </div>
      ) : invoices.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceList.unpaidTotal')}</p>
            <p className="mt-1 font-display text-2xl font-medium">{unpaidInvoiceTotal}</p>
          </div>
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceList.paidTotal')}</p>
            <p className="mt-1 font-display text-2xl font-medium">{paidInvoiceTotal}</p>
          </div>
        </div>
      ) : null}

      {loading && invoices.length === 0 ? (
        <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p>
      ) : null}

      {!loading && invoices.length === 0 ? (
        <div className="mt-10 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-8 sm:p-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <FileText className="h-6 w-6" />
              </div>
              <h2 className="mt-6 font-display text-3xl font-medium">{t('invoiceList.emptyTitle')}</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-brand-ink/55">{t('invoiceList.empty')}</p>
              <Link
                to="/app/new"
                onClick={(e) => {
                  if (limitReached) {
                    e.preventDefault()
                    navigate('/app/upgrade')
                  }
                }}
                className={`mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark ${limitReached ? 'opacity-60' : ''}`}
              >
                <Plus className="h-4 w-4" />
                {t('nav.newInvoice')}
              </Link>
            </div>
            <div className="hidden bg-gradient-to-br from-[#EEF5F7] to-white lg:block" />
          </div>
        </div>
      ) : null}

      {invoices.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <div className="flex items-center gap-3 border-b border-brand-ink/8 px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-brand-ink/35" />
            {client ? (
              <span className="-my-1 inline-flex min-w-0 items-center gap-2 rounded-xl bg-brand/10 py-1 pl-3 pr-1 text-sm font-semibold text-brand">
                <User className="h-4 w-4 shrink-0" />
                <span className="truncate">{client.client.fullName}</span>
                <button
                  type="button"
                  onClick={() => setClientKey(null)}
                  title={t('invoiceList.clearClient')}
                  aria-label={t('invoiceList.clearClient')}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg hover:bg-brand/15"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSuggestIndex(0)
                  setSuggestHidden(false)
                }}
                onKeyDown={onSearchKey}
                placeholder={t('invoiceList.searchClient')}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="invoice-client-suggestions"
                aria-autocomplete="list"
                className="w-full bg-transparent text-sm outline-none placeholder:text-brand-ink/35"
              />
            )}
          </div>

          {suggestions.length > 0 ? (
            <ul id="invoice-client-suggestions" role="listbox" className="border-b border-brand-ink/8 py-1">
              {suggestions.map((group, index) => {
                const owed = formatMoneyList(totalsByCurrency(group.invoices, (item) => remainingOf(item)), formatMoney)
                const owes = group.invoices.some((item) => remainingOf(item) > 0)
                return (
                  <li key={group.key} role="option" aria-selected={index === suggestIndex}>
                    <button
                      type="button"
                      onMouseEnter={() => setSuggestIndex(index)}
                      onClick={() => pickClient(group.key)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${index === suggestIndex ? 'bg-brand/5' : ''}`}
                    >
                      <User className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate font-semibold">{group.client.fullName}</span>
                      <span className="shrink-0 text-xs text-brand-ink/50">{t('invoiceList.clientInvoices', { count: group.invoices.length })}</span>
                      {owes ? <span className="shrink-0 text-xs font-semibold tabular-nums text-[#C0503A]">{owed}</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {client ? (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {(
                [
                  ['unpaid', t('invoiceList.tabUnpaid')],
                  ['all', t('invoiceList.filterAll')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={clientTab === key}
                  onClick={() => {
                    setClientTab(key)
                    setSelected(new Set())
                  }}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${clientTab === key ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() => setPreview(true)}
                className="ml-auto inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {send.cta}
              </button>
            </div>
          ) : (
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'all' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('invoiceList.filterAll')}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unpaid')}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'unpaid' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('invoiceList.filterUnpaid')}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paid')}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'paid' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('invoiceList.filterPaid')}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('overdue')}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'overdue' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('invoiceList.filterOverdue')}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('toSend')}
              aria-pressed={statusFilter === 'toSend'}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'toSend' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('recurring.delivery.filter')} · {toSendCount}
            </button>
          </div>
          )}

          {statusFilter === 'toSend' && !client ? (
            <DeliveryQueue invoices={invoices} />
          ) : (
          <>

          {chosen.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-brand-ink/8 bg-[#EEF5F7] px-4 py-3" role="status">
              <p className="text-sm font-semibold">
                {t('invoiceList.selectedCount', { count: chosen.length })}
                <span className="ml-2 font-normal text-brand-ink/60">{formatMoney(chosenTotal, currency)}</span>
              </p>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                  {t('invoiceList.clearSelection')}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setBulkError('')
                    setBulkOpen(true)
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t('invoiceList.markPaid')}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="w-10 py-3 pl-5">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label={t('invoiceList.selectAll')}
                      title={t('invoiceList.selectAll')}
                      disabled={payable.length === 0}
                      checked={allChosen}
                      onChange={() => setSelected(allChosen ? new Set() : new Set(payable.map((item) => item.id)))}
                      className="h-4 w-4 cursor-pointer accent-[#2C6E7F] disabled:cursor-default disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('invoiceList.client')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('newInvoice.date')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('invoiceList.status')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('invoiceList.amount')}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{t('common.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = invoiceStatus(item)
                  const visible = visiblePaymentStatus(item)
                  const subject = invoiceSubject(item)
                  const late = daysOverdue(item)
                  const sent = isInvoiceSent(item)
                  const canRemind = (status === 'unpaid' || status === 'partial') && remainingOf(item) > 0
                  const reminded = item.reminders?.length || 0
                  const paying = busyId === item.id
                  const markPaidOrUnpaid = async () => {
                    if (paying) return
                    setBusyId(item.id)
                    try {
                      let doc = item
                      if (item.lifecycle === 'draft') {
                        await issueInvoice(item.id)
                        doc = { ...item, lifecycle: 'issued' as const }
                      }
                      await togglePaid(doc, {
                        addPayment: addInvoicePayment,
                        voidPayment: voidInvoicePayment,
                        setStatus: (next) => updateInvoice(doc.id, { status: next }),
                        payload: fullPaymentPayload(doc),
                      })
                    } catch (err) {
                      window.alert(err instanceof Error ? err.message : t('common.error'))
                    } finally {
                      setBusyId(null)
                    }
                  }
                  return (
                  <tr key={item.id} className={`border-b border-brand-ink/5 last:border-0 ${visible === 'cancelled' ? 'opacity-60' : ''} ${pulseId === item.id ? 'bg-[#EEF5F7] ring-2 ring-inset ring-brand/40' : ''} ${selected.has(item.id) && (status === 'unpaid' || status === 'partial') ? 'bg-[#F4F9FA]' : ''}`}>
                    <td className="w-10 py-2.5 pl-5">
                      {(status === 'unpaid' || status === 'partial') && remainingOf(item) > 0 ? (
                        <input
                          type="checkbox"
                          aria-label={t('invoiceList.selectOne', { number: item.number })}
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          className="h-4 w-4 cursor-pointer accent-[#2C6E7F]"
                        />
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Link to={status === 'draft' ? `/app/invoices/${item.id}/edit` : `/app/invoices/${item.id}`} className="font-semibold text-brand hover:underline">
                        {item.number}
                      </Link>
                    </td>
                    <td className="w-full min-w-[140px] max-w-0 px-4 py-2.5" title={[item.client?.fullName, subject].filter(Boolean).join(' — ')}>
                      <span className="block truncate">{item.client?.fullName}</span>
                      {subject ? <span className="block truncate text-xs text-brand-ink/45">{subject}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-brand-ink/70">
                      <div className="font-medium">{item.date}</div>
                      <div className="text-xs text-brand-ink/40">
                        {t('pdf.dueDateLabel')}: {item.dueDate || t('pdf.onReceipt')}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title={sent ? t('docs.sent') : t('send.action')}
                          disabled={visible === 'cancelled'}
                          onClick={() => setSendId(item.id)}
                          className={`inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold transition ${
                            sent ? 'bg-brand/10 text-brand hover:bg-brand/15' : 'border border-brand bg-white text-brand hover:bg-brand hover:text-white'
                          }`}
                        >
                          {sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                          {sent ? t('docs.sent') : t('send.action')}
                        </button>
                        <button
                          type="button"
                          disabled={paying || visible === 'cancelled'}
                          onClick={() => {
                            if (visible === 'cancelled') return
                            markPaidOrUnpaid()
                          }}
                          className={`inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold ${
                            visible === 'paid'
                              ? 'bg-[#E7F4EA] text-[#2E7D32]'
                              : visible === 'partial'
                                ? 'border border-[#E8B84A] bg-[#FFF6E5] text-[#8A5A00]'
                                : visible === 'cancelled'
                                  ? 'bg-brand-ink/10 text-brand-ink/55'
                                  : 'bg-[#C0503A] text-white'
                          }`}
                        >
                          {paying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              {visible === 'paid' ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : visible === 'partial' ? (
                                <PieChart className="h-3.5 w-3.5" />
                              ) : visible === 'cancelled' ? null : (
                                <Circle className="h-3.5 w-3.5" />
                              )}
                              {paidChipLabel(item, visible)}
                            </>
                          )}
                        </button>
                        {late > 0 ? (
                          <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-[#F8E8E4] px-2.5 text-[11px] font-semibold text-[#C0503A]">
                            {t('docs.overdueDays', { days: late })}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">
                      {formatMoney(Number(item.total) || 0, item.currency || currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {canRemind ? (
                          <button
                            type="button"
                            onClick={() => setRemindId(item.id)}
                            title={reminded ? t('remind.lastSent', { date: lastReminderTime(item) }) : undefined}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold ${reminded ? 'bg-[#FFF6E5] text-[#8A5A00] hover:bg-[#FCEBC8]' : 'text-brand hover:bg-brand/5'}`}
                          >
                            {reminded ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                            {reminded ? t('remind.sentCount', { count: reminded }) : t('remind.action')}
                          </button>
                        ) : null}
                        {status === 'draft' ? (
                          <>
                            <Link
                              to={`/app/invoices/${item.id}/edit`}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t('common.edit')}
                            </Link>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void onDelete(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#C0503A] hover:bg-[#F8E8E4]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t('common.delete')}
                            </button>
                          </>
                        ) : (
                          <>
                            {status === 'cancelled' && manager ? (
                              <button
                                type="button"
                                disabled={busyId === item.id}
                                onClick={() => void onDelete(item.id, item.number)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#C0503A] hover:bg-[#F8E8E4]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('common.delete')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setPreviewId(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t('newInvoice.preview')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{client ? t('invoiceList.clientNoUnpaid') : t('invoiceList.emptyTitle')}</p>
          ) : null}
          </>
          )}
        </div>
      ) : null}

      {preview ? (
        <Modal
          title={send.title}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={onSendList}>
                {t('common.send')}
              </Button>
            </>
          }
        >
          <iframe title="invoice-list-preview" className="h-[70vh] w-full bg-white" srcDoc={previewHtml} />
        </Modal>
      ) : null}

      {remindTarget ? <RemindPaymentModal invoice={remindTarget} onClose={() => setRemindId(null)} /> : null}

      {importOpen ? <ImportInvoicesModal onClose={() => setImportOpen(false)} /> : null}

      {bankOpen ? <BankMatchModal onClose={() => setBankOpen(false)} /> : null}

      {sendTarget ? <SendInvoiceModal invoice={sendTarget} onClose={() => setSendId(null)} /> : null}
      {previewTarget ? <InvoicePreviewModal invoice={previewTarget} onClose={() => setPreviewId(null)} /> : null}

      {bulkOpen && chosen.length > 0 ? (
        <Modal
          title={t('invoiceList.markPaid')}
          onClose={() => (bulkBusy ? undefined : setBulkOpen(false))}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" disabled={bulkBusy} onClick={() => void onMarkChosenPaid()}>
                {bulkBusy ? t('common.loading') : t('invoiceList.markPaidConfirm', { count: chosen.length })}
              </Button>
            </>
          }
        >
          <div className="space-y-5 bg-white p-6">
            <p className="text-sm leading-6 text-brand-ink/75">{t('invoiceList.markPaidBody', { count: chosen.length, total: formatMoney(chosenTotal, currency) })}</p>
            <fieldset>
              <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('invoiceList.paymentDate')}</legend>
              <div className="mt-2.5 space-y-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-ink/10 px-4 py-3">
                  <input type="radio" name="bulk-date" checked={bulkDate === 'invoice'} onChange={() => setBulkDate('invoice')} className="mt-1 h-4 w-4 accent-[#2C6E7F]" />
                  <span>
                    <span className="block text-sm font-semibold">{t('invoiceList.paymentDateInvoice')}</span>
                    <span className="block text-xs text-brand-ink/50">{t('invoiceList.paymentDateInvoiceHint')}</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-ink/10 px-4 py-3">
                  <input type="radio" name="bulk-date" checked={bulkDate === 'today'} onChange={() => setBulkDate('today')} className="mt-1 h-4 w-4 accent-[#2C6E7F]" />
                  <span className="text-sm font-semibold">{t('invoiceList.paymentDateToday')}</span>
                </label>
              </div>
            </fieldset>
            <p className="text-xs text-brand-ink/50">{t('invoiceList.markPaidUndo')}</p>
            {bulkError ? <p className="text-sm text-[#C0503A]">{bulkError}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
