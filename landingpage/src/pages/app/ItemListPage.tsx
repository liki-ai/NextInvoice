import { Link } from 'react-router-dom'
import { Plus, Tag, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { formatMoney } from '../../lib/invoice'

export function ItemListPage() {
  const { items, removeItem, profile, loading } = useAppData()
  const { t } = useI18n()
  const currency = profile?.currency || 'EUR'

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/app/profile" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
            ← {t('nav.more')}
          </Link>
          <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">{t('items.title')}</h1>
        </div>
        <Link
          to="/app/items/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
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
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <ul>
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-brand-ink/5 px-5 py-4 last:border-0">
                <Link to={`/app/items/${item.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-brand-ink">{item.description || t('items.untitled')}</p>
                  <p className="mt-1 text-sm text-brand-ink/50">
                    {formatMoney(Number(item.unitCost) || 0, currency)} · {t(`items.unit.${item.unit || 'pcs'}`)}
                  </p>
                </Link>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[#C0503A] hover:bg-[#F8E8E4]"
                  onClick={() => {
                    if (window.confirm(t('items.deleteMessage'))) void removeItem(item.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
