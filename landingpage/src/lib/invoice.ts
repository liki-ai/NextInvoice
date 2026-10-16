import { documentTotals, parseLooseDate, paymentStatus, remainingOf, totalsByCurrency } from './document'

export { buildInvoiceHtml } from './invoiceTemplates'

export type Client = { id?: string; fullName: string; address: string; phone: string; email?: string; businessId?: string; vatNumber?: string; fiscalNumber?: string }

/**
 * The VAT rate a new invoice starts with: the client's own setting if it has one
 * (0 for an export customer), otherwise the company default. Always editable on the invoice.
 */
export function startingTaxRate(client: { taxRate?: number | null } | null | undefined, companyDefault: unknown) {
  const own = client?.taxRate
  return own === undefined || own === null ? { rate: normalizeTaxRate(companyDefault), fromClient: false } : { rate: normalizeTaxRate(own), fromClient: true }
}

export type InvoiceItem = {
  id: string
  description: string
  quantity: string | number
  unitPrice: string | number
}

export type InvoiceStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'cancelled'

export type Invoice = {
  id: string
  number: string
  date: string
  dueDate?: string
  status?: InvoiceStatus
  lifecycle?: 'draft' | 'issued' | 'cancelled'
  client: Client
  clientId?: string
  clientSnapshot?: Client
  companySnapshot?: CompanyProfile | null
  snapshotSource?: 'issued' | 'migrated'
  currency?: string
  items: InvoiceItem[]
  discount: string | number
  /** VAT as a percentage (18 = 18%). Line prices are net; VAT is added after the discount. */
  taxRate?: number
  taxAmount?: number
  /**
   * The prices were typed with VAT included. Stored unit prices are always net; this only tells
   * the form to show them with VAT again when the invoice is reopened.
   */
  pricesIncludeTax?: boolean
  /** Printed without the company's signature and stamp, to be signed and stamped by hand. */
  unsigned?: boolean
  /** The client's contract this invoice bills under, printed in one line above the items. */
  contractName?: string
  contractNumber?: string
  notes?: string
  subtotal: number
  total: number
  amountPaid?: number
  amountDue?: number
  payments?: import('./document').Payment[]
  cancelReason?: string
  cancelledAt?: string
  issuedAt?: string
  sent?: boolean
  sentAt?: string
  /** Code of the link the recipient opens to see this invoice without a login. */
  shareToken?: string
  /** Each time the invoice was emailed from the app, oldest first. */
  emails?: { at: string; from: string; to: string[]; cc?: string[]; subject: string; attached?: boolean }[]
  /** Each payment reminder that covered this invoice, oldest first; `invoices` names all it covered. */
  reminders?: { at: string; from?: string; to?: string[]; cc?: string[]; subject?: string; emailed?: boolean; invoices?: string[] }[]
  /** Sending by email: scheduled, sent, failed …, apart from payment. */
  delivery?: import('./delivery').InvoiceDelivery | null
  /** What happened to the invoice on its way out and after (made, scheduled, sent, paid …), oldest first. */
  events?: import('./delivery').InvoiceEvent[]
  /** Set when a recurring plan made the invoice. */
  recurring?: import('./delivery').InvoiceRecurring
  /** What happened to the invoice after it was first saved (imported, corrected …), oldest first. */
  revisions?: { type?: string; at?: string }[]
  createdAt?: string
  updatedAt?: string
  proofUri?: string
  proofName?: string
  proofMime?: string
  proofData?: string
}

export type CompanyProfile = {
  companyName: string
  contactPerson: string
  nui: string
  vatNumber?: string
  streetAddress: string
  state: string
  zipCode: string
  email: string
  phone: string
  website?: string
  currency: string
  bankName?: string
  iban?: string
  swift?: string
  /** Legal footer on PDF. Empty string = hidden. Missing = use default. Never printed for service businesses. */
  exportNote?: string
  language?: 'sq' | 'en' | 'it'
  industry?: string
  /** Set by the mobile app: a path on that phone, useless in a browser. */
  logoUri?: string
  logoData?: string
  signatureData?: string
  stampData?: string
  invoiceTemplate?: string
  /** Empty = the template's own colour. */
  accentColor?: string
  /** Pre-filled on every new invoice. */
  defaultTaxRate?: number
  /** The invoice form asks for a contract name and number; off for companies that bill without contracts. */
  showContract?: boolean
}

