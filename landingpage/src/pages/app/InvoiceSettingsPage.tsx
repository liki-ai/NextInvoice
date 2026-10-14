import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileSliders, LayoutTemplate, Repeat, type LucideIcon } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/cn'
import { ProfilePage } from './ProfilePage'
import { RecurringPage } from './RecurringPage'

type Tab = { id: 'templates' | 'defaults' | 'recurring'; icon: LucideIcon; key: string }

const TABS: Tab[] = [
  { id: 'templates', icon: LayoutTemplate, key: 'recurring.settings.tabTemplates' },
  { id: 'defaults', icon: FileSliders, key: 'recurring.settings.tabDefaults' },
  { id: 'recurring', icon: Repeat, key: 'recurring.settings.tabRecurring' },
]

/** Everything about the invoices themselves, reached from the gear on the invoice list: tabs on the left. */
export function InvoiceSettingsPage() {
  const { t } = useI18n()
  const { tab = 'templates' } = useParams()
  if (!TABS.some((item) => item.id === tab)) return <Navigate to="/app/invoices/settings" replace />

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/app" className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-semibold text-brand-ink/55 hover:bg-brand/5 hover:text-brand-ink">
        <ArrowLeft className="h-4 w-4" />
        {t('nav.invoices')}
      </Link>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight">{t('recurring.settings.title')}</h1>
      <p className="mt-2 text-sm text-brand-ink/55">{t('recurring.settings.subtitle')}</p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label={t('recurring.settings.title')} className="flex gap-1 overflow-x-auto lg:sticky lg:top-8 lg:flex-col">
          {TABS.map((item) => (
            <NavLink
              key={item.id}
              to={item.id === 'templates' ? '/app/invoices/settings' : `/app/invoices/settings/${item.id}`}
              end
              className={() =>
                cn(
                  'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                  tab === item.id ? 'bg-brand text-white shadow-sm' : 'text-brand-ink/65 hover:bg-white hover:text-brand-ink',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === 'recurring' ? <RecurringPage embedded /> : <ProfilePage part={tab === 'defaults' ? 'defaults' : 'templates'} />}
        </div>
      </div>
    </div>
  )
}
