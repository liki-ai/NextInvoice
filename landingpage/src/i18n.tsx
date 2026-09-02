import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'sq' | 'en'

const translations = {
  sq: {
    nav: {
      invoices: 'Faturat',
      newInvoice: 'Fatura e Re',
      profile: 'Profili',
      login: 'Hyr',
      signup: 'Regjistrohu',
      logout: 'Dil',
      openApp: 'Hap aplikacionin',
    },
    auth: {
      loginTitle: 'Hyr në llogarinë tënde',
      signupTitle: 'Krijo një llogari',
      email: 'Email',
      password: 'Fjalëkalimi',
      confirmPassword: 'Përsërit fjalëkalimin',
      loginCta: 'Hyr',
      signupCta: 'Krijo llogarinë',
      noAccount: 'Nuk ke llogari?',
      hasAccount: 'Ke tashmë llogari?',
      passwordHint: 'Të paktën 8 karaktere.',
      mismatch: 'Fjalëkalimet nuk përputhen.',
    },
    common: {
      save: 'Ruaj',
      cancel: 'Anulo',
      delete: 'Fshij',
      edit: 'Ndrysho',
      loading: 'Duke u ngarkuar...',
      error: 'Gabim',
      success: 'Sukses',
      close: 'Mbyll',
    },
    invoiceList: {
      title: 'Faturat',
      empty: 'Nuk ka fatura ende. Krijo të parën.',
      itemsCount: '{count} artikuj',
      deleteConfirm: 'Fshi këtë faturë? Ky veprim nuk kthehet.',
    },
    newInvoice: {
      title: 'Fatura e Re',
      editTitle: 'Ndrysho faturën',
      modeManual: 'Manualisht',
      modeAi: 'Me AI',
      clientSectionTitle: 'Të dhënat e klientit',
      fullName: 'Emri i plotë',
      address: 'Adresa',
      phone: 'Numri i telefonit',
      aiInputLabel: 'Ngjit ose shkruaj të dhënat e klientit',
      aiInputPlaceholder: 'p.sh. Almedina Sadiku, 7 Arrowhead Dr, Milford CT 06460 USA, +8603029000',
      aiExtractButton: 'Zbulo të dhënat me AI',
      aiExtracting: 'Duke analizuar...',
      aiExtractError: 'Nuk u arrit të nxjerren të dhënat.',
      invoiceDetailsSectionTitle: 'Detajet e faturës',
      invoiceNumber: 'Numri i faturës',
      date: 'Data',
      itemsSectionTitle: 'Artikujt',
      itemDescription: 'Përshkrimi',
      itemQuantity: 'Sasia',
      itemUnitPrice: 'Çmimi/njësi',
      itemTotal: 'Shuma',
      addItem: 'Shto artikull',
      discount: 'Zbritje',
      notes: 'Shënime (opsionale)',
      showDiscount: 'Zbritje',
      showNotes: 'Shënime',
      subtotal: 'Nëntotali',
      total: 'Totali',
      saveAndShare: 'Ruaj dhe shkarko PDF',
      saveChanges: 'Ruaj ndryshimet',
      preview: 'Parapamje',
      previewTitle: 'Parapamje e faturës',
      savedSuccess: 'Fatura u ruajt me sukses.',
      updatedSuccess: 'Fatura u përditësua.',
      validationClient: 'Plotëso emrin e klientit para se të vazhdosh.',
      validationItems: 'Shto të paktën një artikull me çmim.',
    },
    invoiceDetail: {
      title: 'Detajet e faturës',
      downloadPdf: 'Shkarko PDF',
      deleteInvoice: 'Fshij faturën',
    },
    profile: {
      title: 'Profili',
      companySectionTitle: 'Të dhënat e kompanisë',
      companyHint: 'Këto shfaqen në çdo faturë. Ndryshoji me të dhënat e tua.',
      companyName: 'Emri i kompanisë',
      contactPerson: 'Personi kontaktues',
      nui: 'Numri Unik Identifikues (NUI)',
      streetAddress: 'Adresa',
      state: 'Shteti / Rajoni',
      zipCode: 'Kodi Postar',
      email: 'Email',
      phone: 'Telefoni',
      currency: 'Monedha',
      importSectionTitle: 'Importo nga një faturë shembull',
      importDescription: 'Ngarko një faturë (PDF ose imazh) dhe AI i nxjerr të dhënat e kompanisë.',
      importButton: 'Ngarko faturë shembull',
      importing: 'Duke analizuar faturën...',
      importSuccess: 'Të dhënat u plotësuan. Kontrolloji para se të ruash.',
      importError: 'Nuk u arrit të nxjerren të dhënat nga fatura.',
      languageSectionTitle: 'Gjuha',
      languageSq: 'Shqip',
      languageEn: 'English',
      saveSuccess: 'Profili u ruajt.',
      account: 'Llogaria',
    },
    pdf: {
      invoiceLabel: 'Fatura / Invoice',
      dateLabel: 'Data / Date',
      clientLabel: 'Klienti / Client',
      nuiLabel: 'NUI',
      description: 'Përshkrimi / Description',
      quantity: 'Sasia / Quantity',
      unit: 'Njësia / Unit',
      sum: 'Shuma / Sum',
      subtotal: 'Nëntotali / Subtotal',
      discount: 'Zbritje / Discount',
      total: 'Totali / Total',
      issuedBy: 'Faturoi / Issued by',
      receivedBy: 'Pranoi / Received by',
      thankYou: 'Faleminderit! / Thank you!',
    },
  },
  en: {
    nav: {
      invoices: 'Invoices',
      newInvoice: 'New Invoice',
      profile: 'Profile',
      login: 'Log in',
      signup: 'Sign up',
      logout: 'Log out',
      openApp: 'Open app',
    },
    auth: {
      loginTitle: 'Log in to your account',
      signupTitle: 'Create an account',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm password',
      loginCta: 'Log in',
      signupCta: 'Create account',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      passwordHint: 'At least 8 characters.',
      mismatch: 'Passwords do not match.',
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      close: 'Close',
    },
    invoiceList: {
      title: 'Invoices',
      empty: 'No invoices yet. Create your first one.',
      itemsCount: '{count} items',
      deleteConfirm: 'Delete this invoice? This cannot be undone.',
    },
    newInvoice: {
      title: 'New Invoice',
      editTitle: 'Edit invoice',
      modeManual: 'Manual',
      modeAi: 'AI',
      clientSectionTitle: 'Client details',
      fullName: 'Full name',
      address: 'Address',
      phone: 'Phone number',
      aiInputLabel: 'Paste or type the client details',
      aiInputPlaceholder: 'e.g. Almedina Sadiku, 7 Arrowhead Dr, Milford CT 06460 USA, +8603029000',
      aiExtractButton: 'Detect details with AI',
      aiExtracting: 'Analyzing...',
      aiExtractError: 'Could not extract the details.',
      invoiceDetailsSectionTitle: 'Invoice details',
      invoiceNumber: 'Invoice number',
      date: 'Date',
      itemsSectionTitle: 'Items',
      itemDescription: 'Description',
      itemQuantity: 'Quantity',
      itemUnitPrice: 'Unit price',
      itemTotal: 'Total',
      addItem: 'Add item',
      discount: 'Discount',
      notes: 'Notes (optional)',
      showDiscount: 'Discount',
      showNotes: 'Notes',
      subtotal: 'Subtotal',
      total: 'Total',
      saveAndShare: 'Save and download PDF',
      saveChanges: 'Save changes',
      preview: 'Preview',
      previewTitle: 'Invoice preview',
      savedSuccess: 'Invoice saved successfully.',
      updatedSuccess: 'Invoice updated.',
      validationClient: 'Fill in the client name before continuing.',
      validationItems: 'Add at least one item with a price.',
    },
    invoiceDetail: {
      title: 'Invoice details',
      downloadPdf: 'Download PDF',
      deleteInvoice: 'Delete invoice',
    },
    profile: {
      title: 'Profile',
      companySectionTitle: 'Company details',
      companyHint: 'These appear on every invoice. Replace them with your details.',
      companyName: 'Company name',
      contactPerson: 'Contact person',
      nui: 'Unique Identification Number (NUI)',
      streetAddress: 'Address',
      state: 'State / Region',
      zipCode: 'ZIP code',
      email: 'Email',
      phone: 'Phone',
      currency: 'Currency',
      importSectionTitle: 'Import from a sample invoice',
      importDescription: 'Upload an invoice (PDF or image) and AI will extract your company details.',
      importButton: 'Upload sample invoice',
      importing: 'Analyzing invoice...',
      importSuccess: 'Details filled in. Please review before saving.',
      importError: 'Could not extract data from the invoice.',
      languageSectionTitle: 'Language',
      languageSq: 'Shqip',
      languageEn: 'English',
      saveSuccess: 'Profile saved.',
      account: 'Account',
    },
    pdf: {
      invoiceLabel: 'Fatura / Invoice',
      dateLabel: 'Data / Date',
      clientLabel: 'Klienti / Client',
      nuiLabel: 'NUI',
      description: 'Përshkrimi / Description',
      quantity: 'Sasia / Quantity',
      unit: 'Njësia / Unit',
      sum: 'Shuma / Sum',
      subtotal: 'Nëntotali / Subtotal',
      discount: 'Zbritje / Discount',
      total: 'Totali / Total',
      issuedBy: 'Faturoi / Issued by',
      receivedBy: 'Pranoi / Received by',
      thankYou: 'Faleminderit! / Thank you!',
    },
  },
} as const

type Dict = (typeof translations)[Lang]

function getNested(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

type I18nValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, params?: Record<string, string | number>) => string
  dict: Dict
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('nextinvoice.lang')
    return stored === 'en' || stored === 'sq' ? stored : 'sq'
  })

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    localStorage.setItem('nextinvoice.lang', next)
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const value = getNested(translations[lang], key) ?? getNested(translations.sq, key) ?? key
      if (typeof value !== 'string') return key
      if (!params) return value
      return value.replace(/\{(\w+)\}/g, (_m, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`))
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t, dict: translations[lang] }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
