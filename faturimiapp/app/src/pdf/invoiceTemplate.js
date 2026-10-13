import { formatMoney, currencySymbol, toNumber } from '../utils/money';
import { parseLooseDate, remainingOf } from '../utils/document';
import { computeTotals as invoiceTotals } from './invoiceTemplates';
import { resolveExportNote } from '../utils/company';

export { buildInvoiceHtml, computeTotals } from './invoiceTemplates';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function clientKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

export function sortInvoicesChronologically(invoices) {
  return [...(invoices || [])].sort((a, b) => {
    // Invoice dates are free text (05.01.2026, JAN 5, 2026 …); Date.parse would read the first as 1 May.
    const ta = parseLooseDate(a.date)?.getTime() || Date.parse(a.createdAt || '') || 0;
    const tb = parseLooseDate(b.date)?.getTime() || Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a.number || '').localeCompare(String(b.number || ''));
  });
}

export function clientUnpaidSummaries(invoices) {
  const groups = new Map();
  for (const inv of invoices || []) {
    const name = inv.client?.fullName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { client: inv.client, unpaid: [], unpaidCount: 0, unpaidTotal: 0, paidTotal: 0 };
      groups.set(key, group);
    }
    const total = Number(inv.total) || 0;
    if (inv.status === 'paid') {
      group.paidTotal += total;
    } else {
      group.unpaid.push(inv);
      group.unpaidCount += 1;
      group.unpaidTotal += total;
    }
  }
  return [...groups.values()]
    .filter((group) => group.unpaid.length > 0)
    .map((group) => ({ ...group, unpaid: sortInvoicesChronologically(group.unpaid) }))
    .sort((a, b) => a.client.fullName.localeCompare(b.client.fullName));
}

export function formatStatementFileDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function statementFileName(clientName, date = new Date()) {
  const cleaned =
    String(clientName || 'client')
      .trim()
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 60) || 'client';
  return `${cleaned}-${formatStatementFileDate(date)}.pdf`;
}

function statementItemRows(invoices, currency, pdfLabels) {
  return invoices
    .flatMap((inv) => {
      const items =
        inv.items && inv.items.length > 0
          ? inv.items
          : [{ id: '1', description: inv.number, quantity: 1, unitPrice: inv.total }];
      const rows = items.map((item, index) => {
        const qty = toNumber(item.quantity);
        const unit = toNumber(item.unitPrice);
        const orderCell =
          index === 0
            ? `<strong>${escapeHtml(inv.number)}</strong><br/><span class="muted">${escapeHtml(inv.date)}</span>`
            : '';
        return `<tr>
          <td class="order">${orderCell}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="right">${formatMoney(unit, currency)}</td>
          <td class="center">${escapeHtml(item.quantity)}</td>
          <td class="right">${formatMoney(qty * unit, currency)}</td>
        </tr>`;
      });
      if (toNumber(inv.discount) > 0) {
        rows.push(`<tr>
          <td></td>
          <td>${escapeHtml(pdfLabels.discount)}</td>
          <td></td>
          <td></td>
          <td class="right">-${formatMoney(toNumber(inv.discount), currency)}</td>
        </tr>`);
      }
      const vat = invoiceTotals(items, inv.discount, inv.taxRate);
      if (vat.taxAmount > 0) {
        rows.push(`<tr>
          <td></td>
          <td>${escapeHtml(pdfLabels.vat || 'VAT')} ${vat.taxRate}%</td>
          <td></td>
          <td></td>
          <td class="right">${formatMoney(vat.taxAmount, currency)}</td>
        </tr>`);
      }
      return rows;
    })
    .join('');
}

