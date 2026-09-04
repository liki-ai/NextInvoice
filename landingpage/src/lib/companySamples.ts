import type { CompanyProfile } from './invoice'

export type CompanySampleField = Exclude<keyof CompanyProfile, 'language'>

const SAMPLE_VALUES: Record<CompanySampleField, string[]> = {
  companyName: ['Kompania juaj (shembull)', 'Your company (sample)', 'La tua azienda (esempio)'],
  contactPerson: ['Emri juaj (shembull)', 'Your name (sample)', 'Il tuo nome (esempio)'],
  nui: ['000000000'],
  streetAddress: ['Rruga shembull, nr. 1', 'Example street, no. 1', 'Via esempio, n. 1'],
  state: ['Kosovë', 'Kosovo'],
  zipCode: ['10000'],
  email: ['email@shembull.com', 'email@example.com', 'email@esempio.com'],
  phone: ['+383 00 000 000'],
  currency: [],
  bankName: [],
  iban: [],
  exportNote: [],
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
  currency: 'profile.phCurrency',
  bankName: 'profile.phBankName',
  iban: 'profile.phIban',
  exportNote: 'profile.phExportNote',
}

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

export function stripSampleCompanyFields(company: CompanyProfile): CompanyProfile {
  const next = { ...company }
  ;(Object.keys(SAMPLE_VALUES) as CompanySampleField[]).forEach((field) => {
    if (field === 'currency') {
      next.currency = company.currency?.trim() || 'EUR'
      return
    }
    if (field === 'exportNote') {
      if (company.exportNote === undefined || company.exportNote === null) {
        next.exportNote = 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)'
      }
      return
    }
    if (isSampleCompanyValue(field, company[field])) next[field] = ''
  })
  return next
}

export function localizeCompanyProfile(company: CompanyProfile, t: (key: string) => string): CompanyProfile {
  const pick = (field: CompanySampleField) => {
    const raw = company[field] ?? ''
    return isSampleCompanyValue(field, raw) ? t(PLACEHOLDER_KEYS[field]) : raw
  }
  return {
    ...company,
    companyName: pick('companyName'),
    contactPerson: pick('contactPerson'),
    nui: pick('nui'),
    streetAddress: pick('streetAddress'),
    state: pick('state'),
    zipCode: pick('zipCode'),
    email: pick('email'),
    phone: pick('phone'),
    currency: company.currency?.trim() || t('profile.phCurrency'),
    bankName: company.bankName || '',
    iban: company.iban || '',
    exportNote:
      company.exportNote === undefined || company.exportNote === null
        ? 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)'
        : company.exportNote,
  }
}
