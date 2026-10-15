import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FileText, LayoutDashboard, LogOut, Menu, Plus, Settings, Tag, UserCog, Users, Wallet, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppDataProvider, useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { LanguagePicker } from '../../components/LangSwitch'
import { cn } from '../../lib/cn'
import { displayCompanyValue } from '../../lib/companySamples'

type NavItem = { to: string; managerTo?: string; icon: LucideIcon; key: string; active: (pathname: string, search: string) => boolean; managerOnly?: boolean }

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      {
        to: '/app',
        icon: FileText,
        key: 'nav.invoices',
        active: (pathname, search) =>
          pathname === '/app' ||
          pathname.startsWith('/app/new') ||
          pathname.startsWith('/app/invoices') ||
          (pathname.startsWith('/app/statement') && !search.includes('from=overview')),
      },
      { to: '/app/obligations', icon: Wallet, key: 'nav.obligations', active: (pathname) => pathname.startsWith('/app/obligations') },
      {
        // Its tabs: financial health (first, for managers), the overview, and projects.
        to: '/app/overview',
        managerTo: '/app/finance',
        icon: LayoutDashboard,
        key: 'nav.overview',
        active: (pathname, search) => ['/app/overview', '/app/finance', '/app/projects', '/app/mercury'].some((path) => pathname.startsWith(path)) || search.includes('from=overview'),
      },
    ],
  },
  {
    label: 'nav.groupCatalog',
    items: [
      { to: '/app/clients', icon: Users, key: 'nav.clients', active: (pathname) => pathname.startsWith('/app/clients') },
      { to: '/app/items', icon: Tag, key: 'nav.items', active: (pathname) => pathname.startsWith('/app/items') },
    ],
  },
  {
    label: 'nav.groupAccount',
    items: [
      {
        to: '/app/profile',
        icon: Settings,
        key: 'nav.profile',
        active: (pathname) => pathname.startsWith('/app/profile') || pathname.startsWith('/app/upgrade'),
      },
      { to: '/app/users', icon: UserCog, key: 'nav.users', active: (pathname) => pathname.startsWith('/app/users') },
    ],
  },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { logout, user } = useAuth()
  const { profile } = useAppData()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const companyName = displayCompanyValue('companyName', profile?.companyName)
  const logo = profile?.logoData?.startsWith('data:image/') ? profile.logoData : ''

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <button type="button" onClick={() => { navigate('/app'); onNavigate?.() }} className="text-left">
          <span className="font-display text-xl font-semibold tracking-tight text-white">Next Invoice</span>
          <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{t('nav.workspace')}</span>
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label || index}>
            {group.label ? (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{t(group.label)}</p>
            ) : null}
            <div className="space-y-1">
              {group.items.filter((item) => !item.managerOnly || user?.role !== 'member').map((item) => {
                const active = item.active(pathname, search)
                const to = item.managerTo && user?.role !== 'member' ? item.managerTo : item.to
                return (
                  <Link
                    key={item.to}
                    to={to}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                      active ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/6 hover:text-white',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.key)}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <NavLink to="/app/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-sm font-bold text-brand-dark">
            {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : (companyName || user?.email || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?'}
          </span>
          <span className="min-w-0">
            {companyName ? <span className="block truncate text-sm font-semibold text-white">{companyName}</span> : null}
            <span className="block truncate text-xs text-white/50">{user?.email}</span>
          </span>
        </NavLink>
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
        <NavLink
          to="/app/upgrade"
          onClick={onNavigate}
          className="mt-2 block truncate px-2 text-xs font-semibold text-white/55 hover:text-white"
        >
          {t('billing.current')}: {user?.plan === 'premium' ? t('billing.premiumName') : t('billing.freeName')}
        </NavLink>
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
          <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-brand-ink/40" onClick={() => setOpen(false)} />
          <div className="relative h-full w-[280px] bg-brand-dark shadow-2xl">
            <button type="button" aria-label={t('common.close')} className="absolute right-3 top-4 rounded-lg p-2 text-white/70" onClick={() => setOpen(false)}>
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
