import type { DeliveryStatus } from './delivery'

export type Frequency = 'monthly' | 'quarterly' | 'yearly'
export type PlanKind = 'auto' | 'subscription' | 'invoice'
/** 'auto': each invoice is emailed on its day; 'manual': it is made as a draft to check and send by hand. */
export type SendMode = 'auto' | 'manual'

export type PlanItem = { description: string; quantity: number | string; unitPrice: number | string }

/** A recurring plan as it is saved: what to invoice, to whom, how often, and when to send it. */
export type RecurringPlan = {
  id: string
  clientId: string
  product: string
  kind: PlanKind
  items: PlanItem[]
  discount: number
  taxRate: number
  currency: string
  frequency: Frequency
  /** The original renewal date: the first invoiced period starts here, and every later one is counted from it. */
  anchorDate: string
  endDate: string
  sendDaysBefore: number
  dueDays: number
  graceDays: number
  lang: '' | 'sq' | 'en' | 'it'
  to: string[]
  cc: string[]
  from: string
  paymentUrl: string
  notes: string
  sendMode?: SendMode
  active: boolean
  lastError?: string | null
  createdAt?: string
  history?: { at: string; type: string; detail?: Record<string, unknown> }[]
}

/** The plan with what the server works out for it today. */
export type PlanView = RecurringPlan & {
  isSubscription: boolean
  productName: string
  next: { start: string; end: string; sendOn: string } | null
  subscription: { state: 'active' | 'grace' | 'expired'; expires: string; graceEnds: string; daysLeft: number } | null
  invoices: {
    id: string
    number: string
    period: string
    periodEnd: string
    lifecycle: string
    status: string
    total: number
    currency: string
    delivery: { status?: DeliveryStatus; scheduledFor?: string; sentAt?: string; lastError?: string | null } | null
  }[]
}

export type RecurringState = {
  plans: PlanView[]
  settings: {
    notifyEmails: string[]
    notifySent: boolean
    notifyPaid: boolean
    notifySince: string | null
    stripe: { ready: boolean; mode: string; webhookUrl: string }
  }
  today: string
  lookahead: number
}

export type PlanInput = Omit<RecurringPlan, 'id' | 'to' | 'cc' | 'history' | 'createdAt' | 'lastError'> & { to: string; cc: string }

export const FREQUENCIES: Frequency[] = ['monthly', 'quarterly', 'yearly']

const MONTHS: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/**
 * The day the next period starts: the date moved by the frequency (`times` periods on), on the same
 * day of the month where that month has it.
 */
export function nextRenewal(from: Date, frequency: Frequency, times = 1) {
  const month = from.getMonth() + MONTHS[frequency] * times
  const last = new Date(from.getFullYear(), month + 1, 0).getDate()
  return new Date(from.getFullYear(), month, Math.min(from.getDate(), last))
}

/** How often an invoice made recurring repeats, and how the next ones are sent. */
export type RepeatSettings = { frequency: Frequency; sendMode: SendMode }

export const DEFAULT_REPEAT: RepeatSettings = { frequency: 'monthly', sendMode: 'auto' }

/** How a recurring invoice is set, in words: "Çdo muaj · Automatikisht". */
export function repeatSummary(settings: RepeatSettings, t: (key: string) => string) {
  return `${t(`recurring.${settings.frequency}`)} · ${t(settings.sendMode === 'auto' ? 'recurring.sendAuto' : 'recurring.sendManual')}`
}

/** 2026-10-21 for that day, as plans store their dates. */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * When the next invoice of a plan started from an invoice of `start` comes, as the server reckons
 * it: the invoice is the first period, periods over before today are history, so the next one is
 * the first that has not ended yet. `now` says the server makes it at once: its period has begun or
 * begins within the week it looks ahead.
 */
export function firstRepeat(start: Date, frequency: Frequency, today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let k = 1
  // A period ends the day before the next begins; one over before today is skipped.
  while (k < 600 && nextRenewal(start, frequency, k + 1) <= day) k += 1
  const date = nextRenewal(start, frequency, k)
  const lookahead = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 7)
  return { date, now: date <= lookahead }
}

/** What a plan started from an invoice needs: its client and lines, how often from its date, and how it is sent. */
export function planFromInvoice(
  invoice: { id: string; clientId?: string; items: PlanItem[]; discount?: string | number; taxRate?: number | string; notes?: string; date: string; dueDate?: string },
  start: Date,
  settings: { frequency: Frequency; sendMode: SendMode },
  currency: string,
  due: Date | null,
) {
  const dueDays = due ? Math.min(120, Math.max(0, Math.round((due.getTime() - start.getTime()) / 86400000))) : 0
  return {
    firstInvoiceId: invoice.id,
    clientId: invoice.clientId || '',
    kind: 'invoice' as const,
    items: invoice.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
    discount: Number(String(invoice.discount ?? 0).replace(',', '.')) || 0,
    taxRate: Number(invoice.taxRate) || 0,
    currency,
    frequency: settings.frequency,
    anchorDate: dayKey(start),
    sendDaysBefore: 0,
    dueDays,
    graceDays: 0,
    sendMode: settings.sendMode,
    notes: invoice.notes || '',
  }
}
