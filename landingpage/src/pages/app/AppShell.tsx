import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { FileText, Plus, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppDataProvider } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { LangSwitch } from '../../components/LangSwitch'
import { cn } from '../../lib/cn'

function ShellInner() {
  const { t } = useI18n()
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-brand-bg pb-32">
      <header className="sticky top-0 z-40 border-b border-brand-ink/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button type="button" onClick={() => navigate('/app')} className="font-display text-lg font-bold">
            Next Invoice
          </button>
          <div className="flex items-center gap-3">
            <LangSwitch />
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/')
              }}
              className="text-xs font-bold text-brand-ink/60 hover:text-brand"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-ink/10 bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-3 items-end px-6 pb-3 pt-2">
          <NavLink
            to="/app"
            end
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 text-[11px] font-bold', isActive ? 'text-brand' : 'text-brand-ink/45')
            }
          >
            <FileText className="h-5 w-5" />
            {t('nav.invoices')}
          </NavLink>
          <NavLink to="/app/new" className="flex flex-col items-center">
            {({ isActive }) => (
              <span
                className={cn(
                  '-mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white shadow-lg',
                  isActive ? 'bg-brand text-white' : 'bg-[#EEF5F7] text-brand',
                )}
              >
                <Plus className="h-8 w-8" />
              </span>
            )}
          </NavLink>
          <NavLink
            to="/app/profile"
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 text-[11px] font-bold', isActive ? 'text-brand' : 'text-brand-ink/45')
            }
          >
            <UserRound className="h-5 w-5" />
            {t('nav.profile')}
          </NavLink>
        </div>
        {user?.email ? <p className="sr-only">{user.email}</p> : null}
      </nav>
    </div>
  )
}

export function AppShell() {
  return (
    <AppDataProvider>
      <ShellInner />
    </AppDataProvider>
  )
}
