const CURRENCY_SYMBOLS = {
  EUR: '€',
  USD: '$',
  GBP: '£',
};

export function currencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency || '€';
}

export function formatMoney(amount, currency) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${value.toFixed(2)}${currencySymbol(currency)}`;
}

export function formatAmountShort(amount) {
  const cents = Math.round((Number(amount) || 0) * 100);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function toNumber(value) {
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
