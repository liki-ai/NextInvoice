import { documentTotals, remainingOf } from './document';
import { formatDateForInvoice } from './invoiceNumber';
import { clientDisplayName } from './client';

export function paidOf(doc) {
  return documentTotals(doc).amountPaid;
}

export function dueOf(doc) {
  return remainingOf(doc);
}

export function fullPaymentPayload(doc) {
  return {
    amount: documentTotals(doc).amountDue,
    date: formatDateForInvoice(new Date()),
    method: '',
    note: '',
  };
}

export function invoiceBalanceText(invoice, t, formatMoney, currency) {
  const client = clientDisplayName(invoice?.client || invoice?.clientSnapshot) || t('docs.newClient');
  const total = Number(invoice?.total) || 0;
  const paid = paidOf(invoice);
  const due = documentTotals(invoice).amountDue;
  return [
    t('balance.title'),
    '',
    `${t('newInvoice.clientSectionTitle')}: ${client}`,
    `${t('newInvoice.invoiceNumber')}: ${invoice?.number || ''}`,
    `${t('newInvoice.total')}: ${formatMoney(total, currency)}`,
    `${t('balance.deposit')}: ${formatMoney(paid, currency)}`,
    `${t('docs.remaining')}: ${formatMoney(due, currency)}`,
  ].join('\n');
}