export function buildStatementHtml({ company, client, invoices, paidTotal, issuedDate, pdfLabels, showPayments = false }) {
  const currency = company.currency || 'EUR';
  const symbol = currencySymbol(currency);
  const exportNote = resolveExportNote(company);
  const unpaidTotal = (invoices || []).reduce((sum, inv) => sum + remainingOf(inv), 0);
  const payments = Number(paidTotal) || 0;
  const dateLabel = issuedDate || formatStatementFileDate(new Date());
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ');
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel;
  const rows = statementItemRows(invoices || [], currency, pdfLabels);

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
  </html>`;
}

export function listReportFileName(prefix, kind = 'all', date = new Date()) {
  const slug = kind === 'paid' ? 'paguara' : kind === 'unpaid' ? 'papaguara' : 'lista';
  return `${prefix}-${slug}-${formatStatementFileDate(date)}.pdf`;
}

export function paidObligationsFileName(date = new Date()) {
  return listReportFileName('detyrimet', 'paid', date);
}

export function invoiceListFileName(kind = 'all', date = new Date()) {
  return listReportFileName('faturat', kind, date);
}

export function obligationsListFileName(kind = 'paid', date = new Date()) {
  return listReportFileName('detyrimet', kind, date);
}

export function buildPaidObligationsHtml({ company, obligations, issuedDate, pdfLabels }) {
  const currency = company.currency || 'EUR';
  const dateLabel = issuedDate || formatStatementFileDate(new Date());
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ');
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel;
  const total = (obligations || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const rows = (obligations || [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.vendor)}</td>
        <td>${escapeHtml(item.notes || item.description || '')}</td>
        <td>${escapeHtml(item.date || '')}</td>
        <td class="center">${item.proofName || item.proofUri ? escapeHtml(pdfLabels.proofYes || 'Yes') : escapeHtml(pdfLabels.proofNo || '—')}</td>
        <td class="right">${formatMoney(Number(item.amount) || 0, currency)}</td>
      </tr>`,
    )
    .join('');

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
  </html>`;
}

export function buildInvoiceListHtml({ company, invoices, issuedDate, pdfLabels }) {
  const currency = company.currency || 'EUR';
  const dateLabel = issuedDate || formatStatementFileDate(new Date());
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ');
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel;
  const total = (invoices || []).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const rows = (invoices || [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.number || '')}</td>
        <td>${escapeHtml(item.client?.fullName || '')}</td>
        <td>${escapeHtml(item.date || '')}</td>
        <td>${escapeHtml(item.status === 'paid' ? pdfLabels.statusPaid || 'Paid' : pdfLabels.statusUnpaid || 'Unpaid')}</td>
        <td class="right">${formatMoney(Number(item.total) || 0, currency)}</td>
      </tr>`,
    )
    .join('');

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
  </html>`;
}

export function overviewFileName(date = new Date()) {
  return `pasqyra-${formatStatementFileDate(date)}.pdf`;
}

export function buildOverviewHtml({ company, report, periodText, issuedDate, pdfLabels, notes = [] }) {
  const currency = report.currency || company.currency || 'EUR';
  const dateLabel = issuedDate || formatStatementFileDate(new Date());
  const cityLine = [company.zipCode, company.state].filter(Boolean).join(' ');
  const nuiLabel = pdfLabels.pivaLabel || pdfLabels.nuiLabel;
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
        `<tr><td>${escapeHtml(label)}</td><td class="right">${formatMoney(Number(amount) || 0, currency)}</td></tr>`,
    )
    .join('');
  const customerRows = (report.customers || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.client?.fullName || '')}</td><td class="right">${formatMoney(item.amount, currency)}</td></tr>`,
    )
    .join('');
  const overdueRows = (report.overduePayables || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.vendor || '')}</td><td>${escapeHtml(item.dueDate || '')}</td><td class="right">${formatMoney(item.amountDueAsOf || 0, currency)}</td></tr>`,
    )
    .join('');
  const noteBlock = notes.length
    ? `<div class="notes"><div class="block-title">${escapeHtml(pdfLabels.limitationTitle || '')}</div>${notes
        .map((note) => `<p>${escapeHtml(note)}</p>`)
        .join('')}</div>`
    : '';

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
  </html>`;
}
