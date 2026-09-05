import { formatDateForInvoice, toNumber } from './invoice'

export type ObligationStatus = 'paid' | 'unpaid'

export const OBLIGATION_CATEGORIES = ['shipping', 'supplies', 'rent', 'tax', 'other'] as const
export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number]

export type Obligation = {
  id: string
  vendor: string
  description: string
  amount: number
  date: string
  dueDate?: string
  status?: ObligationStatus
  category?: ObligationCategory
  notes?: string
  relatedInvoiceId?: string
  proofName?: string
  proofMime?: string
  proofData?: string
  proofUri?: string
  createdAt?: string
  updatedAt?: string
}

export function obligationStatus(item: Pick<Obligation, 'status'> | null | undefined): ObligationStatus {
  return item?.status === 'paid' ? 'paid' : 'unpaid'
}

export function isObligationCategory(value: unknown): value is ObligationCategory {
  return OBLIGATION_CATEGORIES.includes(value as ObligationCategory)
}

export function uniqueVendors(obligations: Obligation[]): string[] {
  const seen = new Map<string, string>()
  for (const item of obligations) {
    const name = item.vendor?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

export function vendorSummaries(obligations: Obligation[]) {
  const map = new Map<string, { vendor: string; unpaid: number; paid: number; count: number }>()
  for (const item of obligations) {
    const name = item.vendor?.trim() || ''
    const key = name.toLowerCase() || '_'
    const current = map.get(key) || { vendor: name || '—', unpaid: 0, paid: 0, count: 0 }
    const amount = Number(item.amount) || 0
    if (obligationStatus(item) === 'paid') current.paid += amount
    else current.unpaid += amount
    current.count += 1
    map.set(key, current)
  }
  return [...map.values()].sort((a, b) => b.unpaid - a.unpaid || a.vendor.localeCompare(b.vendor))
}

export function emptyObligationDraft(): Omit<Obligation, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    vendor: '',
    description: '',
    amount: 0,
    date: formatDateForInvoice(new Date()),
    dueDate: '',
    status: 'unpaid',
    category: 'shipping',
    notes: '',
    relatedInvoiceId: '',
  }
}

export function parseObligationAmount(value: unknown) {
  return Math.max(toNumber(value), 0)
}
