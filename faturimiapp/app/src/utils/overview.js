'use strict'

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function toCents(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function money(value) {
  return toCents(value) / 100
}

function parseLooseDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoDay) return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
  const dmyFull = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyFull) return new Date(Number(dmyFull[3]), Number(dmyFull[2]) - 1, Number(dmyFull[1]))
  const dmy = raw.match(/^(\d{1,2})[./-](\d{4})$/)
  if (dmy) return new Date(Number(dmy[2]), Number(dmy[1]) - 1, 1)
  const mdy = raw.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i)
  if (mdy) {
    const month = MONTH_ABBR.indexOf(mdy[1].toUpperCase())
    if (month >= 0) return new Date(Number(mdy[3]), month, Number(mdy[2]))
  }
  const iso = Date.parse(raw)
  if (Number.isFinite(iso)) return new Date(iso)
  return null
}

function paymentStatus(doc) {
  if (doc?.lifecycle === 'cancelled' || doc?.status === 'cancelled') return 'cancelled'
  if (doc?.lifecycle === 'draft') return 'draft'
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0)
  const paidCents = (doc?.payments || []).filter((item) => !item.voidedAt).reduce((sum, item) => sum + toCents(item.amount), 0)
  if (doc?.status === 'paid' && paidCents === 0 && totalCents > 0) return 'paid'
  if (totalCents > 0 && paidCents >= totalCents) return 'paid'
  if (paidCents > 0) return 'partial'
  return 'unpaid'
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0)
}

function isoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function onOrBefore(date, end) {
  if (!date) return false
  return startOfDay(date).getTime() <= startOfDay(end).getTime()
}

function inRange(date, start, end) {
  if (!date) return false
  const t = startOfDay(date).getTime()
  return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime()
}

function resolvePeriod(input, now = new Date()) {
  const preset = input?.preset || 'this_month'
  const today = startOfDay(now)
  if (preset === 'this_year') {
    return { preset, start: new Date(today.getFullYear(), 0, 1), end: today }
  }
  if (preset === 'year') {
    const year = Number(input.year) || today.getFullYear()
    const end = year === today.getFullYear() ? today : new Date(year, 11, 31)
    return { preset, year, start: new Date(year, 0, 1), end }
  }
  if (preset === 'month') {
    const year = Number(input.year) || today.getFullYear()
    const month = Number(input.month ?? today.getMonth())
    const start = new Date(year, month, 1)
    const last = lastDayOfMonth(year, month)
    const end = year === today.getFullYear() && month === today.getMonth() ? today : last
    return { preset, year, month, start, end }
  }
  if (preset === 'custom') {
    const start = startOfDay(parseLooseDate(input.from) || today)
    let end = startOfDay(parseLooseDate(input.to) || today)
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

function availableYears(invoices, obligations, now = new Date()) {
  let min = now.getFullYear()
  for (const item of [...(invoices || []), ...(obligations || [])]) {
    const d = parseLooseDate(item.date)
    if (d) min = Math.min(min, d.getFullYear())
  }
  const years = []
  for (let y = now.getFullYear(); y >= Math.min(min, now.getFullYear() - 5); y -= 1) years.push(y)
  return years
}

function docCurrency(doc, fallback = 'EUR') {
  return doc?.currency || doc?.companySnapshot?.currency || fallback
}

function isDraft(doc) {
  return doc?.lifecycle === 'draft'
}

function cancelledOnOrBefore(doc, end) {
  if (doc?.lifecycle !== 'cancelled' && doc?.status !== 'cancelled') return false
  const at = parseLooseDate(doc.cancelledAt)
  if (at) return onOrBefore(at, end)
  return true
}

function isVoidedAsOf(payment, end) {
  if (!payment?.voidedAt) return false
  const voided = parseLooseDate(payment.voidedAt)
  if (voided) return onOrBefore(voided, end)
  return true
}

function paymentCountsAsOf(payment, end) {
  if (isVoidedAsOf(payment, end)) return false
  const paidOn = parseLooseDate(payment?.date)
  if (!paidOn) return false
  return onOrBefore(paidOn, end)
}

function isLegacyPaid(doc) {
  return paymentStatus(doc) === 'paid' && !(doc.payments || []).some((item) => !item.voidedAt)
}

function remainingAsOf(doc, end) {
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

function collectCurrencies(invoices, obligations, fallback = 'EUR') {
  const set = new Set()
  for (const item of invoices || []) {
    if (isDraft(item)) continue
    set.add(docCurrency(item, fallback))
  }
  for (const item of obligations || []) {
    if (item.status === 'cancelled') continue
    set.add(docCurrency(item, fallback))
  }
  if (!set.size) set.add(fallback)
  return [...set]
}

function asObligationDoc(item) {
  return { ...item, total: item.amount }
}

function buildOverview({ invoices = [], obligations = [], period, currency, fallbackCurrency = 'EUR' }) {
  const start = startOfDay(period.start)
  const end = startOfDay(period.end)
  const limitations = { legacyPaid: false, undatedPayments: false, missingDates: false, undatedCancellations: false }

  const issuedInPeriod = []
  const received = []
  const obligationsInPeriod = []
  const paidOut = []
  const receivableDocs = []
  const payableDocs = []
  const customers = new Map()

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
      const key = String(inv.clientId || name).toLowerCase() || inv.id
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
    period: { ...period, start, end, startIso: isoDate(start), endIso: isoDate(end) },
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

function periodLabel(period, months) {
  const names = months || MONTH_ABBR
  if (period.preset === 'this_year' || period.preset === 'year') return String(period.start.getFullYear())
  if (period.preset === 'this_month' || period.preset === 'month') {
    return `${names[period.start.getMonth()]} ${period.start.getFullYear()}`
  }
  return `${isoDate(period.start)} – ${isoDate(period.end)}`
}

function hasLimitation(limitations) {
  return Boolean(limitations?.legacyPaid || limitations?.undatedPayments || limitations?.missingDates || limitations?.undatedCancellations)
}

module.exports = {
  money,
  parseLooseDate,
  isoDate,
  startOfDay,
  resolvePeriod,
  availableYears,
  docCurrency,
  collectCurrencies,
  remainingAsOf,
  paymentCountsAsOf,
  buildOverview,
  periodLabel,
  hasLimitation,
  MONTH_ABBR,
}
