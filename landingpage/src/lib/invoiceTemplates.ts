import { paymentStatus, remainingOf } from './document'
import { computeTotals, currencySymbol, resolveExportNote, toNumber, type Client, type CompanyProfile, type Invoice } from './invoice'

export const INVOICE_TEMPLATES = ['classic', 'corporate', 'minimal'] as const
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATES)[number]

export const TEMPLATE_ACCENT: Record<InvoiceTemplateId, string> = {
  classic: '#2C6E7F',
  corporate: '#2E75B6',
  minimal: '#1D2B2E',
}

export const ACCENT_SWATCHES = ['#2C6E7F', '#2E75B6', '#1D2B2E', '#6B4FA0', '#B4532A', '#2E7D32', '#A67C00']

export function normalizeTemplate(value?: string | null): InvoiceTemplateId {
  return INVOICE_TEMPLATES.includes(value as InvoiceTemplateId) ? (value as InvoiceTemplateId) : 'classic'
}

export function isHexColor(value?: string | null): value is string {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ''))
}

export function resolveAccent(template: InvoiceTemplateId, accentColor?: string | null) {
  return isHexColor(accentColor) ? accentColor : TEMPLATE_ACCENT[template]
}

type PdfInvoice = Pick<
  Invoice,
  'number' | 'date' | 'dueDate' | 'items' | 'discount' | 'taxRate' | 'notes' | 'amountDue' | 'amountPaid' | 'payments' | 'lifecycle' | 'status' | 'companySnapshot' | 'clientSnapshot' | 'currency' | 'unsigned'
>

