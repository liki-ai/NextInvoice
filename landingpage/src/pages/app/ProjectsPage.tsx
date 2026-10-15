import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronRight, FolderKanban, Info, Landmark, Loader2, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card } from '../../components/ui'
import { api, apiBase, getToken } from '../../lib/api'
import { matchStatement, readStatementFile, type BankLine } from '../../lib/bankMatch'
import { cn } from '../../lib/cn'
import { currencySymbol, type Invoice } from '../../lib/invoice'
import { currentDocuments, monthlyFigures, payrollFullCost, runningCosts, type FinanceDoc, type FinanceView } from '../../lib/finance'
import { readAnyWorkbook } from '../../lib/serverFinance'
import { ipacientiCredits, type MercuryTransaction, type MercuryView } from '../../lib/mercury'
import {
  MONTH_HOURS_LIMIT,
  buildProjectsReport,
  ownClientIds,
  payerWords,
  readTimesheet,
  type MonthCosts,
  type ProjectKind,
  type BankCredit,
  type ProjectsReport,
  type Signal,
  type TimesheetView,
} from '../../lib/timesheet'

type T = (key: string, params?: Record<string, string | number>) => string

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ONE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const CENTS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ACCEPT = '.xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const KINDS: ProjectKind[] = ['client', 'product', 'unset', 'shared']
const KIND_BAR: Record<ProjectKind, string> = {
  client: 'bg-brand',
  product: 'bg-[#6B8E5A]',
  shared: 'bg-brand-accent',
  unset: 'bg-brand-ink/20',
}

/** How many projects the bar chart names; the rest are summed in one bar. */
const CHART_PROJECTS = 12

/** "2026-03" → "Mars 2026", or "Mar" for a chart axis; the names come from the translations, which every browser has. */
function monthLabel(month: string, t: T, style: 'short' | 'long' = 'short') {
  const [year, number] = month.split('-').map(Number)
  const names = t(style === 'long' ? 'finance.projects.months' : 'finance.projects.monthsShort').split(',')
  return style === 'long' ? `${names[number - 1]} ${year}` : names[number - 1]
}

function shortDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return day ? `${day[3]}.${day[2]}.${day[1]}` : String(value || '')
}

function errorText(t: T, err: unknown) {
  const code = (err as { code?: string })?.code
  if (code) {
    const known = t(`finance.projects.err.${code}`)
    if (known !== `finance.projects.err.${code}`) return known
  }
  return err instanceof Error ? err.message : t('common.error')
}

/** Each month's tax factor, running costs and full pay cost, from the finance documents. */
function costsByMonth(docs: FinanceDoc[], invoices: Invoice[], months: string[], currency: string) {
  const current = currentDocuments(docs)
  const result: Record<string, MonthCosts> = {}
  for (const year of [...new Set(months.map((month) => Number(month.slice(0, 4))))]) {
    for (const month of monthlyFigures(current, invoices, year, currency)) {
      if (!months.includes(month.period)) continue
      const pay = payrollFullCost(month)
      const factor = typeof pay.cost === 'number' && typeof pay.net === 'number' && pay.net > 0 ? pay.cost / pay.net : null
      // A factor outside this range is a misread document, not the taxes on pay.
      result[month.period] = { taxFactor: factor !== null && factor >= 1 && factor <= 1.8 ? factor : null, running: runningCosts(month), payrollCost: pay.cost }
    }
  }
  return result
}

