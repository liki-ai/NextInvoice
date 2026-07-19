import { formatMoney, currencySymbol, toNumber } from '../utils/money';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lineTotal(item) {
  return toNumber(item.quantity) * toNumber(item.unitPrice);
}

export function computeTotals(items, discount) {
  const subtotal = (items || []).reduce((sum, item) => sum + lineTotal(item), 0);
  const total = Math.max(subtotal - toNumber(discount), 0);
  return { subtotal, total };
}

export function buildInvoiceHtml({ company, client, invoice, pdfLabels }) {
  const items = invoice.items || [];
  const { subtotal, total } = computeTotals(items, invoice.discount);
  const symbol = currencySymbol(company.currency);

  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${escapeHtml(item.quantity)}</td>
          <td class="right">${formatMoney(toNumber(item.unitPrice), company.currency)}</td>
          <td class="right">${formatMoney(lineTotal(item), company.currency)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
  <html lang="sq">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, Helvetica, Arial, sans-serif;
        color: #1D2B2E;
        padding: 32px;
        font-size: 13px;
      }
      .top-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 3px solid #2C6E7F;
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      .company-block h1 {
        margin: 0 0 6px 0;
        font-size: 20px;
        color: #1F4E5A;
      }
      .company-block p, .client-block p { margin: 2px 0; color: #444; }
      .invoice-meta {
        text-align: right;
      }
      .invoice-meta h2 {
        margin: 0 0 8px 0;
        font-size: 26px;
        letter-spacing: 2px;
        color: #2C6E7F;
      }
      .invoice-meta p { margin: 2px 0; }
      .blocks {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 24px;
      }
      .block-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #6B7A7D;
        margin-bottom: 6px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
      }
      thead tr { background: #2C6E7F; color: #fff; }
      th, td {
        padding: 8px 10px;
        border-bottom: 1px solid #E1E6E7;
        text-align: left;
        font-size: 12px;
      }
      th.center, td.center { text-align: center; }
      th.right, td.right { text-align: right; }
      .totals {
        width: 260px;
        margin-left: auto;
      }
      .totals div {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
      }
      .totals .total-row {
        font-weight: 700;
        font-size: 16px;
        border-top: 2px solid #2C6E7F;
        margin-top: 4px;
        padding-top: 8px;
        color: #1F4E5A;
      }
      .notes {
        margin-top: 20px;
        font-size: 12px;
        color: #555;
        white-space: pre-wrap;
      }
      .signatures {
        display: flex;
        justify-content: space-between;
        margin-top: 60px;
      }
      .signature {
        width: 45%;
        text-align: center;
        border-top: 1px solid #999;
        padding-top: 6px;
        font-size: 12px;
        color: #555;
      }
      .thank-you {
        text-align: center;
        margin-top: 30px;
        font-size: 13px;
        color: #2C6E7F;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="top-row">
      <div class="company-block">
        <h1>${escapeHtml(company.companyName)}</h1>
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
      <tbody>
        ${rows}
      </tbody>
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
  </html>`;
}