export type InvoiceHtmlInput = {
  company: CompanyProfile
  client: Client
  invoice: PdfInvoice
  pdfLabels: Record<string, string>
  /** Overrides the template saved on the company profile (used by the template picker). */
  template?: InvoiceTemplateId
  accentColor?: string
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function channels(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Blend a colour towards white. `white` is 0 (unchanged) to 1 (white). */
function tint(hex: string, white: number) {
  return `#${channels(hex)
    .map((c) => Math.round(c + (255 - c) * white).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Blend a colour towards black. `black` is 0 (unchanged) to 1 (black). */
function shade(hex: string, black: number) {
  return `#${channels(hex)
    .map((c) => Math.round(c * (1 - black)).toString(16).padStart(2, '0'))
    .join('')}`
}

function inkOn(hex: string) {
  const [r, g, b] = channels(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#1D2B2E' : '#FFFFFF'
}

function grouped(value: number) {
  const n = Number.isFinite(value) ? value : 0
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function imageSrc(value?: string | null) {
  const src = String(value || '')
  return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : ''
}

type View = ReturnType<typeof buildView>

function buildView({ company, client, invoice, pdfLabels, template, accentColor }: InvoiceHtmlInput) {
  const templateId = template || normalizeTemplate(company.invoiceTemplate)
  const accent = resolveAccent(templateId, accentColor ?? company.accentColor)
  const items = invoice.items || []
  const { subtotal, total, taxRate, taxAmount } = computeTotals(items, invoice.discount, invoice.taxRate)
  const due = remainingOf(invoice)
  const paid = due === 0 && paymentStatus(invoice) !== 'draft' ? total : total - due
  const symbol = currencySymbol(invoice.currency || company.currency)
  const money = (value: number) => `${grouped(value)} ${symbol}`
  const cityLine = [company.state, company.zipCode].map((part) => String(part || '').trim()).filter(Boolean).join(', ')

  return {
    templateId,
    accent,
    accentInk: inkOn(accent),
    L: pdfLabels,
    company,
    client,
    invoice,
    symbol,
    money,
    cityLine,
    rows: items.map((item, index) => ({
      index: index + 1,
      description: item.description,
      quantity: item.quantity,
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.quantity) * toNumber(item.unitPrice),
    })),
    subtotal,
    discount: toNumber(invoice.discount),
    taxRate,
    taxAmount,
    total,
    paid,
    due,
    showBalance: due > 0 && due < total,
    dueText: invoice.dueDate || pdfLabels.onReceipt || '',
    exportNote: resolveExportNote(company),
    logo: imageSrc(company.logoData),
    // Printed to be signed and stamped by hand: neither image goes on the page.
    signature: invoice.unsigned ? '' : imageSrc(company.signatureData),
    stamp: invoice.unsigned ? '' : imageSrc(company.stampData),
    hasPayment: Boolean(company.bankName || company.iban || company.swift),
  }
}

function baseCss(font: string) {
  return `
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; background: #fff; color: #1D2B2E; font-family: ${font}; font-size: 12px; line-height: 1.45; }
    .page { padding: 32px; }
    p { margin: 0; }
    table { border-collapse: collapse; }
    thead { display: table-header-group; }
    tr, .keep { break-inside: avoid; page-break-inside: avoid; }
    .right { text-align: right; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .pre { white-space: pre-wrap; }
    @page { size: A4; margin: 12mm; }
    @media print { .page { padding: 0; } }
  `
}

function shell(v: View, font: string, css: string, body: string) {
  return `<!DOCTYPE html>
<html lang="sq">
<head>
<meta charset="utf-8" />
<title>${esc(v.invoice.number)}</title>
<style>${baseCss(font)}${css}</style>
</head>
<body><div class="page">${body}</div></body>
</html>`
}

function paymentRows(v: View) {
  const { company, L } = v
  return [
    company.bankName ? [L.bankName, company.bankName] : null,
    company.swift ? [L.swiftLabel || 'SWIFT (BIC)', company.swift] : null,
    company.iban ? [L.ibanLabel, company.iban] : null,
  ].filter(Boolean) as string[][]
}

function clientLines(v: View) {
  const { client, L } = v
  return [
    client.address,
    client.businessId ? `${L.nuiLabel}: ${client.businessId}` : '',
    client.fiscalNumber ? `${L.fiscalLabel || 'Fiscal No'}: ${client.fiscalNumber}` : '',
    client.vatNumber ? `${L.vatLabel || 'VAT'}: ${client.vatNumber}` : '',
    client.phone,
    client.email,
  ].filter((line) => String(line || '').trim())
}

/** The client's details as label and value, for a layout that keeps the labels in a column of their own. */
function clientRows(v: View): [string, string][] {
  const { client, L } = v
  const rows: [string, string | undefined][] = [
    [L.addressLabel, client.address],
    [L.nuiLabel, client.businessId],
    [L.fiscalLabel || 'Fiscal No', client.fiscalNumber],
    [L.vatLabel || 'VAT', client.vatNumber],
    ['', client.phone],
    ['', client.email],
  ]
  return rows.filter(([, value]) => String(value || '').trim()) as [string, string][]
}

/* ------------------------------------------------------------------ classic */

function classicTemplate(v: View) {
  const { company, client, invoice, L, accent, money } = v
  const dark = shade(accent, 0.28)
  const css = `
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 3px solid ${accent}; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
    .logo { height: 64px; max-width: 150px; object-fit: contain; flex-shrink: 0; }
    .brand h1 { margin: 0 0 6px; font-size: 20px; color: ${dark}; }
    .brand p, .client p { margin: 2px 0; color: #444; }
    .meta { text-align: right; flex-shrink: 0; }
    .meta h2 { margin: 0 0 8px; font-size: 26px; letter-spacing: 2px; color: ${accent}; }
    .meta p { margin: 2px 0; }
    .client { margin-bottom: 22px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6B7A7D; margin-bottom: 6px; }
    .items { width: 100%; margin-bottom: 16px; }
    .items thead tr { background: ${accent}; color: ${v.accentInk}; }
    .items th, .items td { padding: 8px 10px; border-bottom: 1px solid #E1E6E7; text-align: left; font-size: 12px; vertical-align: top; }
    .items th.right, .items td.right { text-align: right; }
    .items th.center, .items td.center { text-align: center; }
    .totals { width: 270px; margin-left: auto; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals .grand { font-weight: 700; font-size: 16px; border-top: 2px solid ${accent}; margin-top: 4px; padding-top: 8px; color: ${dark}; }
    .notes { margin-top: 20px; color: #555; }
    .payment { margin-top: 20px; color: #444; }
    .payment p { margin: 2px 0; }
    .thanks { text-align: center; margin-top: 30px; font-size: 13px; color: ${accent}; font-weight: 600; }
    .law { text-align: center; margin-top: 8px; font-size: 13px; font-weight: 700; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 48px; }
    .sign { width: 38%; text-align: center; font-size: 12px; color: #555; }
    .sign .ink { height: 46px; display: flex; align-items: flex-end; justify-content: center; }
    .sign .ink img { max-height: 46px; max-width: 160px; }
    .sign .line { border-top: 1px solid #999; padding-top: 6px; }
    .stamp { width: 20%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
  `
  const body = `
    <div class="top">
      <div class="brand">
        ${v.logo ? `<img class="logo" src="${v.logo}" alt="" />` : ''}
        <div>
          <h1>${esc(company.companyName)}</h1>
          ${company.nui ? `<p>${esc(L.nuiLabel)}: ${esc(company.nui)}</p>` : ''}
          ${company.vatNumber ? `<p>${esc(L.vatLabel || 'VAT')}: ${esc(company.vatNumber)}</p>` : ''}
          ${company.streetAddress ? `<p>${esc(company.streetAddress)}</p>` : ''}
          ${v.cityLine ? `<p>${esc(v.cityLine)}</p>` : ''}
          ${company.email ? `<p>${esc(company.email)}</p>` : ''}
          ${company.phone ? `<p>${esc(company.phone)}</p>` : ''}
          ${company.website ? `<p>${esc(company.website)}</p>` : ''}
        </div>
      </div>
      <div class="meta">
        <h2>${esc(L.invoiceTitle || 'INVOICE')}</h2>
        <p>${esc(L.invoiceLabel)}: <strong>${esc(invoice.number)}</strong></p>
        <p>${esc(L.dateLabel)}: ${esc(invoice.date)}</p>
        <p>${esc(L.dueDateLabel)}: ${esc(v.dueText)}</p>
      </div>
    </div>
    <div class="client">
      <div class="label">${esc(L.clientLabel)}</div>
      <p><strong>${esc(L.fullNameLabel)}:</strong> ${esc(client.fullName)}</p>
      ${client.address ? `<p><strong>${esc(L.addressLabel)}:</strong> ${esc(client.address)}</p>` : ''}
      ${client.businessId ? `<p><strong>${esc(L.nuiLabel)}:</strong> ${esc(client.businessId)}</p>` : ''}
      ${client.fiscalNumber ? `<p><strong>${esc(L.fiscalLabel || 'Fiscal No')}:</strong> ${esc(client.fiscalNumber)}</p>` : ''}
      ${client.vatNumber ? `<p><strong>${esc(L.vatLabel || 'VAT')}:</strong> ${esc(client.vatNumber)}</p>` : ''}
      ${client.phone ? `<p><strong>${esc(L.phoneLabel)}:</strong> ${esc(client.phone)}</p>` : ''}
      ${client.email ? `<p><strong>${esc(L.emailLabel || 'Email')}:</strong> ${esc(client.email)}</p>` : ''}
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>${esc(L.description)}</th>
          <th class="center">${esc(L.quantity)}</th>
          <th class="right">${esc(L.unit)} (${esc(v.symbol)})</th>
          <th class="right">${esc(L.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${v.rows
          .map(
            (row) => `<tr>
          <td class="pre">${esc(row.description)}</td>
          <td class="center">${esc(row.quantity)}</td>
          <td class="right nowrap">${money(row.unitPrice)}</td>
          <td class="right nowrap">${money(row.lineTotal)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="totals keep">
      <div><span>${esc(L.subtotal)}</span><span>${money(v.subtotal)}</span></div>
      ${v.discount > 0 ? `<div><span>${esc(L.discount)}</span><span>-${money(v.discount)}</span></div>` : ''}
      ${v.taxRate > 0 ? `<div><span>${esc(L.vat || 'VAT')} ${v.taxRate}%</span><span>${money(v.taxAmount)}</span></div>` : ''}
      <div class="grand"><span>${esc(L.total)}</span><span>${money(v.total)}</span></div>
      ${v.showBalance ? `<div><span>${esc(L.amountPaid || '')}</span><span>${money(v.paid)}</span></div><div class="grand"><span>${esc(L.amountDue || L.total)}</span><span>${money(v.due)}</span></div>` : ''}
    </div>
    ${invoice.notes ? `<div class="notes pre">${esc(invoice.notes)}</div>` : ''}
    ${
      v.hasPayment
        ? `<div class="payment keep"><div class="label">${esc(L.paymentInfo)}</div>${paymentRows(v)
            .map(([label, value]) => `<p>${esc(label)}: ${esc(value)}</p>`)
            .join('')}</div>`
        : ''
    }
    <div class="thanks">${esc(L.thankYou)}</div>
    ${v.exportNote ? `<div class="law">${esc(v.exportNote)}</div>` : ''}
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${v.signature ? `<img src="${v.signature}" alt="" />` : ''}</div>
        <div class="line">${esc(company.contactPerson)}<br/>${esc(L.issuedBy)}</div>
      </div>
      <div class="stamp">${v.stamp ? `<img src="${v.stamp}" alt="" />` : ''}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line">${esc(client.fullName)}<br/>${esc(L.receivedBy)}</div>
      </div>
    </div>
  `
  return shell(v, `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`, css, body)
}

/* ---------------------------------------------------------------- corporate */

// Blank rows pad a short invoice to a full-looking grid, while leaving room for notes and signatures on one page.
const CORPORATE_MIN_ROWS = 6

function corporateTemplate(v: View) {
  const { company, client, invoice, L, accent, symbol } = v
  const soft = tint(accent, 0.86)
  const mid = tint(accent, 0.68)
  const strong = tint(accent, 0.52)
  const line = tint(accent, 0.3)
  const cell = (value: number) => `<span class="cur">${esc(symbol)}</span><span>${grouped(value)}</span>`
  const filler = Math.max(CORPORATE_MIN_ROWS - v.rows.length, 0)
  const css = `
    .band { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: ${accent}; color: ${v.accentInk}; padding: 14px 32px; }
    .band-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .band-logo { height: 44px; max-width: 120px; object-fit: contain; background: #fff; border-radius: 4px; padding: 4px; flex-shrink: 0; }
    .band h1 { margin: 0; font-size: 25px; font-weight: 700; letter-spacing: 0.2px; }
    .band-title { font-size: 28px; font-weight: 400; white-space: nowrap; }
    .sub { display: flex; gap: 24px; justify-content: space-between; background: ${mid}; padding: 14px 32px 14px 64px; font-size: 10.5px; font-weight: 700; }
    .sub td { padding: 1px 0; vertical-align: top; }
    .sub td.k { text-align: right; padding-right: 28px; white-space: nowrap; }
    .parties { display: flex; justify-content: space-between; gap: 32px; margin: 26px 0 22px; font-size: 10.5px; }
    .parties td { padding: 4px 0; vertical-align: top; font-weight: 700; }
    .parties td.k { padding-right: 16px; white-space: nowrap; }
    .items { width: 100%; border: 1.5px solid ${line}; }
    .items th { padding: 18px 8px; font-size: 15px; font-weight: 400; color: ${accent}; text-align: left; border-bottom: 1.5px solid ${line}; }
    .items td { padding: 9px 8px; height: 40px; border: 1px solid ${line}; font-size: 11px; color: #555; vertical-align: middle; }
    .items.dense td { padding: 6px 8px; height: 30px; }
    .items tbody tr:nth-child(even) td { background: ${soft}; }
    .items td.sum { background: ${mid}; }
    .items tbody tr:nth-child(even) td.sum { background: ${strong}; }
    .items .n { width: 8%; }
    .items .q { width: 9%; text-align: right; }
    .items .u { width: 17%; }
    .items .t { width: 17%; }
    .amount { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .pay { flex: 1; margin-top: 22px; background: ${soft}; padding: 10px 16px; text-align: center; font-size: 12.5px; line-height: 1.6; }
    .pay strong { display: block; }
    .totals { width: 26%; min-width: 190px; }
    .totals td { padding: 4px 8px; font-size: 11px; border: 1px solid ${line}; }
    .totals td.k { text-align: right; border-left: 0; border-top: 0; border-bottom: 0; }
    .totals td.v { width: 62%; background: ${soft}; }
    .totals tr:nth-child(odd) td.v { background: ${mid}; }
    .totals tr.grand td { font-weight: 700; padding: 9px 8px; background: ${strong}; border: 1.5px solid ${line}; }
    .notes { margin-top: 18px; color: #444; font-size: 11px; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 44px; padding: 0 64px 0 64px; font-size: 11px; }
    .sign { width: 34%; }
    .sign b { display: block; margin-bottom: 8px; }
    .sign .ink { display: flex; align-items: flex-end; gap: 10px; min-height: 48px; border-bottom: 1.5px solid #1D2B2E; padding-bottom: 4px; }
    .sign .ink img { max-height: 44px; max-width: 120px; }
    .stamp { width: 24%; text-align: center; }
    .stamp img { max-height: 110px; max-width: 120px; }
    .foot { margin-top: 22px; text-align: center; font-size: 11px; color: #555; }
    .foot b { display: block; color: #1D2B2E; margin-top: 4px; }
  `
  const pay = paymentRows(v)
  const body = `
    <div class="band">
      <div class="band-brand">
        ${v.logo ? `<img class="band-logo" src="${v.logo}" alt="" />` : ''}
        <h1>${esc(company.companyName)}</h1>
      </div>
      <div class="band-title">${esc(L.invoiceTitle || 'Invoice')}</div>
    </div>
    <div class="sub">
      <div>
        ${company.streetAddress ? `<div>${esc(company.streetAddress)}</div>` : ''}
        ${v.cityLine ? `<div style="margin-top:4px">${esc(v.cityLine)}</div>` : ''}
      </div>
      <table>
        ${company.nui ? `<tr><td class="k">${esc(L.businessNumber || L.nuiLabel)}:</td><td>${esc(company.nui)}</td></tr>` : ''}
        ${company.vatNumber ? `<tr><td class="k">${esc(L.vatLabel || 'VAT')}:</td><td>${esc(company.vatNumber)}</td></tr>` : ''}
      </table>
      <div>
        ${company.phone ? `<div>${esc(company.phone)}</div>` : ''}
        ${company.email ? `<div style="margin-top:4px">${esc(company.email)}</div>` : ''}
        ${company.website ? `<div style="margin-top:4px">${esc(company.website)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <table>
        <tr><td class="k">${esc(L.customer || L.clientLabel)}:</td><td>${esc(client.fullName)}</td></tr>
        ${clientRows(v)
          .map(([label, value]) => `<tr><td class="k">${label ? `${esc(label)}:` : ''}</td><td>${esc(value)}</td></tr>`)
          .join('')}
      </table>
      <table>
        <tr><td class="k">${esc(L.invoiceLabel)} #:</td><td>${esc(invoice.number)}</td></tr>
        <tr><td class="k">${esc(L.dateLabel)}:</td><td>${esc(invoice.date)}</td></tr>
        <tr><td class="k">${esc(L.dueDateLabel)}:</td><td>${esc(v.dueText)}</td></tr>
      </table>
    </div>
    <table class="items${filler ? '' : ' dense'}">
      <thead>
        <tr>
          <th class="n">#</th>
          <th>${esc(L.description)}</th>
          <th class="q">${esc(L.quantity)}</th>
          <th class="u">${esc(L.unit)}</th>
          <th class="t">${esc(L.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${v.rows
          .map(
            (row) => `<tr>
          <td class="n">${row.index}</td>
          <td class="pre">${esc(row.description)}</td>
          <td class="q">${esc(row.quantity)}</td>
          <td class="u"><div class="amount">${cell(row.unitPrice)}</div></td>
          <td class="t sum"><div class="amount">${cell(row.lineTotal)}</div></td>
        </tr>`,
          )
          .join('')}
        ${'<tr><td class="n"></td><td></td><td class="q"></td><td class="u"></td><td class="t sum"></td></tr>'.repeat(filler)}
      </tbody>
    </table>
    <div class="bottom keep">
      ${
        v.hasPayment
          ? `<div class="pay"><strong>${esc(L.paymentDetails || L.paymentInfo)}:</strong>
              <div>${esc(L.beneficiary || 'Beneficiary')}: ${esc(company.companyName)}</div>
              ${pay.map(([label, value]) => `<div>${esc(label)}: ${esc(value)}</div>`).join('')}
            </div>`
          : '<div style="flex:1"></div>'
      }
      <table class="totals">
        <tr><td class="k">${esc(L.subtotal)}</td><td class="v"><div class="amount">${cell(v.subtotal)}</div></td></tr>
        <tr><td class="k">${esc(L.discount)}</td><td class="v"><div class="amount">${v.discount > 0 ? cell(v.discount) : `<span class="cur">${esc(symbol)}</span><span>-</span>`}</div></td></tr>
        <tr><td class="k">${esc(L.vat || 'VAT')} %</td><td class="v"><div class="amount"><span></span><span>${v.taxRate.toFixed(2)}%</span></div></td></tr>
        <tr><td class="k">${esc(L.vat || 'VAT')}</td><td class="v"><div class="amount">${v.taxAmount > 0 ? cell(v.taxAmount) : `<span class="cur">${esc(symbol)}</span><span>-</span>`}</div></td></tr>
        <tr class="grand"><td class="k">${esc(String(L.total || '').toUpperCase())}</td><td><div class="amount">${cell(v.total)}</div></td></tr>
        ${
          v.showBalance
            ? `<tr><td class="k">${esc(L.amountPaid || '')}</td><td class="v"><div class="amount">${cell(v.paid)}</div></td></tr>
               <tr class="grand"><td class="k">${esc(L.amountDue || L.total)}</td><td><div class="amount">${cell(v.due)}</div></td></tr>`
            : ''
        }
      </table>
    </div>
    ${invoice.notes ? `<div class="notes pre">${esc(invoice.notes)}</div>` : ''}
    <div class="signs keep">
      <div class="sign">
        <b>${esc(L.signature || 'Signature')} (${esc(company.companyName)}):</b>
        <div class="ink"><span>${esc(company.contactPerson)}</span>${v.signature ? `<img src="${v.signature}" alt="" />` : ''}</div>
      </div>
      <div class="stamp">${v.stamp ? `<img src="${v.stamp}" alt="" />` : ''}</div>
      <div class="sign">
        <b>${esc(L.signature || 'Signature')}:</b>
        <div class="ink"></div>
      </div>
    </div>
    ${v.exportNote ? `<div class="foot"><b>${esc(v.exportNote)}</b></div>` : ''}
  `
  return shell(v, `Calibri, Carlito, "Segoe UI", -apple-system, Helvetica, Arial, sans-serif`, css, body)
}

/* ------------------------------------------------------------------ minimal */

function minimalTemplate(v: View) {
  const { company, client, invoice, L, accent, money } = v
  const hair = '#E3E7E8'
  const muted = '#6B7A7D'
  const css = `
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .logo { height: 56px; max-width: 180px; object-fit: contain; }
    .name { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 30px; font-weight: 300; letter-spacing: 3px; color: ${accent}; }
    .title p { margin-top: 4px; font-size: 13px; color: ${muted}; }
    .rule { height: 2px; background: ${accent}; margin: 22px 0 24px; width: 48px; }
    .cols { display: flex; gap: 28px; margin-bottom: 30px; }
    .cols > div { flex: 1; min-width: 0; }
    .cols > div:last-child { flex: 0 0 26%; }
    .cap { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; color: ${muted}; margin-bottom: 8px; }
    .cols p { margin: 2px 0; color: #444; }
    .cols p.lead { font-weight: 700; font-size: 13px; color: #1D2B2E; }
    .kv { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
    .kv span:first-child { color: ${muted}; }
    .items { width: 100%; }
    .items th { padding: 0 8px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.4px; color: ${muted}; text-align: left; border-bottom: 1.5px solid #1D2B2E; }
    .items td { padding: 13px 8px; border-bottom: 1px solid ${hair}; vertical-align: top; }
    .items th:first-child, .items td:first-child { padding-left: 0; }
    .items th:last-child, .items td:last-child { padding-right: 0; }
    .items td.t { font-weight: 600; }
    .after { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; margin-top: 18px; }
    .side { flex: 1; min-width: 0; color: #444; }
    .side .block { margin-bottom: 16px; }
    .totals { width: 44%; min-width: 230px; }
    .totals .kv { padding: 5px 0; }
    .totals .grand { margin-top: 8px; padding: 12px 0 0; border-top: 1.5px solid #1D2B2E; font-size: 19px; font-weight: 700; }
    .totals .grand span:first-child { color: #1D2B2E; }
    .totals .grand span:last-child { color: ${accent}; }
    .signs { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 52px; }
    .sign { width: 34%; font-size: 11px; color: ${muted}; }
    .sign .ink { height: 46px; display: flex; align-items: flex-end; }
    .sign .ink img { max-height: 46px; max-width: 150px; }
    .sign .line { border-top: 1px solid #B9C1C3; padding-top: 6px; }
    .sign .line b { display: block; color: #1D2B2E; font-weight: 600; }
    .stamp { width: 22%; text-align: center; }
    .stamp img { max-height: 96px; max-width: 110px; }
    .foot { margin-top: 28px; padding-top: 14px; border-top: 1px solid ${hair}; text-align: center; font-size: 11px; color: ${muted}; }
    .foot b { display: block; margin-top: 4px; color: #1D2B2E; }
  `
  const pay = paymentRows(v)
  const body = `
    <div class="head">
      ${v.logo ? `<img class="logo" src="${v.logo}" alt="" />` : `<div class="name">${esc(company.companyName)}</div>`}
      <div class="title">
        <h2>${esc(L.invoiceTitle || 'INVOICE')}</h2>
        <p>${esc(invoice.number)}</p>
      </div>
    </div>
    <div class="rule"></div>
    <div class="cols">
      <div>
        <div class="cap">${esc(L.issuedBy)}</div>
        <p class="lead">${esc(company.companyName)}</p>
        ${company.streetAddress ? `<p>${esc(company.streetAddress)}</p>` : ''}
        ${v.cityLine ? `<p>${esc(v.cityLine)}</p>` : ''}
        ${company.nui ? `<p>${esc(L.nuiLabel)}: ${esc(company.nui)}</p>` : ''}
        ${company.vatNumber ? `<p>${esc(L.vatLabel || 'VAT')}: ${esc(company.vatNumber)}</p>` : ''}
        ${company.phone ? `<p>${esc(company.phone)}</p>` : ''}
        ${company.email ? `<p>${esc(company.email)}</p>` : ''}
        ${company.website ? `<p>${esc(company.website)}</p>` : ''}
      </div>
      <div>
        <div class="cap">${esc(L.billedTo || L.clientLabel)}</div>
        <p class="lead">${esc(client.fullName)}</p>
        ${clientLines(v)
          .map((text) => `<p>${esc(text)}</p>`)
          .join('')}
      </div>
      <div>
        <div class="cap">${esc(L.invoiceLabel)}</div>
        <div class="kv"><span>#</span><span>${esc(invoice.number)}</span></div>
        <div class="kv"><span>${esc(L.dateLabel)}</span><span>${esc(invoice.date)}</span></div>
        <div class="kv"><span>${esc(L.dueDateLabel)}</span><span>${esc(v.dueText)}</span></div>
      </div>
    </div>
    <table class="items">
      <thead>
        <tr>
          <th>${esc(L.description)}</th>
          <th class="center">${esc(L.quantity)}</th>
          <th class="right">${esc(L.unit)}</th>
          <th class="right">${esc(L.sum)}</th>
        </tr>
      </thead>
      <tbody>
        ${v.rows
          .map(
            (row) => `<tr>
          <td class="pre">${esc(row.description)}</td>
          <td class="center">${esc(row.quantity)}</td>
          <td class="right nowrap">${money(row.unitPrice)}</td>
          <td class="right nowrap t">${money(row.lineTotal)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="after keep">
      <div class="side">
        ${
          v.hasPayment
            ? `<div class="block"><div class="cap">${esc(L.paymentDetails || L.paymentInfo)}</div>${pay
                .map(([label, value]) => `<div class="kv" style="justify-content:flex-start"><span>${esc(label)}</span><span>${esc(value)}</span></div>`)
                .join('')}</div>`
            : ''
        }
        ${invoice.notes ? `<div class="block pre">${esc(invoice.notes)}</div>` : ''}
      </div>
      <div class="totals">
        <div class="kv"><span>${esc(L.subtotal)}</span><span>${money(v.subtotal)}</span></div>
        ${v.discount > 0 ? `<div class="kv"><span>${esc(L.discount)}</span><span>-${money(v.discount)}</span></div>` : ''}
        ${v.taxRate > 0 ? `<div class="kv"><span>${esc(L.vat || 'VAT')} ${v.taxRate}%</span><span>${money(v.taxAmount)}</span></div>` : ''}
        <div class="kv grand"><span>${esc(L.total)}</span><span>${money(v.total)}</span></div>
        ${v.showBalance ? `<div class="kv" style="margin-top:8px"><span>${esc(L.amountPaid || '')}</span><span>${money(v.paid)}</span></div><div class="kv" style="font-weight:700"><span style="color:#1D2B2E">${esc(L.amountDue || L.total)}</span><span>${money(v.due)}</span></div>` : ''}
      </div>
    </div>
    <div class="signs keep">
      <div class="sign">
        <div class="ink">${v.signature ? `<img src="${v.signature}" alt="" />` : ''}</div>
        <div class="line"><b>${esc(company.contactPerson)}</b>${esc(L.issuedBy)}</div>
      </div>
      <div class="stamp">${v.stamp ? `<img src="${v.stamp}" alt="" />` : ''}</div>
      <div class="sign">
        <div class="ink"></div>
        <div class="line"><b>${esc(client.fullName)}</b>${esc(L.receivedBy)}</div>
      </div>
    </div>
    <div class="foot">${esc(L.thankYou)}${v.exportNote ? `<b>${esc(v.exportNote)}</b>` : ''}</div>
  `
  return shell(v, `"Helvetica Neue", Helvetica, "Segoe UI", -apple-system, Arial, sans-serif`, css, body)
}

const RENDERERS: Record<InvoiceTemplateId, (view: View) => string> = {
  classic: classicTemplate,
  corporate: corporateTemplate,
  minimal: minimalTemplate,
}

export function buildInvoiceHtml(input: InvoiceHtmlInput) {
  const view = buildView(input)
  return RENDERERS[view.templateId](view)
}

/** A filled-in example, so the template picker shows the user's own company on each design. */
export function buildSampleInvoiceHtml({
  company,
  template,
  accentColor,
  pdfLabels,
  sample,
}: {
  company: CompanyProfile
  template: InvoiceTemplateId
  accentColor?: string
  pdfLabels: Record<string, string>
  sample: { clientName: string; clientAddress: string; lines: string[]; date: string }
}) {
  const items = [
    { id: '1', description: sample.lines[0] || '', quantity: 40, unitPrice: 24 },
    { id: '2', description: sample.lines[1] || '', quantity: 1, unitPrice: 350 },
    { id: '3', description: sample.lines[2] || '', quantity: 3, unitPrice: 45 },
  ]
  const taxRate = company.defaultTaxRate || 0
  return buildInvoiceHtml({
    company,
    client: { fullName: sample.clientName, address: sample.clientAddress, phone: '' },
    invoice: { number: 'INV-001', date: sample.date, dueDate: '', items, discount: 0, taxRate, notes: '', status: 'unpaid', lifecycle: 'issued', payments: [] },
    pdfLabels,
    template,
    accentColor,
  })
}
