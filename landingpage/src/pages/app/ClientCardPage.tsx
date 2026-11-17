import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Mail, MapPin, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { clientDisplayName } from '../../lib/client'
import { invoiceClientGroups } from '../../lib/clientInvoices'
import { formatMoney, invoiceStatus, invoiceSubject, type Invoice } from '../../lib/invoice'
import { activePayments, daysOverdue, documentTotals, formatMoneyList, isActiveDocument, money, parseLooseDate, remainingOf, totalsByCurrency, visiblePaymentStatus, type Payment } from '../../lib/document'
import { dateInPeriod, invoiceInPeriod, invoiceListTotals, isoDay, vatSplit } from '../../lib/listTools'
import { MoneyStack, PagerFooter, PeriodFilter, usePaged, usePeriodParam } from '../../components/ListTools'

type PaymentRow = { payment: Payment; invoice: Invoice; time: number }

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function timeOf(value?: string | null) {
  return parseLooseDate(value)?.getTime() || 0
}

/** Days from each fully paid invoice's date to its last payment, averaged; null when nothing was paid in full. */
function averageDaysToPay(invoices: Invoice[]) {
  const spans: number[] = []
  for (const inv of invoices) {
    if (invoiceStatus(inv) !== 'paid') continue
    const issued = timeOf(inv.date)
    const last = Math.max(0, ...activePayments(inv.payments).map((item) => timeOf(item.date)))
    if (!issued || !last) continue
    spans.push(Math.max(0, Math.round((last - issued) / 86400000)))
  }
  if (!spans.length) return null
  return Math.round(spans.reduce((sum, value) => sum + value, 0) / spans.length)
}

