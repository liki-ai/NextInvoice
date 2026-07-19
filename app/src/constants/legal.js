/** Public legal / support URLs used in-app and for App Store metadata. */
export const SUPPORT_EMAIL = 'lirim.sylejmani@tretek.io';

export const LEGAL_URLS = {
  privacyPolicy: 'https://liki-ai.github.io/NextInvoice/privacy-policy.html',
  termsOfUse: 'https://liki-ai.github.io/NextInvoice/terms-of-use.html',
  supportMailto: `mailto:${SUPPORT_EMAIL}?subject=Faturimi%20Support`,
};

/** Demo company data for App Review without requiring AI/network. */
export const SAMPLE_COMPANY_PROFILE = {
  companyName: 'Nina Fashion Studio',
  contactPerson: 'Florina Sylejmani',
  streetAddress: 'Prishtinë, Rruga Tringë Smajli, nr.14/2-1',
  state: 'Kosovë',
  zipCode: '10000',
  email: 'n_inna@live.com',
  phone: '+383 49 671 851',
  currency: 'EUR',
};

/** Demo client text for optional AI extract testing (requires configured API server). */
export const SAMPLE_CLIENT_TEXT =
  'Almedina Sadiku, Rruga B, Prishtinë 10000, Kosovë, +383 44 123 456';
