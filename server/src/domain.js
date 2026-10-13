const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const INDUSTRIES = ['fashion', 'services', 'retail', 'hospitality', 'construction', 'other']
const INVOICE_TEMPLATES = ['classic', 'corporate', 'minimal']

function toCents(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function fromCents(cents) {
  return (Number(cents) || 0) / 100
}

function money(value) {
  return fromCents(toCents(value))
}

function toNumber(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** VAT as a percentage, 0–100. Accepts 18, "18" or a spreadsheet-style fraction such as 0.18. */
function normalizeTaxRate(value) {
  const n = toNumber(value)
  if (n <= 0) return 0
  const percent = n < 1 ? n * 100 : n
  return Math.min(Math.round(percent * 100) / 100, 100)
}

/**
 * Invoice totals. Line prices are net of VAT and may carry more than two decimals
 * (a net price worked back from a round gross one), so only the results are rounded.
 */
function invoiceTotals(items, discount, taxRate) {
  const gross = (items || []).reduce((sum, item) => sum + toNumber(item?.quantity) * toNumber(item?.unitPrice), 0)
  const rate = normalizeTaxRate(taxRate)
  const subtotal = money(gross)
  const reduction = money(discount)
  const net = money(Math.max(subtotal - reduction, 0))
  const total = rate > 0 ? money(Math.max(gross - toNumber(discount), 0) * (1 + rate / 100)) : net
  return { subtotal, discount: reduction, net, taxRate: rate, taxAmount: money(total - net), total }
}

function activePayments(payments) {
  return (payments || []).filter((item) => !item.voidedAt)
}

function paymentSumCents(payments) {
  return activePayments(payments).reduce((sum, item) => sum + toCents(item.amount), 0)
}

function documentTotals(doc) {
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0)
  const paidCents = paymentSumCents(doc?.payments)
  const dueCents = Math.max(totalCents - paidCents, 0)
  return {
    total: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    amountDue: fromCents(dueCents),
    totalCents,
    paidCents,
    dueCents,
  }
}

function paymentStatus(doc) {
  if (doc?.lifecycle === 'cancelled' || doc?.status === 'cancelled') return 'cancelled'
  if (doc?.lifecycle === 'draft') return 'draft'
  const { totalCents, paidCents, dueCents } = documentTotals(doc)
  if (doc?.status === 'paid' && paidCents === 0 && totalCents > 0) return 'paid'
  if (totalCents > 0 && dueCents === 0) return 'paid'
  if (paidCents > 0) return 'partial'
  return 'unpaid'
}

function isSettled(doc) {
  const status = paymentStatus(doc)
  return status === 'paid' || status === 'cancelled' || status === 'draft'
}

function parseLooseDate(value) {
  if (!value) return null
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  const raw = String(value).trim()
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoDay) return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    // Day first, as written here; a "month" above 12 means the date was typed month first (9/30/2026).
    const monthFirst = Number(dmy[2]) > 12 && Number(dmy[1]) <= 12
    return new Date(Number(dmy[3]), Number(dmy[monthFirst ? 1 : 2]) - 1, Number(dmy[monthFirst ? 2 : 1]))
  }
  const mdy = raw.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i)
  if (mdy) {
    const month = MONTH_ABBR.indexOf(mdy[1].toUpperCase())
    if (month >= 0) return new Date(Number(mdy[3]), month, Number(mdy[2]))
  }
  const iso = Date.parse(raw)
  if (Number.isFinite(iso)) return new Date(iso)
  return null
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysOverdue(doc, now = new Date()) {
  if (isSettled(doc)) return 0
  const { dueCents } = documentTotals(doc)
  if (dueCents <= 0) return 0
  const due = parseLooseDate(doc?.dueDate)
  if (!due) return 0
  const diff = startOfDay(now).getTime() - startOfDay(due).getTime()
  const days = Math.floor(diff / 86400000)
  return days > 0 ? days : 0
}

function isOverdue(doc, now = new Date()) {
  return daysOverdue(doc, now) > 0
}

