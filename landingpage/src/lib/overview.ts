import { money, parseLooseDate, paymentStatus, type Payment } from './document'

export type PeriodPreset = 'this_month' | 'this_year' | 'month' | 'year' | 'custom'

export type PeriodInput = {
  preset?: PeriodPreset
  year?: number
  month?: number
  from?: string
  to?: string
}

export type ReportPeriod = {
  preset: PeriodPreset
  year?: number
  month?: number
  start: Date
  end: Date
  startIso: string
  endIso: string
}

export type OverviewLimitations = {
  legacyPaid: boolean
  undatedPayments: boolean
  missingDates: boolean
  undatedCancellations: boolean
}

type AnyDoc = {
  id?: string
  date?: string
  dueDate?: string
  total?: unknown
  amount?: unknown
  currency?: string
  companySnapshot?: { currency?: string } | null
  lifecycle?: string
  status?: string
  cancelledAt?: string
  payments?: Payment[] | null
  clientId?: string
  client?: { fullName?: string; address?: string; phone?: string; email?: string }
  clientSnapshot?: { fullName?: string; address?: string; phone?: string; email?: string }
  number?: string
  vendor?: string
  description?: string
  notes?: string
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0)
}

export function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function onOrBefore(date: Date, end: Date) {
  return startOfDay(date).getTime() <= startOfDay(end).getTime()
}

function inRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false
  const t = startOfDay(date).getTime()
  return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime()
}

export function resolvePeriod(input?: PeriodInput | null, now = new Date()): Omit<ReportPeriod, 'startIso' | 'endIso'> {
  const preset = input?.preset || 'this_month'
  const today = startOfDay(now)
  if (preset === 'this_year') {
    return { preset, start: new Date(today.getFullYear(), 0, 1), end: today }
  }
  if (preset === 'year') {
    const year = Number(input?.year) || today.getFullYear()
    const end = year === today.getFullYear() ? today : new Date(year, 11, 31)
    return { preset, year, start: new Date(year, 0, 1), end }
  }
  if (preset === 'month') {
    const year = Number(input?.year) || today.getFullYear()
    const month = Number(input?.month ?? today.getMonth())
    const start = new Date(year, month, 1)
    const last = lastDayOfMonth(year, month)
    const end = year === today.getFullYear() && month === today.getMonth() ? today : last
    return { preset, year, month, start, end }
  }
  if (preset === 'custom') {
    const start = startOfDay(parseLooseDate(input?.from) || today)
    let end = startOfDay(parseLooseDate(input?.to) || today)
    if (end.getTime() < start.getTime()) end = start
    return { preset, start, end }
  }
  return {
    preset: 'this_month',
    year: today.getFullYear(),
    month: today.getMonth(),
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: today,
  }
}

export function availableYears(invoices: AnyDoc[] = [], obligations: AnyDoc[] = [], now = new Date()) {
  let min = now.getFullYear()
  for (const item of [...invoices, ...obligations]) {
    const d = parseLooseDate(item.date)
    if (d) min = Math.min(min, d.getFullYear())
  }
  const years: number[] = []
  for (let y = now.getFullYear(); y >= Math.min(min, now.getFullYear() - 5); y -= 1) years.push(y)
  return years
}

export function docCurrency(doc: AnyDoc, fallback = 'EUR') {
  return doc?.currency || doc?.companySnapshot?.currency || fallback
}

function isDraft(doc: AnyDoc) {
  return doc?.lifecycle === 'draft'
}

function cancelledOnOrBefore(doc: AnyDoc, end: Date) {
  if (doc?.lifecycle !== 'cancelled' && doc?.status !== 'cancelled') return false
  const at = parseLooseDate(doc.cancelledAt)
  if (at) return onOrBefore(at, end)
  return true
}

function isVoidedAsOf(payment: Payment, end: Date) {
  if (!payment?.voidedAt) return false
  const voided = parseLooseDate(payment.voidedAt)
  if (voided) return onOrBefore(voided, end)
  return true
}

