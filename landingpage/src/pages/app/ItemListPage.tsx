import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Tag, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { formatMoney } from '../../lib/invoice'

export function ItemListPage() {
  const { items, removeItem, profile, loading } = useAppData()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const currency = profile?.currency || 'EUR'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...items].sort((a, b) => String(a.description || '').localeCompare(String(b.description || '')))
    if (!q) return sorted
    return sorted.filter((item) => `${item.description || ''} ${item.additionalDetails || ''}`.toLowerCase().includes(q))
  }, [items, query])

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-4xl font-medium tracking-tight">{t('items.title')}</h1>
        <Link
          to="/app/items/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          {t('items.add')}
        </Link>
      </div>

      {loading && items.length === 0 ? <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p> : null}

      {!loading && items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-brand-ink/8 bg-white p-10 text-center">
          <Tag className="mx-auto h-10 w-10 text-brand-ink/30" />
          <p className="mt-4 text-sm text-brand-ink/55">{t('items.empty')}</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <>
          <label className="relative mt-8 block max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              className="w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <div className="mt-4 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_44px] gap-4 border-b border-brand-ink/8 bg-[#FAFBFB] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40 md:grid">
              <span>{t('items.description')}</span>
              <span>{t('items.unitLabel')}</span>
              <span className="text-right">{t('items.unitCost')}</span>
              <span />
            </div>
            {visible.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/55">{t('common.noResults')}</p> : null}
            <ul>
              {visible.map((item) => {
                const name = item.description || t('items.untitled')
                return (
                  <li key={item.id} className="flex items-center gap-2 border-b border-brand-ink/5 pr-2 last:border-0 hover:bg-brand-bg/60">
                    <Link
                      to={`/app/items/${item.id}`}
                      className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_120px_140px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-brand-ink">{name}</span>
                        {item.additionalDetails ? <span className="block truncate text-xs text-brand-ink/45">{item.additionalDetails}</span> : null}
                      </span>
                      <span className="hidden text-sm text-brand-ink/60 md:block">{t(`items.unit.${item.unit || 'pcs'}`)}</span>
                      <span className="text-right text-sm font-semibold tabular-nums text-brand-ink">
                        {formatMoney(Number(item.unitCost) || 0, currency)}
                        <span className="ml-1 font-normal text-brand-ink/45 md:hidden">/ {t(`items.unit.${item.unit || 'pcs'}`)}</span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`${t('items.deleteTitle')}: ${name}`}
                      title={t('items.deleteTitle')}
                      className="rounded-lg p-2 text-brand-ink/35 hover:bg-[#F8E8E4] hover:text-[#C0503A]"
                      onClick={() => {
                        if (window.confirm(t('items.deleteMessage'))) void removeItem(item.id)
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
