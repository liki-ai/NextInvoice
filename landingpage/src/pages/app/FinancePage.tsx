import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Download, FileText, Inbox, Landmark, Mail, RefreshCw, RotateCcw, Settings2, Trash2, Undo2, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal, Select } from '../../components/ui'
import { BankMatchModal } from '../../components/BankMatchModal'
import { api, apiBase, getToken } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/invoice'
import {
  FINANCE_KINDS,
  annualStatements,
  buildFinanceSummary,
  currentDocuments,
  financeYears,
  headlineAmount,
  monthlyFigures,
  operatingOut,
  type FinanceDoc,
  type FinanceKind,
  type FinanceView,
  type HealthStatus,
} from '../../lib/finance'

type T = (key: string, params?: Record<string, string | number>) => string

const ACCEPT = '.pdf,.xlsx,.xls,.csv,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const TAX_KINDS: FinanceKind[] = ['vat_return', 'payroll_tax', 'rent_tax', 'profit_tax', 'other_tax']

/** 2026-10-13 → 13.10.2026; a month 2026-08 → 08.2026; anything else as it is. */
function shortDate(value: string | null | undefined) {
  const text = String(value || '')
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (day) return `${day[3]}.${day[2]}.${day[1]}`
  const month = /^(\d{4})-(\d{2})$/.exec(text)
  if (month) return `${month[2]}.${month[1]}`
  return text
}

function periodText(period: string | undefined, lang: string) {
  const text = String(period || '')
  const month = /^(\d{4})-(\d{2})$/.exec(text)
  if (month) return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(Number(month[1]), Number(month[2]) - 1, 1))
  const quarter = /^(\d{4})-Q([1-4])$/.exec(text)
  if (quarter) return `T${quarter[2]} ${quarter[1]}`
  return text
}

function monthName(period: string, lang: string) {
  const [year, month] = period.split('-').map(Number)
  return new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(year, month - 1, 1))
}

