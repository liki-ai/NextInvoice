import { documentTotals, type Payment } from './document'
import { clientDisplayName } from './client'

export function fullPaymentPayload(doc: { total?: unknown; amount?: unknown; payments?: Payment[] | null }) {
  const due = documentTotals(doc).amountDue
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return {
    amount: due,
    date: `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
    method: '',
    note: '',
  }
}

export function invoiceBalanceText(
  invoice: { number?: string; total?: number; client?: { fullName?: string; firstName?: string; lastName?: string }; clientSnapshot?: { fullName?: string } } | undefined,
  t: (key: string) => string,
  formatMoney: (n: number, c: string) => string,
  currency: string,
) {
  const client = clientDisplayName(invoice?.client || invoice?.clientSnapshot) || t('docs.newClient')
  const total = Number(invoice?.total) || 0
  const paid = documentTotals(invoice || {}).amountPaid
  const due = documentTotals(invoice || {}).amountDue
  return [
    t('balance.title'),
    '',
    `${t('newInvoice.clientSectionTitle')}: ${client}`,
    `${t('newInvoice.invoiceNumber')}: ${invoice?.number || ''}`,
    `${t('newInvoice.total')}: ${formatMoney(total, currency)}`,
    `${t('balance.deposit')}: ${formatMoney(paid, currency)}`,
    `${t('docs.remaining')}: ${formatMoney(due, currency)}`,
  ].join('\n')
}
