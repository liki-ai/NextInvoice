import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildInvoiceHtml, buildStatementHtml, buildPaidObligationsHtml, buildInvoiceListHtml, statementFileName, invoiceListFileName, obligationsListFileName } from './invoiceTemplate';

function sanitizeFileName(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return cleaned || 'Invoice';
}

function buildPdfFileName(company, invoice) {
  const companyPart = sanitizeFileName(company?.companyName);
  const numberPart = sanitizeFileName(invoice?.number);
  return `${companyPart}_${numberPart}.pdf`;
}

export async function generateInvoicePdfFile({ company, client, invoice, pdfLabels }) {
  const html = buildInvoiceHtml({ company, client, invoice, pdfLabels });
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const fileName = buildPdfFileName(company, invoice);
  const dest = `${FileSystem.cacheDirectory}${fileName}`;

  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }

  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function shareInvoicePdf({ company, client, invoice, pdfLabels }) {
  const uri = await generateInvoicePdfFile({ company, client, invoice, pdfLabels });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: buildPdfFileName(company, invoice),
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

export async function generateStatementPdfFile({ company, client, invoices, paidTotal, issuedDate, pdfLabels }) {
  const html = buildStatementHtml({ company, client, invoices, paidTotal, issuedDate, pdfLabels, showPayments: false });
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const fileName = statementFileName(client?.fullName, issuedDate);
  const dest = `${FileSystem.cacheDirectory}${fileName}`;

  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }

  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function shareStatementPdf({ company, client, invoices, paidTotal, issuedDate, pdfLabels }) {
  const uri = await generateStatementPdfFile({
    company,
    client,
    invoices,
    paidTotal,
    issuedDate,
    pdfLabels,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: statementFileName(client?.fullName, issuedDate),
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

export async function sharePaidObligationsPdf({ company, obligations, issuedDate, pdfLabels, kind = 'paid' }) {
  const html = buildPaidObligationsHtml({ company, obligations, issuedDate, pdfLabels });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = obligationsListFileName(kind, issuedDate);
  const dest = `${FileSystem.cacheDirectory}${fileName}`;
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: uri, to: dest });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf',
    });
  }
  return dest;
}

export async function shareInvoiceListPdf({ company, invoices, issuedDate, pdfLabels, kind = 'all' }) {
  const html = buildInvoiceListHtml({ company, invoices, issuedDate, pdfLabels });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = invoiceListFileName(kind, issuedDate);
  const dest = `${FileSystem.cacheDirectory}${fileName}`;
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: uri, to: dest });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: fileName,
      UTI: 'com.adobe.pdf',
    });
  }
  return dest;
}
