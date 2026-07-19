import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildInvoiceHtml } from './invoiceTemplate';

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
