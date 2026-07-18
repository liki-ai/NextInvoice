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

export function toNumber(value) {
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
