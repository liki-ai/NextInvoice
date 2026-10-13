import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowDownZA, ArrowUpDown, ArrowUpNarrowWide, Plus, Search, Trash2, Users } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { clientDisplayName, clientMatchesQuery } from '../../lib/client'
import { clientMoneyTotals, formatMoney } from '../../lib/invoice'
import { formatMoneyList } from '../../lib/document'

type SortKey = 'name' | 'invoiced' | 'paid'
type Sort = { key: SortKey; desc: boolean }

const COLUMNS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

/** Amounts in several currencies sit one per line, so a narrow column never cuts one off. */
function stacked(amounts: string) {
  return amounts.split(' · ').map((amount) => (
    <span key={amount} className="block truncate">
      {amount}
    </span>
  ))
}

/** A column heading that sorts the list: names start A to Z, amounts start with the largest. */
function SortHeading({ column, label, sort, onSort, right }: { column: SortKey; label: string; sort: Sort; onSort: (next: Sort) => void; right?: boolean }) {
  const active = sort.key === column
  const Icon = !active ? ArrowUpDown : column === 'name' ? (sort.desc ? ArrowDownZA : ArrowDownAZ) : sort.desc ? ArrowDownWideNarrow : ArrowUpNarrowWide
  return (
    <span role="columnheader" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={right ? 'md:text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort({ key: column, desc: active ? !sort.desc : column !== 'name' })}
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-[0.08em] hover:text-brand-ink ${active ? 'text-brand' : ''}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

export function ClientListPage() {
  const { clients, invoices, removeClient, loading } = useAppData()
  const { t, dict } = useI18n()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', desc: false })

  const money = useMemo(() => clientMoneyTotals(clients, invoices), [clients, invoices])
  const sorted = useMemo(() => {
    const byName = (a: (typeof clients)[number], b: (typeof clients)[number]) => clientDisplayName(a).localeCompare(clientDisplayName(b))
    const amount = (item: (typeof clients)[number]) => (sort.key === 'paid' ? money.get(item.id)?.paidSum : money.get(item.id)?.invoicedSum) || 0
    return [...clients].sort((a, b) => {
      if (sort.key === 'name') return sort.desc ? byName(b, a) : byName(a, b)
      return (sort.desc ? amount(b) - amount(a) : amount(a) - amount(b)) || byName(a, b)
    })
  }, [clients, money, sort])
  const visible = useMemo(() => sorted.filter((item) => clientMatchesQuery(item, query)), [sorted, query])

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl font-medium tracking-tight">{t('clients.title')}</h1>
        <Link
          to="/app/clients/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          {t('clients.add')}
        </Link>
      </div>

      {loading && clients.length === 0 ? <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p> : null}

      {!loading && clients.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-brand-ink/8 bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-brand-ink/30" />
          <p className="mt-4 text-sm text-brand-ink/55">{t('clients.empty')}</p>
        </div>
      ) : null}

      {clients.length > 0 ? (
        <>
          <label className="relative mt-8 block max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('newInvoice.searchClients')}
              aria-label={t('newInvoice.searchClients')}
              className="w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <div className="mt-4 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
            <div className="flex items-center gap-2 border-b border-brand-ink/8 bg-[#FAFBFB] pr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40" role="row">
              <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 md:grid md:gap-4 ${COLUMNS}`}>
                <SortHeading column="name" label={t('clients.title')} sort={sort} onSort={setSort} />
                <span className="hidden md:block">{t('profile.phone')}</span>
                <span className="hidden md:block">{t('profile.email')}</span>
                <span className="hidden md:block">{dict.pdf.nuiLabel}</span>
                <SortHeading column="invoiced" label={t('overview.invoiced')} sort={sort} onSort={setSort} right />
                <SortHeading column="paid" label={t('invoiceList.paidTotal')} sort={sort} onSort={setSort} right />
              </div>
              <span className="w-8 shrink-0" />
            </div>
            {visible.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/55">{t('common.noResults')}</p> : null}
            <ul>
              {visible.map((item) => {
                const name = clientDisplayName(item)
                const totals = money.get(item.id)
                const invoiced = formatMoneyList(totals?.invoiced || [], formatMoney)
                const paid = formatMoneyList(totals?.paid || [], formatMoney)
                return (
                  <li key={item.id} className="flex items-center gap-2 border-b border-brand-ink/5 pr-2 last:border-0 hover:bg-brand-bg/60">
                    <Link
                      to={`/app/clients/${item.id}`}
                      className={`grid min-w-0 flex-1 grid-cols-1 items-center gap-x-4 gap-y-1 px-5 py-3.5 ${COLUMNS}`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{initials(name)}</span>
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-semibold text-brand-ink">{name}</span>
                            {item.taxRate === 0 ? (
                              <span className="shrink-0 rounded-md bg-brand-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink/55">{t('clients.taxNone')}</span>
                            ) : item.taxRate ? (
                              <span className="shrink-0 rounded-md bg-brand-bg px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-ink/55">{item.taxRate}%</span>
                            ) : null}
                          </span>
                          {item.address ? <span className="block truncate text-xs text-brand-ink/45">{item.address}</span> : null}
                        </span>
                      </span>
                      <span className="truncate pl-12 text-sm text-brand-ink/60 md:pl-0">{item.phone}</span>
                      <span className="truncate pl-12 text-sm text-brand-ink/60 md:pl-0">{item.email}</span>
                      <span className="hidden truncate text-sm text-brand-ink/60 md:block">{item.businessId}</span>
                      <span className="hidden text-right text-sm font-semibold tabular-nums text-brand-ink md:block">{stacked(invoiced)}</span>
                      <span className="hidden text-right text-sm tabular-nums text-brand-ink/70 md:block">{stacked(paid)}</span>
                      <span className="flex flex-wrap gap-x-3 pl-12 text-xs tabular-nums text-brand-ink/55 md:hidden">
                        <span className="whitespace-nowrap">
                          {t('overview.invoiced')} <span className="font-semibold text-brand-ink">{invoiced}</span>
                        </span>
                        <span className="whitespace-nowrap">
                          {t('invoiceList.paidTotal')} <span className="font-semibold text-brand-ink">{paid}</span>
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`${t('clients.deleteTitle')}: ${name}`}
                      title={t('clients.deleteTitle')}
                      className="rounded-lg p-2 text-brand-ink/35 hover:bg-[#F8E8E4] hover:text-[#C0503A]"
                      onClick={() => {
                        if (window.confirm(t('clients.deleteMessage'))) void removeClient(item.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}
