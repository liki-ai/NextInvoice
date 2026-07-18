import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildInvoiceHtml } from './invoiceTemplate';

export async function generateInvoicePdfFile({ company, client, invoice, pdfLabels }) {
  const html = buildInvoiceHtml({ company, client, invoice, pdfLabels });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function shareInvoicePdf({ company, client, invoice, pdfLabels }) {
  const uri = await generateInvoicePdfFile({ company, client, invoice, pdfLabels });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Invoice ${invoice.number}`,
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