export function paymentCountsAsOf(payment: Payment, end: Date) {
  if (isVoidedAsOf(payment, end)) return false
  const paidOn = parseLooseDate(payment?.date)
  if (!paidOn) return false
  return onOrBefore(paidOn, end)
}

function isLegacyPaid(doc: AnyDoc) {
  return paymentStatus(doc) === 'paid' && !(doc.payments || []).some((item) => !item.voidedAt)
}

export function remainingAsOf(doc: AnyDoc, end: Date) {
  if (isDraft(doc)) return { amount: 0, legacyPaid: false }
  const dated = parseLooseDate(doc.date)
  if (!dated || !onOrBefore(dated, end)) return { amount: 0, legacyPaid: false }
  if (cancelledOnOrBefore(doc, end)) return { amount: 0, legacyPaid: false }
  const total = money(doc.total ?? doc.amount ?? 0)
  if (isLegacyPaid(doc)) return { amount: 0, legacyPaid: true }
  const paid = (doc.payments || []).reduce((sum, item) => {
    if (isVoidedAsOf(item, end)) return sum
    const paidOn = parseLooseDate(item.date)
    if (!paidOn || onOrBefore(paidOn, end)) return sum + money(item.amount)
    return sum
  }, 0)
  return { amount: Math.max(money(total - paid), 0), legacyPaid: false }
}

export function collectCurrencies(invoices: AnyDoc[] = [], obligations: AnyDoc[] = [], fallback = 'EUR') {
  const set = new Set<string>()
  for (const item of invoices) {
    if (isDraft(item)) continue
    set.add(docCurrency(item, fallback))
  }
  for (const item of obligations) {
    if (item.status === 'cancelled') continue
    set.add(docCurrency(item, fallback))
  }
  if (!set.size) set.add(fallback)
  return [...set]
}

function asObligationDoc(item: AnyDoc) {
  return { ...item, total: item.amount }
}

