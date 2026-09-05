import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Modal, Select } from '../../components/ui'
import {
  buildOverviewHtml,
  downloadHtmlAsPdf,
  formatMoney,
  formatStatementFileDate,
  overviewFileName,
} from '../../lib/invoice'
import {
  MONTH_ABBR,
  availableYears,
  buildOverview,
  collectCurrencies,
  hasLimitation,
  isoDate,
  periodLabel,
  resolvePeriod,
  type PeriodPreset,
} from '../../lib/overview'
import { localizeCompanyProfile } from '../../lib/companySamples'

const PRESETS: PeriodPreset[] = ['this_month', 'this_year', 'month', 'year', 'custom']

function limitationNotes(
  limitations: ReturnType<typeof buildOverview>['limitations'],
  t: (key: string) => string,
) {
  const notes: string[] = []
  if (limitations.legacyPaid) notes.push(t('overview.limitationLegacy'))
  if (limitations.undatedPayments) notes.push(t('overview.limitationUndated'))
  if (limitations.missingDates) notes.push(t('overview.limitationDates'))
  if (limitations.undatedCancellations) notes.push(t('overview.limitationCancel'))
  return notes
}

function overviewPdfLabels(t: (key: string, params?: Record<string, string | number>) => string, dict: { pdf: Record<string, string> }) {
  return {
    ...dict.pdf,
    pdfTitle: t('overview.pdfTitle'),
    period: t('overview.title'),
    asOf: t('overview.asOf', { date: '' }).replace(/\s*\{date\}\s*/g, '').replace(/\s+$/g, ''),
    invoiced: t('overview.invoiced'),
    received: t('overview.received'),
    obligationsRecorded: t('overview.obligationsRecorded'),
    paidOut: t('overview.paidOut'),
    receivables: t('overview.receivables'),
    payables: t('overview.payables'),
    netPayments: t('overview.netPayments'),
    netHint: t('overview.netHint'),
    customers: t('overview.customers'),
    overdue: t('overview.overdue'),
    empty: t('overview.empty'),
    limitationTitle: t('overview.limitationTitle'),
    summary: t('invoiceDetail.summary'),
    vendor: t('obligations.vendor'),
  }
}