/** Money into the bank that no invoice accounts for, from the statements covering the months. */
async function looseCredits(docs: FinanceDoc[], invoices: Invoice[], months: string[]) {
  const first = `${months[0]}-01`
  const last = `${months[months.length - 1]}-31`
  const statements = docs.filter(
    (doc) =>
      doc.kind === 'bank_statement' &&
      doc.status === 'done' &&
      !doc.excluded &&
      doc.hasFile &&
      /\.(xlsx|xls|csv)$/i.test(doc.name) &&
      (!doc.statement || (doc.statement.to >= first && doc.statement.from <= last)),
  )
  const seen = new Set<string>()
  const lines: (BankLine & { rest: number })[] = []
  for (const doc of statements) {
    try {
      const res = await fetch(`${apiBase()}/api/finance/documents/${doc.id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) continue
      const statement = await readStatementFile(await res.blob())
      if (!statement) continue
      for (const line of matchStatement(statement, invoices).loose) {
        const key = `${line.date}|${line.rest}|${line.text}`
        if (seen.has(key) || !months.includes(line.date.slice(0, 7))) continue
        seen.add(key)
        lines.push(line)
      }
    } catch {
      // A statement that cannot be read is left out; the others still count.
    }
  }
  return { statements: statements.length, lines: lines.sort((a, b) => a.date.localeCompare(b.date)) }
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
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{children}</h2>
      {action}
    </div>
  )
}

function Legend({ t }: { t: T }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-ink/55">
      {KINDS.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', KIND_BAR[kind])} />
          {t(`finance.projects.legend.${kind}`)}
        </span>
      ))}
    </div>
  )
}

const TH = 'px-3 py-3'
const TD = 'px-3 py-2.5'
const muted = <span className="text-brand-ink/25">—</span>

export function ProjectsPage() {
  const { user } = useAuth()
  const { invoices, clients, profile } = useAppData()
  const { t } = useI18n()
  const [view, setView] = useState<TimesheetView | null>(null)
  const [finance, setFinance] = useState<FinanceView | null>(null)
  const [mercury, setMercury] = useState<MercuryTransaction[]>([])
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [month, setMonth] = useState('all')
  const [correct, setCorrect] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [bank, setBank] = useState<{ statements: number; lines: (BankLine & { rest: number })[] } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const manager = user?.role !== 'member'
  const currency = profile?.currency || 'EUR'
  const symbol = currencySymbol(currency)

  const load = useCallback(async () => {
    try {
      setView(await api<TimesheetView>('/api/finance/projects'))
      setLoadError('')
    } catch (err) {
      setLoadError(errorText(t, err))
    }
    // The costs come from the finance documents; without them the page still shows the hours.
    setFinance(await api<FinanceView>('/api/finance').catch(() => null))
    // What comes into the Mercury account (the US company) is iPacienti's revenue, in euros.
    setMercury(await api<MercuryView>('/api/mercury').then((view) => (view.connected ? view.transactions : [])).catch(() => []))
  }, [t])

  useEffect(() => {
    if (manager) void load()
  }, [load, manager])

  const timesheet = view?.timesheet
  const months = useMemo(() => (timesheet ? (month === 'all' ? timesheet.months : timesheet.months.filter((item) => item === month)) : []), [timesheet, month])
  const docs = useMemo(() => finance?.documents || [], [finance])
  const monthCosts = useMemo(() => (timesheet ? costsByMonth(docs, invoices, timesheet.months, currency) : {}), [docs, invoices, timesheet, currency])
  const ownClients = useMemo(() => ownClientIds(clients, profile?.companyName), [clients, profile?.companyName])
  const bankCredits = useMemo(() => [...(bank?.lines || []).map((line) => ({ date: line.date, amount: line.rest, text: line.text })), ...ipacientiCredits(mercury)], [bank, mercury])
  const report = useMemo(
    () => (timesheet && timesheet.entries.length ? buildProjectsReport({ timesheet, months, invoices, clients, currency, ownClients, monthCosts, correct, bankCredits }) : null),
    [timesheet, months, invoices, clients, currency, ownClients, monthCosts, correct, bankCredits],
  )
  const sortedClients = useMemo(() => [...clients].filter((client) => client.id).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName))), [clients])
  const clientName = useMemo(() => new Map(sortedClients.map((client) => [client.id as string, client.fullName])), [sortedClients])

  // The statements are read again only when the months change, not on every new array of the same months.
  const monthsKey = months.join(',')
  useEffect(() => {
    if (!finance || !monthsKey) return
    let cancelled = false
    setBank(null)
    void looseCredits(docs, invoices, monthsKey.split(',')).then((result) => {
      if (!cancelled) setBank(result)
    })
    return () => {
      cancelled = true
    }
  }, [finance, docs, invoices, monthsKey])

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setNotice('')
    try {
      const workbook = await readAnyWorkbook(new Uint8Array(await file.arrayBuffer()), file.name)
      const entries = readTimesheet(workbook, file.name)
      if (entries.length === 0) {
        setNotice(t('finance.projects.noneFound'))
        return
      }
      const next = await api<TimesheetView>('/api/finance/projects/hours', { method: 'PUT', body: { fileName: file.name, entries } })
      setView(next)
      setMonth('all')
      setNotice(t('finance.projects.importedCount', { rows: entries.length, months: next.timesheet.months.length }))
    } catch (err) {
      setNotice(errorText(t, err))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function clear() {
    if (!window.confirm(t('finance.projects.clearConfirm'))) return
    try {
      setView(await api<TimesheetView>('/api/finance/projects/hours', { method: 'DELETE' }))
      setNotice('')
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function link(project: string, value: string) {
    const body = value === 'internal' ? { project, internal: true } : { project, internal: false, clientId: value || null }
    try {
      setView(await api<TimesheetView>('/api/finance/projects/project', { method: 'PATCH', body }))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function setExtraClients(project: string, list: string[]) {
    try {
      setView(await api<TimesheetView>('/api/finance/projects/project', { method: 'PATCH', body: { project, clients: list } }))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function setSource(name: string, bank: string[]) {
    try {
      setView(await api<TimesheetView>('/api/finance/projects/source', { method: 'PATCH', body: { name, bank } }))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function setBankWords(project: string, bank: string[]) {
    try {
      setView(await api<TimesheetView>('/api/finance/projects/project', { method: 'PATCH', body: { project, bank } }))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function acceptAll() {
    for (const project of report?.projects || []) {
      if (project.suggestion) await link(project.name, project.suggestion.clientId)
    }
  }

  if (!manager) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('finance.projects.title')}</h1>
        <Card className="mt-6">
          <p className="text-sm text-brand-ink/60">{t('finance.managersOnly')}</p>
        </Card>
      </div>
    )
  }

  const money = (amount: number | null | undefined) => (typeof amount === 'number' ? `${WHOLE.format(amount)} ${symbol}` : '—')
  const hourly = (amount: number | null | undefined) => (typeof amount === 'number' ? `${CENTS.format(amount)} ${symbol}` : '—')
  const hoursText = (value: number) => WHOLE.format(value)
  const uploadButton = (
    <>
      <Button type="button" variant={timesheet?.entries.length ? 'secondary' : 'primary'} disabled={uploading} onClick={() => fileInput.current?.click()}>
        <Upload className="h-4 w-4" />
        {uploading ? t('finance.projects.uploading') : timesheet?.entries.length ? t('finance.projects.replace') : t('finance.projects.upload')}
      </Button>
      <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files)} />
    </>
  )

  const suggestions = report?.projects.filter((project) => project.suggestion) || []
  // What money can be given to: any project that is not shared work.
  const projectTargets = report?.projects.filter((project) => project.kind !== 'shared').map((project) => project.name) || []
  const products = report?.projects.filter((project) => project.kind === 'product') || []
  const totalRevenue = report ? report.revenue + report.otherTotal : 0
  const productiveHours = report ? report.byMonth.reduce((sum, item) => sum + item.productiveHours, 0) : 0

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{t('finance.projects.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/55">{t('finance.projects.subtitle')}</p>
          {timesheet?.importedAt ? (
            <p className="mt-1 text-xs text-brand-ink/45">
              {t('finance.projects.imported', { file: timesheet.fileName || '—', date: shortDate(timesheet.importedAt) })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {timesheet && timesheet.months.length > 1 ? (
            <select
              aria-label={t('finance.projects.period')}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl border border-brand-ink/10 bg-white px-3 py-2.5 text-sm font-semibold"
            >
              <option value="all">{t('finance.projects.allMonths')}</option>
              {timesheet.months.map((item) => (
                <option key={item} value={item}>
                  {monthLabel(item, t, 'long')}
                </option>
              ))}
            </select>
          ) : null}
          {uploadButton}
          {timesheet?.entries.length ? (
            <Button type="button" variant="ghost" onClick={() => void clear()} aria-label={t('finance.projects.clear')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {report && report.corrections.length ? (
        <label className="mt-3 inline-flex cursor-pointer items-start gap-2 text-sm text-brand-ink/70">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2C6E7F]" checked={correct} onChange={(e) => setCorrect(e.target.checked)} />
          <span>
            {t('finance.projects.correct')}
            <span className="block text-xs text-brand-ink/45">{t('finance.projects.correctHint', { limit: MONTH_HOURS_LIMIT })}</span>
          </span>
        </label>
      ) : null}

      {notice ? <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-brand-ink/70">{notice}</p> : null}
      {loadError ? <p className="mt-4 rounded-xl bg-[#C0503A]/8 px-4 py-3 text-sm text-[#C0503A]">{loadError}</p> : null}

      {!view && !loadError ? <p className="mt-8 text-sm text-brand-ink/50">{t('common.loading')}</p> : null}

      {view && !report ? (
        <Card className="mt-6 flex flex-col items-start gap-4 p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <FolderKanban className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xl font-medium">{t('finance.projects.emptyTitle')}</p>
            <p className="mt-1 max-w-xl text-sm text-brand-ink/60">{t('finance.projects.emptyText')}</p>
          </div>
          {uploadButton}
        </Card>
      ) : null}

      {report ? (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              primary
              label={t('finance.projects.tiles.hours')}
              value={hoursText(report.hours)}
              lines={[
                t('finance.projects.tiles.hoursHint', { people: report.people.length, projects: report.projects.length }),
                correct && report.rawHours !== report.hours ? t('finance.projects.tiles.corrected', { raw: hoursText(report.rawHours), fixed: hoursText(report.hours) }) : '',
                report.months.length > 1 ? t('finance.projects.tiles.perMonth', { hours: hoursText(report.hours / report.months.length) }) : '',
              ]}
            />
            <Tile
              primary
              label={t('finance.projects.tiles.cost')}
              value={money(report.cost)}
              lines={[
                t('finance.projects.tiles.costPay', { net: money(report.net), taxes: money(report.taxed - report.net) }),
                t('finance.projects.tiles.costOther', { running: money(report.pool.running), unexplained: money(report.pool.unexplained) }),
              ]}
            />
            <Tile
              primary
              label={t('finance.projects.tiles.revenue')}
              value={report.linkedHours > 0 || report.otherTotal > 0 ? money(totalRevenue) : '—'}
              lines={
                report.linkedHours > 0 || report.otherTotal > 0
                  ? [t('finance.projects.tiles.revenueProjects', { amount: money(report.revenue) }), report.otherTotal ? t('finance.projects.tiles.revenueOther', { amount: money(report.otherTotal) }) : '']
                  : [t('finance.projects.tiles.revenueNone')]
              }
            />
            <Tile
              label={t('finance.projects.tiles.profit')}
              value={<span className={totalRevenue - report.cost < 0 ? 'text-[#C0503A]' : undefined}>{money(totalRevenue - report.cost)}</span>}
              lines={[t('finance.projects.tiles.profitHint'), productiveHours ? t('finance.projects.tiles.hourCost', { amount: hourly(report.cost / productiveHours) }) : '']}
            />
          </section>
          {!finance ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-brand-ink/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('finance.projects.loadingCosts')}
            </p>
          ) : null}

          <section className="mt-6">
            <SignalBar signals={report.signals} t={t} corrected={correct} />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section>
              <SectionTitle>{t('finance.projects.sections.projects')}</SectionTitle>
              <Card className="p-5">
                <Legend t={t} />
                <ProjectBars report={report} t={t} />
              </Card>
            </section>
            <section>
              <SectionTitle>{t('finance.projects.sections.months')}</SectionTitle>
              <Card className="p-5">
                <Legend t={t} />
                <MonthColumns report={report} t={t} />
              </Card>
            </section>
          </div>

          {products.length ? (
            <section className="mt-6">
              <SectionTitle>{t('finance.projects.sections.products')}</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <Card key={product.name} className="p-5">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className={cn('h-2.5 w-2.5 rounded-sm', KIND_BAR.product)} />
                      {product.name}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] tabular-nums">
                      <dt className="text-brand-ink/55">{t('finance.projects.cols.revenue')}</dt>
                      <dd className="text-right font-semibold">{money(product.revenue)}</dd>
                      <dt className="text-brand-ink/55">{t('finance.projects.cols.cost')}</dt>
                      <dd className="text-right">{money(product.cost)}</dd>
                      <dt className="text-brand-ink/55">{t('finance.projects.cols.profit')}</dt>
                      <dd className={cn('text-right font-semibold', (product.profit ?? 0) < 0 && 'text-[#C0503A]')}>{money(product.profit)}</dd>
                      <dt className="text-brand-ink/55">{t('finance.projects.cols.hours')}</dt>
                      <dd className="text-right">{hoursText(product.hours)}</dd>
                    </dl>
                    <div className="mt-3 space-y-0.5 border-t border-brand-ink/6 pt-2 text-xs text-brand-ink/50">
                      <p>{product.invoices ? `${t('finance.projects.productRevenue', { product: product.name })}: ${product.invoices}` : t('finance.projects.productNone', { product: product.name })}</p>
                      {product.bankPayments ? <p>{t('finance.projects.productBank', { amount: money(product.bankRevenue), count: product.bankPayments })}</p> : null}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-6">
            <SectionTitle
              action={
                suggestions.length ? (
                  <Button type="button" variant="secondary" onClick={() => void acceptAll()}>
                    <Sparkles className="h-4 w-4" />
                    {t('finance.projects.acceptAll', { count: suggestions.length })}
                  </Button>
                ) : null
              }
            >
              {t('finance.projects.sections.table')}
            </SectionTitle>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-right text-[13px] tabular-nums">
                  <thead className="bg-brand-bg/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.project')}</th>
                      <th className={cn(TH, 'text-left')}>{t('finance.projects.cols.client')}</th>
                      <th className={TH}>{t('finance.projects.cols.hours')}</th>
                      <th className={TH}>{t('finance.projects.cols.direct')}</th>
                      <th className={TH}>{t('finance.projects.cols.overhead')}</th>
                      <th className={TH}>{t('finance.projects.cols.cost')}</th>
                      <th className={TH}>{t('finance.projects.cols.costPerHour')}</th>
                      <th className={TH}>{t('finance.projects.cols.revenue')}</th>
                      <th className={TH}>{t('finance.projects.cols.profit')}</th>
                      <th className={TH}>{t('finance.projects.cols.perHour')}</th>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.team')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map((project) => {
                      const sharedClient = project.kind === 'client' && report.projects.filter((other) => other.clientId === project.clientId).length > 1
                      const shared = project.kind === 'shared'
                      return (
                        <tr key={project.name} className={cn('border-t border-brand-ink/6 align-top', shared && 'bg-brand-accent/[0.04]')}>
                          <td className="px-4 py-2.5 text-left font-semibold">
                            <span className="inline-flex items-center gap-2">
                              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', KIND_BAR[project.kind])} />
                              {project.name}
                            </span>
                            {project.kind === 'product' ? <span className="ml-[18px] block text-[11px] font-normal text-brand-ink/45">{t('finance.projects.ownProduct')}</span> : null}
                          </td>
                          <td className="px-3 py-1.5 text-left">
                            <select
                              aria-label={`${t('finance.projects.cols.client')}: ${project.name}`}
                              value={shared ? 'internal' : project.clientId || ''}
                              onChange={(e) => void link(project.name, e.target.value)}
                              className={cn('w-full max-w-[220px] rounded-lg border border-brand-ink/10 bg-white px-2 py-1.5 text-[13px]', project.kind === 'unset' ? 'text-brand-ink/45' : 'text-brand-ink')}
                            >
                              <option value="">{t('finance.projects.choose')}</option>
                              <option value="internal">{t('finance.projects.internalOption')}</option>
                              {project.clientId && !clientName.has(project.clientId) ? <option value={project.clientId}>{project.clientId}</option> : null}
                              {sortedClients.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.fullName}
                                </option>
                              ))}
                            </select>
                            {project.suggestion ? (
                              <p className="mt-1 flex max-w-[220px] items-center gap-1.5 text-[11px] leading-4 text-brand">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 truncate">{t('finance.projects.suggestion', { client: clientName.get(project.suggestion.clientId) || '' })}</span>
                                <button type="button" className="shrink-0 font-semibold underline underline-offset-2" onClick={() => void link(project.name, project.suggestion!.clientId)}>
                                  {t('finance.projects.accept')}
                                </button>
                              </p>
                            ) : null}
                            {sharedClient ? <p className="mt-1 max-w-[220px] text-[11px] leading-4 text-brand-ink/45">{t('finance.projects.shared')}</p> : null}
                            {(timesheet?.projects[project.name]?.clients || []).length ? (
                              <ul className="mt-1 flex max-w-[220px] flex-wrap gap-1">
                                {(timesheet?.projects[project.name]?.clients || []).map((id) => (
                                  <li key={id} className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[11px] text-brand-ink/70">
                                    + {clientName.get(id) || id}
                                    <button
                                      type="button"
                                      aria-label={t('finance.projects.unlinkClient')}
                                      className="text-brand-ink/40 hover:text-[#C0503A]"
                                      onClick={() => void setExtraClients(project.name, (timesheet?.projects[project.name]?.clients || []).filter((item) => item !== id))}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className={cn(TD, 'font-semibold')}>
                            {hoursText(project.hours)}
                            {project.rawHours !== project.hours ? <span className="block text-[11px] font-normal text-brand-ink/40 line-through">{hoursText(project.rawHours)}</span> : null}
                          </td>
                          <td className={TD}>
                            {money(project.direct)}
                            {project.unpaidHours > 0 ? <span className="block text-[11px] text-brand-ink/45">{hoursText(project.unpaidHours)} h {t('finance.projects.noPay')}</span> : null}
                          </td>
                          <td className={TD}>{shared ? muted : money(project.overhead)}</td>
                          <td className={cn(TD, 'font-semibold')}>{money(project.cost)}</td>
                          <td className={TD}>{hourly(project.costPerHour)}</td>
                          <td className={TD}>{project.revenue === null ? muted : money(project.revenue)}</td>
                          <td className={cn(TD, 'font-semibold', project.profit !== null && project.profit < 0 && 'text-[#C0503A]')}>{project.profit === null ? muted : money(project.profit)}</td>
                          <td className={TD}>{project.revenuePerHour === null ? muted : hourly(project.revenuePerHour)}</td>
                          <td className="px-4 py-2.5 text-left text-brand-ink/65">
                            {project.people
                              .slice(0, 3)
                              .map((person) => `${person.person.split(' ')[0]} ${hoursText(person.hours)}`)
                              .join(', ')}
                            {project.people.length > 3 ? ` ${t('finance.projects.otherPeople', { count: project.people.length - 3 })}` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-ink/50">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('finance.projects.costNote')}
            </p>
          </section>

          <section className="mt-6">
            <SectionTitle>{t('finance.projects.sections.shared')}</SectionTitle>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Card className="p-5">
                <p className="text-[13px] leading-5 text-brand-ink/60">{t('finance.projects.sharedNote')}</p>
                <dl className="mt-3 space-y-1.5 text-[13px] tabular-nums">
                  {report.pool.shared.map((item) => (
                    <div key={item.project} className="flex justify-between gap-3">
                      <dt className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-sm', KIND_BAR.shared)} />
                        {item.project}
                      </dt>
                      <dd>{money(item.cost)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <dt>{t('finance.projects.cols.running')}</dt>
                    <dd>{money(report.pool.running)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t('finance.projects.cols.unexplained')}</dt>
                    <dd>{money(report.pool.unexplained)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-brand-ink/8 pt-1.5 font-semibold">
                    <dt>{t('finance.projects.sharedTotal')}</dt>
                    <dd>{money(report.pool.total)}</dd>
                  </div>
                </dl>
              </Card>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-right text-[13px] tabular-nums">
                    <thead className="bg-brand-bg/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/50">
                      <tr>
                        <th className="px-4 py-3 text-left">{t('finance.projects.cols.month')}</th>
                        <th className={TH}>{t('finance.projects.cols.payroll')}</th>
                        <th className={TH}>{t('finance.projects.cols.factor')}</th>
                        <th className={TH}>{t('finance.projects.cols.running')}</th>
                        <th className={TH}>{t('finance.projects.cols.pool')}</th>
                        <th className={TH}>{t('finance.projects.cols.productive')}</th>
                        <th className="px-4 py-3">{t('finance.projects.cols.rate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byMonth.map((item) => (
                        <tr key={item.month} className="border-t border-brand-ink/6">
                          <td className="px-4 py-2 text-left font-semibold">{monthLabel(item.month, t, 'long')}</td>
                          <td className={cn(TD, 'py-2')}>{item.payrollCost === null ? muted : money(item.payrollCost)}</td>
                          <td className={cn(TD, 'py-2')}>
                            {item.taxFactorEstimated && item.taxFactor === 1 ? (
                              muted
                            ) : (
                              <>
                                +{Math.round((item.taxFactor - 1) * 100)}%
                                {item.taxFactorEstimated ? <span className="block text-[11px] text-brand-ink/40">{t('finance.projects.estimated')}</span> : null}
                              </>
                            )}
                          </td>
                          <td className={cn(TD, 'py-2')}>{item.running === null ? muted : money(item.running)}</td>
                          <td className={cn(TD, 'py-2')}>{money(item.pool)}</td>
                          <td className={cn(TD, 'py-2')}>{hoursText(item.productiveHours)}</td>
                          <td className="px-4 py-2 font-semibold">{item.overheadRate === null ? muted : hourly(item.overheadRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>{t('finance.projects.sections.people')}</SectionTitle>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-right text-[13px] tabular-nums">
                  <thead className="bg-brand-bg/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.person')}</th>
                      <th className={TH}>{t('finance.projects.cols.hours')}</th>
                      <th className={TH}>{t('finance.projects.cols.net')}</th>
                      <th className={TH}>{t('finance.projects.cols.taxed')}</th>
                      <th className={TH}>{t('finance.projects.cols.full')}</th>
                      <th className={TH}>{t('finance.projects.cols.projects')}</th>
                      <th className={TH}>{t('finance.projects.cols.perMonth')}</th>
                      <th className="px-4 py-3">{t('finance.projects.cols.busiest')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.people.map((person) => {
                      const expanded = open === person.person
                      return (
                        <Fragment key={person.person}>
                          <tr className={cn('cursor-pointer border-t border-brand-ink/6 hover:bg-brand-bg/50', expanded && 'bg-brand-bg/50')} onClick={() => setOpen(expanded ? null : person.person)}>
                            <td className="px-4 py-2.5 text-left font-semibold">
                              <button type="button" aria-expanded={expanded} className="inline-flex items-center gap-1.5 text-left">
                                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-brand-ink/40" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand-ink/40" />}
                                {person.person}
                              </button>
                            </td>
                            <td className={cn(TD, 'font-semibold')}>
                              {hoursText(person.hours)}
                              {person.rawHours !== person.hours ? <span className="block text-[11px] font-normal text-brand-ink/40 line-through">{hoursText(person.rawHours)}</span> : null}
                            </td>
                            <td className={TD}>{person.perHour ? hourly(person.perHour.net) : <span className="text-brand-ink/40">{t('finance.projects.noPay')}</span>}</td>
                            <td className={TD}>{person.perHour ? hourly(person.perHour.taxed) : muted}</td>
                            <td className={cn(TD, 'font-semibold')}>{person.perHour ? hourly(person.perHour.full) : muted}</td>
                            <td className={TD}>{person.projects}</td>
                            <td className={cn(TD, person.projectsPerMonth >= 5 && 'font-semibold text-[#B7791F]')}>{ONE.format(person.projectsPerMonth)}</td>
                            <td className={cn('px-4 py-2.5', person.busiest.hours > MONTH_HOURS_LIMIT && 'font-semibold text-[#C0503A]')}>
                              {person.busiest.month ? `${hoursText(person.busiest.hours)} h · ${monthLabel(person.busiest.month, t)}` : '—'}
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="bg-brand-bg/40">
                              <td colSpan={8} className="px-4 pb-4 pt-1">
                                <table className="w-full text-right text-[12px] tabular-nums">
                                  <thead className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
                                    <tr>
                                      <th className="py-2 text-left">{t('finance.projects.cols.month')}</th>
                                      <th className="py-2">{t('finance.projects.cols.hours')}</th>
                                      <th className="py-2">{t('finance.projects.cols.netPay')}</th>
                                      <th className="py-2">{t('finance.projects.cols.taxedPay')}</th>
                                      <th className="py-2">{t('finance.projects.cols.overheadShare')}</th>
                                      <th className="py-2">{t('finance.projects.cols.fullCost')}</th>
                                      <th className="py-2">{t('finance.projects.cols.full')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {person.months.map((item) => (
                                      <tr key={item.month} className="border-t border-brand-ink/6">
                                        <td className="py-1.5 text-left">{monthLabel(item.month, t, 'long')}</td>
                                        <td className="py-1.5">
                                          {hoursText(item.hours)}
                                          {item.rawHours !== item.hours ? <span className="ml-1 text-brand-ink/40 line-through">{hoursText(item.rawHours)}</span> : null}
                                        </td>
                                        <td className="py-1.5">{item.net ? money(item.net) : <span className="text-brand-ink/40">{t('finance.projects.noPay')}</span>}</td>
                                        <td className="py-1.5">{item.net ? money(item.taxed) : muted}</td>
                                        <td className="py-1.5">{money(item.overhead)}</td>
                                        <td className="py-1.5">{item.net ? money(item.full) : muted}</td>
                                        <td className="py-1.5 font-semibold">{hourly(item.perHour)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <p className="mt-2 text-left text-[11px] text-brand-ink/50">
                                  {person.byProject
                                    .slice(0, 6)
                                    .map((item) => `${item.project} ${Math.round((item.hours / (person.hours || 1)) * 100)}%`)
                                    .join(' · ')}
                                </p>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-ink/50">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('finance.projects.peopleNote')}
            </p>
          </section>

          <section className="mt-6">
            <SectionTitle>{t('finance.projects.sections.other')}</SectionTitle>
            <Card className="p-5">
              <p className="text-[13px] leading-5 text-brand-ink/60">{report.otherRevenue.length ? t('finance.projects.otherNote') : t('finance.projects.otherNone')}</p>
              {report.otherRevenue.length ? (
                <ul className="mt-3 divide-y divide-brand-ink/6">
                  {report.otherRevenue.map((group) => (
                    <li key={group.clientId || group.client} className="py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="min-w-0 truncate font-semibold">
                          {group.clientId ? (
                            <Link to={`/app/clients/${group.clientId}`} className="hover:underline">
                              {group.client}
                            </Link>
                          ) : (
                            group.client
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {group.clientId && projectTargets.length ? (
                            <select
                              aria-label={`${t('finance.projects.bankAssign')} ${group.client}`}
                              value=""
                              onChange={(e) => e.target.value && void setExtraClients(e.target.value, [...(timesheet?.projects[e.target.value]?.clients || []), group.clientId])}
                              className="rounded-lg border border-brand-ink/10 bg-white px-2 py-1 text-[12px] text-brand-ink/70"
                            >
                              <option value="">{t('finance.projects.bankAssign')}</option>
                              {projectTargets.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <span className="font-semibold tabular-nums">{money(group.total)}</span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-brand-ink/55">
                        {group.invoices.map((item, index) => (
                          <Fragment key={item.id}>
                            {index ? ' · ' : ''}
                            <Link to={`/app/invoices/${item.id}`} className="hover:underline">
                              {item.number}
                            </Link>{' '}
                            {shortDate(item.date)} {money(item.net)}
                          </Fragment>
                        ))}
                        {group.bank.map((line, index) => (
                          <Fragment key={`bank${index}`}>
                            {index || group.invoices.length ? ' · ' : ''}
                            {t('finance.projects.fromBank')} {shortDate(line.date)} {money(line.amount)}
                          </Fragment>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}

              {report.sources.length ? (
                <div className="mt-5 border-t border-brand-ink/8 pt-4">
                  <p className="text-sm font-semibold">{t('finance.projects.sourcesTitle')}</p>
                  <ul className="mt-2 divide-y divide-brand-ink/6">
                    {report.sources.map((source) => (
                      <li key={source.name} className="py-2.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold">{source.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{money(source.total)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-ink/55">
                          <span>{t('finance.projects.sourcePayments', { count: source.payments.length })}</span>
                          {source.words.map((words) => (
                            <span key={words} className="inline-flex items-center gap-1 rounded bg-brand-accent/15 px-1.5 py-0.5 text-[11px] text-brand-ink/70">
                              “{words}”
                              <button
                                type="button"
                                aria-label={t('finance.projects.bankRemove')}
                                className="text-brand-ink/40 hover:text-[#C0503A]"
                                onClick={() => void setSource(source.name, source.words.filter((item) => item !== words))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-5 border-t border-brand-ink/8 pt-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Landmark className="h-4 w-4 text-brand" />
                  {t('finance.projects.bankTitle')}
                </p>
                <p className="mt-1 text-[13px] text-brand-ink/55">{t('finance.projects.bankNote')}</p>
                {!bank ? (
                  <p className="mt-3 flex items-center gap-2 text-[13px] text-brand-ink/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('finance.projects.bankLoading')}
                  </p>
                ) : bank.statements === 0 ? (
                  <p className="mt-3 text-[13px] text-brand-ink/50">{t('finance.projects.bankMissing')}</p>
                ) : (
                  <BankCredits
                    left={report.bankLeft}
                    rules={Object.entries(timesheet?.projects || {}).flatMap(([name, item]) => (item.bank || []).map((words) => ({ project: name, words })))}
                    targets={projectTargets}
                    sources={report.sources.map((source) => source.name)}
                    money={money}
                    t={t}
                    onSave={(project, words) => void setBankWords(project, [...(timesheet?.projects[project]?.bank || []), words])}
                    onSource={(name, words) => void setSource(name, [...(timesheet?.sources?.[name] || []), words])}
                    onRemove={(project, words) => void setBankWords(project, (timesheet?.projects[project]?.bank || []).filter((item) => item !== words))}
                  />
                )}
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  )
}

/** The signals folded into one slim bar with a count per kind; the details open on a click. */
function SignalBar({ signals, t, corrected }: { signals: Signal[]; t: T; corrected: boolean }) {
  const [open, setOpen] = useState(false)
  const over = signals.filter((signal) => signal.key === 'overHours').length
  const lone = signals.filter((signal) => signal.key === 'keyPerson').length
  const notes = signals.length - over - lone
  const warn = over + lone > 0
  const chip = (label: string, count: number, tone: 'warn' | 'note') => (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold', tone === 'warn' ? 'bg-[#F8E8E4] text-[#C0503A]' : 'bg-brand/8 text-brand')}>
      {label}
      <span className="tabular-nums">{count}</span>
    </span>
  )
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-white', warn ? 'border-[#C0503A]/25' : 'border-brand-ink/8')}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={signals.length === 0}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-left transition hover:bg-brand-ink/[0.02] disabled:cursor-default"
      >
        {warn ? <AlertTriangle className="h-4 w-4 shrink-0 text-[#C0503A]" /> : <Info className="h-4 w-4 shrink-0 text-brand" />}
        <span className="text-sm font-semibold text-brand-ink">{t('finance.projects.sections.signals')}</span>
        {signals.length === 0 ? <span className="text-sm text-brand-ink/55">{t('finance.projects.signal.none')}</span> : null}
        <span className="flex flex-wrap items-center gap-1.5">
          {over ? chip(t('finance.projects.signal.summaryOver'), over, 'warn') : null}
          {lone ? chip(t('finance.projects.signal.summaryLone'), lone, 'warn') : null}
          {notes ? chip(t('finance.projects.signal.summaryNotes'), notes, 'note') : null}
        </span>
        {signals.length ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-ink/50">
            {open ? t('finance.projects.signal.collapse') : t('finance.projects.signal.expand')}
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </span>
        ) : null}
      </button>
      {open && signals.length ? (
        <div className="border-t border-brand-ink/8 px-4 py-4">
          <SignalList signals={signals} t={t} corrected={corrected} />
        </div>
      ) : null}
    </div>
  )
}

function SignalList({ signals, t, corrected }: { signals: Signal[]; t: T; corrected: boolean }) {
  if (signals.length === 0) return <p className="text-sm text-brand-ink/60">{t('finance.projects.signal.none')}</p>
  const over = signals.filter((signal) => signal.key === 'overHours')
  const lone = signals.filter((signal) => signal.key === 'keyPerson')
  const rest = signals.filter((signal) => signal.key !== 'overHours' && signal.key !== 'keyPerson')
  const line = (signal: Signal) => {
    switch (signal.key) {
      case 'overHours':
        return t('finance.projects.signal.overHours', { person: signal.person, months: signal.months, hours: WHOLE.format(signal.hours), month: monthLabel(signal.month, t, 'long'), to: signal.to })
      case 'keyPerson':
        return t('finance.projects.signal.keyPerson', { project: signal.project, person: signal.person, share: signal.share })
      case 'scattered':
        return t('finance.projects.signal.scattered', { person: signal.person, projects: signal.projects, perMonth: ONE.format(signal.perMonth) })
      case 'unpaid':
        return t('finance.projects.signal.unpaid', { people: signal.people, hours: WHOLE.format(signal.hours) })
      case 'shared':
        return t('finance.projects.signal.shared', { share: signal.share, hours: WHOLE.format(signal.hours) })
      case 'unset':
        return t('finance.projects.signal.unset', { projects: signal.projects, hours: WHOLE.format(signal.hours) })
      case 'missingCosts':
        return signal.all
          ? t('finance.projects.signal.missingAll')
          : t('finance.projects.signal.missingCosts', { months: signal.months.map((month) => monthLabel(month, t, 'long')).join(', ') })
    }
  }
  const group = (title: string, items: Signal[], note?: string) => (
    <li className="flex items-start gap-2.5 text-sm leading-5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C0503A]" />
      <div className="min-w-0">
        <p className="text-brand-ink/80">{title}</p>
        <ul className="mt-1 space-y-0.5">
          {items.map((signal, index) => (
            <li key={index} className="text-[13px] text-brand-ink/65 before:mr-1.5 before:text-brand-ink/30 before:content-['•']">
              {line(signal)}
            </li>
          ))}
        </ul>
        {note ? <p className="mt-1 text-[12px] text-brand">{note}</p> : null}
      </div>
    </li>
  )
  return (
    <ul className="space-y-3">
      {over.length ? group(t('finance.projects.signal.overHoursTitle', { limit: MONTH_HOURS_LIMIT }), over, corrected ? t('finance.projects.signal.overHoursFixed') : undefined) : null}
      {lone.length ? group(t('finance.projects.signal.keyPersonTitle'), lone) : null}
      {rest.map((signal, index) => (
        <li key={index} className="flex items-start gap-2.5 text-sm leading-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span className="text-brand-ink/80">{line(signal)}</span>
        </li>
      ))}
    </ul>
  )
}

function ProjectBars({ report, t }: { report: ProjectsReport; t: T }) {
  const named = report.projects.slice(0, CHART_PROJECTS)
  const rest = report.projects.slice(CHART_PROJECTS)
  const restHours = rest.reduce((sum, project) => sum + project.hours, 0)
  const rows = [
    ...named.map((project) => ({ key: project.name, label: project.name, hours: project.hours, share: project.share, kind: project.kind })),
    ...(rest.length ? [{ key: '__rest', label: `${t('finance.projects.others')} (${rest.length})`, hours: restHours, share: report.hours ? restHours / report.hours : 0, kind: 'unset' as ProjectKind }] : []),
  ]
  const max = Math.max(...rows.map((row) => row.hours), 1)
  return (
    <ul className="mt-4 space-y-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
          <span className="truncate font-medium" title={row.label}>
            {row.label}
          </span>
          <span className="h-3.5 rounded bg-brand-ink/5">
            <span className={cn('block h-full rounded', row.key === '__rest' ? 'bg-brand-ink/15' : KIND_BAR[row.kind])} style={{ width: `${Math.max(1.5, (row.hours / max) * 100)}%` }} />
          </span>
          <span className="w-24 text-right tabular-nums text-brand-ink/70">
            <span className="font-semibold text-brand-ink">{WHOLE.format(row.hours)}</span> h · {Math.round(row.share * 100)}%
          </span>
        </li>
      ))}
    </ul>
  )
}

function MonthColumns({ report, t }: { report: ProjectsReport; t: T }) {
  const max = Math.max(...report.byMonth.map((month) => month.hours), 1)
  return (
    <div className="mt-4 flex h-64 items-end gap-2">
      {report.byMonth.map((month) => (
        <div key={month.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-semibold tabular-nums text-brand-ink/70">{WHOLE.format(month.hours)}</span>
          <div className="flex w-full max-w-[42px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(month.hours / max) * 100}%` }}>
            {KINDS.map((kind) => (month[kind] > 0 ? <span key={kind} className={cn('block w-full', KIND_BAR[kind])} style={{ height: `${(month[kind] / (month.hours || 1)) * 100}%` }} /> : null))}
          </div>
          <span className="text-[11px] text-brand-ink/55">{monthLabel(month.month, t)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Bank money with no invoice: each payment can be given to a project, or to a source of money
 * outside the projects (a subsidy), by the words that name it; later payments with the same words follow.
 */
function BankCredits({
  left,
  rules,
  targets,
  sources,
  money,
  t,
  onSave,
  onSource,
  onRemove,
}: {
  left: BankCredit[]
  rules: { project: string; words: string }[]
  targets: string[]
  sources: string[]
  money: (amount: number) => string
  t: T
  onSave: (project: string, words: string) => void
  onSource: (name: string, words: string) => void
  onRemove: (project: string, words: string) => void
}) {
  // `target`: a project's name, "source:<name>" for a source, or "source:" for a new one.
  const [editing, setEditing] = useState<{ index: number; target: string; name: string; words: string } | null>(null)
  const isSource = editing?.target.startsWith('source:')
  return (
    <>
      {rules.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {rules.map((rule) => (
            <li key={`${rule.project}|${rule.words}`} className="inline-flex items-center gap-2 rounded-lg bg-[#6B8E5A]/10 px-2.5 py-1 text-[12px]">
              <span>
                “{rule.words}” → <strong>{rule.project}</strong>
              </span>
              <button type="button" aria-label={t('finance.projects.bankRemove')} className="text-brand-ink/40 hover:text-[#C0503A]" onClick={() => onRemove(rule.project, rule.words)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {left.length === 0 ? (
        <p className="mt-3 text-[13px] text-brand-ink/50">{t('finance.projects.bankNone')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px] tabular-nums">
            <tbody>
              {left.map((line, index) => (
                <Fragment key={index}>
                  <tr className="border-t border-brand-ink/6 first:border-t-0">
                    <td className="w-24 py-2 pr-3 align-top text-brand-ink/60">{shortDate(line.date)}</td>
                    <td className="py-2 pr-3 align-top text-brand-ink/80">
                      <span className="line-clamp-2">{line.text}</span>
                    </td>
                    <td className="w-28 py-2 pr-3 text-right align-top font-semibold">{money(line.amount)}</td>
                    <td className="w-48 py-1.5 text-right align-top">
                      <select
                        aria-label={t('finance.projects.bankAssign')}
                        value={editing?.index === index ? editing.target : ''}
                        onChange={(e) => {
                          const target = e.target.value
                          setEditing(target ? { index, target, name: target.startsWith('source:') ? target.slice(7) : '', words: payerWords(line.text) } : null)
                        }}
                        className="w-full rounded-lg border border-brand-ink/10 bg-white px-2 py-1.5 text-[12px] text-brand-ink/70"
                      >
                        <option value="">{t('finance.projects.bankAssign')}</option>
                        <optgroup label={t('finance.projects.projectsGroup')}>
                          {targets.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t('finance.projects.outsideGroup')}>
                          {sources.map((name) => (
                            <option key={name} value={`source:${name}`}>
                              {name}
                            </option>
                          ))}
                          <option value="source:">{t('finance.projects.sourceNew')}</option>
                        </optgroup>
                      </select>
                    </td>
                  </tr>
                  {editing?.index === index ? (
                    <tr>
                      <td />
                      <td colSpan={3} className="pb-3">
                        <form
                          className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-bg/70 p-2.5"
                          onSubmit={(e) => {
                            e.preventDefault()
                            const words = editing.words.trim()
                            if (words.length < 3) return
                            if (isSource) {
                              if (!editing.name.trim()) return
                              onSource(editing.name.trim(), words)
                            } else onSave(editing.target, words)
                            setEditing(null)
                          }}
                        >
                          {editing.target === 'source:' ? (
                            <input
                              aria-label={t('finance.projects.sourceName')}
                              placeholder={t('finance.projects.sourceName')}
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                              className="w-44 rounded-lg border border-brand-ink/10 bg-white px-2 py-1.5 text-[13px]"
                            />
                          ) : null}
                          <span className="text-[12px] text-brand-ink/60">{t('finance.projects.bankWords', { project: isSource ? editing.name || '…' : editing.target })}</span>
                          <input
                            aria-label={t('finance.projects.bankWords', { project: isSource ? editing.name : editing.target })}
                            value={editing.words}
                            onChange={(e) => setEditing({ ...editing, words: e.target.value })}
                            className="min-w-[220px] flex-1 rounded-lg border border-brand-ink/10 bg-white px-2 py-1.5 text-[13px]"
                          />
                          <Button type="submit">{t('finance.projects.bankSave')}</Button>
                          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                            {t('finance.projects.bankCancel')}
                          </Button>
                          <p className="w-full text-[11px] text-brand-ink/50">{t('finance.projects.wordsHint')}</p>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              <tr className="border-t border-brand-ink/10">
                <td />
                <td className="py-2 pr-3 text-right font-semibold">{t('finance.projects.sharedTotal')}</td>
                <td className="py-2 pr-3 text-right font-semibold">{money(left.reduce((sum, line) => sum + line.amount, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