export function buildOverview({
  invoices = [],
  obligations = [],
  period,
  currency,
  fallbackCurrency = 'EUR',
}: {
  invoices?: AnyDoc[]
  obligations?: AnyDoc[]
  period: { start: Date; end: Date; preset?: PeriodPreset; year?: number; month?: number }
  currency: string
  fallbackCurrency?: string
}) {
  const start = startOfDay(period.start)
  const end = startOfDay(period.end)
  const limitations: OverviewLimitations = {
    legacyPaid: false,
    undatedPayments: false,
    missingDates: false,
    undatedCancellations: false,
  }

  const issuedInPeriod: AnyDoc[] = []
  const received: Array<Payment & { invoice: AnyDoc }> = []
  const obligationsInPeriod: AnyDoc[] = []
  const paidOut: Array<Payment & { obligation: AnyDoc }> = []
  const receivableDocs: Array<AnyDoc & { amountDueAsOf: number }> = []
  const payableDocs: Array<AnyDoc & { amountDueAsOf: number; daysOverdueAsOf: number }> = []
  const customers = new Map<
    string,
    { clientId: string; client: AnyDoc['client']; amount: number; invoices: Array<AnyDoc & { amountDueAsOf: number }> }
  >()

  for (const inv of invoices) {
    if (isDraft(inv)) continue
    const cur = docCurrency(inv, fallbackCurrency)
    if (cur !== currency) continue
    const dated = parseLooseDate(inv.date)
    if (!dated) {
      limitations.missingDates = true
      continue
    }
    if ((inv.lifecycle === 'cancelled' || inv.status === 'cancelled') && !inv.cancelledAt) {
      limitations.undatedCancellations = true
    }
    const cancelledByEnd = cancelledOnOrBefore(inv, end)
    if (inRange(dated, start, end) && !cancelledByEnd) issuedInPeriod.push(inv)
    for (const pay of inv.payments || []) {
      if (!parseLooseDate(pay.date) && !pay.voidedAt) limitations.undatedPayments = true
      if (paymentCountsAsOf(pay, end) && inRange(parseLooseDate(pay.date), start, end)) {
        received.push({ ...pay, invoice: inv })
      }
    }
    const due = remainingAsOf(inv, end)
    if (due.legacyPaid) limitations.legacyPaid = true
    if (due.amount > 0) {
      receivableDocs.push({ ...inv, amountDueAsOf: due.amount })
      const name = inv.clientSnapshot?.fullName || inv.client?.fullName || ''
      const key = String(inv.clientId || name).toLowerCase() || inv.id || name
      const group = customers.get(key) || {
        clientId: inv.clientId || '',
        client: inv.clientSnapshot || inv.client || { fullName: name },
        amount: 0,
        invoices: [],
      }
      group.amount = money(group.amount + due.amount)
      group.invoices.push({ ...inv, amountDueAsOf: due.amount })
      customers.set(key, group)
    }
  }

  for (const item of obligations) {
    const cur = docCurrency(item, fallbackCurrency)
    if (cur !== currency) continue
    const dated = parseLooseDate(item.date)
    if (!dated) {
      limitations.missingDates = true
      continue
    }
    if (item.status === 'cancelled' && !item.cancelledAt) limitations.undatedCancellations = true
    if (cancelledOnOrBefore(item, end)) continue
    if (inRange(dated, start, end)) obligationsInPeriod.push(item)
    for (const pay of item.payments || []) {
      if (!parseLooseDate(pay.date) && !pay.voidedAt) limitations.undatedPayments = true
      if (paymentCountsAsOf(pay, end) && inRange(parseLooseDate(pay.date), start, end)) {
        paidOut.push({ ...pay, obligation: item })
      }
    }
    const due = remainingAsOf(asObligationDoc(item), end)
    if (due.legacyPaid) limitations.legacyPaid = true
    if (due.amount > 0) {
      const dueDate = parseLooseDate(item.dueDate)
      const days = dueDate ? Math.floor((startOfDay(end).getTime() - startOfDay(dueDate).getTime()) / 86400000) : 0
      payableDocs.push({ ...item, amountDueAsOf: due.amount, daysOverdueAsOf: days > 0 ? days : 0 })
    }
  }

  const invoiced = money(issuedInPeriod.reduce((sum, inv) => sum + money(inv.total), 0))
  const paymentsReceived = money(received.reduce((sum, item) => sum + money(item.amount), 0))
  const obligationsRecorded = money(obligationsInPeriod.reduce((sum, item) => sum + money(item.amount), 0))
  const paymentsMade = money(paidOut.reduce((sum, item) => sum + money(item.amount), 0))
  const receivables = money(receivableDocs.reduce((sum, item) => sum + money(item.amountDueAsOf), 0))
  const payables = money(payableDocs.reduce((sum, item) => sum + money(item.amountDueAsOf), 0))

  return {
    period: { ...period, preset: period.preset || 'this_month', start, end, startIso: isoDate(start), endIso: isoDate(end) } as ReportPeriod,
    currency,
    invoiced,
    paymentsReceived,
    obligationsRecorded,
    paymentsMade,
    receivables,
    payables,
    netPayments: money(paymentsReceived - paymentsMade),
    issuedInPeriod,
    received,
    obligationsInPeriod,
    paidOut,
    receivableDocs,
    payableDocs: payableDocs.sort((a, b) => (b.daysOverdueAsOf || 0) - (a.daysOverdueAsOf || 0)),
    overduePayables: payableDocs.filter((item) => item.daysOverdueAsOf > 0),
    customers: [...customers.values()].sort((a, b) => b.amount - a.amount),
    limitations,
  }
}

export type OverviewReport = ReturnType<typeof buildOverview>

export function periodLabel(period: { preset?: string; start: Date; end: Date }, months?: string[]) {
  const names = months || MONTH_ABBR
  if (period.preset === 'this_year' || period.preset === 'year') return String(period.start.getFullYear())
  if (period.preset === 'this_month' || period.preset === 'month') {
    return `${names[period.start.getMonth()]} ${period.start.getFullYear()}`
  }
  return `${isoDate(period.start)} – ${isoDate(period.end)}`
}

export function hasLimitation(limitations?: OverviewLimitations | null) {
  return Boolean(
    limitations?.legacyPaid || limitations?.undatedPayments || limitations?.missingDates || limitations?.undatedCancellations,
  )
}

export { MONTH_ABBR }
