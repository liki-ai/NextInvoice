import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from './ui'
import { cn } from '../lib/cn'
import { projectAdvice, type Advice } from '../lib/projectAdvice'
import type { ProjectFigures, ProjectsReport } from '../lib/timesheet'

type T = (key: string, params?: Record<string, string | number>) => string

const TONE: Record<Advice['tone'], string> = {
  good: 'bg-[#2E8B57]',
  info: 'bg-brand',
  warn: 'bg-[#C9A227]',
  bad: 'bg-[#C0503A]',
}

const KIND_DOT: Record<ProjectFigures['kind'], string> = {
  client: 'bg-brand',
  product: 'bg-[#5B8C5A]',
  shared: 'bg-brand-accent',
  unset: 'bg-brand-ink/25',
}

function Tile({ label, value, lines, tone }: { label: string; value: ReactNode; lines?: string[]; tone?: 'bad' }) {
  const shown = (lines || []).filter(Boolean)
  return (
    <div className="flex h-full flex-col rounded-2xl border border-brand/20 bg-white p-4 shadow-[0_1px_2px_rgba(29,43,46,0.05)] sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">{label}</p>
      <p className={cn('mt-2 font-display text-2xl font-medium leading-none tabular-nums sm:text-[28px]', tone === 'bad' && 'text-[#C0503A]')}>{value}</p>
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

/**
 * One project on its own: what it brought in (and through which company), what it cost month by
 * month, who worked on it and at what cost, and what is worth changing.
 */
export function ProjectDetail({
  project,
  report,
  clientName,
  money,
  hourly,
  hoursText,
  monthName,
  backTo,
  t,
}: {
  project: ProjectFigures
  report: ProjectsReport
  clientName: string
  money: (amount: number | null | undefined) => string
  hourly: (amount: number | null | undefined) => string
  hoursText: (value: number) => string
  monthName: (month: string) => string
  backTo: string
  t: T
}) {
  const advice = projectAdvice(project, report)
  const months = [...report.months].sort()
  const rows = months.map((month) => {
    const hours = project.byMonth[month] ?? 0
    const cost = project.costByMonth[month] ?? 0
    const revenue = project.revenueByMonth[month] ?? 0
    return { month, hours, cost, revenue, result: revenue - cost }
  })
  let running = 0
  const withRunning = rows.map((row) => {
    running += row.result
    return { ...row, running }
  })
  const peak = Math.max(1, ...rows.map((row) => Math.max(row.cost, row.revenue)))
  const earns = project.kind === 'client' || project.kind === 'product'
  const shkRevenue = project.revenue !== null ? Math.max(0, project.revenue - project.llcRevenue) : null
  const margin = project.revenue && project.profit !== null ? Math.round((project.profit / project.revenue) * 100) : null
  // Amounts in money, per-hour figures with cents, hours and percentages as they are.
  const format = (key: string, value: number | string) => {
    if (typeof value !== 'number') return value
    if (['loss', 'perMonth', 'revenueNeeded', 'profit', 'cost', 'amount', 'revenueRecent', 'revenueBefore'].includes(key)) return money(value)
    if (['costHour', 'revenueHour', 'gap'].includes(key)) return hourly(value)
    return value
  }

  return (
    <div className="min-w-0">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink/55 hover:text-brand">
        <ArrowLeft className="h-4 w-4" />
        {t('projectDetail.back')}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-display text-3xl font-medium tracking-tight">
            <span className={cn('h-3 w-3 rounded-sm', KIND_DOT[project.kind])} />
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-brand-ink/55">
            {t(`projectDetail.kind.${project.kind}`)}
            {clientName ? ` · ${clientName}` : ''} · {months.length === 1 ? monthName(months[0]) : `${monthName(months[0])} – ${monthName(months[months.length - 1])}`}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t('projectDetail.revenue')}
          value={earns || project.revenue !== null ? money(project.revenue) : '—'}
          lines={[
            project.llcRevenue > 0 ? t('projectDetail.fromShpk', { amount: money(shkRevenue) }) : '',
            project.llcRevenue > 0 ? t('projectDetail.fromLlc', { amount: money(project.llcRevenue), count: project.llcPayments }) : '',
            project.invoices ? t('projectDetail.invoices', { count: project.invoices }) : '',
            project.bankPayments ? t('projectDetail.bankPayments', { count: project.bankPayments }) : '',
          ]}
        />
        <Tile
          label={t('projectDetail.cost')}
          value={money(project.cost)}
          lines={[t('projectDetail.direct', { amount: money(project.direct) }), project.kind !== 'shared' ? t('projectDetail.overhead', { amount: money(project.overhead) }) : '']}
        />
        <Tile
          label={t('projectDetail.profit')}
          value={project.profit === null ? '—' : money(project.profit)}
          tone={project.profit !== null && project.profit < 0 ? 'bad' : undefined}
          lines={[margin !== null ? t('projectDetail.margin', { margin }) : '', project.revenuePerHour !== null ? t('projectDetail.perHour', { revenue: hourly(project.revenuePerHour), cost: hourly(project.costPerHour) }) : '']}
        />
        <Tile
          label={t('projectDetail.hours')}
          value={hoursText(project.hours)}
          lines={[
            t('projectDetail.people', { count: project.people.length }),
            project.rawHours !== project.hours ? t('projectDetail.rawHours', { hours: hoursText(project.rawHours) }) : '',
            t('projectDetail.shareOfHours', { share: Math.round(project.share * 100) }),
          ]}
        />
      </div>

      {advice.length ? (
        <section className="mt-8">
          <SectionTitle>{t('projectDetail.adviceTitle')}</SectionTitle>
          <Card className="p-0">
            <ul className="divide-y divide-brand-ink/6">
              {advice.map((item) => (
                <li key={item.key} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[item.tone])} />
                  <p className="text-[13px] leading-5 text-brand-ink/75">{t(`projectDetail.advice.${item.key}`, Object.fromEntries(Object.entries(item.params).map(([key, value]) => [key, format(key, value)])))}</p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionTitle>{t('projectDetail.monthlyTitle')}</SectionTitle>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-[13px] tabular-nums">
              <thead className="bg-brand-bg/60 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
                <tr>
                  <th className="px-4 py-3 text-left">{t('projectDetail.col.month')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.hours')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.cost')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.revenue')}</th>
                  <th className="w-[28%] px-3 py-3 text-left">{t('projectDetail.col.chart')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.result')}</th>
                  <th className="px-4 py-3">{t('projectDetail.col.running')}</th>
                </tr>
              </thead>
              <tbody>
                {withRunning.map((row) => (
                  <tr key={row.month} className={cn('border-t border-brand-ink/5', !row.hours && !row.revenue && 'text-brand-ink/30')}>
                    <td className="px-4 py-2.5 text-left font-semibold capitalize">{monthName(row.month)}</td>
                    <td className="px-3 py-2.5">{row.hours ? hoursText(row.hours) : '—'}</td>
                    <td className="px-3 py-2.5">{row.cost ? money(row.cost) : '—'}</td>
                    <td className="px-3 py-2.5">{row.revenue ? money(row.revenue) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-brand-ink/[0.05]">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${(row.revenue / peak) * 100}%` }} />
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-brand-ink/[0.05]">
                        <span className="block h-full rounded-full bg-[#C0503A]/60" style={{ width: `${(row.cost / peak) * 100}%` }} />
                      </span>
                    </td>
                    <td className={cn('px-3 py-2.5 font-semibold', row.result < 0 && 'text-[#C0503A]')}>{row.hours || row.revenue ? money(row.result) : '—'}</td>
                    <td className={cn('px-4 py-2.5', row.running < 0 && 'text-[#C0503A]')}>{money(row.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-brand-ink/50">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-brand" />
            {t('projectDetail.col.revenue')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-[#C0503A]/60" />
            {t('projectDetail.col.cost')}
          </span>
          <span>{t('projectDetail.monthlyNote')}</span>
        </p>
      </section>

      <section className="mt-8">
        <SectionTitle>{t('projectDetail.teamTitle', { count: project.people.length })}</SectionTitle>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-[13px] tabular-nums">
              <thead className="bg-brand-bg/60 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
                <tr>
                  <th className="px-4 py-3 text-left">{t('projectDetail.col.person')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.hours')}</th>
                  <th className="w-[30%] px-3 py-3 text-left">{t('projectDetail.col.share')}</th>
                  <th className="px-3 py-3">{t('projectDetail.col.cost')}</th>
                  <th className="px-4 py-3">{t('projectDetail.col.costPerHour')}</th>
                </tr>
              </thead>
              <tbody>
                {project.people.map((person) => {
                  const share = project.hours ? person.hours / project.hours : 0
                  return (
                    <tr key={person.person} className="border-t border-brand-ink/5">
                      <td className="px-4 py-2.5 text-left font-semibold">{person.person}</td>
                      <td className="px-3 py-2.5">{hoursText(person.hours)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-ink/[0.05]">
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />
                          </span>
                          <span className="w-9 text-right text-[11px] text-brand-ink/50">{Math.round(share * 100)}%</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{money(person.cost)}</td>
                      <td className="px-4 py-2.5">{person.hours ? hourly(person.cost / person.hours) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  )
}
