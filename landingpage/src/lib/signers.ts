import type { CompanyProfile } from './invoice'

/** A person who may sign the company's invoices (an authorized representative), with their own signature. */
export type Signer = {
  id: string
  name: string
  /** One of SIGNER_ROLES, printed in the invoice's language, or a title typed by hand and printed as typed. */
  role?: string
  /** The app user this person is: invoices they make propose their own signature. */
  userId?: string
  signatureData?: string
  /** Taken off the list. Kept for the invoices they signed, which still print their signature. */
  removed?: boolean
}

export const SIGNER_ROLES = ['managingDirector', 'administrationDirector', 'director', 'owner', 'authorizedPerson'] as const

const ROLE_LABELS: Record<string, string> = {
  managingDirector: 'roleManagingDirector',
  administrationDirector: 'roleAdministrationDirector',
  director: 'roleDirector',
  owner: 'roleOwner',
  authorizedPerson: 'roleAuthorizedPerson',
}

/** The id a company's one signature goes by while its profile still predates signers. */
export const COMPANY_SIGNER_ID = 'company'

type WithSigners = Pick<CompanyProfile, 'signers' | 'defaultSignerId' | 'signatureData' | 'contactPerson'> | null | undefined

/** Every signer, removed ones too. A profile from before signers, with one signature, counts as one signer. */
export function companySigners(company: WithSigners): Signer[] {
  if (Array.isArray(company?.signers)) return company.signers
  return company?.signatureData ? [{ id: COMPANY_SIGNER_ID, name: company.contactPerson || '', signatureData: company.signatureData }] : []
}

/** The signers still on the list. */
export function activeSigners(company: WithSigners) {
  return companySigners(company).filter((item) => !item.removed)
}

/** The signer an invoice gets when nobody picked one: the default, or else the first. */
export function defaultSigner(company: WithSigners): Signer | null {
  const active = activeSigners(company)
  return active.find((item) => item.id === company?.defaultSignerId) || active[0] || null
}

/** Who signs an invoice: the one saved on it (even if since removed from the list), or the default. */
export function invoiceSigner(company: WithSigners, signerId?: string): Signer | null {
  return (signerId ? companySigners(company).find((item) => item.id === signerId) : undefined) || defaultSigner(company)
}

/** Who a new invoice proposes: the signed-in person when they sign for the company with a signature of their own, otherwise the default. */
export function proposedSigner(company: WithSigners, accountId?: string): Signer | null {
  const own = accountId ? activeSigners(company).find((item) => item.userId === accountId && item.signatureData) : undefined
  return own || defaultSigner(company)
}

/** The key of a known role's label among the invoice texts, or '' for a title typed by hand. */
export function signerRoleKey(role?: string) {
  return ROLE_LABELS[String(role || '')] || ''
}

/** The role as printed: a known one in the language of the given texts, a typed one as typed. */
export function signerRoleText(role: string | undefined, labels: Record<string, string>) {
  const key = signerRoleKey(role)
  return key ? labels[key] || '' : String(role || '').trim()
}