export function OverviewPage() {
  const { invoices, obligations, profile, loading } = useAppData()
  const { t, dict } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(false)
  const fallbackCurrency = profile?.currency || 'EUR'
  const currencies = useMemo(
    () => collectCurrencies(invoices, obligations, fallbackCurrency),
    [invoices, obligations, fallbackCurrency],
  )
  const currency = currencies.includes(searchParams.get('currency') || '')
    ? (searchParams.get('currency') as string)
    : currencies[0] || fallbackCurrency
  const preset = (PRESETS.includes(searchParams.get('preset') as PeriodPreset)
    ? searchParams.get('preset')
    : 'this_month') as PeriodPreset
  const year = Number(searchParams.get('year')) || new Date().getFullYear()
  const month = Number(searchParams.get('month') ?? new Date().getMonth())
  const from = searchParams.get('from') || isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const to = searchParams.get('to') || isoDate(new Date())
  const metric = searchParams.get('metric') || ''
  const period = useMemo(
    () => resolvePeriod({ preset, year, month, from, to }),
    [preset, year, month, from, to],
  )
  const report = useMemo(
    () => buildOverview({ invoices, obligations, period, currency, fallbackCurrency }),
    [invoices, obligations, period, currency, fallbackCurrency],
  )
  const years = useMemo(() => availableYears(invoices, obligations), [invoices, obligations])
  const label = periodLabel(report.period)
  const notes = limitationNotes(report.limitations, t)
  const issuedDate = formatStatementFileDate(new Date())
  const empty =
    report.invoiced === 0 &&
    report.paymentsReceived === 0 &&
    report.obligationsRecorded === 0 &&
    report.paymentsMade === 0 &&
    report.receivables === 0 &&
    report.payables === 0

  const html = useMemo(() => {
    if (!preview || !profile) return ''
    return buildOverviewHtml({
      company: localizeCompanyProfile(profile, t),
      report,
      periodText: label,
      issuedDate,
      pdfLabels: overviewPdfLabels(t, dict),
      notes,
    })
  }, [preview, profile, report, label, issuedDate, dict, t, notes])

  function update(next: Record<string, string | number | undefined>) {
    const params: Record<string, string> = { preset, currency }
    if (preset === 'month' || preset === 'year') params.year = String(year)
    if (preset === 'month') params.month = String(month)
    if (preset === 'custom') {
      params.from = from
      params.to = to
    }
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') delete params[key]
      else params[key] = String(value)
    }
    if (next.preset && next.preset !== preset) delete params.metric
    setSearchParams(params)
  }

  function openMetric(nextMetric: string) {
    update({ metric: nextMetric })
  }

  function statementHref(clientName?: string, clientId?: string) {
    const params = new URLSearchParams({
      from: 'overview',
      asOf: report.period.endIso,
      currency,
      preset,
      client: clientName || '',
    })
    if (clientId) params.set('clientId', clientId)
    if (preset === 'month' || preset === 'year') params.set('year', String(year))
    if (preset === 'month') params.set('month', String(month))
    if (preset === 'custom') {
      params.set('rangeFrom', from)
      params.set('rangeTo', to)
    }
    return `/app/statement?${params.toString()}`
  }

  const cards = [
    { key: 'invoiced', label: t('overview.invoiced'), value: report.invoiced, metric: 'invoiced' },
    { key: 'received', label: t('overview.received'), value: report.paymentsReceived, metric: 'received' },
    { key: 'obligations', label: t('overview.obligationsRecorded'), value: report.obligationsRecorded, metric: 'obligations' },
    { key: 'paidOut', label: t('overview.paidOut'), value: report.paymentsMade, metric: 'paidOut' },
    { key: 'receivables', label: t('overview.receivables'), value: report.receivables, metric: 'receivables' },
    { key: 'payables', label: t('overview.payables'), value: report.payables, metric: 'payables' },
  ]

  const drillTitle: Record<string, string> = {
    invoiced: t('overview.drillInvoiced'),
    received: t('overview.drillReceived'),
    obligations: t('overview.drillObligations'),
    paidOut: t('overview.drillPaidOut'),
    receivables: t('overview.drillReceivables'),
    payables: t('overview.drillPayables'),
    net: t('overview.drillNet'),
  }

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('overview.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('overview.subtitle')}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink/40">
            {label} · {t('overview.asOf', { date: report.period.endIso })} · {currency}
          </p>
        </div>
        <Button type="button" onClick={() => setPreview(true)} disabled={empty && !hasLimitation(report.limitations)}>
          <Send className="h-4 w-4" />
          {t('overview.exportPdf')}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {PRESETS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => update({ preset: item, metric: undefined })}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
              preset === item ? 'bg-brand text-white' : 'bg-white text-brand-ink/65 hover:text-brand-ink'
            }`}
          >
            {item === 'this_month'
              ? t('overview.thisMonth')
              : item === 'this_year'
                ? t('overview.thisYear')
                : item === 'month'
                  ? t('overview.month')
                  : item === 'year'
                    ? t('overview.year')
                    : t('overview.custom')}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {preset === 'month' || preset === 'year' ? (
          <Select label={t('overview.year')} value={String(year)} onChange={(e) => update({ year: e.target.value, metric: undefined })}>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        ) : null}
        {preset === 'month' ? (
          <Select label={t('overview.month')} value={String(month)} onChange={(e) => update({ month: e.target.value, metric: undefined })}>
            {MONTH_ABBR.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </Select>
        ) : null}
        {preset === 'custom' ? (
          <>
            <label className="mb-5 flex flex-col gap-2.5 last:mb-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('overview.from')}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => update({ from: e.target.value, metric: undefined })}
                className="w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="mb-5 flex flex-col gap-2.5 last:mb-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('overview.to')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => update({ to: e.target.value, metric: undefined })}
                className="w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              />
            </label>
          </>
        ) : null}
        {currencies.length > 1 ? (
          <Select label={t('overview.currency')} value={currency} onChange={(e) => update({ currency: e.target.value, metric: undefined })}>
            {currencies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {loading && invoices.length === 0 && obligations.length === 0 ? (
        <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p>
      ) : null}

      {notes.length > 0 ? (
        <Card className="mt-6 border-[#E8C4BB] bg-[#FDF6F4]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#C0503A]">{t('overview.limitationTitle')}</p>
          {notes.map((note) => (
            <p key={note} className="mt-2 text-sm text-brand-ink/70">
              {note}
            </p>
          ))}
        </Card>
      ) : null}

      {empty ? (
        <Card className="mt-6">
          <p className="text-sm text-brand-ink/60">{t('overview.empty')}</p>
        </Card>
      ) : null}

      <p className="mt-6 text-xs text-brand-ink/45">{t('overview.tapHint')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <button key={card.key} type="button" onClick={() => openMetric(card.metric)} className="text-left">
            <Card className="h-full p-4 transition hover:border-brand/30 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{card.label}</p>
              <p className="mt-2 font-display text-xl font-medium sm:text-2xl">{formatMoney(card.value, currency)}</p>
            </Card>
          </button>
        ))}
        <button type="button" onClick={() => openMetric('net')} className="col-span-2 text-left lg:col-span-3">
          <Card className="p-4 transition hover:border-brand/30 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('overview.netPayments')}</p>
            <p className="mt-2 font-display text-2xl font-medium">{formatMoney(report.netPayments, currency)}</p>
            <p className="mt-2 text-xs text-brand-ink/50">{t('overview.netHint')}</p>
          </Card>
        </button>
      </div>

      {metric ? (
        <Card className="mt-8 p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-brand-ink/8 px-5 py-4">
            <div>
              <h2 className="font-display text-xl font-medium">{drillTitle[metric] || metric}</h2>
              <p className="mt-1 text-xs text-brand-ink/45">
                {label} · {currency}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => update({ metric: undefined })}>
              {t('common.close')}
            </Button>
          </div>
          <DrillList report={report} metric={metric} currency={currency} t={t} navigate={navigate} />
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-brand-ink/8 px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('overview.customers')}</h2>
          </div>
          {report.customers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-brand-ink/55">{t('overview.empty')}</p>
          ) : (
            <div>
              {report.customers.map((item) => (
                <Link
                  key={`${item.clientId}-${item.client?.fullName}`}
                  to={statementHref(item.client?.fullName, item.clientId)}
                  className="flex items-center justify-between gap-3 border-b border-brand-ink/5 px-5 py-3 last:border-0 hover:bg-brand-bg"
                >
                  <span className="text-sm font-semibold">{item.client?.fullName}</span>
                  <span className="text-sm font-semibold text-brand">{formatMoney(item.amount, currency)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-brand-ink/8 px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('overview.overdue')}</h2>
          </div>
          {report.overduePayables.length === 0 ? (
            <p className="px-5 py-6 text-sm text-brand-ink/55">{t('overview.empty')}</p>
          ) : (
            <div>
              {report.overduePayables.map((item) => (
                <Link
                  key={item.id}
                  to={`/app/obligations/${item.id}/edit`}
                  className="flex items-center justify-between gap-3 border-b border-brand-ink/5 px-5 py-3 last:border-0 hover:bg-brand-bg"
                >
                  <span>
                    <span className="block text-sm font-semibold">{item.vendor}</span>
                    <span className="text-xs text-brand-ink/45">{t('overview.daysOverdue', { days: item.daysOverdueAsOf })}</span>
                  </span>
                  <span className="text-sm font-semibold text-[#C0503A]">{formatMoney(item.amountDueAsOf, currency)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {preview ? (
        <Modal
          title={t('overview.exportPdf')}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!profile) return
                  downloadHtmlAsPdf(
                    buildOverviewHtml({
                      company: localizeCompanyProfile(profile, t),
                      report,
                      periodText: label,
                      issuedDate,
                      pdfLabels: overviewPdfLabels(t, dict),
                      notes,
                    }),
                    overviewFileName(issuedDate),
                  )
                  setPreview(false)
                }}
              >
                {t('common.send')}
              </Button>
            </>
          }
        >
          <iframe title="overview-preview" className="h-[70vh] w-full bg-white" srcDoc={html} />
        </Modal>
      ) : null}
    </div>
  )
}

function DrillList({
  report,
  metric,
  currency,
  t,
  navigate,
}: {
  report: ReturnType<typeof buildOverview>
  metric: string
  currency: string
  t: (key: string, params?: Record<string, string | number>) => string
  navigate: ReturnType<typeof useNavigate>
}) {
  const rows: Array<{ id: string; title: string; subtitle: string; amount: number; href: string }> = []
  if (metric === 'invoiced') {
    for (const item of report.issuedInPeriod) {
      rows.push({
        id: String(item.id),
        title: String(item.number || ''),
        subtitle: String(item.clientSnapshot?.fullName || item.client?.fullName || item.date || ''),
        amount: Number(item.total) || 0,
        href: `/app/invoices/${item.id}`,
      })
    }
  } else if (metric === 'receivables') {
    for (const item of report.receivableDocs) {
      rows.push({
        id: String(item.id),
        title: String(item.number || ''),
        subtitle: String(item.clientSnapshot?.fullName || item.client?.fullName || item.date || ''),
        amount: Number(item.amountDueAsOf) || 0,
        href: `/app/invoices/${item.id}`,
      })
    }
  } else if (metric === 'received') {
    report.received.forEach((item, index) => {
      rows.push({
        id: item.id || `r-${index}`,
        title: String(item.invoice?.number || ''),
        subtitle: t('overview.paymentOn', { date: item.date }),
        amount: Number(item.amount) || 0,
        href: `/app/invoices/${item.invoice?.id}`,
      })
    })
  } else if (metric === 'obligations') {
    for (const item of report.obligationsInPeriod) {
      rows.push({
        id: String(item.id),
        title: String(item.vendor || ''),
        subtitle: String(item.date || ''),
        amount: Number(item.amount) || 0,
        href: `/app/obligations/${item.id}/edit`,
      })
    }
  } else if (metric === 'payables') {
    for (const item of report.payableDocs) {
      rows.push({
        id: String(item.id),
        title: String(item.vendor || ''),
        subtitle: String(item.date || ''),
        amount: Number(item.amountDueAsOf) || 0,
        href: `/app/obligations/${item.id}/edit`,
      })
    }
  } else if (metric === 'paidOut') {
    report.paidOut.forEach((item, index) => {
      rows.push({
        id: item.id || `p-${index}`,
        title: String(item.obligation?.vendor || ''),
        subtitle: t('overview.paymentOn', { date: item.date }),
        amount: Number(item.amount) || 0,
        href: `/app/obligations/${item.obligation?.id}/edit`,
      })
    })
  } else if (metric === 'net') {
    report.received.forEach((item, index) => {
      rows.push({
        id: `in-${item.id || index}`,
        title: String(item.invoice?.number || ''),
        subtitle: t('overview.paymentOn', { date: item.date }),
        amount: Number(item.amount) || 0,
        href: `/app/invoices/${item.invoice?.id}`,
      })
    })
    report.paidOut.forEach((item, index) => {
      rows.push({
        id: `out-${item.id || index}`,
        title: String(item.obligation?.vendor || ''),
        subtitle: t('overview.paymentOn', { date: item.date }),
        amount: -(Number(item.amount) || 0),
        href: `/app/obligations/${item.obligation?.id}/edit`,
      })
    })
  }

  if (!rows.length) {
    return <p className="px-5 py-8 text-sm text-brand-ink/55">{t('overview.noMatches')}</p>
  }

  return (
    <div>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => navigate(row.href)}
          className="flex w-full items-center justify-between gap-3 border-b border-brand-ink/5 px-5 py-3 text-left last:border-0 hover:bg-brand-bg"
        >
          <span>
            <span className="block text-sm font-semibold text-brand">{row.title}</span>
            <span className="text-xs text-brand-ink/45">{row.subtitle}</span>
          </span>
          <span className="text-sm font-semibold">{formatMoney(row.amount, currency)}</span>
        </button>
      ))}
    </div>
  )
}