export const DEFAULT_EXPORT_NOTE = 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)'

/** The export-law line is about goods leaving the country, so service businesses never print it. */
export function usesExportNote(company: Pick<CompanyProfile, 'industry'> | null | undefined) {
  return company?.industry !== 'services'
}

export function resolveExportNote(company: Pick<CompanyProfile, 'exportNote' | 'industry'> | null | undefined) {
  if (!usesExportNote(company)) return ''
  if (!company || company.exportNote === undefined || company.exportNote === null) {
    return DEFAULT_EXPORT_NOTE
  }
  return String(company.exportNote).trim()
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', ALL: 'L', MKD: 'ден' }
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'ALL', 'MKD'] as const

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] || currency || '€'
}

export function formatMoney(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount : 0
  return `${value.toFixed(2)}${currencySymbol(currency)}`
}

export function formatAmountShort(amount: number) {
  const cents = Math.round((Number(amount) || 0) * 100)
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

export function toNumber(value: unknown) {
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function generateId() {
  return crypto.randomUUID()
}

export function generateInvoiceNumber(existing: Invoice[], date = new Date()) {
  // An account whose invoices are mostly numbered 202610-008 keeps that scheme; the server applies the same rule.
  const issued = existing.filter((inv) => inv.lifecycle !== 'draft')
  const dated = issued.filter((inv) => /^\d{6}-\d+$/.test(inv.number || '')).length
  if (dated > 0 && dated * 2 > issued.length) {
    const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
    const last = issued.reduce((max, inv) => {
      const match = (inv.number || '').match(/^(\d{6})-(\d+)$/)
      return match && match[1] === period ? Math.max(max, Number(match[2]) || 0) : max
    }, 0)
    return `${period}-${String(last + 1).padStart(3, '0')}`
  }
  const prefix = MONTH_ABBR[date.getMonth()]
  const sameMonthCount = existing.filter((inv) => (inv.number || '').startsWith(`${prefix}-`)).length
  const seq = String(sameMonthCount + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

export function formatDateForInvoice(date: Date | string = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function cents(value: number) {
  return Math.round(value * 100) / 100
}

/** VAT as a percentage, 0–100. Accepts 18, "18" or a spreadsheet-style fraction such as 0.18. */
export function normalizeTaxRate(value: unknown) {
  const n = toNumber(value)
  if (n <= 0) return 0
  const percent = n < 1 ? n * 100 : n
  return Math.min(Math.round(percent * 100) / 100, 100)
}

/**
 * Line prices are net of VAT and may carry more than two decimals (a net price worked back from a
 * round gross one), so only the results are rounded. The server computes totals the same way.
 */
/**
 * The net price to store for a price typed with VAT included. Kept to 8 decimals so that
 * quantity × price × VAT comes back to exactly the amount that was typed.
 */
export function netFromGross(gross: unknown, taxRate: unknown) {
  return Math.round((toNumber(gross) / (1 + normalizeTaxRate(taxRate) / 100)) * 1e8) / 1e8
}

export function grossFromNet(net: unknown, taxRate: unknown) {
  return cents(toNumber(net) * (1 + normalizeTaxRate(taxRate) / 100))
}

export function computeTotals(items: InvoiceItem[], discount: unknown, taxRate: unknown = 0) {
  const gross = (items || []).reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0)
  const rate = normalizeTaxRate(taxRate)
  const subtotal = cents(gross)
  const net = cents(Math.max(subtotal - cents(toNumber(discount)), 0))
  const total = rate > 0 ? cents(Math.max(gross - toNumber(discount), 0) * (1 + rate / 100)) : net
  return { subtotal, net, taxRate: rate, taxAmount: cents(total - net), total }
}

export function invoiceStatus(invoice: Pick<Invoice, 'status' | 'lifecycle' | 'total' | 'payments'> | null | undefined): InvoiceStatus {
  if (!invoice) return 'unpaid'
  return paymentStatus(invoice)
}

/**
 * One line saying what an invoice is for, shown under the client in lists. An imported invoice
 * keeps its project description as the first line of its notes; any other invoice is described
 * by its first line item, with a count of the rest.
 */
export function invoiceSubject(invoice: Pick<Invoice, 'items' | 'notes' | 'revisions'> | null | undefined) {
  const firstLine = (value: unknown) =>
    String(value || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || ''
  if (invoice?.revisions?.some((entry) => entry.type === 'import')) {
    const project = firstLine(invoice.notes)
    if (project) return project
  }
  const lines = (invoice?.items || []).map((item) => firstLine(item.description)).filter(Boolean)
  if (lines.length === 0) return ''
  return lines.length > 1 ? `${lines[0]} +${lines.length - 1}` : lines[0]
}

export function uniqueClients(invoices: Invoice[]): Client[] {
  const seen = new Map<string, Client>()
  for (const item of invoices) {
    const name = item.client?.fullName?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, item.client)
  }
  return [...seen.values()]
}

export function clientKey(name: string | null | undefined) {
  return String(name || '')
    .trim()
    .toLowerCase()
}

/** The calendar year an invoice belongs to, read from its free-text date. */
export function invoiceYear(invoice: Pick<Invoice, 'date' | 'createdAt'>) {
  const date = parseLooseDate(invoice.date) || parseLooseDate(invoice.createdAt)
  return date ? date.getFullYear() : null
}

export function sortInvoicesChronologically(invoices: Invoice[]) {
  return [...invoices].sort((a, b) => {
    // Invoice dates are free text (05.01.2026, JAN 5, 2026 …); Date.parse would read the first as 1 May.
    const ta = parseLooseDate(a.date)?.getTime() || Date.parse(a.createdAt || '') || 0
    const tb = parseLooseDate(b.date)?.getTime() || Date.parse(b.createdAt || '') || 0
    if (ta !== tb) return ta - tb
    return String(a.number || '').localeCompare(String(b.number || ''))
  })
}

export type ClientUnpaidSummary = {
  client: Client
  unpaid: Invoice[]
  unpaidCount: number
  unpaidTotal: number
  paidTotal: number
}

export function clientUnpaidSummaries(invoices: Invoice[]): ClientUnpaidSummary[] {
  const groups = new Map<string, ClientUnpaidSummary>()
  for (const inv of invoices) {
    const name = inv.client?.fullName?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = { client: inv.client, unpaid: [], unpaidCount: 0, unpaidTotal: 0, paidTotal: 0 }
      groups.set(key, group)
    }
    const total = remainingOf(inv)
    if (invoiceStatus(inv) === 'paid') {
      group.paidTotal += Number(inv.total) || 0
    } else if (invoiceStatus(inv) !== 'cancelled' && invoiceStatus(inv) !== 'draft') {
      group.unpaid.push(inv)
      group.unpaidCount += 1
      group.unpaidTotal += total
    }
  }
  return [...groups.values()]
    .filter((group) => group.unpaid.length > 0)
    .map((group) => ({ ...group, unpaid: sortInvoicesChronologically(group.unpaid) }))
    .sort((a, b) => a.client.fullName.localeCompare(b.client.fullName))
}

/**
 * Every issued invoice of the same client that still has something owed, oldest first: what one
 * payment reminder to that client covers. The client is matched by id, or by name without one.
 */
export function owedInvoicesOfClient(invoices: Invoice[], invoice: Invoice) {
  const idOf = (inv: Invoice) => inv.clientId || inv.client?.id || ''
  const nameOf = (inv: Invoice) => String(inv.client?.fullName || '').trim().toLowerCase()
  const same = (inv: Invoice) => (idOf(inv) && idOf(invoice) ? idOf(inv) === idOf(invoice) : Boolean(nameOf(inv)) && nameOf(inv) === nameOf(invoice))
  return sortInvoicesChronologically(invoices.filter((inv) => same(inv) && remainingOf(inv) > 0))
}

/** A stored moment as "13.10.2026, 16:05"; empty when there is none. */
export function formatStamp(value?: string) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** When this invoice was last covered by a payment reminder; empty if never. */
export function lastReminderTime(invoice: Pick<Invoice, 'reminders'>) {
  return formatStamp(invoice.reminders?.[invoice.reminders.length - 1]?.at)
}

export type ClientMoney = {
  invoiced: { currency: string; amount: number }[]
  paid: { currency: string; amount: number }[]
  invoicedSum: number
  paidSum: number
}

/**
 * What each client has been invoiced and has paid, over issued invoices (drafts and cancelled
 * ones do not count). Keyed by client id; an invoice that carries no client id is matched to
 * the client of the same name.
 */
export function clientMoneyTotals(clients: { id: string; fullName?: string }[], invoices: Invoice[]) {
  const idByName = new Map<string, string>()
  for (const client of clients) {
    const name = String(client.fullName || '').trim().toLowerCase()
    if (name && !idByName.has(name)) idByName.set(name, client.id)
  }
  const groups = new Map<string, Invoice[]>()
  for (const inv of invoices) {
    const id = inv.clientId || inv.client?.id || idByName.get(String(inv.client?.fullName || '').trim().toLowerCase())
    if (!id) continue
    const group = groups.get(id)
    if (group) group.push(inv)
    else groups.set(id, [inv])
  }
  const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100
  const totals = new Map<string, ClientMoney>()
  for (const [id, list] of groups) {
    const invoiced = totalsByCurrency(list, (inv) => documentTotals(inv).total)
    const paid = totalsByCurrency(list, (inv) => Math.round((documentTotals(inv).total - remainingOf(inv)) * 100) / 100)
    totals.set(id, { invoiced, paid, invoicedSum: sum(invoiced), paidSum: sum(paid) })
  }
  return totals
}

export function formatStatementFileDate(date: Date | string = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

export function statementFileName(clientName: string, date: Date | string = new Date()) {
  const cleaned =
    String(clientName || 'client')
      .trim()
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 60) || 'client'
  return `${cleaned}-${formatStatementFileDate(date)}.pdf`
}

export function draftFromInvoice(source: Invoice, existing: Invoice[]): Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    number: generateInvoiceNumber(existing),
    date: formatDateForInvoice(new Date()),
    dueDate: source.dueDate || '',
    status: 'unpaid',
    client: { ...source.client },
    items: (source.items || []).map((item) => ({ ...item, id: generateId() })),
    discount: source.discount,
    taxRate: source.taxRate || 0,
    pricesIncludeTax: Boolean(source.pricesIncludeTax),
    unsigned: Boolean(source.unsigned),
    contractName: source.contractName || '',
    contractNumber: source.contractNumber || '',
    notes: source.notes || '',
    subtotal: source.subtotal,
    total: source.total,
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function statementItemRows(invoices: Invoice[], currency: string, pdfLabels: Record<string, string>) {
  return invoices
    .flatMap((inv) => {
      const items =
        inv.items && inv.items.length > 0
          ? inv.items
          : [{ id: '1', description: inv.number, quantity: 1, unitPrice: inv.total }]
      const rows = items.map((item, index) => {
        const qty = toNumber(item.quantity)
        const unit = toNumber(item.unitPrice)
        const orderCell =
          index === 0
            ? `<strong>${escapeHtml(inv.number)}</strong><br/><span class="muted">${escapeHtml(inv.date)}</span>`
            : ''
        return `<tr>
          <td class="order">${orderCell}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="right">${formatMoney(unit, currency)}</td>
          <td class="center">${escapeHtml(item.quantity)}</td>
          <td class="right">${formatMoney(qty * unit, currency)}</td>
        </tr>`
      })
      if (toNumber(inv.discount) > 0) {
        rows.push(`<tr>
          <td></td>
          <td>${escapeHtml(pdfLabels.discount)}</td>
          <td></td>
          <td></td>
          <td class="right">-${formatMoney(toNumber(inv.discount), currency)}</td>
        </tr>`)
      }
      const vat = computeTotals(items, inv.discount, inv.taxRate)
      if (vat.taxAmount > 0) {
        rows.push(`<tr>
          <td></td>
          <td>${escapeHtml(pdfLabels.vat || 'VAT')} ${vat.taxRate}%</td>
          <td></td>
          <td></td>
          <td class="right">${formatMoney(vat.taxAmount, currency)}</td>
        </tr>`)
      }
      return rows
    })
    .join('')
}

export function buildStatementHtml({
  company,
  client,
  invoices,
  paidTotal,
  issuedDate,
  pdfLabels,
  showPayments = false,
}: {
  company: CompanyProfile
  client: Client
  invoices: Invoice[]
  paidTotal?: number
  issuedDate?: string
  pdfLabels: Record<string, string>
  showPayments?: boolean
}) {
  const currency = company.currency || 'EUR'
  const symbol = currencySymbol(currency)
  const exportNote = resolveExportNote(company)
  const unpaidTotal = invoices.reduce((sum, inv) => sum + remainingOf(inv), 0)
  const payments = Number(paidTotal) || 0
  const dateLabel = issuedDate || formatStatementFileDate(new Date())
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ')
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel
  const rows = statementItemRows(invoices, currency, pdfLabels)

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block { min-width: 0; flex: 1; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p, .client-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; flex-shrink: 0; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 20px; letter-spacing: 1.5px; color: #2C6E7F; }
      .invoice-meta p { margin: 2px 0; }
      .blocks { margin-bottom: 18px; }
      .block-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; vertical-align: top; word-break: break-word; }
      th.center, td.center { text-align: center; width: 8%; }
      th.right, td.right { text-align: right; white-space: nowrap; width: 14%; }
      td.order, th.order { width: 18%; white-space: normal; }
      .muted { color: #6B7A7D; font-size: 10px; }
      .totals { width: 280px; margin-left: auto; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .total-row { font-weight: 700; font-size: 16px; border-top: 2px solid #2C6E7F; margin-top: 4px; padding-top: 8px; color: #1F4E5A; }
      .payment { margin-top: 20px; font-size: 12px; color: #444; }
      .thank-you { text-align: center; margin-top: 28px; font-size: 13px; color: #2C6E7F; font-weight: 600; }
      .export-law { text-align: center; margin-top: 8px; font-size: 13px; font-weight: 700; color: #1D2B2E; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
        ${company.streetAddress ? `<p>${escapeHtml(company.streetAddress)}</p>` : ''}
        ${cityLine ? `<p>${escapeHtml(cityLine)}</p>` : ''}
        ${company.nui ? `<p>${escapeHtml(nuiLabel)} ${escapeHtml(company.nui)}</p>` : ''}
        ${company.email ? `<p>${escapeHtml(company.email)}</p>` : ''}
        ${company.phone ? `<p>${escapeHtml(company.phone)}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>${escapeHtml(pdfLabels.statementTitle || 'PREVENTIVI')}</h2>
        <p>${escapeHtml(pdfLabels.dateLabel)}: ${escapeHtml(dateLabel)}</p>
      </div>
    </div>
    <div class="blocks">
      <div class="client-block">
        <div class="block-title">${escapeHtml(pdfLabels.billedTo || pdfLabels.clientLabel)}</div>
        <p><strong>${escapeHtml(client.fullName)}</strong></p>
        ${client.address ? `<p>${escapeHtml(client.address)}</p>` : ''}
        ${client.phone ? `<p>${escapeHtml(client.phone)}</p>` : ''}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="order">${escapeHtml(pdfLabels.order || pdfLabels.invoiceLabel)}</th>
          <th>${escapeHtml(pdfLabels.patientService || pdfLabels.description)}</th>
          <th class="right">${escapeHtml(pdfLabels.unitPrice || pdfLabels.unit)} (${symbol})</th>
          <th class="center">${escapeHtml(pdfLabels.qty || pdfLabels.quantity)}</th>
          <th class="right">${escapeHtml(pdfLabels.sum)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>${escapeHtml(pdfLabels.ordersTotal)}</span><span>${formatMoney(unpaidTotal, currency)}</span></div>
      ${showPayments ? `<div><span>${escapeHtml(pdfLabels.paymentsTotal)}</span><span>${formatMoney(payments, currency)}</span></div>` : ''}
      <div class="total-row"><span>${escapeHtml(showPayments ? pdfLabels.balanceDue : pdfLabels.total)}</span><span>${formatMoney(unpaidTotal, currency)}</span></div>
    </div>
    ${company.bankName || company.iban ? `<div class="payment"><div class="block-title">${escapeHtml(pdfLabels.paymentInfo)}</div>${company.bankName ? `<p>${escapeHtml(pdfLabels.bankName)}: ${escapeHtml(company.bankName)}</p>` : ''}${company.iban ? `<p>${escapeHtml(pdfLabels.ibanLabel)}: ${escapeHtml(company.iban)}</p>` : ''}</div>` : ''}
    <div class="thank-you">${escapeHtml(pdfLabels.thankYou)}</div>
    ${exportNote ? `<div class="export-law">${escapeHtml(exportNote)}</div>` : ''}
  </body>
  </html>`
}

export function downloadHtmlAsPdf(html: string, filename: string) {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    throw new Error('Could not open print preview.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  const title = doc.querySelector('title')
  if (title) title.textContent = filename
  else {
    const el = doc.createElement('title')
    el.textContent = filename
    doc.head.appendChild(el)
  }
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => document.body.removeChild(frame), 1000)
  }, 250)
}

export function listReportFileName(prefix: string, kind: 'all' | 'paid' | 'unpaid' = 'all', date: Date | string = new Date()) {
  const slug = kind === 'paid' ? 'paguara' : kind === 'unpaid' ? 'papaguara' : 'lista'
  return `${prefix}-${slug}-${formatStatementFileDate(date)}.pdf`
}

export function paidObligationsFileName(date: Date | string = new Date()) {
  return listReportFileName('detyrimet', 'paid', date)
}

export function invoiceListFileName(kind: 'all' | 'paid' | 'unpaid' = 'all', date: Date | string = new Date()) {
  return listReportFileName('faturat', kind, date)
}

export function obligationsListFileName(kind: 'all' | 'paid' | 'unpaid' = 'paid', date: Date | string = new Date()) {
  return listReportFileName('detyrimet', kind, date)
}

export function buildPaidObligationsHtml({
  company,
  obligations,
  issuedDate,
  pdfLabels,
}: {
  company: CompanyProfile
  obligations: Array<{
    vendor: string
    notes?: string
    description?: string
    date?: string
    amount?: number
    proofName?: string
    proofUri?: string
    proofData?: string
  }>
  issuedDate?: string
  pdfLabels: Record<string, string>
}) {
  const currency = company.currency || 'EUR'
  const dateLabel = issuedDate || formatStatementFileDate(new Date())
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ')
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel
  const total = obligations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const rows = obligations
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.vendor)}</td>
        <td>${escapeHtml(item.notes || item.description || '')}</td>
        <td>${escapeHtml(item.date || '')}</td>
        <td class="center">${item.proofName || item.proofData || item.proofUri ? escapeHtml(pdfLabels.proofYes || 'Yes') : escapeHtml(pdfLabels.proofNo || '—')}</td>
        <td class="right">${formatMoney(Number(item.amount) || 0, currency)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      th.center, td.center { text-align: center; }
      .totals { width: 240px; margin-left: auto; font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; border-top: 2px solid #2C6E7F; padding-top: 8px; color: #1F4E5A; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
        ${company.streetAddress ? `<p>${escapeHtml(company.streetAddress)}</p>` : ''}
        ${cityLine ? `<p>${escapeHtml(cityLine)}</p>` : ''}
        ${company.nui ? `<p>${escapeHtml(nuiLabel)} ${escapeHtml(company.nui)}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>${escapeHtml(pdfLabels.paidObligationsTitle || 'Paid')}</h2>
        <p>${escapeHtml(pdfLabels.dateLabel)}: ${escapeHtml(dateLabel)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(pdfLabels.vendor || 'Vendor')}</th>
          <th>${escapeHtml(pdfLabels.description)}</th>
          <th>${escapeHtml(pdfLabels.dateLabel)}</th>
          <th class="center">${escapeHtml(pdfLabels.proofLabel || 'Proof')}</th>
          <th class="right">${escapeHtml(pdfLabels.sum)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals"><span>${escapeHtml(pdfLabels.total)}</span><span>${formatMoney(total, currency)}</span></div>
  </body>
  </html>`
}

export function buildInvoiceListHtml({
  company,
  invoices,
  issuedDate,
  pdfLabels,
}: {
  company: CompanyProfile
  invoices: Array<{
    number?: string
    date?: string
    status?: string
    lifecycle?: string
    total?: number
    amountDue?: number
    payments?: import('./document').Payment[]
    currency?: string
    client?: { fullName?: string }
  }>
  issuedDate?: string
  pdfLabels: Record<string, string>
}) {
  const currency = company.currency || 'EUR'
  const dateLabel = issuedDate || formatStatementFileDate(new Date())
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ')
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel
  const total = invoices.reduce((sum, item) => {
    if (item.status === 'cancelled' || item.lifecycle === 'cancelled') return sum
    return sum + remainingOf(item as Invoice)
  }, 0)
  const rows = invoices
    .map((item) => {
      const status = paymentStatus(item as Invoice)
      const statusLabel =
        status === 'paid'
          ? pdfLabels.statusPaid || 'Paid'
          : status === 'partial'
            ? pdfLabels.statusPartial || 'Partial'
            : status === 'cancelled'
              ? pdfLabels.statusCancelled || 'Cancelled'
              : status === 'draft'
                ? pdfLabels.statusDraft || 'Draft'
                : pdfLabels.statusUnpaid || 'Unpaid'
      const amount = Number(item.total) || 0
      return `<tr>
        <td>${escapeHtml(item.number || '')}</td>
        <td>${escapeHtml(item.client?.fullName || '')}</td>
        <td>${escapeHtml(item.date || '')}</td>
        <td>${escapeHtml(statusLabel)}</td>
        <td class="right">${formatMoney(amount, item.currency || currency)}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      .totals { width: 240px; margin-left: auto; font-weight: 700; font-size: 16px; display: flex; justify-content: space-between; border-top: 2px solid #2C6E7F; padding-top: 8px; color: #1F4E5A; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
        ${company.streetAddress ? `<p>${escapeHtml(company.streetAddress)}</p>` : ''}
        ${cityLine ? `<p>${escapeHtml(cityLine)}</p>` : ''}
        ${company.nui ? `<p>${escapeHtml(nuiLabel)} ${escapeHtml(company.nui)}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>${escapeHtml(pdfLabels.listTitle || pdfLabels.statementTitle || 'List')}</h2>
        <p>${escapeHtml(pdfLabels.dateLabel)}: ${escapeHtml(dateLabel)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(pdfLabels.invoiceLabel)}</th>
          <th>${escapeHtml(pdfLabels.clientLabel)}</th>
          <th>${escapeHtml(pdfLabels.dateLabel)}</th>
          <th>${escapeHtml(pdfLabels.statusLabel || '')}</th>
          <th class="right">${escapeHtml(pdfLabels.sum)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals"><span>${escapeHtml(pdfLabels.total)}</span><span>${formatMoney(total, currency)}</span></div>
  </body>
  </html>`
}

export function overviewFileName(date: Date | string = new Date()) {
  return `pasqyra-${formatStatementFileDate(date)}.pdf`
}

export function buildOverviewHtml({
  company,
  report,
  periodText,
  issuedDate,
  pdfLabels,
  notes = [],
}: {
  company: CompanyProfile
  report: {
    currency: string
    invoiced: number
    paymentsReceived: number
    obligationsRecorded: number
    paymentsMade: number
    receivables: number
    payables: number
    netPayments: number
    period: { endIso?: string }
    customers: Array<{ client?: { fullName?: string }; amount: number }>
    overduePayables: Array<{ vendor?: string; dueDate?: string; amountDueAsOf?: number; daysOverdueAsOf?: number }>
  }
  periodText: string
  issuedDate?: string
  pdfLabels: Record<string, string>
  notes?: string[]
}) {
  const currency = report.currency || company.currency || 'EUR'
  const dateLabel = issuedDate || formatStatementFileDate(new Date())
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ')
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel
  const summaryRows = [
    [pdfLabels.invoiced, report.invoiced],
    [pdfLabels.received, report.paymentsReceived],
    [pdfLabels.obligationsRecorded, report.obligationsRecorded],
    [pdfLabels.paidOut, report.paymentsMade],
    [pdfLabels.receivables, report.receivables],
    [pdfLabels.payables, report.payables],
    [pdfLabels.netPayments, report.netPayments],
  ]
    .map(
      ([label, amount]) =>
        `<tr><td>${escapeHtml(String(label))}</td><td class="right">${formatMoney(Number(amount) || 0, currency)}</td></tr>`,
    )
    .join('')
  const customerRows = (report.customers || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.client?.fullName || '')}</td><td class="right">${formatMoney(item.amount, currency)}</td></tr>`,
    )
    .join('')
  const overdueRows = (report.overduePayables || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.vendor || '')}</td><td>${escapeHtml(item.dueDate || '')}</td><td class="right">${formatMoney(item.amountDueAsOf || 0, currency)}</td></tr>`,
    )
    .join('')
  const noteBlock = notes.length
    ? `<div class="notes"><div class="block-title">${escapeHtml(pdfLabels.limitationTitle || '')}</div>${notes
        .map((note) => `<p>${escapeHtml(note)}</p>`)
        .join('')}</div>`
    : ''

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 20px; font-size: 12px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 18px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; text-transform: uppercase; }
      .company-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 18px; color: #2C6E7F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 6px 7px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 11px; }
      th.right, td.right { text-align: right; }
      h3 { margin: 18px 0 8px; font-size: 13px; color: #1F4E5A; text-transform: uppercase; letter-spacing: 0.04em; }
      .notes { margin-top: 16px; padding: 10px 12px; background: #F8E8E4; border-radius: 8px; }
      .notes p { margin: 4px 0; color: #7A3B2E; }
      .block-title { font-weight: 700; margin-bottom: 6px; }
      .hint { color: #6B7A7D; margin: 0 0 12px; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
        ${company.streetAddress ? `<p>${escapeHtml(company.streetAddress)}</p>` : ''}
        ${cityLine ? `<p>${escapeHtml(cityLine)}</p>` : ''}
        ${company.nui ? `<p>${escapeHtml(nuiLabel)} ${escapeHtml(company.nui)}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>${escapeHtml(pdfLabels.pdfTitle || pdfLabels.listTitle || 'Overview')}</h2>
        <p>${escapeHtml(pdfLabels.period || '')}: ${escapeHtml(periodText)}</p>
        <p>${escapeHtml(pdfLabels.asOf || '')}: ${escapeHtml(report.period?.endIso || dateLabel)}</p>
        <p>${escapeHtml(pdfLabels.dateLabel)}: ${escapeHtml(dateLabel)}</p>
        <p>${escapeHtml(currency)}</p>
      </div>
    </div>
    <p class="hint">${escapeHtml(pdfLabels.netHint || '')}</p>
    <table>
      <thead><tr><th>${escapeHtml(pdfLabels.summary || '')}</th><th class="right">${escapeHtml(pdfLabels.sum)}</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
    <h3>${escapeHtml(pdfLabels.customers || '')}</h3>
    <table>
      <thead><tr><th>${escapeHtml(pdfLabels.clientLabel)}</th><th class="right">${escapeHtml(pdfLabels.sum)}</th></tr></thead>
      <tbody>${customerRows || `<tr><td colspan="2">${escapeHtml(pdfLabels.empty || '')}</td></tr>`}</tbody>
    </table>
    <h3>${escapeHtml(pdfLabels.overdue || '')}</h3>
    <table>
      <thead><tr><th>${escapeHtml(pdfLabels.vendor || '')}</th><th>${escapeHtml(pdfLabels.dateLabel)}</th><th class="right">${escapeHtml(pdfLabels.sum)}</th></tr></thead>
      <tbody>${overdueRows || `<tr><td colspan="3">${escapeHtml(pdfLabels.empty || '')}</td></tr>`}</tbody>
    </table>
    ${noteBlock}
  </body>
  </html>`
}
