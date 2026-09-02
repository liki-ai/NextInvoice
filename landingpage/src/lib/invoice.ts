export type Client = { fullName: string; address: string; phone: string }

export type InvoiceItem = {
  id: string
  description: string
  quantity: string | number
  unitPrice: string | number
}

export type Invoice = {
  id: string
  number: string
  date: string
  client: Client
  items: InvoiceItem[]
  discount: string | number
  notes?: string
  subtotal: number
  total: number
  createdAt?: string
  updatedAt?: string
}

export type CompanyProfile = {
  companyName: string
  contactPerson: string
  nui: string
  streetAddress: string
  state: string
  zipCode: string
  email: string
  phone: string
  currency: string
  language?: 'sq' | 'en'
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] || currency || '€'
}

export function formatMoney(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount : 0
  return `${value.toFixed(2)}${currencySymbol(currency)}`
}

export function toNumber(value: unknown) {
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function generateId() {
  return crypto.randomUUID()
}

export function generateInvoiceNumber(existing: Invoice[], date = new Date()) {
  const prefix = MONTH_ABBR[date.getMonth()]
  const sameMonthCount = existing.filter((inv) => (inv.number || '').startsWith(`${prefix}-`)).length
  const seq = String(sameMonthCount + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

export function formatDateForInvoice(date: Date | string = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function computeTotals(items: InvoiceItem[], discount: unknown) {
  const subtotal = (items || []).reduce(
    (sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice),
    0,
  )
  const total = Math.max(subtotal - toNumber(discount), 0)
  return { subtotal, total }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildInvoiceHtml({
  company,
  client,
  invoice,
  pdfLabels,
}: {
  company: CompanyProfile
  client: Client
  invoice: Pick<Invoice, 'number' | 'date' | 'items' | 'discount' | 'notes'>
  pdfLabels: Record<string, string>
}) {
  const items = invoice.items || []
  const { subtotal, total } = computeTotals(items, invoice.discount)
  const symbol = currencySymbol(company.currency)
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${escapeHtml(item.quantity)}</td>
          <td class="right">${formatMoney(toNumber(item.unitPrice), company.currency)}</td>
          <td class="right">${formatMoney(toNumber(item.quantity) * toNumber(item.unitPrice), company.currency)}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1D2B2E; padding: 32px; font-size: 13px; }
      .top-row { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2C6E7F; padding-bottom: 16px; margin-bottom: 20px; }
      .company-block h1 { margin: 0 0 6px 0; font-size: 20px; color: #1F4E5A; }
      .company-block p, .client-block p { margin: 2px 0; color: #444; }
      .invoice-meta { text-align: right; }
      .invoice-meta h2 { margin: 0 0 8px 0; font-size: 26px; letter-spacing: 2px; color: #2C6E7F; }
      .invoice-meta p { margin: 2px 0; }
      .blocks { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
      .block-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td { padding: 8px 10px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 12px; }
      th.center, td.center { text-align: center; }
      th.right, td.right { text-align: right; }
      .totals { width: 260px; margin-left: auto; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .total-row { font-weight: 700; font-size: 16px; border-top: 2px solid #2C6E7F; margin-top: 4px; padding-top: 8px; color: #1F4E5A; }
      .notes { margin-top: 20px; font-size: 12px; color: #555; white-space: pre-wrap; }
      .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
      .signature { width: 45%; text-align: center; border-top: 1px solid #999; padding-top: 6px; font-size: 12px; color: #555; }
      .thank-you { text-align: center; margin-top: 30px; font-size: 13px; color: #2C6E7F; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
        ${company.nui ? `<p>${escapeHtml(pdfLabels.nuiLabel)}: ${escapeHtml(company.nui)}</p>` : ''}
        <p>${escapeHtml(company.streetAddress)}</p>
        <p>${escapeHtml(company.state)} ${escapeHtml(company.zipCode)}</p>
        <p>${escapeHtml(company.email)}</p>
        <p>${escapeHtml(company.phone)}</p>
      </div>
      <div class="invoice-meta">
        <h2>INVOICE</h2>
        <p>${escapeHtml(pdfLabels.invoiceLabel)}: ${escapeHtml(invoice.number)}</p>
        <p>${escapeHtml(pdfLabels.dateLabel)}: ${escapeHtml(invoice.date)}</p>
      </div>
    </div>
    <div class="blocks">
      <div class="client-block">
        <div class="block-title">${escapeHtml(pdfLabels.clientLabel)}</div>
        <p><strong>${escapeHtml(client.fullName)}</strong></p>
        <p>${escapeHtml(client.address)}</p>
        <p>${escapeHtml(client.phone)}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(pdfLabels.description)}</th>
          <th class="center">${escapeHtml(pdfLabels.quantity)}</th>
          <th class="right">${escapeHtml(pdfLabels.unit)} (${symbol})</th>
          <th class="right">${escapeHtml(pdfLabels.sum)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>${escapeHtml(pdfLabels.subtotal)}</span><span>${formatMoney(subtotal, company.currency)}</span></div>
      <div><span>${escapeHtml(pdfLabels.discount)}</span><span>${formatMoney(toNumber(invoice.discount), company.currency)}</span></div>
      <div class="total-row"><span>${escapeHtml(pdfLabels.total)}</span><span>${formatMoney(total, company.currency)}</span></div>
    </div>
    ${invoice.notes ? `<div class="notes">${escapeHtml(invoice.notes)}</div>` : ''}
    <div class="thank-you">${escapeHtml(pdfLabels.thankYou)}</div>
    <div class="signatures">
      <div class="signature">${escapeHtml(company.contactPerson)}<br/>${escapeHtml(pdfLabels.issuedBy)}</div>
      <div class="signature">${escapeHtml(client.fullName)}<br/>${escapeHtml(pdfLabels.receivedBy)}</div>
    </div>
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
