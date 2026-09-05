export type Payment = {
  id: string
  amount: number
  date: string
  method?: string
  note?: string
  createdAt?: string
  voidedAt?: string
  voidReason?: string
  revisions?: unknown[]
}

export type DocStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'cancelled'

export type ClientRecord = {
  id: string
  fullName: string
  address?: string
  phone?: string
  email?: string
  businessId?: string
  createdAt?: string
  updatedAt?: string
}

function toCents(value: unknown) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function money(value: unknown) {
  return toCents(value) / 100
}

export function activePayments(payments?: Payment[] | null) {
  return (payments || []).filter((item) => !item.voidedAt)
}

export function documentTotals(doc: { total?: unknown; amount?: unknown; payments?: Payment[] | null }) {
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0)
  const paidCents = activePayments(doc?.payments).reduce((sum, item) => sum + toCents(item.amount), 0)
  const dueCents = Math.max(totalCents - paidCents, 0)
  return {
    total: totalCents / 100,
    amountPaid: paidCents / 100,
    amountDue: dueCents / 100,
  }
}

export function paymentStatus(doc: {
  lifecycle?: string
  status?: string
  total?: unknown
  amount?: unknown
  payments?: Payment[] | null
}): DocStatus {
  if (doc?.lifecycle === 'cancelled' || doc?.status === 'cancelled') return 'cancelled'
  if (doc?.lifecycle === 'draft') return 'draft'
  const totals = documentTotals(doc)
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0)
  const paidCents = toCents(totals.amountPaid)
  if (doc?.status === 'paid' && paidCents === 0 && totalCents > 0) return 'paid'
  if (totalCents > 0 && totals.amountDue === 0) return 'paid'
  if (paidCents > 0) return 'partial'
  return 'unpaid'
}

export function remainingOf(doc: {
  amountDue?: number
  lifecycle?: string
  status?: string
  total?: unknown
  amount?: unknown
  payments?: Payment[] | null
}) {
  const status = paymentStatus(doc)
  if (status === 'cancelled' || status === 'draft') return 0
  if (typeof doc.amountDue === 'number') return doc.amountDue
  if (status === 'paid') return 0
  return documentTotals(doc).amountDue
}

export function isActiveDocument(doc: { lifecycle?: string; status?: string }) {
  return paymentStatus(doc) !== 'cancelled' && paymentStatus(doc) !== 'draft'
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function parseLooseDate(value?: string | null) {
  if (!value) return null
  const raw = String(value).trim()
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoDay) return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
  const mdy = raw.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i)
  if (mdy) {
    const month = MONTH_ABBR.indexOf(mdy[1].toUpperCase())
    if (month >= 0) return new Date(Number(mdy[3]), month, Number(mdy[2]))
  }
  const iso = Date.parse(raw)
  if (Number.isFinite(iso)) return new Date(iso)
  return null
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysOverdue(doc: { dueDate?: string; lifecycle?: string; status?: string; total?: unknown; amount?: unknown; payments?: Payment[] | null; amountDue?: number }, now = new Date()) {
  const status = paymentStatus(doc)
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return 0
  if (remainingOf(doc) <= 0) return 0
  const due = parseLooseDate(doc?.dueDate)
  if (!due) return 0
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(due).getTime()) / 86400000)
  return days > 0 ? days : 0
}

export function isOverdue(doc: Parameters<typeof daysOverdue>[0], now = new Date()) {
  return daysOverdue(doc, now) > 0
}

export function reminderText(invoice: { number?: string; dueDate?: string; total?: unknown; payments?: Payment[] | null; amountDue?: number }, labels: { hello: string; body: string; thanks: string; onReceipt: string }, days: number) {
  const due = invoice?.dueDate || labels.onReceipt
  const remaining = remainingOf(invoice).toFixed(2)
  return [
    labels.hello,
    labels.body.replace('{number}', invoice?.number || '').replace('{due}', due).replace('{amount}', remaining).replace('{days}', String(days)),
    labels.thanks,
  ].join('\n\n')
}

export function totalsByCurrency<T extends { currency?: string; lifecycle?: string; status?: string }>(
  docs: T[],
  valueOf: (doc: T) => number,
) {
  const map = new Map<string, number>()
  for (const doc of docs) {
    if (!isActiveDocument(doc)) continue
    const currency = doc.currency || 'EUR'
    map.set(currency, money((map.get(currency) || 0) + valueOf(doc)))
  }
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }))
}

export function formatMoneyList(rows: { currency: string; amount: number }[], formatMoney: (amount: number, currency: string) => string) {
  if (!rows.length) return formatMoney(0, 'EUR')
  return rows.map((row) => formatMoney(row.amount, row.currency)).join(' · ')
}

export function todayInputValue(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
