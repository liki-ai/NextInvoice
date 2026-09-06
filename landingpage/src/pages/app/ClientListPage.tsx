import { Link } from 'react-router-dom'
import { Plus, Trash2, Users } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { clientDisplayName } from '../../lib/client'

export function ClientListPage() {
  const { clients, removeClient, loading } = useAppData()
  const { t } = useI18n()

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/app/profile" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
            ← {t('nav.more')}
          </Link>
          <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">{t('clients.title')}</h1>
        </div>
        <Link
          to="/app/clients/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
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
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
          <ul>
            {clients.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-brand-ink/5 px-5 py-4 last:border-0">
                <Link to={`/app/clients/${item.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-brand-ink">{clientDisplayName(item)}</p>
                  <p className="mt-1 truncate text-sm text-brand-ink/50">{[item.phone, item.email].filter(Boolean).join(' · ')}</p>
                </Link>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[#C0503A] hover:bg-[#F8E8E4]"
                  onClick={() => {
                    if (window.confirm(t('clients.deleteMessage'))) void removeClient(item.id)
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
