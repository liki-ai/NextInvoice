// The entry point the API server is built from (see scripts/build-server-render.mjs). It gives the
// server the same invoice page and the same words the web app uses, so an invoice attached to an
// email is the page the user previewed. Nothing here may depend on React or on the browser.

import { isLang, pdfLabelsIn, translateIn, type Lang } from '../i18nCore'
import { companyForPdf, stripSampleCompanyFields } from './companySamples'
import { type Client, type CompanyProfile, type Invoice } from './invoice'
import { buildInvoiceHtml } from './invoiceTemplates'

export { isLang }
export { formatMoney } from './invoice'

/** The company's details without the sample values a new account starts with. */
export function realCompany(profile: CompanyProfile) {
  return stripSampleCompanyFields(profile)
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>) {
  return translateIn(lang, key, params)
}

/** The printable invoice page, with its labels in the given language. */
export function renderInvoiceHtml({ invoice, profile, lang }: { invoice: Invoice; profile: CompanyProfile; lang: Lang }) {
  const client = (invoice.clientSnapshot || invoice.client) as Client
  return buildInvoiceHtml({
    company: companyForPdf(invoice, profile, (key) => translateIn(lang, key)),
    client,
    invoice,
    pdfLabels: pdfLabelsIn(lang),
  })
}
