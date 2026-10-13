export type MailSender = { name: string; email: string }

/** The company's mailbox connection as the server lets the browser see it; the password never comes back. */
export type MailSettings = {
  host: string
  port: number
  user: string
  hasPassword: boolean
  /** Extra addresses the company allows as sender. */
  senders: MailSender[]
  ready: boolean
  /** Everything that may stand under "From", the account's own address first. */
  from: MailSender[]
}

export type MailState = {
  mail: MailSettings
  /** Whether the server can attach the invoice as a PDF. */
  pdf: boolean
}

export type MailSettingsInput = { host: string; port: number; user: string; password?: string; senders: MailSender[] }

export type InvoiceEmailInput = { from: string; to: string; cc?: string; subject: string; body: string; lang: string; attachPdf: boolean }

export const MAIL_PROVIDERS = [
  { id: 'google', labelKey: 'mail.providerGoogle', host: 'smtp.gmail.com', port: 587 },
  { id: 'googleRelay', labelKey: 'mail.providerGoogleRelay', host: 'smtp-relay.gmail.com', port: 587 },
  { id: 'microsoft', labelKey: 'mail.providerMicrosoft', host: 'smtp.office365.com', port: 587 },
] as const

export type MailProviderId = (typeof MAIL_PROVIDERS)[number]['id'] | 'other'

export function providerOf(host: string): MailProviderId {
  return MAIL_PROVIDERS.find((item) => item.host === host.trim().toLowerCase())?.id ?? 'other'
}

export function isGoogleHost(host: string) {
  return /(^|\.)gmail\.com$/.test(host.trim().toLowerCase())
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim())
}

/** "a@x.com, b@y.com" → the addresses, or null when any of them is not one. */
export function splitRecipients(value: string): string[] | null {
  const parts = value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  return parts.every(isEmail) ? parts : null
}

const ERROR_KEYS: Record<string, string> = {
  MAIL_NOT_CONFIGURED: 'mail.errNotConfigured',
  MAIL_INCOMPLETE: 'mail.errIncomplete',
  MAIL_HOST: 'mail.errHost',
  MAIL_AUTH: 'mail.errAuth',
  MAIL_CONNECT: 'mail.errConnect',
  MAIL_REJECTED: 'mail.errRejected',
  MAIL_SENDER: 'mail.errSender',
  MAIL_RECIPIENT: 'mail.errRecipient',
  MAIL_CONTENT: 'mail.errContent',
  MAIL_LIMIT: 'mail.errLimit',
  MAIL_FAILED: 'mail.errGeneric',
  PDF_FAILED: 'mail.errPdf',
}

/** A mail failure in the user's language, with what the mail server itself said when it said something. */
export function mailErrorText(err: unknown, t: (key: string) => string) {
  const failure = err as { code?: string; detail?: string; message?: string } | null
  const key = failure?.code ? ERROR_KEYS[failure.code] : undefined
  if (!key) return failure?.message || t('mail.errGeneric')
  return failure?.detail ? `${t(key)} (${failure.detail})` : t(key)
}
