import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, FolderKanban, Info, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { currencySymbol } from '../../lib/invoice'
import { readAnyWorkbook } from '../../lib/serverFinance'
import { MONTH_HOURS_LIMIT, buildProjectsReport, readTimesheet, type ProjectKind, type Signal, type TimesheetView } from '../../lib/timesheet'

type T = (key: string, params?: Record<string, string | number>) => string

const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ONE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const CENTS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ACCEPT = '.xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const KIND_BAR: Record<ProjectKind, string> = {
  client: 'bg-brand',
  internal: 'bg-brand-accent',
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

function errorText(t: T, err: unknown) {
  const code = (err as { code?: string })?.code
  if (code) {
    const known = t(`finance.projects.err.${code}`)
    if (known !== `finance.projects.err.${code}`) return known
  }
  return err instanceof Error ? err.message : t('common.error')
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{children}</h2>
}

function Legend({ t }: { t: T }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-ink/55">
      {(['client', 'internal', 'unset'] as ProjectKind[]).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-sm', KIND_BAR[kind])} />
          {t(`finance.projects.legend.${kind}`)}
        </span>
      ))}
    </div>
  )
}

export function ProjectsPage() {
  const { user } = useAuth()
  const { invoices, clients, profile } = useAppData()
  const { t } = useI18n()
  const [view, setView] = useState<TimesheetView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploading, setUploading] = useState(false)
  const [month, setMonth] = useState('all')
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
  }, [t])

  useEffect(() => {
    if (manager) void load()
  }, [load, manager])

  const timesheet = view?.timesheet
  const months = useMemo(() => (timesheet ? (month === 'all' ? timesheet.months : timesheet.months.filter((item) => item === month)) : []), [timesheet, month])
  const report = useMemo(
    () => (timesheet && timesheet.entries.length ? buildProjectsReport({ timesheet, months, invoices, clients, currency }) : null),
    [timesheet, months, invoices, clients, currency],
  )
  const sortedClients = useMemo(() => [...clients].filter((client) => client.id).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName))), [clients])
  const clientName = useMemo(() => new Map(sortedClients.map((client) => [client.id as string, client.fullName])), [sortedClients])

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

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{t('finance.projects.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/55">{t('finance.projects.subtitle')}</p>
          {timesheet?.importedAt ? (
            <p className="mt-1 text-xs text-brand-ink/45">
              {t('finance.projects.imported', { file: timesheet.fileName || '—', date: timesheet.importedAt.slice(0, 10).split('-').reverse().join('.') })}
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
                report.months.length > 1 ? t('finance.projects.tiles.perMonth', { hours: hoursText(report.hours / report.months.length) }) : '',
              ]}
            />
            <Tile
              primary
              label={t('finance.projects.tiles.cost')}
              value={money(report.cost)}
              lines={[t('finance.projects.tiles.costHint'), report.unpaidHours > 0 ? t('finance.projects.tiles.unpaidHint', { hours: hoursText(report.unpaidHours) }) : '']}
            />
            <Tile
              primary
              label={t('finance.projects.tiles.revenue')}
              value={report.linkedHours > 0 ? money(report.revenue) : '—'}
              lines={[report.linkedHours > 0 ? t('finance.projects.tiles.revenueHint') : t('finance.projects.tiles.revenueNone')]}
            />
            {report.linkedHours > 0 ? (
              <Tile
                label={t('finance.projects.tiles.margin')}
                value={(() => {
                  const linked = report.projects.filter((project) => project.kind === 'client')
                  const profit = linked.reduce((sum, project) => sum + (project.profit ?? 0), 0)
                  return <span className={profit < 0 ? 'text-[#C0503A]' : undefined}>{money(profit)}</span>
                })()}
                lines={[
                  t('finance.projects.tiles.marginHint', { amount: `${CENTS.format(report.revenue / report.linkedHours)} ${symbol}` }),
                  report.internalHours > 0 ? `${t('finance.projects.tiles.internal')}: ${Math.round((report.internalHours / report.hours) * 100)}%` : '',
                ]}
              />
            ) : (
              <Tile
                label={t('finance.projects.tiles.internal')}
                value={report.internalHours > 0 ? `${Math.round((report.internalHours / report.hours) * 100)}%` : '—'}
                lines={[report.internalHours > 0 ? t('finance.projects.tiles.internalHint', { hours: hoursText(report.internalHours) }) : t('finance.projects.tiles.revenueNone')]}
              />
            )}
          </section>

          <section className="mt-6">
            <SectionTitle>{t('finance.projects.sections.signals')}</SectionTitle>
            <Card className="p-5">
              <SignalList signals={report.signals} t={t} />
            </Card>
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

          <section className="mt-6">
            <SectionTitle>{t('finance.projects.sections.table')}</SectionTitle>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right text-[13px] tabular-nums">
                  <thead className="bg-brand-bg/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.project')}</th>
                      <th className="px-3 py-3 text-left">{t('finance.projects.cols.client')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.hours')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.share')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.cost')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.revenue')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.profit')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.perHour')}</th>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.team')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map((project) => {
                      const sharedClient = project.clientId ? report.projects.filter((other) => other.clientId === project.clientId).length > 1 : false
                      return (
                        <tr key={project.name} className="border-t border-brand-ink/6 align-top">
                          <td className="px-4 py-2.5 text-left font-semibold">
                            <span className="inline-flex items-center gap-2">
                              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', KIND_BAR[project.kind])} />
                              {project.name}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-left">
                            <select
                              aria-label={`${t('finance.projects.cols.client')}: ${project.name}`}
                              value={project.kind === 'internal' ? 'internal' : project.clientId || ''}
                              onChange={(e) => void link(project.name, e.target.value)}
                              className={cn(
                                'w-full max-w-[210px] rounded-lg border border-brand-ink/10 bg-white px-2 py-1.5 text-[13px]',
                                project.kind === 'unset' ? 'text-brand-ink/45' : 'text-brand-ink',
                              )}
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
                            {sharedClient ? <p className="mt-1 max-w-[210px] text-[11px] leading-4 text-brand-ink/45">{t('finance.projects.shared')}</p> : null}
                          </td>
                          <td className="px-3 py-2.5 font-semibold">{hoursText(project.hours)}</td>
                          <td className="px-3 py-2.5 text-brand-ink/60">{ONE.format(project.share * 100)}%</td>
                          <td className="px-3 py-2.5">
                            {money(project.cost)}
                            {project.unpaidHours > 0 ? <span className="block text-[11px] text-brand-ink/45">{hoursText(project.unpaidHours)} h {t('finance.projects.noPay')}</span> : null}
                          </td>
                          <td className="px-3 py-2.5">{project.revenue === null ? <span className="text-brand-ink/25">—</span> : money(project.revenue)}</td>
                          <td className={cn('px-3 py-2.5 font-semibold', project.profit !== null && project.profit < 0 && 'text-[#C0503A]')}>
                            {project.profit === null ? <span className="font-normal text-brand-ink/25">—</span> : money(project.profit)}
                          </td>
                          <td className="px-3 py-2.5">{project.revenuePerHour === null ? <span className="text-brand-ink/25">—</span> : CENTS.format(project.revenuePerHour)}</td>
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
            <SectionTitle>{t('finance.projects.sections.people')}</SectionTitle>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-right text-[13px] tabular-nums">
                  <thead className="bg-brand-bg/60 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink/50">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.person')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.hours')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.cost')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.projects')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.perMonth')}</th>
                      <th className="px-3 py-3">{t('finance.projects.cols.busiest')}</th>
                      <th className="px-4 py-3 text-left">{t('finance.projects.cols.main')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.people.map((person) => (
                      <tr key={person.person} className="border-t border-brand-ink/6">
                        <td className="px-4 py-2.5 text-left font-semibold">{person.person}</td>
                        <td className="px-3 py-2.5 font-semibold">{hoursText(person.hours)}</td>
                        <td className="px-3 py-2.5">{person.paid ? money(person.cost) : <span className="text-brand-ink/40">{t('finance.projects.noPay')}</span>}</td>
                        <td className="px-3 py-2.5">{person.projects}</td>
                        <td className={cn('px-3 py-2.5', person.projectsPerMonth >= 5 && 'font-semibold text-[#B7791F]')}>{ONE.format(person.projectsPerMonth)}</td>
                        <td className={cn('px-3 py-2.5', person.busiest.hours > MONTH_HOURS_LIMIT && 'font-semibold text-[#C0503A]')}>
                          {person.busiest.month ? `${hoursText(person.busiest.hours)} h · ${monthLabel(person.busiest.month, t)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-left text-brand-ink/65">
                          {person.byProject
                            .slice(0, 3)
                            .map((item) => `${item.project} ${Math.round((item.hours / person.hours) * 100)}%`)
                            .join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  )
}

function SignalList({ signals, t }: { signals: Signal[]; t: T }) {
  if (signals.length === 0) return <p className="text-sm text-brand-ink/60">{t('finance.projects.signal.none')}</p>
  const over = signals.filter((signal) => signal.key === 'overHours')
  const lone = signals.filter((signal) => signal.key === 'keyPerson')
  const rest = signals.filter((signal) => signal.key !== 'overHours' && signal.key !== 'keyPerson')
  const line = (signal: Signal) => {
    switch (signal.key) {
      case 'overHours':
        return t('finance.projects.signal.overHours', { person: signal.person, months: signal.months, hours: WHOLE.format(signal.hours), month: monthLabel(signal.month, t, 'long') })
      case 'keyPerson':
        return t('finance.projects.signal.keyPerson', { project: signal.project, person: signal.person, share: signal.share })
      case 'scattered':
        return t('finance.projects.signal.scattered', { person: signal.person, projects: signal.projects, perMonth: ONE.format(signal.perMonth) })
      case 'unpaid':
        return t('finance.projects.signal.unpaid', { people: signal.people, hours: WHOLE.format(signal.hours) })
      case 'internal':
        return t('finance.projects.signal.internal', { share: signal.share, hours: WHOLE.format(signal.hours) })
      case 'unset':
        return t('finance.projects.signal.unset', { projects: signal.projects, hours: WHOLE.format(signal.hours) })
    }
  }
  const group = (title: string, items: Signal[]) => (
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
      </div>
    </li>
  )
  return (
    <ul className="space-y-3">
      {over.length ? group(t('finance.projects.signal.overHoursTitle', { limit: MONTH_HOURS_LIMIT }), over) : null}
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

function ProjectBars({ report, t }: { report: ReturnType<typeof buildProjectsReport>; t: T }) {
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

function MonthColumns({ report, t }: { report: ReturnType<typeof buildProjectsReport>; t: T }) {
  const max = Math.max(...report.byMonth.map((month) => month.hours), 1)
  const parts: ProjectKind[] = ['client', 'unset', 'internal']
  return (
    <div className="mt-4 flex h-64 items-end gap-2">
      {report.byMonth.map((month) => (
        <div key={month.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-semibold tabular-nums text-brand-ink/70">{WHOLE.format(month.hours)}</span>
          <div className="flex w-full max-w-[42px] flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(month.hours / max) * 100}%` }}>
            {parts.map((kind) => (month[kind] > 0 ? <span key={kind} className={cn('block w-full', KIND_BAR[kind])} style={{ height: `${(month[kind] / (month.hours || 1)) * 100}%` }} /> : null))}
          </div>
          <span className="text-[11px] capitalize text-brand-ink/55">{monthLabel(month.month, t)}</span>
        </div>
      ))}
    </div>
  )
}
