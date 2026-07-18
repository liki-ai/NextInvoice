const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function generateInvoiceNumber(existingInvoices, date = new Date()) {
  const prefix = MONTH_ABBR[date.getMonth()];
  const sameMonthCount = existingInvoices.filter((inv) => (inv.number || '').startsWith(`${prefix}-`)).length;
  const seq = String(sameMonthCount + 1).padStart(3, '0');
  return `${prefix}-${seq}`;
}

export function formatDateForInvoice(date, locale) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const month = MONTH_ABBR[d.getMonth()];
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function isoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}
