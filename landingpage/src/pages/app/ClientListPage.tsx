import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Users } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { clientDisplayName, clientMatchesQuery } from '../../lib/client'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function ClientListPage() {
  const { clients, removeClient, loading } = useAppData()
  const { t, dict } = useI18n()
  const [query, setQuery] = useState('')

  const sorted = useMemo(
    () => [...clients].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b))),
    [clients],
  )
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
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_44px] gap-4 border-b border-brand-ink/8 bg-[#FAFBFB] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40 md:grid">
              <span>{t('clients.title')}</span>
              <span>{t('profile.phone')}</span>
              <span>{t('profile.email')}</span>
              <span>{dict.pdf.nuiLabel}</span>
              <span />
            </div>
            {visible.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/55">{t('common.noResults')}</p> : null}
            <ul>
              {visible.map((item) => {
                const name = clientDisplayName(item)
                return (
                  <li key={item.id} className="flex items-center gap-2 border-b border-brand-ink/5 pr-2 last:border-0 hover:bg-brand-bg/60">
                    <Link
                      to={`/app/clients/${item.id}`}
                      className="grid min-w-0 flex-1 grid-cols-1 items-center gap-x-4 gap-y-1 px-5 py-3.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)]"
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
