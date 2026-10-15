import { DEFAULT_EXPORT_NOTE, type CompanyProfile, type Invoice } from './invoice'

/** Fields a new account is seeded with placeholder values for. */
export type CompanySampleField = 'companyName' | 'contactPerson' | 'nui' | 'streetAddress' | 'state' | 'zipCode' | 'email' | 'phone'

const SAMPLE_VALUES: Record<CompanySampleField, string[]> = {
  companyName: ['Kompania juaj (shembull)', 'Your company (sample)', 'La tua azienda (esempio)'],
  contactPerson: ['Emri juaj (shembull)', 'Your name (sample)', 'Il tuo nome (esempio)'],
  nui: ['000000000'],
  streetAddress: ['Rruga shembull, nr. 1', 'Example street, no. 1', 'Via esempio, n. 1'],
  state: ['Kosovë', 'Kosovo'],
  zipCode: ['10000'],
  email: ['email@shembull.com', 'email@example.com', 'email@esempio.com'],
  phone: ['+383 00 000 000'],
}

const PLACEHOLDER_KEYS: Record<CompanySampleField, string> = {
  companyName: 'profile.phCompanyName',
  contactPerson: 'profile.phContactPerson',
  nui: 'profile.phNui',
  streetAddress: 'profile.phStreetAddress',
  state: 'profile.phState',
  zipCode: 'profile.phZipCode',
  email: 'profile.phEmail',
  phone: 'profile.phPhone',
}

const SAMPLE_FIELDS = Object.keys(SAMPLE_VALUES) as CompanySampleField[]

export function isSampleCompanyValue(field: CompanySampleField, value: string | undefined) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return true
  return SAMPLE_VALUES[field].includes(trimmed)
}

export function displayCompanyValue(field: CompanySampleField, value: string | undefined) {
  return isSampleCompanyValue(field, value) ? '' : String(value ?? '')
}

export function companyPlaceholderKey(field: CompanySampleField) {
  return PLACEHOLDER_KEYS[field]
}

/** The profile as an editable form: seeded samples become empty fields. */
export function stripSampleCompanyFields(company: CompanyProfile): CompanyProfile {
  const next = { ...company }
  for (const field of SAMPLE_FIELDS) {
    if (isSampleCompanyValue(field, company[field])) next[field] = ''
  }
  next.currency = company.currency?.trim() || 'EUR'
  if (company.exportNote === undefined || company.exportNote === null) next.exportNote = DEFAULT_EXPORT_NOTE
  return next
}

/** The profile as printed: anything still a sample is shown as a localized placeholder. */
export function localizeCompanyProfile(company: CompanyProfile, t: (key: string) => string): CompanyProfile {
  const next = { ...company }
  for (const field of SAMPLE_FIELDS) {
    if (isSampleCompanyValue(field, company[field])) next[field] = t(PLACEHOLDER_KEYS[field])
  }
  next.currency = company.currency?.trim() || t('profile.phCurrency')
  next.bankName = company.bankName || ''
  next.iban = company.iban || ''
  next.exportNote = company.exportNote === undefined || company.exportNote === null ? DEFAULT_EXPORT_NOTE : company.exportNote
  return next
}

/**
 * The company block for an invoice PDF. An issued invoice carries a frozen copy of the legal details,
 * so those win; the look (logo, template, colour, signature, stamp) always follows the current profile.
 */
export function companyForPdf(
  invoice: Pick<Invoice, 'companySnapshot'> | null | undefined,
  profile: CompanyProfile,
  t: (key: string) => string,
): CompanyProfile {
  const live = localizeCompanyProfile(profile, t)
  const snapshot = invoice?.companySnapshot
  if (!snapshot) return live
  // Details that were still blank when the invoice was issued (the NUI, the bank), or still the
  // samples a new account starts with ("Kompania juaj (shembull)"), come from the profile.
  const filled: Record<string, unknown> = {}
  for (const key of ['companyName', 'contactPerson', 'nui', 'vatNumber', 'streetAddress', 'state', 'zipCode', 'email', 'phone', 'website', 'bankName', 'iban', 'swift'] as const) {
    const sample = (SAMPLE_FIELDS as string[]).includes(key) && isSampleCompanyValue(key as CompanySampleField, snapshot[key] as string | undefined)
    if ((sample || !String(snapshot[key] ?? '').trim()) && String(live[key] ?? '').trim()) filled[key] = live[key]
  }
  return {
    ...snapshot,
    ...filled,
    // Added after the first snapshots were taken; older invoices fall back to the profile.
    industry: snapshot.industry ?? live.industry,
    logoData: live.logoData,
    signatureData: live.signatureData,
    stampData: live.stampData,
    invoiceTemplate: live.invoiceTemplate,
    accentColor: live.accentColor,
  }
}
