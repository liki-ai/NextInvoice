const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

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
  const d = date instanceof Date ? date : new Date(date)
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
    streetAddress: String(profile.streetAddress || ''),
    state: String(profile.state || ''),
    zipCode: String(profile.zipCode || ''),
    email: String(profile.email || ''),
    phone: String(profile.phone || ''),
    currency: String(profile.currency || 'EUR'),
    bankName: String(profile.bankName || ''),
    iban: String(profile.iban || ''),
    exportNote: profile.exportNote,
  }
}

function clientSnapshot(client) {
  if (!client) return { fullName: '', address: '', phone: '', email: '', businessId: '' }
  return {
    id: client.id || '',
    fullName: String(client.fullName || '').trim(),
    address: String(client.address || '').trim(),
    phone: String(client.phone || '').trim(),
    email: String(client.email || '').trim(),
    businessId: String(client.businessId || client.nui || '').trim(),
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
  MONTH_ABBR,
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
