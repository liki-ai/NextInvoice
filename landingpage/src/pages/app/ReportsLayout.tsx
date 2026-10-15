import { NavLink, Outlet } from 'react-router-dom'
import { FolderKanban, HeartPulse, Landmark, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/cn'

// The reports behind the Overview menu item, as tabs: financial health and projects are for the
// owner and the administrators, so a member sees the overview alone, without tabs.

const TABS = [
  { to: '/app/finance', key: 'finance.tabs.health', icon: HeartPulse },
  { to: '/app/overview', key: 'finance.tabs.overview', icon: LayoutDashboard },
  { to: '/app/projects', key: 'finance.tabs.projects', icon: FolderKanban },
  { to: '/app/mercury', key: 'mercury.tab', icon: Landmark },
]

export function ReportsLayout() {
  const { user } = useAuth()
  const { t } = useI18n()
  if (user?.role === 'member') return <Outlet />
  return (
    <>
      {/* All three pages span the screen, so the tabs stay in the same place when switching. */}
      <nav aria-label={t('nav.overview')} className="mb-6 overflow-x-auto">
        <div className="inline-flex gap-1 rounded-2xl border border-brand-ink/8 bg-white p-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition sm:px-4',
                  isActive ? 'bg-brand-dark text-white' : 'text-brand-ink/60 hover:bg-brand-ink/5 hover:text-brand-ink',
                )
              }
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {t(tab.key)}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </>
  )
}