export function ClientCardPage() {
  const { clientId } = useParams()
  const { clients, invoices, profile, loading, removeClient } = useAppData()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'payments' ? 'payments' : 'invoices'
  const [period, setPeriod] = usePeriodParam()
  const currency = profile?.currency || 'EUR'
  const client = clients.find((item) => item.id === clientId)

  // Every invoice that is this client's: by id, or by name for invoices saved before clients had ids. Newest first.
  const all = useMemo(() => {
    const group = invoiceClientGroups(invoices, clients).find((item) => item.key === `id:${clientId}`)
    return group ? [...group.invoices].reverse() : []
  }, [invoices, clients, clientId])

  const stats = useMemo(() => {
    const active = all.filter((item) => isActiveDocument(item))
    const totals = invoiceListTotals(all)
    return {
      ...totals,
      overdue: totalsByCurrency(active, (item) => (daysOverdue(item) > 0 ? remainingOf(item) : 0)),
      last: active[0]?.date || '',
      avgDays: averageDaysToPay(active),
    }
  }, [all])

  const periodInvoices = useMemo(() => all.filter((item) => invoiceInPeriod(item, period)), [all, period])
  const periodTotals = useMemo(() => invoiceListTotals(periodInvoices), [periodInvoices])

  const payments = useMemo(() => {
    const rows: PaymentRow[] = []
    for (const invoice of all) {
      if (!isActiveDocument(invoice)) continue
      for (const payment of activePayments(invoice.payments)) {
        if (dateInPeriod(payment.date, period)) rows.push({ payment, invoice, time: timeOf(payment.date) })
      }
    }
    return rows.sort((a, b) => b.time - a.time)
  }, [all, period])
  const paymentTotals = useMemo(
    () => totalsByCurrency(payments.map((row) => ({ currency: row.invoice.currency, amount: money(row.payment.amount) })), (row) => row.amount),
    [payments],
  )

  const pagedInvoices = usePaged(periodInvoices, `${clientId}|${period.from}|${period.to}`)
  const pagedPayments = usePaged(payments, `${clientId}|${period.from}|${period.to}`)

  function setTab(next: 'invoices' | 'payments') {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'payments') params.set('tab', 'payments')
        else params.delete('tab')
        return params
      },
      { replace: true },
    )
  }

  if (!client) {
    return (
      <div>
        <Link to="/app/clients" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
          ← {t('lists.back')}
        </Link>
        <p className="mt-10 text-brand-ink/55">{loading ? t('common.loading') : t('lists.notFound')}</p>
      </div>
    )
  }

  const name = clientDisplayName(client)
  const owes = stats.remaining.some((row) => row.amount > 0)
  const late = stats.overdue.some((row) => row.amount > 0)
  const tiles: { label: string; value: string; tone?: 'red' | 'green' }[] = [
    { label: t('lists.statInvoices'), value: String(stats.count) },
    { label: t('lists.statNet'), value: formatMoneyList(stats.net, formatMoney) },
    { label: t('lists.statVat'), value: formatMoneyList(stats.vat, formatMoney) },
    { label: t('lists.statInvoiced'), value: formatMoneyList(stats.total, formatMoney) },
    { label: t('lists.statPaid'), value: formatMoneyList(stats.paid, formatMoney), tone: 'green' },
    { label: t('lists.statRemaining'), value: formatMoneyList(stats.remaining, formatMoney), tone: owes ? 'red' : undefined },
    { label: t('lists.statOverdue'), value: formatMoneyList(stats.overdue, formatMoney), tone: late ? 'red' : undefined },
    { label: t('lists.statAvgDays'), value: stats.avgDays === null ? '—' : t('lists.days', { days: stats.avgDays }) },
  ]

  const statusChip = (item: Invoice) => {
    const status = invoiceStatus(item)
    if (status === 'draft') return <span className="rounded-full bg-brand-ink/8 px-2.5 py-1 text-[11px] font-semibold text-brand-ink/60">{t('docs.statusDraft')}</span>
    const visible = visiblePaymentStatus(item)
    const days = daysOverdue(item)
    const cls =
      visible === 'paid'
        ? 'bg-[#E7F4EA] text-[#2E7D32]'
        : visible === 'partial'
          ? 'border border-[#E8B84A] bg-[#FFF6E5] text-[#8A5A00]'
          : visible === 'cancelled'
            ? 'bg-brand-ink/10 text-brand-ink/55'
            : 'bg-[#F8E8E4] text-[#C0503A]'
    const label = visible === 'paid' ? t('invoiceList.statusPaid') : visible === 'partial' ? t('docs.statusPartial') : visible === 'cancelled' ? t('docs.statusCancelled') : t('invoiceList.statusUnpaid')
    return (
      <span className="flex flex-wrap items-center gap-1">
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{label}</span>
        {days > 0 ? <span className="whitespace-nowrap rounded-full bg-[#F8E8E4] px-2 py-1 text-[11px] font-semibold text-[#C0503A]">{t('docs.overdueDays', { days })}</span> : null}
      </span>
    )
  }

  const th = 'px-3 py-2.5 font-semibold'
  const methodLabel = (method?: string) => (method === 'cash' ? t('docs.methodCash') : method === 'bank' ? t('docs.methodBank') : method || '')

  return (
    <div>
      <Link to="/app/clients" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('lists.back')}
      </Link>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-lg font-bold text-brand">{initials(name)}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('lists.card')}</p>
            <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">{name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-ink/60">
              {client.address ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {client.address}
                </span>
              ) : null}
              {client.phone ? (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand">
                  <Phone className="h-3.5 w-3.5" />
                  {client.phone}
                </a>
              ) : null}
              {client.email ? (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-brand">
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </a>
              ) : null}
              {client.businessId ? <span>NUI {client.businessId}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            title={t('lists.delete')}
            aria-label={t('lists.delete')}
            onClick={() => {
              if (!window.confirm(t('clients.deleteMessage'))) return
              void removeClient(client.id).then(() => navigate('/app/clients'), (err) => window.alert(err instanceof Error ? err.message : t('common.error')))
            }}
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-brand-ink/12 bg-white text-brand-ink/50 hover:border-[#C0503A]/30 hover:bg-[#F8E8E4] hover:text-[#C0503A]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <Link
            to={`/app/clients/${client.id}/edit`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
          >
            <Pencil className="h-4 w-4" />
            {t('lists.edit')}
          </Link>
          <Link
            to={`/app/new?clientId=${encodeURIComponent(client.id)}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            {t('lists.newInvoice')}
          </Link>
        </div>
      </div>

      <section className="mt-8" aria-label={t('lists.allTime')}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('lists.allTime')}</h2>
          {stats.last ? (
            <p className="text-xs text-brand-ink/50">
              {t('lists.statLast')}: <span className="font-semibold text-brand-ink/70">{stats.last}</span>
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border border-brand-ink/8 bg-white px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{tile.label}</p>
              <p className={`mt-1 font-display text-xl font-medium tabular-nums sm:text-2xl ${tile.tone === 'red' ? 'text-[#C0503A]' : tile.tone === 'green' ? 'text-[#2E7D32]' : ''}`}>{tile.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-ink/8 px-4 pt-3" role="tablist">
          {(
            [
              ['invoices', t('lists.invoices'), periodInvoices.length],
              ['payments', t('lists.payments'), payments.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-semibold transition ${tab === key ? 'border-brand text-brand' : 'border-transparent text-brand-ink/55 hover:text-brand-ink'}`}
            >
              {label}
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${tab === key ? 'bg-brand/10' : 'bg-brand-bg'}`}>{count}</span>
            </button>
          ))}
        </div>
        <div className="border-b border-brand-ink/6 px-4 py-3">
          <PeriodFilter period={period} onChange={setPeriod} />
        </div>

        {tab === 'invoices' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                  <tr>
                    <th className={`${th} pl-5`}>{t('newInvoice.invoiceNumber')}</th>
                    <th className={th}>{t('newInvoice.date')}</th>
                    <th className={th}>{t('invoiceList.status')}</th>
                    <th className={`${th} text-right`}>{t('lists.netLong')}</th>
                    <th className={`${th} text-right`}>{t('lists.vatLong')}</th>
                    <th className={`${th} text-right`}>{t('lists.totalCol')}</th>
                    <th className={`${th} text-right`}>{t('lists.paid')}</th>
                    <th className={`${th} pr-5 text-right`}>{t('lists.remaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedInvoices.visible.map((item) => {
                    const split = vatSplit(item)
                    const cur = item.currency || currency
                    const owed = remainingOf(item)
                    const subject = invoiceSubject(item)
                    const draft = invoiceStatus(item) === 'draft'
                    return (
                      <tr key={item.id} className={`border-b border-brand-ink/5 last:border-0 hover:bg-brand-bg/50 ${visiblePaymentStatus(item) === 'cancelled' ? 'opacity-60' : ''}`}>
                        <td className="max-w-[260px] px-3 py-2.5 pl-5">
                          <Link to={draft ? `/app/invoices/${item.id}/edit` : `/app/invoices/${item.id}`} className="font-semibold text-brand hover:underline">
                            {item.number}
                          </Link>
                          {subject ? <span className="block truncate text-xs text-brand-ink/45">{subject}</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-brand-ink/70">
                          <div className="font-medium">{item.date}</div>
                          <div className="text-xs text-brand-ink/40">
                            {t('pdf.dueDateLabel')}: {item.dueDate || t('pdf.onReceipt')}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{statusChip(item)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-brand-ink/70">{formatMoney(split.net, cur)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-brand-ink/70">{formatMoney(split.vat, cur)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(split.total, cur)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#2E7D32]">
                          {isActiveDocument(item) ? formatMoney(money(documentTotals(item).total - owed), cur) : '—'}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2.5 pr-5 text-right tabular-nums ${owed > 0 ? 'font-semibold text-[#C0503A]' : 'text-brand-ink/40'}`}>
                          {isActiveDocument(item) ? formatMoney(owed, cur) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {periodInvoices.length > 0 ? (
                  <tfoot className="border-t-2 border-brand-ink/12 bg-[#F4F8F9] text-sm font-semibold">
                    <tr>
                      <td colSpan={3} className="px-3 py-3 pl-5 text-brand-ink">
                        {t('lists.totalRowCount', { count: periodTotals.count })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-brand-ink/80">
                        <MoneyStack rows={periodTotals.net} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-brand-ink/80">
                        <MoneyStack rows={periodTotals.vat} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-brand-ink">
                        <MoneyStack rows={periodTotals.total} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[#2E7D32]">
                        <MoneyStack rows={periodTotals.paid} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 pr-5 text-right tabular-nums text-[#C0503A]">
                        <MoneyStack rows={periodTotals.remaining} />
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {periodInvoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('lists.noInvoices')}</p> : null}
            <PagerFooter paged={pagedInvoices} />
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-brand-ink/8 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                  <tr>
                    <th className={`${th} pl-5`}>{t('lists.paymentDate')}</th>
                    <th className={th}>{t('lists.invoice')}</th>
                    <th className={th}>{t('lists.method')}</th>
                    <th className={th}>{t('lists.note')}</th>
                    <th className={`${th} pr-5 text-right`}>{t('lists.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPayments.visible.map(({ payment, invoice }) => {
                    const date = parseLooseDate(payment.date)
                    return (
                      <tr key={`${invoice.id}:${payment.id}`} className="border-b border-brand-ink/5 last:border-0 hover:bg-brand-bg/50">
                        <td className="whitespace-nowrap px-3 py-2.5 pl-5 font-medium tabular-nums">{date ? isoDay(date).split('-').reverse().join('.') : payment.date}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <Link to={`/app/invoices/${invoice.id}`} className="font-semibold text-brand hover:underline">
                            {invoice.number}
                          </Link>
                          <span className="ml-2 text-xs text-brand-ink/45">{invoice.date}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-brand-ink/70">{methodLabel(payment.method)}</td>
                        <td className="max-w-[280px] truncate px-3 py-2.5 text-brand-ink/60" title={payment.note || undefined}>
                          {payment.note}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right font-semibold tabular-nums text-[#2E7D32]">
                          {formatMoney(money(payment.amount), invoice.currency || currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {payments.length > 0 ? (
                  <tfoot className="border-t-2 border-brand-ink/12 bg-[#F4F8F9] text-sm font-semibold">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 pl-5 text-brand-ink">
                        {t('lists.paymentsCount', { count: payments.length })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 pr-5 text-right font-bold tabular-nums text-[#2E7D32]">
                        <MoneyStack rows={paymentTotals} />
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            {payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/50">{t('lists.noPayments')}</p> : null}
            <PagerFooter paged={pagedPayments} />
          </>
        )}
      </div>
    </div>
  )
}
