import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink, Landmark, RefreshCw, Repeat, Search, Settings2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal } from '../../components/ui'
import { api, apiBase } from '../../lib/api'
import { cn } from '../../lib/cn'
import { buildMercuryReport, isInternal, mercuryYears, partyName, spendGroup, type Insight, type MercuryTransaction, type MercuryView, type PartyTotal } from '../../lib/mercury'

type T = (key: string, params?: Record<string, string | number>) => string

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const USD_WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd = (value: number | null | undefined) => (typeof value === 'number' ? USD.format(value) : '—')
const usdWhole = (value: number) => USD_WHOLE.format(value)

const TONE: Record<Insight['tone'], string> = {
  good: 'bg-[#2E8B57]',
  info: 'bg-brand',
  warn: 'bg-[#C9A227]',
  bad: 'bg-[#C0503A]',
}

function errorText(t: T, err: unknown) {
  const code = (err as { code?: string })?.code
  if (code) {
    const known = t(`mercury.err.${code}`)
    if (known !== `mercury.err.${code}`) return known
  }
  return err instanceof Error ? err.message : t('common.error')
}

function shortDay(day: string) {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

function monthLabel(month: string, lang: string) {
  const [year, index] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(year, index - 1, 1))
}

/** Mercury's categories come in English; ours are named in the page's language. */
function groupLabel(t: T, name: string) {
  return ['card', 'transfers', 'fees'].includes(name) ? t(`mercury.group.${name}`) : name
}

