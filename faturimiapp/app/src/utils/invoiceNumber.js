const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function generateInvoiceNumber(existingInvoices, date = new Date()) {
  // An account whose invoices are mostly numbered 202610-008 keeps that scheme; the server applies the same rule.
  const issued = (existingInvoices || []).filter((inv) => inv.lifecycle !== 'draft');
  const dated = issued.filter((inv) => /^\d{6}-\d+$/.test(String(inv.number || ''))).length;
  if (dated > 0 && dated * 2 > issued.length) {
    const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const last = issued.reduce((max, inv) => {
      const match = String(inv.number || '').match(/^(\d{6})-(\d+)$/);
      return match && match[1] === period ? Math.max(max, Number(match[2]) || 0) : max;
    }, 0);
    return `${period}-${String(last + 1).padStart(3, '0')}`;
  }
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
