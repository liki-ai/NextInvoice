import { computeTotals, invoiceStatus, normalizeTaxRate, type Invoice } from './invoice'
import { documentTotals, isActiveDocument, isOverdue, money, parseLooseDate, remainingOf, totalsByCurrency } from './document'

/** A stretch of days, each end as YYYY-MM-DD; an empty end is open. */
export type Period = { from: string; to: string }

export const NO_PERIOD: Period = { from: '', to: '' }

export function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function hasPeriod(period: Period) {
  return Boolean(period.from || period.to)
}

export function monthPeriod(offset = 0, now = new Date()): Period {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: isoDay(first), to: isoDay(last) }
}

export function yearPeriod(now = new Date()): Period {
  return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
}

/** Whether a date written any of the ways invoices carry it (OCT 14, 2026 · 14.10.2026 · ISO) falls in the period. */
export function dateInPeriod(value: string | undefined | null, period: Period) {
  if (!hasPeriod(period)) return true
  const date = parseLooseDate(value)
  if (!date) return false
  const day = isoDay(date)
  if (period.from && day < period.from) return false
  if (period.to && day > period.to) return false
  return true
}

export function invoiceInPeriod(invoice: Pick<Invoice, 'date' | 'createdAt'>, period: Period) {
  return dateInPeriod(invoice.date || invoice.createdAt, period)
}

/**
 * An invoice's amount without VAT and its VAT. The VAT recorded on the invoice is used; an older or
 * imported invoice that carries a rate but no recorded VAT gets it worked out from its lines, or
 * failing that from its total.
 */
export function vatSplit(invoice: Invoice) {
  const total = documentTotals(invoice).total
  let vat = money(invoice.taxAmount)
  const rate = normalizeTaxRate(invoice.taxRate)
  if (!vat && rate > 0) {
    const lines = invoice.items?.length ? computeTotals(invoice.items, invoice.discount, rate) : null
    vat = lines && Math.abs(lines.total - total) < 0.01 ? lines.taxAmount : money(total - total / (1 + rate / 100))
  }
  return { net: money(total - vat), vat, total }
}

/** Totals of a list of invoices per currency; drafts and cancelled invoices carry no money. */
export function invoiceListTotals(invoices: Invoice[]) {
  const counted = invoices.filter((item) => isActiveDocument(item))
  return {
    count: counted.length,
    net: totalsByCurrency(counted, (item) => vatSplit(item).net),
    vat: totalsByCurrency(counted, (item) => vatSplit(item).vat),
    total: totalsByCurrency(counted, (item) => vatSplit(item).total),
    paid: totalsByCurrency(counted, (item) => money(documentTotals(item).total - remainingOf(item))),
    remaining: totalsByCurrency(counted, (item) => remainingOf(item)),
  }
}

export type InvoiceSortKey = 'number' | 'client' | 'date' | 'status' | 'net' | 'vat' | 'total'

// What needs attention first: overdue, then owed, partly paid, paid, drafts, cancelled.
const STATUS_RANK: Record<string, number> = { overdue: 0, unpaid: 1, partial: 2, paid: 3, draft: 4, cancelled: 5 }

function statusRank(invoice: Invoice) {
  const status = invoiceStatus(invoice)
  if ((status === 'unpaid' || status === 'partial') && isOverdue(invoice)) return STATUS_RANK.overdue
  return STATUS_RANK[status] ?? 6
}

/**
 * Invoices in the order of a column; without one, as they came. Ties keep the order they came in,
 * and invoices of the same day go by number.
 */
export function sortInvoices(invoices: Invoice[], sort: { key: InvoiceSortKey; desc: boolean } | null) {
  if (!sort) return invoices
  const text = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const day = (inv: Invoice) => parseLooseDate(inv.date)?.getTime() ?? 0
  const compare: (a: Invoice, b: Invoice) => number = {
    number: (a: Invoice, b: Invoice) => text.compare(String(a.number || ''), String(b.number || '')),
    client: (a: Invoice, b: Invoice) => text.compare(String(a.client?.fullName || '').trim(), String(b.client?.fullName || '').trim()),
    date: (a: Invoice, b: Invoice) => day(a) - day(b) || text.compare(String(a.number || ''), String(b.number || '')),
    status: (a: Invoice, b: Invoice) => statusRank(a) - statusRank(b),
    net: (a: Invoice, b: Invoice) => vatSplit(a).net - vatSplit(b).net,
    vat: (a: Invoice, b: Invoice) => vatSplit(a).vat - vatSplit(b).vat,
    total: (a: Invoice, b: Invoice) => vatSplit(a).total - vatSplit(b).total,
  }[sort.key]
  const sign = sort.desc ? -1 : 1
  return invoices
    .map((invoice, index) => ({ invoice, index }))
    .sort((a, b) => sign * compare(a.invoice, b.invoice) || a.index - b.index)
    .map((row) => row.invoice)
}