function Tile({ label, value, lines, primary }: { label: string; value: ReactNode; lines?: string[]; primary?: boolean }) {
  const shown = (lines || []).filter(Boolean)
  return (
    <div className={cn('flex h-full flex-col rounded-2xl border bg-white p-4 sm:p-5', primary ? 'border-brand/20 shadow-[0_1px_2px_rgba(29,43,46,0.05)]' : 'border-brand-ink/8')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', primary ? 'text-brand' : 'text-brand-ink/45')}>{label}</p>
      <p className={cn('mt-2 font-display font-medium leading-none tabular-nums', primary ? 'text-2xl sm:text-[28px]' : 'text-xl sm:text-2xl')}>{value}</p>
      {shown.length ? (
        <div className="mt-3 space-y-1 border-t border-brand-ink/6 pt-2.5">
          {shown.map((line) => (
            <p key={line} className="text-[13px] leading-5 text-brand-ink/60">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{children}</h2>
      {action}
    </div>
  )
}

/** The arrow shows which way it moved; the colour whether that is good (more income, less spending). */
function Trend({ change, good }: { change: number | null; good: boolean }) {
  if (change === null) return <span className="text-brand-ink/25">—</span>
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', good ? 'bg-[#2E8B57]/10 text-[#2E8B57]' : 'bg-[#C0503A]/10 text-[#C0503A]')}>
      {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
    </span>
  )
}

/** A ranked list with a share bar: who pays the company, or what its money goes to. */
function Ranked({ items, label, t, inverse }: { items: PartyTotal[]; label: (name: string) => string; t: T; inverse?: boolean }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-brand-ink/45">{t('mercury.none')}</p>
  return (
    <ul className="divide-y divide-brand-ink/5">
      {items.slice(0, 8).map((item) => (
        <li key={item.name} className="py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-semibold">{label(item.name)}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums">{usdWhole(item.total)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-ink/[0.06]">
              <span className={cn('block h-full rounded-full', inverse ? 'bg-[#C0503A]/70' : 'bg-brand')} style={{ width: `${Math.max(1, Math.round(item.share * 100))}%` }} />
            </span>
            <span className="w-9 text-right text-[11px] tabular-nums text-brand-ink/45">{Math.round(item.share * 100)}%</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-brand-ink/50">
            <span>{t('mercury.perMonthRecent', { amount: usdWhole(item.recent) })}</span>
            {/* Spending that grows is the warning sign, income that grows the good one. */}
            {item.change !== null ? <Trend change={item.change} good={inverse ? item.change <= 0 : item.change >= 0} /> : null}
            {item.change !== null ? <span>{t('mercury.vsBefore')}</span> : null}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function MercuryPage() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const [view, setView] = useState<MercuryView | null>(null)
  const [error, setError] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [spendBy, setSpendBy] = useState<'groups' | 'vendors'>('groups')
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(40)
  const [syncing, setSyncing] = useState(false)
  const manager = user?.role !== 'member'

  const load = useCallback(async () => {
    try {
      setView(await api<MercuryView>('/api/mercury'))
      setError('')
    } catch (err) {
      setError(errorText(t, err))
    }
  }, [t])

  useEffect(() => {
    if (manager) void load()
  }, [load, manager])

  // Follow a sync the server is running (the first one reads the whole history).
  useEffect(() => {
    if (!view || !view.connected || !view.syncing) return undefined
    const timer = setTimeout(() => void load(), 3000)
    return () => clearTimeout(timer)
  }, [view, load])

  const connected = view?.connected ? view : null
  const transactions = useMemo(() => connected?.transactions || [], [connected])
  const report = useMemo(() => (connected ? buildMercuryReport(connected.accounts, transactions, year) : null), [connected, transactions, year])
  const years = useMemo(() => mercuryYears(transactions), [transactions])
  const listed = useMemo(() => {
    const words = query.trim().toLowerCase()
    return transactions.filter((tx) => {
      if (filter === 'in' && tx.amount <= 0) return false
      if (filter === 'out' && tx.amount >= 0) return false
      if (!words) return true
      return `${tx.counterparty} ${tx.description} ${tx.note} ${tx.category}`.toLowerCase().includes(words)
    })
  }, [transactions, filter, query])

  async function syncNow() {
    setSyncing(true)
    try {
      setView(await api<MercuryView>('/api/mercury/sync', { method: 'POST' }))
      setError('')
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setSyncing(false)
    }
  }

  if (!manager) {
    return (
      <Card>
        <p className="text-sm text-brand-ink/60">{t('finance.managersOnly')}</p>
      </Card>
    )
  }

  const company = connected?.accounts.find((item) => item.company)?.company
  const peak = report ? Math.max(1, ...report.months.map((month) => Math.max(month.in, month.out))) : 1
  const isThisYear = year === new Date().getFullYear()

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-medium tracking-tight">
            Mercury
            {company ? <span className="rounded-lg bg-brand-ink/[0.05] px-2 py-1 font-sans text-xs font-semibold text-brand-ink/60">{company} · USD</span> : null}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/55">{t('mercury.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <>
              <select aria-label={t('finance.year')} value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-brand-ink/10 bg-white px-3 py-2.5 text-sm font-semibold">
                {years.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" disabled={syncing || connected.syncing} onClick={() => void syncNow()}>
                <RefreshCw className={cn('h-4 w-4', (syncing || connected.syncing) && 'animate-spin')} />
                {t('mercury.syncNow')}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('mercury.settings')}</span>
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-[#C0503A]">{error}</p> : null}

      {connected ? (
        <p className={cn('mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', connected.lastError ? 'text-[#C0503A]' : 'text-brand-ink/50')}>
          <Landmark className="h-3.5 w-3.5" />
          {connected.syncing && !connected.lastSyncAt
            ? t('mercury.firstSync')
            : connected.lastError
              ? `${t('mercury.syncFailed')}: ${t(`mercury.err.${connected.lastError}`) === `mercury.err.${connected.lastError}` ? connected.lastError : t(`mercury.err.${connected.lastError}`)}`
              : connected.lastSyncAt
                ? t('mercury.lastSync', { date: new Date(connected.lastSyncAt).toLocaleString(lang), count: transactions.length })
                : ''}
          <span>· {connected.webhook.configured ? t('mercury.liveOn') : t('mercury.liveOff')}</span>
        </p>
      ) : null}

      {view && !view.connected ? (
        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-start gap-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Landmark className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-medium">{t('mercury.connectTitle')}</h2>
              <p className="mt-1 max-w-2xl text-sm text-brand-ink/60">{t('mercury.connectBody')}</p>
              <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-brand-ink/70">
                <li>{t('mercury.step1')}</li>
                <li>{t('mercury.step2')}</li>
                <li>{t('mercury.step3')}</li>
              </ol>
              <Button type="button" className="mt-5" onClick={() => setSettingsOpen(true)}>
                {t('mercury.connect')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {connected && report ? (
        <>
          {report.insights.length ? (
            <section className="mt-6" aria-labelledby="mercury-insights">
              <SectionTitle>
                <span id="mercury-insights">{t('mercury.insightsTitle')}</span>
              </SectionTitle>
              <Card className="p-0">
                <ul className="divide-y divide-brand-ink/6">
                  {report.insights.map((item) => (
                    <li key={item.key} className="flex items-start gap-3 px-5 py-3.5">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[item.tone])} />
                      <p className="text-[13px] leading-5 text-brand-ink/75">
                        {t(`mercury.insight.${item.key}`, Object.fromEntries(Object.entries(item.params).map(([key, value]) => [key, typeof value === 'number' && ['recent', 'before', 'monthly', 'surplus'].includes(key) ? usdWhole(value) : value])))}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="mercury-figures">
            <SectionTitle>
              <span id="mercury-figures">{t('mercury.figuresTitle', { year })}</span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile primary label={t('mercury.balance')} value={usd(report.balance)} lines={connected.accounts.map((item) => `${item.name}: ${usd(item.currentBalance)}`)} />
              <Tile primary label={t(isThisYear ? 'mercury.incomeYtd' : 'mercury.incomeYear', { year })} value={usd(report.income)} lines={[report.avgIncome !== null ? t('mercury.avgRecent', { amount: usd(report.avgIncome) }) : '']} />
              <Tile primary label={t(isThisYear ? 'mercury.spendYtd' : 'mercury.spendYear', { year })} value={usd(report.spending)} lines={[report.burn !== null ? t('mercury.avgRecent', { amount: usd(report.burn) }) : '']} />
              <Tile
                primary
                label={t('mercury.net', { year })}
                value={<span className={report.net < 0 ? 'text-[#C0503A]' : undefined}>{usd(report.net)}</span>}
                lines={[
                  report.margin !== null ? t('mercury.margin', { margin: Math.round(report.margin * 100) }) : '',
                  report.runway !== null ? t('mercury.runway', { months: Math.round(report.runway * 10) / 10 }) : report.burn !== null ? t('mercury.selfFunded') : '',
                ]}
              />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="mercury-monthly">
            <SectionTitle
              action={
                <span className="flex items-center gap-3 text-[11px] text-brand-ink/50">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-brand" />
                    {t('mercury.in')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-[#C0503A]/60" />
                    {t('mercury.out')}
                  </span>
                </span>
              }
            >
              <span id="mercury-monthly">{t('mercury.monthlyTitle', { year })}</span>
            </SectionTitle>
            <Card className="p-5">
              <div className="grid grid-cols-12 items-end gap-1.5 sm:gap-3" style={{ height: 180 }}>
                {report.months.map((month) => (
                  <div key={month.month} className="flex h-full items-end justify-center gap-0.5 sm:gap-1" title={`${monthLabel(month.month, lang)}: ${t('mercury.in')} ${usd(month.in)} · ${t('mercury.out')} ${usd(month.out)} · ${t('mercury.netShort')} ${usd(month.net)}`}>
                    <span className="w-1/2 max-w-[18px] rounded-t bg-brand" style={{ height: `${(month.in / peak) * 100}%`, minHeight: month.in ? 2 : 0 }} />
                    <span className="w-1/2 max-w-[18px] rounded-t bg-[#C0503A]/60" style={{ height: `${(month.out / peak) * 100}%`, minHeight: month.out ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-12 gap-1.5 border-t border-brand-ink/8 pt-2 text-center sm:gap-3">
                {report.months.map((month) => (
                  <div key={month.month} className="min-w-0">
                    <p className="text-[11px] font-semibold capitalize text-brand-ink/55">{monthLabel(month.month, lang)}</p>
                    <p className={cn('mt-0.5 truncate text-[10px] tabular-nums sm:text-[11px]', month.net < 0 ? 'text-[#C0503A]' : month.net > 0 ? 'text-[#2E8B57]' : 'text-brand-ink/25')}>
                      {month.in || month.out ? `${month.net >= 0 ? '+' : '−'}${usdWhole(Math.abs(month.net)).replace('$', '$')}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="mercury-sources">
              <SectionTitle>
                <span id="mercury-sources">{t('mercury.sourcesTitle')}</span>
              </SectionTitle>
              <Card className="px-5 py-2">
                <Ranked items={report.sources} label={(name) => name} t={t} />
              </Card>
              <p className="mt-2 text-[11px] text-brand-ink/45">{t('mercury.ipacientiNote')}</p>
            </section>
            <section aria-labelledby="mercury-spend">
              <SectionTitle
                action={
                  <span className="inline-flex rounded-lg border border-brand-ink/10 bg-white p-0.5 text-[11px] font-semibold">
                    {(['groups', 'vendors'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSpendBy(key)}
                        className={cn('rounded-md px-2 py-1 transition', spendBy === key ? 'bg-brand-dark text-white' : 'text-brand-ink/55 hover:text-brand-ink')}
                      >
                        {t(`mercury.by.${key}`)}
                      </button>
                    ))}
                  </span>
                }
              >
                <span id="mercury-spend">{t('mercury.spendTitle')}</span>
              </SectionTitle>
              <Card className="px-5 py-2">
                <Ranked items={spendBy === 'groups' ? report.groups : report.vendors} label={(name) => groupLabel(t, name)} t={t} inverse />
              </Card>
            </section>
          </div>

          {report.recurring.length ? (
            <section className="mt-8" aria-labelledby="mercury-recurring">
              <SectionTitle action={<span className="text-[11px] font-semibold text-brand-ink/55">{t('mercury.recurringTotal', { amount: usd(report.recurringMonthly) })}</span>}>
                <span id="mercury-recurring">{t('mercury.recurringTitle')}</span>
              </SectionTitle>
              <Card className="p-0">
                <ul className="grid divide-y divide-brand-ink/5 sm:grid-cols-2 sm:divide-y-0">
                  {report.recurring.map((item) => (
                    <li key={item.name} className="flex items-center justify-between gap-3 border-brand-ink/5 px-5 py-3 sm:border-b">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Repeat className="h-3.5 w-3.5 shrink-0 text-brand-ink/35" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{item.name}</span>
                          <span className="block text-[11px] text-brand-ink/45">{groupLabel(t, item.group)}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums">{t('mercury.perMonth', { amount: usd(item.monthly) })}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="mercury-transactions">
            <SectionTitle>
              <span id="mercury-transactions">{t('mercury.transactionsTitle', { count: listed.length })}</span>
            </SectionTitle>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-brand-ink/10 bg-white p-1 text-xs font-semibold">
                {(['all', 'in', 'out'] as const).map((key) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} className={cn('rounded-lg px-3 py-1.5 transition', filter === key ? 'bg-brand-dark text-white' : 'text-brand-ink/55 hover:text-brand-ink')}>
                    {t(`mercury.filter.${key}`)}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setShown(40)
                  }}
                  placeholder={t('mercury.search')}
                  className="w-full rounded-xl border border-brand-ink/10 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </label>
            </div>
            <Card className="overflow-hidden p-0">
              {listed.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-brand-ink/45">{t('mercury.none')}</p>
              ) : (
                <ul className="divide-y divide-brand-ink/5">
                  {listed.slice(0, shown).map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} t={t} />
                  ))}
                </ul>
              )}
            </Card>
            {listed.length > shown ? (
              <div className="mt-3 text-center">
                <Button type="button" variant="secondary" onClick={() => setShown((count) => count + 80)}>
                  {t('mercury.more', { count: listed.length - shown })}
                </Button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {settingsOpen && view ? (
        <SettingsModal
          view={view}
          t={t}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setView(next)
            setSettingsOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function TransactionRow({ tx, t }: { tx: MercuryTransaction; t: T }) {
  const incoming = tx.amount > 0
  const internal = isInternal(tx)
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', internal && 'opacity-55')}>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', incoming ? 'bg-[#2E8B57]/10 text-[#2E8B57]' : 'bg-brand-ink/[0.05] text-brand-ink/55')}>
        {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{partyName(tx)}</p>
        <p className="truncate text-[11px] text-brand-ink/50">
          {shortDay(tx.date)} · {internal ? t('mercury.internal') : incoming ? t('mercury.ipacienti') : groupLabel(t, spendGroup(tx))}
          {tx.status === 'pending' ? ` · ${t('mercury.pending')}` : ''}
          {tx.note ? ` · ${tx.note}` : ''}
        </p>
      </div>
      <span className={cn('shrink-0 text-right text-[13px] font-semibold tabular-nums', incoming ? 'text-[#2E8B57]' : '')}>
        {incoming ? '+' : '−'}
        {USD.format(Math.abs(tx.amount))}
        {tx.eur !== null && incoming && !internal ? <span className="block text-[11px] font-normal text-brand-ink/45">≈ {Math.abs(tx.eur).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span> : null}
      </span>
      {tx.link ? (
        <a href={tx.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg p-1.5 text-brand-ink/35 hover:bg-brand-ink/5 hover:text-brand-ink" aria-label={t('mercury.openInMercury')} title={t('mercury.openInMercury')}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </li>
  )
}

function SettingsModal({ view, t, onClose, onSaved }: { view: MercuryView; t: T; onClose: () => void; onSaved: (view: MercuryView) => void }) {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [since, setSince] = useState(view.since)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const webhookUrl = view.connected ? `${apiBase() || window.location.origin}${view.webhook.path}` : ''

  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await api<MercuryView>('/api/mercury', { method: 'PUT', body: { token, since, ...(secret ? { webhookSecret: secret } : {}) } }))
    } catch (err) {
      const detail = (err as { detail?: string }).detail
      setError(errorText(t, err) + (detail && !/unauthor/i.test(detail) ? ` (${detail})` : ''))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      onSaved(await api<MercuryView>('/api/mercury', { method: 'DELETE' }))
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      size="sm"
      title={t('mercury.settings')}
      onClose={onClose}
      footer={
        <>
          {view.connected ? (
            confirming ? (
              <Button type="button" variant="danger" className="mr-auto" disabled={busy} onClick={() => void disconnect()}>
                {t('mercury.disconnectConfirm')}
              </Button>
            ) : (
              <Button type="button" variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
                {t('mercury.disconnect')}
              </Button>
            )
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || (!view.connected && !token.trim())} onClick={() => void save()}>
            {busy ? t('mercury.checking') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="bg-white p-6">
        <Field
          label={t('mercury.token')}
          type="password"
          autoComplete="off"
          value={token}
          placeholder={view.connected ? t('mercury.tokenKept') : 'secret-token:mercury_production_…'}
          onChange={(e) => setToken(e.target.value)}
        />
        <p className="-mt-3 mb-5 text-xs leading-5 text-brand-ink/50">{t('mercury.tokenHint')}</p>
        <Field label={t('mercury.since')} type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        {view.connected ? (
          <div className="mt-2 rounded-xl border border-brand-ink/8 bg-brand-bg/60 p-4">
            <p className="text-sm font-semibold">{t('mercury.webhookTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-brand-ink/55">{t('mercury.webhookHint')}</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-2 text-[11px] text-brand-ink/70">{webhookUrl}</code>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-4">
              <Field
                label={t('mercury.secret')}
                type="password"
                autoComplete="off"
                value={secret}
                placeholder={view.webhook.configured ? t('mercury.tokenKept') : ''}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-[#C0503A]">{error}</p> : null}
      </div>
    </Modal>
  )
}
