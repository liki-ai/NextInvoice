export function toCents(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function money(value) {
  return toCents(value) / 100;
}

export function activePayments(payments) {
  return (payments || []).filter((item) => !item.voidedAt);
}

export function documentTotals(doc) {
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0);
  const paidCents = activePayments(doc?.payments).reduce((sum, item) => sum + toCents(item.amount), 0);
  return {
    total: totalCents / 100,
    amountPaid: paidCents / 100,
    amountDue: Math.max(totalCents - paidCents, 0) / 100,
  };
}

export function paymentStatus(doc) {
  if (doc?.lifecycle === 'cancelled' || doc?.status === 'cancelled') return 'cancelled';
  if (doc?.lifecycle === 'draft') return 'draft';
  const totals = documentTotals(doc);
  const totalCents = toCents(doc?.total ?? doc?.amount ?? 0);
  const paidCents = toCents(totals.amountPaid);
  if (doc?.status === 'paid' && paidCents === 0 && totalCents > 0) return 'paid';
  if (totalCents > 0 && totals.amountDue === 0) return 'paid';
  if (paidCents > 0) return 'partial';
  return 'unpaid';
}

export function remainingOf(doc) {
  const status = paymentStatus(doc);
  if (status === 'cancelled' || status === 'draft') return 0;
  if (typeof doc?.amountDue === 'number') return doc.amountDue;
  if (status === 'paid') return 0;
  return documentTotals(doc).amountDue;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function parseLooseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDay) return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const mdy = raw.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/i);
  if (mdy) {
    const month = MONTH_ABBR.indexOf(mdy[1].toUpperCase());
    if (month >= 0) return new Date(Number(mdy[3]), month, Number(mdy[2]));
  }
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return new Date(iso);
  return null;
}

export function daysOverdue(doc, now = new Date()) {
  const status = paymentStatus(doc);
  if (status === 'paid' || status === 'cancelled' || status === 'draft') return 0;
  if (remainingOf(doc) <= 0) return 0;
  const due = parseLooseDate(doc?.dueDate);
  if (!due) return 0;
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((start(now).getTime() - start(due).getTime()) / 86400000);
  return days > 0 ? days : 0;
}

export function isOverdue(doc, now = new Date()) {
  return daysOverdue(doc, now) > 0;
}

export function reminderText(invoice, labels, days) {
  const due = invoice?.dueDate || labels.onReceipt || '';
  const remaining = remainingOf(invoice).toFixed(2);
  return [
    labels.hello,
    labels.body
      .replace('{number}', invoice?.number || '')
      .replace('{due}', due)
      .replace('{amount}', remaining)
      .replace('{days}', String(days)),
    labels.thanks,
  ].join('\n\n');
}

export function todayInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function pdfCompany(invoice, liveProfile) {
  return invoice?.companySnapshot || liveProfile;
}

export function pdfClient(invoice) {
  return invoice?.clientSnapshot || invoice?.client;
}
