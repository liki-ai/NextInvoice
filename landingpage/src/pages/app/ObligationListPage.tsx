import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Paperclip, Pencil, Plus, Search, Send, Trash2, Wallet } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import {
  buildPaidObligationsHtml,
  downloadHtmlAsPdf,
  formatMoney,
  formatStatementFileDate,
  paidObligationsFileName,
} from '../../lib/invoice'
import { localizeCompanyProfile } from '../../lib/companySamples'
import { obligationStatus, uniqueVendors, vendorSummaries } from '../../lib/obligation'
import type { Obligation } from '../../lib/obligation'

const MAX_PROOF_BYTES = 4 * 1024 * 1024

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

async function openProof(item: Obligation) {
  let proof = item
  if (!proof.proofData && proof.proofName) {
    const res = await api<{ obligation: Obligation }>(`/api/obligations/${item.id}`)
    proof = res.obligation
  }
  if (!proof.proofData) return
  const opened = window.open(proof.proofData, '_blank', 'noopener')
  if (opened) return
  const link = document.createElement('a')
  link.href = proof.proofData
  link.download = proof.proofName || 'proof'
  link.click()
}

export function ObligationListPage() {
  const { obligations, invoices, loading, profile, updateObligation, removeObligation } = useAppData()
  const { t, dict } = useI18n()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const currency = profile?.currency || 'EUR'
  const vendors = useMemo(() => uniqueVendors(obligations), [obligations])
  const summaries = useMemo(() => vendorSummaries(obligations), [obligations])
  const paidItems = obligations.filter((item) => obligationStatus(item) === 'paid')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return obligations.filter((item) => {
      if (statusFilter !== 'all' && obligationStatus(item) !== statusFilter) return false
      if (vendorFilter !== 'all' && item.vendor.trim().toLowerCase() !== vendorFilter) return false
      if (!q) return true
      const related = invoices.find((inv) => inv.id === item.relatedInvoiceId)
      const hay = `${item.vendor} ${item.notes || ''} ${item.description} ${item.date} ${related?.number || ''} ${related?.client?.fullName || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [obligations, invoices, query, statusFilter, vendorFilter])

  const unpaid = obligations
    .filter((item) => obligationStatus(item) === 'unpaid')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const paid = paidItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  async function onTogglePaid(id: string, current: 'paid' | 'unpaid') {
    if (busyId) return
    setBusyId(id)
    setError('')
    try {
      await updateObligation(id, { status: current === 'paid' ? 'unpaid' : 'paid' })
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(t('obligations.deleteConfirm'))) return
    if (busyId) return
    setBusyId(id)
    setError('')
    try {
      await removeObligation(id)
    } finally {
      setBusyId(null)
    }
  }

  async function onAttachProof(id: string, file: File | undefined) {
    if (!file) return
    if (file.size > MAX_PROOF_BYTES) {
      setError(t('obligations.proofTooLarge'))
      return
    }
    setBusyId(id)
    setError('')
    try {
      const proofData = await fileToDataUrl(file)
      await updateObligation(id, {
        proofName: file.name,
        proofMime: file.type || '',
        proofData,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  function onSendPaid() {
    if (!paidItems.length || !profile) return
    setSending(true)
    setError('')
    try {
      const html = buildPaidObligationsHtml({
        company: localizeCompanyProfile(profile, t),
        obligations: paidItems,
        issuedDate: formatStatementFileDate(new Date()),
        pdfLabels: {
          ...dict.pdf,
          paidObligationsTitle: t('obligations.sendPaidTitle'),
          vendor: t('obligations.vendor'),
          proofLabel: t('obligations.proofTitle'),
          proofYes: t('obligations.proofAttached'),
          proofNo: t('obligations.proofMissing'),
        },
      })
      downloadHtmlAsPdf(html, paidObligationsFileName())
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('obligations.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('obligations.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {paidItems.length > 0 ? (
            <button
              type="button"
              onClick={onSendPaid}
              disabled={sending}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
            >
              <Send className="h-4 w-4" />
              {sending ? t('common.loading') : t('obligations.sendPaid')}
            </button>
          ) : null}
          <Link
            to="/app/obligations/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            {t('nav.newObligation')}
          </Link>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-[#C0503A]">{error}</p> : null}

      {obligations.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('obligations.countLabel', { count: obligations.length })}</p>
            <p className="mt-1 font-display text-2xl font-medium">{obligations.length}</p>
          </div>
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('obligations.unpaidTotal')}</p>
            <p className="mt-1 font-display text-2xl font-medium">{formatMoney(unpaid, currency)}</p>
          </div>
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('obligations.paidTotal')}</p>
            <p className="mt-1 font-display text-2xl font-medium">{formatMoney(paid, currency)}</p>
          </div>
        </div>
      ) : null}

      {summaries.length > 1 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((item) => (
            <button
              key={item.vendor}
              type="button"
              onClick={() => setVendorFilter(item.vendor.toLowerCase())}
              className={`rounded-2xl border px-5 py-4 text-left transition ${
                vendorFilter === item.vendor.toLowerCase()
                  ? 'border-brand bg-brand/5'
                  : 'border-brand-ink/8 bg-white hover:border-brand/30'
              }`}
            >
              <p className="text-sm font-semibold">{item.vendor}</p>
              <p className="mt-1 text-xs text-brand-ink/50">{t('obligations.vendorCount', { count: item.count })}</p>
              <p className="mt-2 font-display text-lg font-medium">{formatMoney(item.unpaid, currency)}</p>
              <p className="text-[11px] text-brand-ink/40">{t('obligations.stillDue')}</p>
            </button>
          ))}
        </div>
      ) : null}

      {loading && obligations.length === 0 ? (
        <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p>
      ) : null}

      {!loading && obligations.length === 0 ? (
        <div className="mt-10 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-8 sm:p-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Wallet className="h-6 w-6" />
              </div>
              <h2 className="mt-6 font-display text-3xl font-medium">{t('obligations.emptyTitle')}</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-brand-ink/55">{t('obligations.empty')}</p>
              <Link
                to="/app/obligations/new"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                <Plus className="h-4 w-4" />
                {t('nav.newObligation')}
              </Link>
            </div>
            <div className="hidden bg-gradient-to-br from-[#EEF5F7] to-white lg:block" />
          </div>
        </div>
      ) : null}

      {obligations.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <div className="flex items-center gap-3 border-b border-brand-ink/8 px-4 py-3">
            <Search className="h-4 w-4 text-brand-ink/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('obligations.search')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-brand-ink/35"
            />
          </div>

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
            {vendors.length > 1 ? (
              <button
                type="button"
                onClick={() => setVendorFilter('all')}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${vendorFilter === 'all' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
              >
                {t('obligations.allVendors')}
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('obligations.vendor')}</th>
                  <th className="px-5 py-3 font-semibold">{t('obligations.optionalNotes')}</th>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.date')}</th>
                  <th className="px-5 py-3 font-semibold">{t('obligations.relatedInvoice')}</th>
                  <th className="px-5 py-3 font-semibold">{t('obligations.proofTitle')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('invoiceList.amount')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('common.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const related = invoices.find((inv) => inv.id === item.relatedInvoiceId)
                  const status = obligationStatus(item)
                  const hasProof = Boolean(item.proofName || item.proofData)
                  return (
                    <tr key={item.id} className="border-b border-brand-ink/5 last:border-0">
                      <td className="px-5 py-4">
                        <Link to={`/app/obligations/${item.id}/edit`} className="font-semibold text-brand hover:underline">
                          {item.vendor}
                        </Link>
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/40">
                          {t(`obligations.category.${item.category || 'other'}`)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-brand-ink/70">{item.notes || item.description || '—'}</td>
                      <td className="px-5 py-4 text-brand-ink/60">
                        <div className="font-semibold">{item.date}</div>
                        <div className="text-xs text-brand-ink/40">{item.dueDate || t('pdf.onReceipt')}</div>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          title={status === 'unpaid' ? t('invoiceList.tapToMarkPaid') : undefined}
                          onClick={() => onTogglePaid(item.id, status)}
                          className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            status === 'paid' ? 'bg-[#E7F4EA] text-[#2E7D32]' : 'bg-[#C0503A] text-white'
                          }`}
                        >
                          {status === 'paid' ? t('invoiceList.statusPaid') : t('invoiceList.statusUnpaid')}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-brand-ink/60">
                        {related ? (
                          <Link to={`/app/invoices/${related.id}`} className="font-semibold text-brand hover:underline">
                            {related.number}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {hasProof ? (
                            <button
                              type="button"
                              onClick={() => void openProof(item)}
                              className="inline-flex max-w-[160px] items-center gap-1 truncate text-xs font-semibold text-brand hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              {item.proofName || t('obligations.proofAttached')}
                            </button>
                          ) : null}
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#EEF5F7] px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brand/10">
                            {hasProof ? t('common.edit') : t('obligations.proofAdd')}
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="hidden"
                              onChange={(e) => {
                                void onAttachProof(item.id, e.target.files?.[0])
                                e.target.value = ''
                              }}
                            />
                          </label>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">{formatMoney(Number(item.amount) || 0, currency)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/app/obligations/${item.id}/edit`}
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
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('obligations.emptyTitle')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
