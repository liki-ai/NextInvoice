const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Next invoice number for the given date's month.
 * Format: INV-JUL-001 (resets sequence when the month changes).
 */
export function generateInvoiceNumber(existingInvoices = [], date = new Date()) {
  const month = MONTH_ABBR[date.getMonth()];
  const prefix = `INV-${month}-`;
  let maxSeq = 0;

  for (const inv of existingInvoices) {
    const number = String(inv?.number || '');
    if (!number.startsWith(prefix)) continue;
    const seq = parseInt(number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function formatDateForInvoice(date) {
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
