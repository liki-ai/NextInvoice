import type { DeliveryStatus } from './delivery'

export type Frequency = 'monthly' | 'quarterly' | 'yearly'
export type PlanKind = 'auto' | 'subscription' | 'invoice'

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
