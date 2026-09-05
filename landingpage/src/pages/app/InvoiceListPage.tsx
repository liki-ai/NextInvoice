import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { Button, Modal } from '../../components/ui'
import {
  buildInvoiceListHtml,
  clientUnpaidSummaries,
  downloadHtmlAsPdf,
  formatMoney,
  formatStatementFileDate,
  invoiceListFileName,
  invoiceStatus,
} from '../../lib/invoice'
import { daysOverdue, formatMoneyList, isOverdue, remainingOf, totalsByCurrency } from '../../lib/document'
import { PaymentModal } from '../../components/PaymentModal'
import { localizeCompanyProfile } from '../../lib/companySamples'

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
  const { invoices, loading, profile, removeInvoice, addInvoicePayment } = useAppData()
  const { t, dict } = useI18n()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>('all')
  const [usage, setUsage] = useState<{ plan: 'free' | 'premium'; used: number; limit: number | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [payId, setPayId] = useState<string | null>(null)
  const navigate = useNavigate()
  const currency = profile?.currency || 'EUR'
  const send = sendCopy(statusFilter === 'overdue' ? 'unpaid' : statusFilter, t)

  useEffect(() => {
    void api<{ plan: 'free' | 'premium'; used: number; limit: number | null }>('/api/billing/usage')
      .then((res) => setUsage(res))
      .catch(() => {
        // If usage can't be loaded, we still allow browsing existing invoices.
      })
  }, [])

  const limitReached = usage?.plan === 'free' && usage.limit !== null && usage.used >= usage.limit

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? invoices
      : invoices.filter((item) => {
          const hay = `${item.number} ${item.client?.fullName || ''} ${item.date}`.toLowerCase()
          return hay.includes(q)
        })

    if (statusFilter === 'all') return list
    if (statusFilter === 'overdue') return list.filter((item) => isOverdue(item))
    if (statusFilter === 'paid') return list.filter((item) => invoiceStatus(item) === 'paid')
    return list.filter((item) => {
      const status = invoiceStatus(item)
      return status === 'unpaid' || status === 'partial'
    })
  }, [invoices, query, statusFilter])

  const unpaidClients = useMemo(() => clientUnpaidSummaries(invoices), [invoices])
  const statementTotal = unpaidClients.reduce((sum, item) => sum + item.unpaidTotal, 0)
  const unpaidInvoiceTotal = formatMoneyList(
    totalsByCurrency(invoices, (item) => (invoiceStatus(item) === 'paid' ? 0 : remainingOf(item))),
    formatMoney,
  )
  const paidInvoiceTotal = formatMoneyList(
    totalsByCurrency(invoices, (item) => (invoiceStatus(item) === 'paid' ? Number(item.total) || 0 : 0)),
    formatMoney,
  )

  async function onDelete(id: string) {
    if (!window.confirm(t('invoiceList.deleteConfirm'))) return
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

  function statusLabel(status: ReturnType<typeof invoiceStatus>) {
    if (status === 'paid') return t('invoiceList.statusPaid')
    if (status === 'partial') return t('docs.statusPartial')
    if (status === 'draft') return t('docs.statusDraft')
    if (status === 'cancelled') return t('docs.statusCancelled')
    return t('invoiceList.statusUnpaid')
  }

  const previewHtml =
    preview && profile && filtered.length
      ? buildInvoiceListHtml({
          company: localizeCompanyProfile(profile, t),
          invoices: filtered,
          issuedDate: formatStatementFileDate(new Date()),
          pdfLabels: {
            ...dict.pdf,
            listTitle: send.title,
            statusPaid: t('invoiceList.statusPaid'),
            statusUnpaid: t('invoiceList.statusUnpaid'),
            statusLabel: t('obligations.status'),
          },
        })
      : ''

  function onSendList() {
    if (!previewHtml) return
    downloadHtmlAsPdf(previewHtml, invoiceListFileName(send.kind))
    setPreview(false)
  }

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('invoiceList.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('invoiceList.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filtered.length > 0 ? (
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
            >
              <Send className="h-4 w-4" />
              {send.cta}
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

      {statusFilter !== 'paid' && unpaidClients.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setStatusFilter('unpaid')
            setPreview(true)
          }}
          className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-brand-ink/8 bg-white px-5 py-4 text-left hover:border-brand/30"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('statement.title')}</p>
            <p className="mt-1 text-sm text-brand-ink/70">{t('statement.banner')}</p>
          </div>
          <p className="font-display text-xl font-medium">{formatMoney(statementTotal, currency)}</p>
        </button>
      ) : null}

      {invoices.length > 0 ? (
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
            <Search className="h-4 w-4 text-brand-ink/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('invoiceList.search')}
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
            <button
              type="button"
              onClick={() => setStatusFilter('overdue')}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${statusFilter === 'overdue' ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink'}`}
            >
              {t('invoiceList.filterOverdue')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                  <th className="px-5 py-3 font-semibold">{t('invoiceList.client')}</th>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.date')}</th>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.itemsSectionTitle')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('invoiceList.amount')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('common.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = invoiceStatus(item)
                  const late = daysOverdue(item)
                  const due = remainingOf(item)
                  return (
                  <tr key={item.id} className={`border-b border-brand-ink/5 last:border-0 ${status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-4">
                      <Link to={`/app/invoices/${item.id}`} className="font-semibold text-brand hover:underline">
                        {item.number}
                      </Link>
                      {status === 'draft' ? <div className="text-xs text-brand-ink/40">{t('docs.draft')}</div> : null}
                    </td>
                    <td className="px-5 py-4">{item.client?.fullName}</td>
                    <td className="px-5 py-4 text-brand-ink/60">
                      <div className="font-semibold">{item.date}</div>
                      <div className="text-xs text-brand-ink/40">{item.dueDate || t('pdf.onReceipt')}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            status === 'paid'
                              ? 'bg-[#E7F4EA] text-[#2E7D32]'
                              : status === 'partial'
                                ? 'bg-[#FFF4D6] text-[#8A6D00]'
                                : status === 'cancelled'
                                  ? 'bg-brand-ink/10 text-brand-ink/55'
                                  : 'bg-[#C0503A] text-white'
                          }`}
                        >
                          {statusLabel(status)}
                        </span>
                        {late > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-[#F8E8E4] px-2.5 py-1 text-[11px] font-semibold text-[#C0503A]">
                            {t('docs.overdueDays', { days: late })}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-brand-ink/60">{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {formatMoney(status === 'cancelled' || status === 'draft' ? Number(item.total) || 0 : due, item.currency || currency)}
                      {status === 'partial' ? <div className="text-xs font-normal text-brand-ink/40">{t('docs.remaining')}</div> : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {status !== 'cancelled' && status !== 'draft' && due > 0 ? (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => setPayId(item.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
                          >
                            {t('docs.recordPayment')}
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
                          <Link
                            to={`/app/invoices/${item.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
                          >
                            {t('invoiceList.view')}
                          </Link>
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
            <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('invoiceList.emptyTitle')}</p>
          ) : null}
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

      {payId ? (
        <PaymentModal
          doc={invoices.find((item) => item.id === payId) || { total: 0 }}
          currency={invoices.find((item) => item.id === payId)?.currency || currency}
          onClose={() => setPayId(null)}
          onSave={async (payment) => {
            await addInvoicePayment(payId, payment)
          }}
        />
      ) : null}
    </div>
  )
}
