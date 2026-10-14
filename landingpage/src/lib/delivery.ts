// Where an invoice stands on its way to the customer's inbox. This is apart from payment: a paid
// invoice can still be waiting to be sent, and an unpaid one can be long sent.

export type DeliveryStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'

export type InvoiceDelivery = {
  status?: DeliveryStatus
  /** The day (YYYY-MM-DD) it is due to be emailed. */
  scheduledFor?: string
  to?: string[]
  cc?: string[]
  lang?: string
  sentAt?: string
  lastError?: string | null
  lastDetail?: string | null
  nextRetryAt?: string | null
  attempts?: { at: string; ok: boolean; code?: string; manual?: boolean }[]
  template?: 'subscription' | 'invoice'
}

export type InvoiceEvent = { at: string; type: string; detail?: Record<string, unknown> }

/** The invoice was made by a recurring plan, for the period that starts on `period`. */
export type InvoiceRecurring = { planId: string; period: string; periodEnd: string; graceEnds?: string }

/** What the list shows: scheduled for a later day, ready (its day has come or it was never sent), being sent, sent, or failed. */
export type DeliveryState = 'scheduled' | 'ready' | 'sending' | 'sent' | 'failed' | 'none'

type Deliverable = { lifecycle?: string; sent?: boolean; sentAt?: string; delivery?: InvoiceDelivery | null }

export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function deliveryState(invoice: Deliverable, today = todayIso()): DeliveryState {
  if (invoice.lifecycle === 'cancelled') return 'none'
  const delivery = invoice.delivery
  if (delivery?.status === 'failed') return 'failed'
  if (delivery?.status === 'sending') return 'sending'
  if (delivery?.status === 'scheduled') return delivery.scheduledFor && delivery.scheduledFor > today ? 'scheduled' : 'ready'
  if (delivery?.status === 'sent' || invoice.sent === true || invoice.sentAt) return 'sent'
  // Issued and explicitly not sent yet: it waits for someone to send it.
  if (invoice.lifecycle === 'issued' && invoice.sent === false) return 'ready'
  return 'none'
}

/** Waiting for its email: scheduled, ready, on its way, or failed and needing a look. */
export function awaitsDelivery(invoice: Deliverable, today = todayIso()) {
  const state = deliveryState(invoice, today)
  return state === 'scheduled' || state === 'ready' || state === 'sending' || state === 'failed'
}

/** Failed first, then ready, then scheduled by date. */
export function deliveryOrder(a: Deliverable, b: Deliverable, today = todayIso()) {
  const rank: Record<DeliveryState, number> = { failed: 0, sending: 1, ready: 2, scheduled: 3, sent: 4, none: 5 }
  const ra = rank[deliveryState(a, today)]
  const rb = rank[deliveryState(b, today)]
  if (ra !== rb) return ra - rb
  return String(a.delivery?.scheduledFor || '').localeCompare(String(b.delivery?.scheduledFor || ''))
}

/** "2026-11-01" as 01.11.2026. */
export function printDay(iso?: string | null) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** A mail failure in words, from the delivery's own code or an error thrown by the API. */
export function deliveryErrorText(code: string | null | undefined, t: (key: string) => string) {
  if (!code) return ''
  const key = `recurring.err.${code}`
  const text = t(key)
  return text === key ? t('recurring.err.MAIL_FAILED') : text
}

/** A moment as 14.10.2026 12:32, the same in every browser. */
export function printMoment(iso?: string | null) {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`
}
