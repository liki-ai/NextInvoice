import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Search } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { formatMoney } from '../../lib/invoice'

export function InvoiceListPage() {
  const { invoices, loading, profile } = useAppData()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const currency = profile?.currency || 'EUR'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter((item) => {
      const hay = `${item.number} ${item.client?.fullName || ''} ${item.date}`.toLowerCase()
      return hay.includes(q)
    })
  }, [invoices, query])

  const billed = invoices.reduce((sum, item) => sum + (Number(item.total) || 0), 0)

  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('invoiceList.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('invoiceList.subtitle')}</p>
        </div>
        <Link
          to="/app/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          {t('nav.newInvoice')}
        </Link>
      </div>

      {invoices.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceList.countLabel', { count: invoices.length })}</p>
            <p className="mt-1 font-display text-2xl font-medium">{invoices.length}</p>
          </div>
          <div className="rounded-2xl border border-brand-ink/8 bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceList.billed')}</p>
            <p className="mt-1 font-display text-2xl font-medium">{formatMoney(billed, currency)}</p>
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
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                  <th className="px-5 py-3 font-semibold">{t('invoiceList.client')}</th>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.date')}</th>
                  <th className="px-5 py-3 font-semibold">{t('newInvoice.itemsSectionTitle')}</th>
                  <th className="px-5 py-3 text-right font-semibold">{t('invoiceList.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-brand-ink/5 last:border-0">
                    <td className="px-5 py-4">
                      <Link to={`/app/invoices/${item.id}`} className="font-semibold text-brand hover:underline">
                        {item.number}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{item.client?.fullName}</td>
                    <td className="px-5 py-4 text-brand-ink/60">{item.date}</td>
                    <td className="px-5 py-4 text-brand-ink/60">{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</td>
                    <td className="px-5 py-4 text-right font-semibold">{formatMoney(item.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('invoiceList.emptyTitle')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