function allocateInvoiceNumber(existing, date = new Date()) {
  const d = parseLooseDate(date) || new Date()
  const issued = (existing || []).filter((inv) => inv?.lifecycle !== 'draft')
  // An account whose invoices are mostly numbered 202610-008 (year, month, running number) keeps
  // that scheme — typically one that imported its history from a spreadsheet.
  const dated = issued.filter((inv) => /^\d{6}-\d+$/.test(String(inv?.number || ''))).length
  if (dated > 0 && dated * 2 > issued.length) {
    const period = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    let last = 0
    for (const inv of issued) {
      const match = String(inv?.number || '').match(/^(\d{6})-(\d+)$/)
      if (match && match[1] === period) last = Math.max(last, Number(match[2]) || 0)
    }
    return `${period}-${String(last + 1).padStart(3, '0')}`
  }
  const prefix = MONTH_ABBR[d.getMonth()]
  let max = 0
  for (const inv of existing || []) {
    if (inv?.lifecycle === 'draft') continue
    const match = String(inv?.number || '').match(/^([A-Z]{3})-(\d+)$/)
    if (!match || match[1] !== prefix) continue
    max = Math.max(max, Number(match[2]) || 0)
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function companySnapshot(profile) {
  if (!profile) return null
  return {
    companyName: String(profile.companyName || ''),
    contactPerson: String(profile.contactPerson || ''),
    nui: String(profile.nui || ''),
    vatNumber: String(profile.vatNumber || ''),
    streetAddress: String(profile.streetAddress || ''),
    state: String(profile.state || ''),
    zipCode: String(profile.zipCode || ''),
    email: String(profile.email || ''),
    phone: String(profile.phone || ''),
    currency: String(profile.currency || 'EUR'),
    bankName: String(profile.bankName || ''),
    iban: String(profile.iban || ''),
    swift: String(profile.swift || ''),
    website: String(profile.website || ''),
    industry: INDUSTRIES.includes(profile.industry) ? profile.industry : 'other',
    exportNote: profile.exportNote,
  }
}

function clientSnapshot(client) {
  if (!client) return { fullName: '', firstName: '', lastName: '', address: '', phone: '', email: '', businessId: '', notes: '', measurements: {}, photos: [] }
  const firstName = String(client.firstName || '').trim()
  const lastName = String(client.lastName || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || String(client.fullName || '').trim()
  return {
    id: client.id || '',
    firstName,
    lastName,
    fullName,
    address: String(client.address || '').trim(),
    phone: String(client.phone || '').trim(),
    email: String(client.email || '').trim(),
    businessId: String(client.businessId || client.nui || '').trim(),
    vatNumber: String(client.vatNumber || '').trim(),
    fiscalNumber: String(client.fiscalNumber || '').trim(),
    notes: String(client.notes || '').trim(),
    measurements: client.measurements && typeof client.measurements === 'object' ? client.measurements : {},
    photos: Array.isArray(client.photos) ? client.photos : [],
  }
}

function pdfCompany(invoice, liveProfile) {
  return invoice?.companySnapshot || liveProfile
}

function pdfClient(invoice) {
  return invoice?.clientSnapshot || invoice?.client
}

function pdfCurrency(invoice, liveProfile) {
  return invoice?.currency || invoice?.companySnapshot?.currency || liveProfile?.currency || 'EUR'
}

function reminderText({ invoice, days, labels }) {
  const due = invoice?.dueDate || labels.onReceipt || ''
  const remaining = documentTotals(invoice).amountDue
  return [
    labels.hello,
    labels.body
      .replace('{number}', invoice?.number || '')
      .replace('{due}', due)
      .replace('{amount}', remaining.toFixed(2))
      .replace('{days}', String(days)),
    labels.thanks,
  ].join('\n\n')
}

function validatePaymentAmount(doc, amount, exceptPaymentId) {
  const cents = toCents(amount)
  if (cents <= 0) return { ok: false, error: 'AMOUNT_INVALID' }
  const others = activePayments(doc?.payments).filter((item) => !exceptPaymentId || item.id !== exceptPaymentId)
  const remaining = toCents(doc?.total ?? doc?.amount) - paymentSumCents(others)
  if (cents > remaining) return { ok: false, error: 'AMOUNT_EXCEEDS', remaining: fromCents(remaining) }
  return { ok: true, cents, remaining: fromCents(remaining - cents) }
}

function hydrateInvoice(raw, profile) {
  const payments = Array.isArray(raw?.payments) ? raw.payments : []
  const lifecycle = raw?.lifecycle || (raw?.status === 'cancelled' ? 'cancelled' : 'issued')
  const client = raw?.client || {}
  const computed = paymentStatus({ ...raw, payments, lifecycle })
  const totals = documentTotals({ ...raw, payments })
  const legacyPaid = raw?.status === 'paid' && payments.length === 0 && lifecycle === 'issued'
  return {
    ...raw,
    payments,
    lifecycle,
    status: computed,
    amountPaid: legacyPaid ? money(raw.total) : totals.amountPaid,
    amountDue: legacyPaid || computed === 'paid' || computed === 'cancelled' ? 0 : totals.amountDue,
    currency: raw?.currency || raw?.companySnapshot?.currency || profile?.currency || 'EUR',
    taxRate: normalizeTaxRate(raw?.taxRate),
    taxAmount: money(raw?.taxAmount),
    snapshotSource: raw?.companySnapshot ? raw.snapshotSource || 'issued' : raw?.snapshotSource || 'migrated',
    companySnapshot: raw?.companySnapshot || null,
    clientSnapshot: raw?.clientSnapshot || clientSnapshot(client),
    clientId: raw?.clientId || client.id || '',
    revisions: Array.isArray(raw?.revisions) ? raw.revisions : [],
  }
}

function hydrateObligation(raw) {
  const payments = Array.isArray(raw?.payments) ? raw.payments : []
  const computed = paymentStatus({ ...raw, payments, total: raw?.amount })
  const totals = documentTotals({ ...raw, payments, total: raw?.amount })
  const legacyPaid = raw?.status === 'paid' && payments.length === 0
  return {
    ...raw,
    payments,
    status: computed === 'draft' ? 'unpaid' : computed,
    amountPaid: legacyPaid ? money(raw.amount) : totals.amountPaid,
    amountDue: legacyPaid || computed === 'paid' || computed === 'cancelled' ? 0 : totals.amountDue,
    revisions: Array.isArray(raw?.revisions) ? raw.revisions : [],
  }
}

function activeDocument(doc) {
  return doc?.lifecycle !== 'cancelled' && doc?.status !== 'cancelled' && doc?.lifecycle !== 'draft'
}

function similarClient(a, b) {
  const nameA = String(a?.fullName || '').trim().toLowerCase()
  const nameB = String(b?.fullName || '').trim().toLowerCase()
  if (!nameA || nameA !== nameB) return false
  const phoneA = String(a?.phone || '').replace(/\D/g, '')
  const phoneB = String(b?.phone || '').replace(/\D/g, '')
  const emailA = String(a?.email || '').trim().toLowerCase()
  const emailB = String(b?.email || '').trim().toLowerCase()
  const idA = String(a?.businessId || '').trim().toLowerCase()
  const idB = String(b?.businessId || '').trim().toLowerCase()
  if (phoneA && phoneB && phoneA === phoneB) return true
  if (emailA && emailB && emailA === emailB) return true
  if (idA && idB && idA === idB) return true
  return false
}

module.exports = {
  toNumber,
  normalizeTaxRate,
  invoiceTotals,
  MONTH_ABBR,
  INDUSTRIES,
  INVOICE_TEMPLATES,
  toCents,
  fromCents,
  money,
  activePayments,
  paymentSumCents,
  documentTotals,
  paymentStatus,
  isSettled,
  parseLooseDate,
  daysOverdue,
  isOverdue,
  allocateInvoiceNumber,
  companySnapshot,
  clientSnapshot,
  pdfCompany,
  pdfClient,
  pdfCurrency,
  reminderText,
  validatePaymentAmount,
  similarClient,
  hydrateInvoice,
  hydrateObligation,
  activeDocument,
}
