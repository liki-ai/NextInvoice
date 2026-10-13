export const DEFAULT_COMPANY_PROFILE = {
  companyName: 'Kompania juaj (shembull)',
  contactPerson: 'Emri juaj (shembull)',
  nui: '000000000',
  streetAddress: 'Rruga shembull, nr. 1',
  state: 'Kosovë',
  zipCode: '10000',
  email: 'email@shembull.com',
  phone: '+383 00 000 000',
  currency: 'EUR',
  bankName: '',
  iban: '',
  exportNote: 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)',
  industry: 'other',
};

export const DEFAULT_SETTINGS = {
  language: 'sq',
  apiBaseUrl: 'https://api.mynextinvoice.com',
};

// Addresses the API used to live at. A phone that saved one of these follows the move.
export const RETIRED_API_URLS = ['https://nextinvoice.onrender.com'];

export function currentApiBaseUrl(saved) {
  const url = String(saved || '').trim().replace(/\/+$/, '');
  return !url || RETIRED_API_URLS.includes(url) ? DEFAULT_SETTINGS.apiBaseUrl : url;
}

export const DEFAULT_PLAN = {
  plan: 'free',
  productId: null,
  originalTransactionId: null,
  expiresAt: null,
  platform: null,
  updatedAt: null,
};
