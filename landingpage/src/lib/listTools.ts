import { computeTotals, normalizeTaxRate, type Invoice } from './invoice'
import { documentTotals, isActiveDocument, money, parseLooseDate, remainingOf, totalsByCurrency } from './document'

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
