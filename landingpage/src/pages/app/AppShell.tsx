import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FileText, LayoutDashboard, LogOut, Menu, Plus, Settings, Wallet, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppDataProvider } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { LanguagePicker } from '../../components/LangSwitch'
import { cn } from '../../lib/cn'

const NAV = [
  { to: '/app', end: true, icon: FileText, key: 'nav.invoices', id: 'invoices' },
  { to: '/app/obligations', end: false, icon: Wallet, key: 'nav.obligations', id: 'obligations' },
  { to: '/app/overview', end: false, icon: LayoutDashboard, key: 'nav.overview', id: 'overview' },
  { to: '/app/profile', end: true, icon: Settings, key: 'nav.profile', id: 'settings' },
] as const

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const invoicesActive =
    pathname === '/app' ||
    pathname.startsWith('/app/invoices') ||
    (pathname.startsWith('/app/statement') && !search.includes('from=overview'))
  const obligationsActive = pathname.startsWith('/app/obligations')
  const overviewActive = pathname.startsWith('/app/overview') || search.includes('from=overview')
  const settingsActive = pathname.startsWith('/app/profile') || pathname.startsWith('/app/upgrade')

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-8 pt-7">
        <button type="button" onClick={() => { navigate('/app'); onNavigate?.() }} className="text-left">
          <span className="font-display text-xl font-semibold tracking-tight text-white">Next Invoice</span>
          <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{t('nav.workspace')}</span>
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => {
              const active =
                item.id === 'invoices'
                  ? invoicesActive
                  : item.id === 'obligations'
                    ? obligationsActive
                    : item.id === 'overview'
                      ? overviewActive
                      : item.id === 'settings'
                        ? settingsActive
                        : isActive
              return cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                active ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/6 hover:text-white',
              )
            }}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 px-4 py-4">
        <p className="truncate px-2 text-xs text-white/50">{user?.email}</p>
        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <LanguagePicker variant="dark" />
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/')
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/55 hover:bg-white/8 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ShellInner() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const composeTo = pathname.startsWith('/app/obligations') ? '/app/obligations/new' : '/app/new'
  const showCompose =
    pathname === '/app' ||
    (pathname.startsWith('/app/obligations') && !pathname.includes('/new') && !pathname.includes('/edit'))

  return (
    <div className="min-h-screen bg-brand-bg lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="fixed inset-y-0 left-0 w-[260px] bg-brand-dark">
          <Sidebar />
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-brand-ink/40" onClick={() => setOpen(false)} />
          <div className="relative h-full w-[280px] bg-brand-dark shadow-2xl">
            <button type="button" className="absolute right-3 top-4 rounded-lg p-2 text-white/70" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-brand-ink/8 bg-brand-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-brand-ink hover:bg-white" aria-label={t('nav.menu')}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-lg font-semibold">Next Invoice</span>
          <div className="ml-auto flex items-center gap-2">
            {showCompose ? (
              <NavLink
                to={composeTo}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A227] text-white shadow-sm"
                aria-label={pathname.startsWith('/app/obligations') ? t('nav.newObligation') : t('nav.newInvoice')}
              >
                <Plus className="h-5 w-5" />
              </NavLink>
            ) : null}
            <LanguagePicker />
          </div>
        </header>
        <main className="w-full px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
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