async function fetchFile(doc: FinanceDoc) {
  const res = await fetch(`${apiBase()}/api/finance/documents/${doc.id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error(String(res.status))
  return res.blob()
}

async function download(doc: FinanceDoc) {
  const blob = await fetchFile(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = doc.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function errorText(t: T, err: unknown) {
  const code = (err as { code?: string })?.code
  if (code) {
    const known = t(`finance.err.${code}`)
    if (known !== `finance.err.${code}`) return known
  }
  return err instanceof Error ? err.message : t('common.error')
}

const DOT: Record<HealthStatus, string> = {
  good: 'bg-[#2E8B57]',
  warn: 'bg-[#C9A227]',
  bad: 'bg-[#C0503A]',
  unknown: 'bg-brand-ink/20',
}

function Tile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'brand' | 'plain' }) {
  return (
    <div className={cn('h-full rounded-2xl border p-3.5 sm:p-4', tone === 'brand' ? 'border-brand/15 bg-brand/5' : 'border-brand-ink/8 bg-white')}>
      <p className={cn('text-[10.5px] font-semibold uppercase tracking-[0.08em]', tone === 'brand' ? 'text-brand/80' : 'text-brand-ink/40')}>{label}</p>
      <p className="mt-1.5 font-display text-lg font-medium tabular-nums sm:text-xl">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-brand-ink/50">{hint}</p> : null}
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

export function FinancePage() {
  const { user } = useAuth()
  const { invoices, profile, refresh } = useAppData()
  const { t, lang } = useI18n()
  const [view, setView] = useState<FinanceView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [filter, setFilter] = useState<'all' | 'taxes' | 'failed' | FinanceKind>('all')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceDoc | null>(null)
  const [bankFile, setBankFile] = useState<Blob | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const wasBusy = useRef(false)
  const currency = profile?.currency || 'EUR'
  const manager = user?.role !== 'member'

  const load = useCallback(async () => {
    try {
      setView(await api<FinanceView>('/api/finance'))
      setLoadError('')
    } catch (err) {
      setLoadError(errorText(t, err))
    }
  }, [t])

  useEffect(() => {
    if (manager) void load()
  }, [load, manager])

  // While the mailbox is being read or documents are being read, follow along; when it is done,
  // the invoices may have been settled by a bank statement, so they are fetched again.
  const busy = Boolean(view && (view.progress.checking || view.progress.reading > 0))
  useEffect(() => {
    if (busy) {
      wasBusy.current = true
      const timer = setTimeout(() => void load(), 3000)
      return () => clearTimeout(timer)
    }
    if (wasBusy.current) {
      wasBusy.current = false
      void refresh()
    }
    return undefined
  }, [busy, view, load, refresh])

  const docs = useMemo(() => view?.documents || [], [view])
  const summary = useMemo(() => buildFinanceSummary(docs, invoices, year, currency), [docs, invoices, year, currency])
  const current = useMemo(() => currentDocuments(docs), [docs])
  const months = useMemo(() => monthlyFigures(current, invoices, year, currency), [current, invoices, year, currency])
  const annual = useMemo(() => annualStatements(docs), [docs])
  const years = useMemo(() => financeYears(docs, invoices), [docs, invoices])
  const statements = useMemo(
    () => docs.filter((doc) => doc.kind === 'bank_statement' && doc.status === 'done').sort((a, b) => String(b.statement?.to || b.receivedAt).localeCompare(String(a.statement?.to || a.receivedAt))),
    [docs],
  )

  async function act(path: string, method = 'POST', body?: unknown) {
    try {
      setNotice('')
      setView(await api<FinanceView>(path, { method, body }))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    const form = new FormData()
    for (const file of Array.from(files).slice(0, 20)) form.append('files', file)
    setUploading(true)
    setNotice('')
    try {
      const res = await api<FinanceView & { added: { id: string; duplicate: boolean }[] }>('/api/finance/documents', { method: 'POST', form })
      setView(res)
      const again = res.added.filter((item) => item.duplicate).length
      setNotice(t('finance.uploaded', { count: res.added.length - again }) + (again ? ` ${t('finance.duplicates', { count: again })}` : ''))
    } catch (err) {
      setNotice(errorText(t, err))
    } finally {
      setUploading(false)
    }
  }

  async function openBank(doc: FinanceDoc) {
    try {
      setBankFile(await fetchFile(doc))
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  if (!manager) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('finance.title')}</h1>
        <Card className="mt-6">
          <p className="text-sm text-brand-ink/60">{t('finance.managersOnly')}</p>
        </Card>
      </div>
    )
  }

  const money = (amount: number | null | undefined) => (typeof amount === 'number' ? formatMoney(amount, currency) : '—')
  const change = summary.revenueLastYear > 0 ? Math.round(((summary.revenue - summary.revenueLastYear) / summary.revenueLastYear) * 100) : null
  const shown = docs.filter((doc) => {
    if (filter === 'all') return true
    if (filter === 'failed') return doc.status === 'failed'
    if (filter === 'taxes') return TAX_KINDS.includes(doc.kind as FinanceKind)
    return doc.kind === filter
  })
  const failed = docs.filter((doc) => doc.status === 'failed').length
  const settings = view?.settings
  const isThisYear = year === new Date().getFullYear()

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{t('finance.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/55">{t('finance.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('finance.year')}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-brand-ink/10 bg-white px-3 py-2.5 text-sm font-semibold"
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" />
            {uploading ? t('finance.uploading') : t('finance.upload')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
          {settings?.enabled ? (
            <Button type="button" variant="secondary" disabled={view?.progress.checking} onClick={() => void act('/api/finance/check')}>
              <RefreshCw className={cn('h-4 w-4', view?.progress.checking && 'animate-spin')} />
              {view?.progress.checking ? t('finance.checking') : t('finance.checkNow')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setSettingsOpen(true)} aria-label={t('finance.inboxSettings')}>
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('finance.inboxSettings')}</span>
          </Button>
        </div>
      </div>

      {loadError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-[#C0503A]">{loadError}</p> : null}
      {notice ? <p className="mt-4 rounded-xl bg-brand/5 px-4 py-3 text-sm font-medium text-brand-ink/70">{notice}</p> : null}

      {view && !settings?.enabled ? (
        <Card className="mt-6 flex flex-wrap items-center gap-4 border-brand/20 bg-brand/5 p-5">
          <Mail className="h-6 w-6 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('finance.connectTitle')}</p>
            <p className="mt-0.5 text-sm text-brand-ink/60">{t('finance.connectBody')}</p>
          </div>
          <Button type="button" onClick={() => setSettingsOpen(true)}>
            {t('finance.connectAction')}
          </Button>
        </Card>
      ) : null}

      {view && (busy || view.check.lastError || view.check.lastAt) ? (
        <p className={cn('mt-4 flex flex-wrap items-center gap-2 text-xs', view.check.lastError && !busy ? 'text-[#C0503A]' : 'text-brand-ink/50')}>
          <Inbox className="h-3.5 w-3.5" />
          {view.progress.checking
            ? t('finance.progressChecking', { count: view.progress.fetched })
            : view.check.lastError
              ? `${t('finance.lastCheckFailed')}: ${t(`finance.err.${view.check.lastError}`) === `finance.err.${view.check.lastError}` ? view.check.lastError : t(`finance.err.${view.check.lastError}`)}${view.check.lastDetail ? ` (${view.check.lastDetail})` : ''}`
              : view.check.lastAt
                ? t('finance.lastCheck', { date: new Date(view.check.lastAt).toLocaleString(lang), count: view.messages })
                : ''}
          {view.progress.reading > 0 ? <span className="font-semibold text-brand">· {t('finance.progressReading', { count: view.progress.reading })}</span> : null}
        </p>
      ) : null}

      {/* The few things an owner needs to know, first. */}
      <section className="mt-6" aria-labelledby="finance-signals">
        <SectionTitle>
          <span id="finance-signals">{t('finance.signalsTitle')}</span>
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.signals.map((signal) => (
            <div key={signal.key} className="rounded-2xl border border-brand-ink/8 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[signal.status])} />
                <p className="text-sm font-semibold">{t(`finance.signal.${signal.key}.title`)}</p>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-brand-ink/60">{t(`finance.signal.${signal.key}.${signal.status}`, signal.params)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="finance-figures">
        <SectionTitle>
          <span id="finance-figures">{t('finance.figuresTitle', { year })}</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            tone="brand"
            label={t('finance.cash')}
            value={summary.cash ? money(summary.cash.amount) : '—'}
            hint={summary.cash ? t('finance.cashHint', { date: shortDate(summary.cash.date) }) : t('finance.cashMissing')}
          />
          <Tile
            tone="brand"
            label={t(isThisYear ? 'finance.revenueYtd' : 'finance.revenueYear', { year })}
            value={money(summary.revenue)}
            hint={change === null ? t('finance.collectedHint', { amount: money(summary.collected) }) : `${change >= 0 ? '+' : ''}${change}% ${t('finance.vsLastYear')} · ${t('finance.collectedHint', { amount: money(summary.collected) })}`}
          />
          <Tile
            tone="brand"
            label={t('finance.receivables')}
            value={money(summary.receivables)}
            hint={summary.overdue > 0 ? t('finance.overdueHint', { amount: money(summary.overdue) }) : t('finance.noOverdue')}
          />
          <Tile
            tone="brand"
            label={t(isThisYear ? 'finance.profitYtd' : 'finance.profitYear', { year })}
            value={summary.estimate ? <span className={summary.estimate.result < 0 ? 'text-[#C0503A]' : undefined}>{money(summary.estimate.result)}</span> : '—'}
            hint={
              [
                summary.estimate ? t('finance.profitHint', { from: monthName(summary.estimate.from, lang), to: monthName(summary.estimate.to, lang) }) : t('finance.noEstimate'),
                summary.annual && summary.annual.netProfit !== null ? t('finance.lastYearProfit', { year: summary.annual.year, amount: money(summary.annual.netProfit) }) : '',
              ]
                .filter(Boolean)
                .join(' · ')
            }
          />
          <Tile
            label={t('finance.spendTile', { year })}
            value={summary.spending ? money(summary.spending.total) : '—'}
            hint={summary.spending ? (summary.burn ? t('finance.burnHint', { amount: money(summary.burn) }) : '') : t('finance.cashMissing')}
          />
          <Tile
            label={t('finance.payroll')}
            value={summary.payroll ? money(summary.payroll.cost ?? summary.payroll.net) : '—'}
            hint={
              summary.payroll
                ? [periodText(summary.payroll.period, lang), summary.payroll.employees ? t('finance.employees', { count: summary.payroll.employees }) : '', summary.payroll.fromBank ? t('finance.payrollFromBank') : summary.payroll.cost === null ? t('finance.onlyNet') : summary.payroll.net !== null ? t('finance.netHint', { amount: money(summary.payroll.net) }) : '']
                    .filter(Boolean)
                    .join(' · ')
                : t('finance.noPayroll')
            }
          />
          <Tile
            label={t('finance.vatTile', { year })}
            value={summary.taxesByKind.vat ? money(summary.taxesByKind.vat) : '—'}
            hint={summary.taxesByKind.vat ? t('finance.vatHint') : t('finance.noTaxDocs')}
          />
          <Tile
            label={t('finance.otherTaxTile', { year })}
            value={money(summary.taxesByKind.payroll + summary.taxesByKind.rent + summary.taxesByKind.profit + summary.taxesByKind.other)}
            hint={
              [
                summary.taxesByKind.payroll ? `${t('finance.short.payroll')} ${money(summary.taxesByKind.payroll)}` : '',
                summary.taxesByKind.rent ? `${t('finance.short.rent')} ${money(summary.taxesByKind.rent)}` : '',
                summary.taxesByKind.profit ? `${t('finance.short.profit')} ${money(summary.taxesByKind.profit)}` : '',
                summary.taxesByKind.other ? `${t('finance.short.other')} ${money(summary.taxesByKind.other)}` : '',
              ]
                .filter(Boolean)
                .join(' · ') || t('finance.noTaxDocs')
            }
          />
        </div>
      </section>

      {summary.spending ? (
        <section className="mt-6" aria-labelledby="finance-spending">
          <SectionTitle>
            <span id="finance-spending">{t('finance.spendTitle', { year })}</span>
          </SectionTitle>
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="font-display text-2xl font-medium tabular-nums">{money(summary.spending.total)}</p>
              {summary.spending.months > 0 ? <p className="text-sm text-brand-ink/60">{t('finance.spendAverage', { amount: money(summary.spending.average), count: summary.spending.months })}</p> : null}
              {summary.spending.dividends > 0 ? <p className="text-sm text-brand-ink/60">{t('finance.spendDividends', { amount: money(summary.spending.dividends) })}</p> : null}
            </div>
            <ul className="mt-4 space-y-2.5">
              {summary.spending.byCategory.map((item) => {
                const share = summary.spending!.total > 0 ? item.amount / summary.spending!.total : 0
                return (
                  <li key={item.category} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_9rem]">
                    <span className="truncate">{t(`finance.spend.${item.category}`)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-brand-ink/[0.06]">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">
                      {money(item.amount)} <span className="font-normal text-brand-ink/45">{Math.round(share * 100)}%</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-[11px] text-brand-ink/45">{t('finance.spendNote')}</p>
          </Card>
        </section>
      ) : null}

      {summary.upcoming.length > 0 || (summary.missing && summary.missing.kinds.length > 0) ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {summary.upcoming.length > 0 ? (
            <Card className="p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-brand" />
                {t('finance.upcoming')}
              </p>
              <ul className="mt-3 space-y-2">
                {summary.upcoming.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {t(`finance.kinds.${doc.kind}`)} · {periodText(doc.period, lang)}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {money(doc.amountDue)} · {shortDate(doc.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {summary.missing && summary.missing.kinds.length > 0 ? (
            <Card className="border-2 border-[#C9A227]/50 bg-[#FFF9E8] p-5 sm:p-6 lg:col-span-2">
              <p className="flex items-center gap-2.5 font-display text-xl font-medium">
                <AlertTriangle className="h-6 w-6 shrink-0 text-[#C9A227]" />
                {t('finance.missingTitle', { period: periodText(summary.missing.period, lang) })}
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {summary.missing.kinds.map((kind) => (
                  <li key={kind} className="rounded-xl border border-[#C9A227]/40 bg-white px-3.5 py-2 text-base font-semibold">
                    {t(`finance.kinds.${kind}`)}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-brand-ink/60">{view && view.progress.reading > 0 ? t('finance.missingReading', { count: view.progress.reading }) : t('finance.missingHint')}</p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Month by month: what was invoiced here, and what the accountant's documents say. */}
      <section className="mt-8">
        <SectionTitle>{t('finance.monthlyTitle', { year })}</SectionTitle>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-right text-sm tabular-nums">
              <thead>
                <tr className="border-b border-brand-ink/8 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
                  <th className="px-4 py-3 text-left">{t('finance.col.month')}</th>
                  <th className="px-3 py-3">{t('finance.col.invoiced')}</th>
                  <th className="px-3 py-3">{t('finance.col.collected')}</th>
                  <th className="px-3 py-3">{t('finance.col.bankIn')}</th>
                  <th className="px-3 py-3">{t('finance.col.bankOut')}</th>
                  <th className="px-3 py-3">{t('finance.col.sales')}</th>
                  <th className="px-3 py-3">{t('finance.col.purchases')}</th>
                  <th className="px-3 py-3">{t('finance.col.payroll')}</th>
                  <th className="px-3 py-3">{t('finance.col.vat')}</th>
                  <th className="px-3 py-3">{t('finance.col.payrollTax')}</th>
                  <th className="px-3 py-3">{t('finance.col.otherTax')}</th>
                  <th className="px-4 py-3 text-left">{t('finance.col.documents')}</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => {
                  const other = [month.rentTax, month.profitTax, month.otherTax].some((value) => value !== null)
                    ? (month.rentTax ?? 0) + (month.profitTax ?? 0) + (month.otherTax ?? 0)
                    : null
                  const empty = month.invoiced === 0 && month.collected === 0 && month.kinds.size === 0
                  return (
                    <tr key={month.period} className={cn('border-b border-brand-ink/5 last:border-0', empty && 'text-brand-ink/30')}>
                      <td className="px-4 py-2.5 text-left font-semibold capitalize">{monthName(month.period, lang)}</td>
                      <td className="px-3 py-2.5">{month.invoiced ? money(month.invoiced) : '—'}</td>
                      <td className="px-3 py-2.5">{month.collected ? money(month.collected) : '—'}</td>
                      <td className="px-3 py-2.5">{month.bank ? money(month.bank.in) : '—'}</td>
                      <td className="px-3 py-2.5">{month.bank ? money(operatingOut(month.bank)) : '—'}</td>
                      <td className="px-3 py-2.5">{money(month.salesNet)}</td>
                      <td className="px-3 py-2.5">{money(month.purchasesNet)}</td>
                      <td className="px-3 py-2.5">{money(month.payrollCost ?? month.payrollNet ?? (month.bank?.spend.payroll || null))}</td>
                      <td className="px-3 py-2.5">{money(month.vat)}</td>
                      <td className="px-3 py-2.5">{money(month.payrollTax)}</td>
                      <td className="px-3 py-2.5">{money(other)}</td>
                      <td className="px-4 py-2.5 text-left">
                        <span className="flex flex-wrap gap-1">
                          {(['vat_return', 'payroll_tax', 'payroll', 'sales_book', 'purchase_book', 'bank_statement'] as FinanceKind[]).map((kind) => (
                            <span
                              key={kind}
                              title={t(`finance.kinds.${kind}`)}
                              className={cn(
                                'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                                month.kinds.has(kind) ? 'bg-brand/10 text-brand' : 'bg-brand-ink/[0.04] text-brand-ink/25',
                              )}
                            >
                              {t(`finance.badge.${kind}`)}
                            </span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-ink/10 font-semibold">
                  <td className="px-4 py-3 text-left">{t('finance.col.total')}</td>
                  {(['invoiced', 'collected'] as const).map((key) => (
                    <td key={key} className="px-3 py-3">
                      {money(months.reduce((total, month) => total + month[key], 0))}
                    </td>
                  ))}
                  <td className="px-3 py-3">{money(months.reduce((total, month) => total + (month.bank?.in ?? 0), 0))}</td>
                  <td className="px-3 py-3">{money(months.reduce((total, month) => total + (month.bank ? operatingOut(month.bank) : 0), 0))}</td>
                  {(['salesNet', 'purchasesNet'] as const).map((key) => (
                    <td key={key} className="px-3 py-3">
                      {money(months.reduce((total, month) => total + (month[key] ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-3 py-3">{money(months.reduce((total, month) => total + (month.payrollCost ?? month.payrollNet ?? month.bank?.spend.payroll ?? 0), 0))}</td>
                  <td className="px-3 py-3">{money(summary.taxesByKind.vat)}</td>
                  <td className="px-3 py-3">{money(summary.taxesByKind.payroll)}</td>
                  <td className="px-3 py-3">{money(summary.taxesByKind.rent + summary.taxesByKind.profit + summary.taxesByKind.other)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <p className="mt-2 text-[11px] text-brand-ink/45">{t('finance.monthlyNote')}</p>
      </section>

      {annual.length > 0 ? (
        <section className="mt-8">
          <SectionTitle>{t('finance.annualTitle')}</SectionTitle>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-right text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-brand-ink/8 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
                    <th className="px-4 py-3 text-left" />
                    {annual.map((item) => (
                      <th key={item.year} className="px-4 py-3">
                        {item.year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['revenue', 'costOfSales', 'staffCosts', 'operatingExpenses', 'profitBeforeTax', 'incomeTax', 'netProfit', 'cash', 'receivables', 'totalAssets', 'totalLiabilities', 'equity'] as const).map((key) =>
                    annual.some((item) => item.figures[key] !== null) ? (
                      <tr key={key} className={cn('border-b border-brand-ink/5 last:border-0', key === 'netProfit' && 'font-semibold')}>
                        <td className="px-4 py-2.5 text-left">{t(`finance.statement.${key}`)}</td>
                        {annual.map((item) => (
                          <td key={item.year} className={cn('px-4 py-2.5', key === 'netProfit' && (item.figures[key] ?? 0) < 0 && 'text-[#C0503A]')}>
                            {money(item.figures[key])}
                          </td>
                        ))}
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {statements.length > 0 ? (
        <section className="mt-8">
          <SectionTitle>{t('finance.bankTitle')}</SectionTitle>
          <div className="space-y-3">
            {statements.slice(0, 6).map((doc) => (
              <BankCard key={doc.id} doc={doc} t={t} money={money} onUndo={() => void act(`/api/finance/documents/${doc.id}/undo-bank`).then(() => refresh())} onReview={() => void openBank(doc)} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionTitle>{t('finance.documentsTitle', { count: docs.length })}</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(['all', 'taxes', 'payroll', 'sales_book', 'purchase_book', 'financial_statements', 'bank_statement', 'supplier_invoice', 'own_invoice', ...(failed ? ['failed'] : [])] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as typeof filter)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition',
                filter === key ? 'border-brand bg-brand text-white' : 'border-brand-ink/10 bg-white text-brand-ink/60 hover:border-brand/30',
              )}
            >
              {key === 'all' ? t('finance.filter.all') : key === 'taxes' ? t('finance.filter.taxes') : key === 'failed' ? t('finance.filter.failed', { count: failed }) : t(`finance.kinds.${key}`)}
            </button>
          ))}
        </div>
        <Card className="overflow-hidden p-0">
          {shown.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-brand-ink/20" />
              <p className="mt-3 text-sm text-brand-ink/55">{docs.length === 0 ? t('finance.noDocuments') : t('finance.noneInFilter')}</p>
            </div>
          ) : (
            <ul>
              {shown.slice(0, 300).map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  t={t}
                  lang={lang}
                  money={(amount) => (typeof amount === 'number' ? formatMoney(amount, doc.currency || currency) : '')}
                  onDownload={() => void download(doc).catch((err) => setNotice(errorText(t, err)))}
                  onEdit={() => setEditing(doc)}
                  onRetry={() => void act(`/api/finance/documents/${doc.id}/retry`)}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {settingsOpen && view ? (
        <InboxSettingsModal
          view={view}
          t={t}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setView(next)
            setSettingsOpen(false)
          }}
        />
      ) : null}

      {editing ? (
        <EditDocumentModal
          doc={editing}
          t={t}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await act(`/api/finance/documents/${editing.id}`, 'PATCH', patch)
            setEditing(null)
          }}
          onDelete={async () => {
            await act(`/api/finance/documents/${editing.id}`, 'DELETE')
            setEditing(null)
          }}
        />
      ) : null}

      {bankFile ? (
        <BankMatchModal
          initialFile={bankFile}
          onClose={() => {
            setBankFile(null)
            void refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function BankCard({ doc, t, money, onUndo, onReview }: { doc: FinanceDoc; t: T; money: (amount: number | null | undefined) => string; onUndo: () => void; onReview: () => void }) {
  const bank = doc.figures?.bank
  const statement = doc.statement
  const applied = (statement?.applied || []).filter((item) => !item.undoneAt)
  const spreadsheet = /\.(xlsx|xls|csv)$/i.test(doc.name)
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-brand" />
            {t('finance.bankPeriod', { from: shortDate(statement?.from || bank?.from), to: shortDate(statement?.to || bank?.to) })}
          </p>
          <p className="mt-1 text-xs text-brand-ink/50">
            {[
              bank?.closingBalance !== null && bank?.closingBalance !== undefined ? t('finance.bankClosing', { amount: money(bank.closingBalance) }) : '',
              statement ? t('finance.bankIn', { count: statement.credits, amount: money(statement.totalIn) }) : '',
              bank?.totalOut !== null && bank?.totalOut !== undefined ? t('finance.bankOut', { amount: money(bank.totalOut) }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statement && statement.review.length > 0 && spreadsheet ? (
            <Button type="button" variant="secondary" onClick={onReview}>
              {t('finance.bankReview', { count: statement.review.length })}
            </Button>
          ) : null}
          {applied.length > 0 ? (
            <Button type="button" variant="ghost" onClick={onUndo}>
              <Undo2 className="h-4 w-4" />
              {t('finance.bankUndo')}
            </Button>
          ) : null}
        </div>
      </div>
      {applied.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-brand">{t('finance.bankApplied', { count: applied.length })}</p>
          <ul className="mt-2 divide-y divide-brand-ink/5 rounded-xl border border-brand-ink/8">
            {applied.map((item) => (
              <li key={item.invoiceId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <Link to={`/app/invoices/${item.invoiceId}`} className="min-w-0 truncate font-semibold hover:text-brand">
                  {item.number} <span className="font-normal text-brand-ink/55">· {item.client}</span>
                </Link>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(item.amount, item.currency)} · {item.dates.map(shortDate).join(', ')}
                  {item.paidInFull ? <span className="ml-2 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">{t('finance.paidInFull')}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : statement ? (
        <p className="mt-3 text-xs text-brand-ink/50">{statement.auto ? t('finance.bankNothing') : t('finance.bankManual')}</p>
      ) : null}
      {statement && statement.review.length > 0 && !spreadsheet ? (
        <ul className="mt-3 space-y-1 text-xs text-brand-ink/60">
          {statement.review.slice(0, 10).map((item) => (
            <li key={item.invoiceId}>
              <Link to={`/app/invoices/${item.invoiceId}`} className="font-semibold hover:text-brand">
                {item.number}
              </Link>{' '}
              · {item.client} · {t(`finance.reviewChange.${item.change}`)} {formatMoney(item.bankPaid, item.currency)}
            </li>
          ))}
        </ul>
      ) : null}
      {statement && statement.loose > 0 ? <p className="mt-3 text-xs text-brand-ink/50">{t('finance.bankLoose', { count: statement.loose, amount: money(statement.looseTotal) })}</p> : null}
    </Card>
  )
}

function DocumentRow({
  doc,
  t,
  lang,
  money,
  onDownload,
  onEdit,
  onRetry,
}: {
  doc: FinanceDoc
  t: T
  lang: string
  money: (amount: number | null | undefined) => string
  onDownload: () => void
  onEdit: () => void
  onRetry: () => void
}) {
  const amount = doc.status === 'done' ? headlineAmount(doc) : null
  const from = doc.email ? doc.email.fromName || doc.email.from : ''
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-ink/5 px-5 py-3 last:border-0', doc.excluded && 'opacity-50')}>
      <div className="min-w-0 flex-[1_1_18rem]">
        <div className="flex flex-wrap items-center gap-2">
          {doc.status === 'done' && doc.kind ? (
            <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">{t(`finance.kinds.${doc.kind}`)}</span>
          ) : doc.status === 'pending' ? (
            <span className="rounded-md bg-[#C9A227]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9A7A12]">{t('finance.reading')}</span>
          ) : (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#C0503A]">{t('finance.failed')}</span>
          )}
          {doc.period ? <span className="text-xs font-semibold capitalize text-brand-ink/55">{periodText(doc.period, lang)}</span> : null}
          {doc.excluded ? <span className="text-[10px] font-semibold uppercase text-brand-ink/45">{t('finance.excluded')}</span> : null}
        </div>
        <p className="mt-1 truncate text-sm font-semibold">{doc.title || doc.name}</p>
        <p className="mt-0.5 truncate text-xs text-brand-ink/45">
          {doc.source === 'upload' ? t('finance.sourceUpload') : t('finance.sourceEmail', { from, subject: doc.email?.subject || '' })} · {shortDate(doc.receivedAt)}
          {doc.status === 'failed' && doc.error ? ` · ${doc.error}` : ''}
        </p>
        {doc.summary && doc.status === 'done' ? <p className="mt-1 line-clamp-2 text-xs text-brand-ink/60">{doc.summary}</p> : null}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {amount !== null ? <span className="mr-2 text-sm font-semibold tabular-nums">{money(amount)}</span> : null}
        {doc.status === 'failed' ? (
          <button type="button" onClick={onRetry} className="rounded-lg p-2 text-brand-ink/50 hover:bg-brand-ink/5 hover:text-brand-ink" title={t('finance.retry')} aria-label={t('finance.retry')}>
            <RotateCcw className="h-4 w-4" />
          </button>
        ) : null}
        {doc.hasFile ? (
          <button type="button" onClick={onDownload} className="rounded-lg p-2 text-brand-ink/50 hover:bg-brand-ink/5 hover:text-brand-ink" title={t('finance.download')} aria-label={t('finance.download')}>
            <Download className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className="rounded-lg p-2 text-brand-ink/50 hover:bg-brand-ink/5 hover:text-brand-ink" title={t('finance.edit')} aria-label={t('finance.edit')}>
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

function EditDocumentModal({
  doc,
  t,
  onClose,
  onSave,
  onDelete,
}: {
  doc: FinanceDoc
  t: T
  onClose: () => void
  onSave: (patch: { kind: string; period: string; excluded: boolean }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [kind, setKind] = useState<string>(doc.kind || 'other')
  const [period, setPeriod] = useState(doc.period || '')
  const [excluded, setExcluded] = useState(Boolean(doc.excluded))
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <Modal
      size="sm"
      title={t('finance.editTitle')}
      onClose={onClose}
      footer={
        <>
          {confirming ? (
            <Button
              type="button"
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void onDelete().finally(() => setBusy(false))
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t('finance.deleteConfirm')}
            </Button>
          ) : (
            <Button type="button" variant="danger" className="mr-auto" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" />
              {t('finance.delete')}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onSave({ kind, period, excluded }).finally(() => setBusy(false))
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="bg-white p-6">
        <p className="mb-4 truncate text-sm font-semibold">{doc.name}</p>
        <Select label={t('finance.kind')} value={kind} onChange={(e) => setKind(e.target.value)}>
          {FINANCE_KINDS.map((item) => (
            <option key={item} value={item}>
              {t(`finance.kinds.${item}`)}
            </option>
          ))}
        </Select>
        <Field label={t('finance.period')} value={period} placeholder="2026-08" onChange={(e) => setPeriod(e.target.value)} />
        <p className="-mt-3 mb-4 text-xs text-brand-ink/45">{t('finance.periodHint')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
          {t('finance.exclude')}
        </label>
      </div>
    </Modal>
  )
}

function InboxSettingsModal({ view, t, onClose, onSaved }: { view: FinanceView; t: T; onClose: () => void; onSaved: (view: FinanceView) => void }) {
  const [enabled, setEnabled] = useState(view.settings.enabled || !view.settings.watch.length)
  const [box, setBox] = useState<'company' | 'personal'>(view.settings.box === 'personal' && !view.settings.boxIsMine ? 'personal' : view.settings.box)
  const [watch, setWatch] = useState(view.settings.watch.join(', '))
  const [since, setSince] = useState(view.settings.since)
  const [imapHost, setImapHost] = useState(view.settings.imapHost)
  const [autoBank, setAutoBank] = useState(view.settings.autoBank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tested, setTested] = useState('')
  const noMailbox = !view.mailboxes.company.ready && !view.mailboxes.personal.ready
  // A colleague's own mailbox stays in use unless another one is chosen; it cannot be chosen again by name.
  const body = () => ({ enabled, watch, since, imapHost, autoBank, ...(box !== view.settings.box || view.settings.boxIsMine ? { box } : {}) })

  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await api<FinanceView>('/api/finance/settings', { method: 'PUT', body: body() }))
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setError('')
    setTested('')
    try {
      const res = await api<{ folder: string; matches: number; host: string }>('/api/finance/test', { method: 'POST', body: body() })
      setTested(t('finance.testOk', { count: res.matches, folder: res.folder, host: res.host }))
    } catch (err) {
      const detail = (err as { detail?: string }).detail
      setError(errorText(t, err) + (detail ? ` (${detail})` : ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      size="sm"
      title={t('finance.inboxSettings')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" className="mr-auto" disabled={busy || noMailbox || !watch.trim()} onClick={() => void test()}>
            {t('finance.test')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={busy || noMailbox} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="bg-white p-6">
        <p className="mb-5 text-sm text-brand-ink/60">{t('finance.inboxIntro')}</p>
        {noMailbox ? (
          <p className="mb-5 rounded-xl bg-[#C9A227]/10 px-4 py-3 text-sm">
            {t('finance.noMailbox')}{' '}
            <Link to="/app/profile" className="font-semibold text-brand underline">
              {t('nav.profile')}
            </Link>
          </p>
        ) : null}
        <label className="mb-5 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('finance.enabled')}
        </label>
        <Select label={t('finance.mailbox')} value={box} onChange={(e) => setBox(e.target.value as 'company' | 'personal')}>
          <option value="company" disabled={!view.mailboxes.company.ready}>
            {t('finance.mailboxCompany')}
            {view.mailboxes.company.email ? ` — ${view.mailboxes.company.email}` : ` (${t('finance.notConnected')})`}
          </option>
          <option value="personal" disabled={!view.mailboxes.personal.ready && view.settings.boxIsMine}>
            {t('finance.mailboxPersonal')}
            {view.settings.box === 'personal' && !view.settings.boxIsMine ? ` (${t('finance.colleagueBox')})` : view.mailboxes.personal.email ? ` — ${view.mailboxes.personal.email}` : ` (${t('finance.notConnected')})`}
          </option>
        </Select>
        <Field label={t('finance.watch')} value={watch} placeholder="kontabilisti@gmail.com" onChange={(e) => setWatch(e.target.value)} />
        <p className="-mt-3 mb-5 text-xs leading-5 text-brand-ink/45">{t('finance.watchHint')}</p>
        <Field label={t('finance.since')} type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        <label className="mb-5 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={autoBank} onChange={(e) => setAutoBank(e.target.checked)} />
          <span>
            {t('finance.autoBank')}
            <span className="mt-0.5 block text-xs text-brand-ink/45">{t('finance.autoBankHint')}</span>
          </span>
        </label>
        <details className="mb-2">
          <summary className="cursor-pointer text-xs font-semibold text-brand-ink/55">{t('finance.advanced')}</summary>
          <div className="mt-3">
            <Field label={t('finance.imapHost')} value={imapHost} placeholder={view.settings.imapHostDefault || 'imap.gmail.com'} onChange={(e) => setImapHost(e.target.value)} />
            <p className="-mt-3 text-xs leading-5 text-brand-ink/45">{t('finance.imapHint')}</p>
          </div>
        </details>
        {tested ? <p className="mt-4 rounded-xl bg-brand/5 px-4 py-3 text-sm font-medium text-brand">{tested}</p> : null}
        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-[#C0503A]">{error}</p> : null}
      </div>
    </Modal>
  )
}
