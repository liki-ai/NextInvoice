import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleAlert, Lightbulb, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import { buildInsights, type Insight, type InsightRow, type InsightSeverity } from '../lib/insights'
import { formatMoney, type Invoice } from '../lib/invoice'
import type { ClientRecord } from '../lib/document'
import type { Obligation } from '../lib/obligation'
import { cn } from '../lib/cn'
import { Card } from './ui'

const SEVERITY: Record<InsightSeverity, { key: string; badge: string; bar: string; Icon: typeof CircleAlert }> = {
  high: { key: 'insights.severityHigh', badge: 'bg-[#F8E8E4] text-[#C0503A]', bar: 'bg-[#C0503A]', Icon: CircleAlert },
  medium: { key: 'insights.severityMedium', badge: 'bg-[#FFF6E5] text-[#8A5A00]', bar: 'bg-[#E8B84A]', Icon: TriangleAlert },
  low: { key: 'insights.severityLow', badge: 'bg-brand/10 text-brand', bar: 'bg-brand/50', Icon: Lightbulb },
}

/**
 * The Overview's analysis: what the recorded invoices, payments, expenses and clients say needs
 * fixing, most important first, each with the numbers behind it and what to do about it.
 */
export function InsightsPanel({
  invoices,
  obligations,
  clients,
  currency,
  fallbackCurrency,
}: {
  invoices: Invoice[]
  obligations: Obligation[]
  clients: ClientRecord[]
  currency: string
  fallbackCurrency: string
}) {
  const { t } = useI18n()
  const report = useMemo(() => buildInsights({ invoices, obligations, clients, currency, fallbackCurrency }), [invoices, obligations, clients, currency, fallbackCurrency])
  const amounts = (values?: Record<string, number>) => Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, formatMoney(value, currency)]))

  function sentence(insight: Insight, part: 'Title' | 'Text' | 'Action') {
    const variant = part === 'Title' && insight.variant ? `${insight.variant[0].toUpperCase()}${insight.variant.slice(1)}` : ''
    return t(`insights.${insight.id}${variant}${part}`, { ...insight.params, ...amounts(insight.money) })
  }

  function rowParts(row: InsightRow) {
    const note = row.note ? t(row.note.key, { ...row.note.params, ...amounts(row.note.money) }) : ''
    // A row without a name of its own is named by its note, with the detail underneath.
    return row.label ? { label: row.label, sub: note || row.text || '' } : { label: note, sub: row.text || '' }
  }

  return (
    <section className="mt-10" aria-labelledby="insights-title">
      <h2 id="insights-title" className="font-display text-2xl font-medium tracking-tight">
        {t('insights.title')}
      </h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-6 text-brand-ink/55">{t('insights.subtitle', { currency })}</p>

      {report.insights.length === 0 ? (
        <Card className="mt-5">
          <p className="text-sm text-brand-ink/60">{t('insights.none')}</p>
        </Card>
      ) : (
        <ol className="mt-5 space-y-4">
          {report.insights.map((insight, index) => {
            const look = SEVERITY[insight.severity]
            return (
              <li key={insight.id}>
                <Card className="relative overflow-hidden p-0">
                  <span className={cn('absolute inset-y-0 left-0 w-1', look.bar)} aria-hidden="true" />
                  <div className="px-5 py-5 pl-6 sm:px-6 sm:pl-7">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm font-semibold tabular-nums text-brand-ink/35">{index + 1}</span>
                      <h3 className="min-w-0 flex-1 text-base font-semibold">{sentence(insight, 'Title')}</h3>
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold', look.badge)}>
                        <look.Icon className="h-3.5 w-3.5" />
                        {t(look.key)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-brand-ink/70">{sentence(insight, 'Text')}</p>

                    {insight.rows.length > 0 ? (
                      <ul className="mt-3 divide-y divide-brand-ink/6 rounded-xl border border-brand-ink/8 bg-[#FAFBFB]">
                        {insight.rows.map((row, rowIndex) => {
                          const parts = rowParts(row)
                          return (
                            <li key={rowIndex} className="flex items-start justify-between gap-4 px-4 py-2.5">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{parts.label}</span>
                                {parts.sub ? <span className="block break-words text-xs leading-5 text-brand-ink/50">{parts.sub}</span> : null}
                              </span>
                              {row.money !== undefined ? (
                                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(row.money, currency)}</span>
                              ) : null}
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <p className="min-w-0 flex-1 text-sm leading-6">
                        <span className="font-semibold">{t('insights.todo')}: </span>
                        <span className="text-brand-ink/75">{sentence(insight, 'Action')}</span>
                      </p>
                      {insight.link ? (
                        <Link to={insight.link} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline">
                          {t('insights.open')}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ol>
      )}

      {report.hasLastYear ? null : <p className="mt-4 text-xs leading-5 text-brand-ink/50">{t('insights.importHint')}</p>}
    </section>
  )
}
