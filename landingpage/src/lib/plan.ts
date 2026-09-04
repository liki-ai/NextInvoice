import type { Invoice } from './invoice'

export const FREE_MONTHLY_LIMIT = 10
export const PREMIUM_PRICE_EUR = 20

export type Plan = 'free' | 'premium'

export function monthKey(value: Date | string = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function invoicesCreatedThisMonth(invoices: Invoice[], now = new Date()) {
  const key = monthKey(now)
  return invoices.filter((item) => monthKey(item.createdAt || item.date) === key).length
}

export function planUsage(plan: Plan | undefined, invoices: Invoice[], now = new Date()) {
  const used = invoicesCreatedThisMonth(invoices, now)
  const premium = plan === 'premium'
  return {
    plan: premium ? 'premium' : 'free',
    used,
    limit: premium ? null : FREE_MONTHLY_LIMIT,
    remaining: premium ? null : Math.max(FREE_MONTHLY_LIMIT - used, 0),
    canCreate: premium || used < FREE_MONTHLY_LIMIT,
  }
}
