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

/** The day the next period starts: the date moved by the frequency, on the same day of the month where that month has it. */
export function nextRenewal(from: Date, frequency: Frequency) {
  const month = from.getMonth() + MONTHS[frequency]
  const last = new Date(from.getFullYear(), month + 1, 0).getDate()
  return new Date(from.getFullYear(), month, Math.min(from.getDate(), last))
}
