// What the recorded invoices, payments, expenses and clients say needs attention, ordered by how
// much it matters. Everything here is arithmetic on the user's own records: it points at things to
// look into, it does not judge them. Revenue is counted net of VAT; open amounts are what is owed,
// VAT included.

import { activePayments, daysOverdue, isActiveDocument, parseLooseDate, remainingOf, type ClientRecord } from './document'
import { toNumber, type Invoice } from './invoice'
import { docCurrency } from './overview'
import type { Obligation } from './obligation'

export type InsightSeverity = 'high' | 'medium' | 'low'

export type InsightId =
  | 'overdue'
  | 'paymentDates'
  | 'noExpenses'
  | 'yearPace'
  | 'concentration'
  | 'clientsDown'
  | 'clientsGone'
  | 'yearEnd'
  | 'records'
  | 'clientData'
  | 'daysToPay'
  | 'smallInvoices'
  | 'terms'
  | 'flatPrices'

/** A line of detail under a finding. `money` values are amounts; `note` says how to read the row. */
export type InsightRow = {
  label: string
  money?: number
  text?: string
  note?: { key: string; params?: Record<string, string | number>; money?: Record<string, number> }
}

export type Insight = {
  id: InsightId
  severity: InsightSeverity
  /** Higher comes first. */
  priority: number
  /** Numbers for the sentences; `money` ones are amounts in the report's currency. */
  params: Record<string, string | number>
  money: Record<string, number>
  rows: InsightRow[]
  /** Where in the app the matter is dealt with. */
  link?: string
  /** A variant of the wording, when one finding reads differently by direction (up or down). */
  variant?: string
}

export type InsightsReport = {
  insights: Insight[]
  /** Whether last year's invoices are there to compare with. */
  hasLastYear: boolean
  year: number
}

const DAY = 86400000
const cents = (value: number) => Math.round(value * 100) / 100
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

type Row = { invoice: Invoice; date: Date; net: number; client: string; clientName: string }

function clientKey(invoice: Invoice) {
  const name = String(invoice.client?.fullName || '').trim()
  return invoice.clientId || invoice.client?.id || name.toLowerCase()
}

/** A line's description without the month, year and numbers that change from invoice to invoice. */
function stem(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b(janar|shkurt|mars|prill|maj|qershor|korrik|gusht|shtator|tetor|n[eë]ntor|dhjetor|january|february|march|april|may|june|july|august|september|october|november|december|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/g, '')
    .replace(/\d+/g, '')
    .replace(/[^\p{L} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function sameDay(a: Date | null, b: Date | null) {
  return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate())
}

export function buildInsights({
  invoices,
  obligations,
  clients,
  currency,
  fallbackCurrency = 'EUR',
  now = new Date(),
}: {
  invoices: Invoice[]
  obligations: Obligation[]
  clients: ClientRecord[]
  currency: string
  fallbackCurrency?: string
  now?: Date
}): InsightsReport {
  const year = now.getFullYear()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rows: Row[] = []
  for (const invoice of invoices) {
    if (!isActiveDocument(invoice) || docCurrency(invoice, fallbackCurrency) !== currency) continue
    const date = parseLooseDate(invoice.date)
    if (!date) continue
    const net = cents(toNumber(invoice.total) - toNumber(invoice.taxAmount ?? 0))
    rows.push({ invoice, date, net, client: clientKey(invoice), clientName: String(invoice.client?.fullName || '').trim() })
  }
  const names = new Map<string, string>()
  for (const row of [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())) if (row.clientName) names.set(row.client, row.clientName)
  const nameOf = (key: string) => names.get(key) || key

  const sum = (list: Row[]) => cents(list.reduce((total, row) => total + row.net, 0))
  const byClient = (list: Row[]) => {
    const map = new Map<string, Row[]>()
    for (const row of list) {
      const group = map.get(row.client)
      if (group) group.push(row)
      else map.set(row.client, [row])
    }
    return map
  }
  const inYear = (y: number) => rows.filter((row) => row.date.getFullYear() === y)
  const toDate = (list: Row[]) => list.filter((row) => row.date.getMonth() < today.getMonth() || (row.date.getMonth() === today.getMonth() && row.date.getDate() <= today.getDate()))

  const thisYear = inYear(year)
  const lastYear = inYear(year - 1)
  const lastToDate = toDate(lastYear)
  const hasLastYear = lastYear.length > 0
  const insights: Insight[] = []
  const add = (insight: Omit<Insight, 'params' | 'money' | 'rows'> & Partial<Pick<Insight, 'params' | 'money' | 'rows'>>) =>
    insights.push({ params: {}, money: {}, rows: [], ...insight })

  // ---- money owed and past its due date
  const open = rows.map((row) => ({ row, left: remainingOf(row.invoice), late: daysOverdue(row.invoice, now) })).filter((item) => item.left > 0.005)
  const pastDue = open.filter((item) => item.late > 0)
  if (pastDue.length > 0) {
    const lateByClient = new Map<string, { left: number; late: number; count: number }>()
    for (const item of pastDue) {
      const entry = lateByClient.get(item.row.client) || { left: 0, late: 0, count: 0 }
      entry.left = cents(entry.left + item.left)
      entry.late = Math.max(entry.late, item.late)
      entry.count += 1
      lateByClient.set(item.row.client, entry)
    }
    const pastDueTotal = cents(pastDue.reduce((total, item) => total + item.left, 0))
    add({
      id: 'overdue',
      severity: 'high',
      priority: 100,
      params: { count: open.length, lateCount: pastDue.length },
      money: { open: cents(open.reduce((total, item) => total + item.left, 0)), pastDue: pastDueTotal },
      rows: [...lateByClient.entries()]
        .sort((a, b) => b[1].left - a[1].left)
        .slice(0, 6)
        .map(([key, entry]) => ({ label: nameOf(key), money: entry.left, note: { key: 'insights.daysLate', params: { days: entry.late, count: entry.count } } })),
      link: '/app',
    })
  }

  // ---- payments that carry the invoice's own date, so nothing can be said about who pays late
  const payments = rows.flatMap((row) => activePayments(row.invoice.payments).map((payment) => ({ row, payment, paid: parseLooseDate(payment.date) })))
  const undated = payments.filter((item) => !item.paid || sameDay(item.paid, item.row.date))
  const datesUnreliable = payments.length >= 5 && undated.length / payments.length >= 0.6
  if (datesUnreliable) {
    add({ id: 'paymentDates', severity: 'high', priority: 90, params: { same: undated.length, count: payments.length }, link: '/app' })
  }

  // ---- no expenses recorded
  const since = today.getTime() - 90 * DAY
  const recentInvoiced = sum(rows.filter((row) => row.date.getTime() >= since))
  const recentExpenses = obligations.filter((item) => {
    if (!isActiveDocument(item)) return false
    const date = parseLooseDate(item.date)
    return Boolean(date && date.getTime() >= since)
  })
  if (recentInvoiced > 0 && recentExpenses.length === 0) {
    add({ id: 'noExpenses', severity: 'high', priority: 85, params: { total: obligations.length }, money: { invoiced: recentInvoiced }, link: '/app/obligations' })
  }

  // ---- how the year is going against the last one
  const netNow = sum(thisYear)
  const netBefore = sum(lastToDate)
  const netLastFull = sum(lastYear)
  if (netBefore > 0 && thisYear.length > 0) {
    // One large invoice can swing the comparison to date, so the finding leads with what is still
    // missing to match last year and gives the comparison as detail.
    const change = Math.round(((netNow - netBefore) / netBefore) * 1000) / 10
    const needed = Math.max(cents(netLastFull - netNow), 0)
    add({
      id: 'yearPace',
      severity: needed === 0 ? 'low' : change <= -10 ? 'high' : change < 0 ? 'medium' : 'low',
      priority: needed === 0 ? 10 : change < 0 ? 75 : 52,
      variant: needed === 0 ? 'ahead' : 'behind',
      params: { change: `${change > 0 ? '+' : ''}${change}`, year: year - 1 },
      money: { now: netNow, before: netBefore, lastFull: netLastFull, needed },
    })
  }

  // ---- a few clients carry the year
  const ranked = [...byClient(thisYear).entries()].map(([key, list]) => ({ key, net: sum(list), count: list.length })).sort((a, b) => b.net - a.net)
  if (ranked.length >= 4 && netNow > 0) {
    const top = (n: number) => share(ranked.slice(0, n).reduce((total, item) => total + item.net, 0), netNow)
    if (top(1) >= 35 || top(3) >= 50) {
      add({
        id: 'concentration',
        severity: top(1) >= 50 || top(3) >= 70 ? 'high' : 'medium',
        priority: 70,
        params: { top1Name: nameOf(ranked[0].key), top1: top(1), top3: top(3), top5: top(5), clients: ranked.length },
        rows: ranked.slice(0, 5).map((item) => ({ label: nameOf(item.key), money: item.net, text: `${share(item.net, netNow)}%` })),
        link: '/app/clients',
      })
    }
  }

  // ---- clients bringing much less than in the same months last year, and clients gone
  if (hasLastYear) {
    const nowBy = byClient(thisYear)
    const beforeBy = byClient(lastToDate)
    const down = [...beforeBy.entries()]
      .map(([key, list]) => ({ key, before: sum(list), now: sum(nowBy.get(key) || []) }))
      .filter((item) => item.now > 0 && item.before >= netBefore * 0.02 && item.now <= item.before * 0.7)
      .sort((a, b) => b.before - b.now - (a.before - a.now))
    if (down.length > 0) {
      add({
        id: 'clientsDown',
        severity: 'medium',
        priority: 65,
        params: { count: down.length },
        money: { lost: cents(down.reduce((total, item) => total + (item.before - item.now), 0)) },
        rows: down.slice(0, 6).map((item) => ({ label: nameOf(item.key), money: item.now, note: { key: 'insights.wasBefore', money: { before: item.before }, params: { change: Math.round(((item.now - item.before) / item.before) * 100) } } })),
        link: '/app/clients',
      })
    }
    const gone = [...byClient(lastYear).entries()]
      .filter(([key]) => !nowBy.has(key))
      .map(([key, list]) => ({ key, net: sum(list) }))
      .sort((a, b) => b.net - a.net)
    if (gone.length > 0) {
      add({
        id: 'clientsGone',
        severity: 'medium',
        priority: 60,
        params: { count: gone.length, year: year - 1 },
        money: { amount: cents(gone.reduce((total, item) => total + item.net, 0)) },
        rows: gone.slice(0, 6).map((item) => ({ label: nameOf(item.key), money: item.net })),
        link: '/app/clients',
      })
    }
    const quarter4 = sum(lastYear.filter((row) => row.date.getMonth() >= 9))
    if (netLastFull > 0 && share(quarter4, netLastFull) >= 45) {
      add({ id: 'yearEnd', severity: 'medium', priority: 55, params: { share: share(quarter4, netLastFull), year: year - 1 }, money: { amount: quarter4 } })
    }
  }

  // ---- numbering and dates that would need explaining
  const numbered = thisYear.map((row) => ({ row, match: String(row.invoice.number || '').match(/^(\d{4})(\d{2})-(\d+)$/) })).filter((item) => item.match)
  const missing: string[] = []
  const byPrefix = new Map<string, number[]>()
  for (const item of numbered) {
    const prefix = `${item.match![1]}${item.match![2]}`
    byPrefix.set(prefix, [...(byPrefix.get(prefix) || []), Number(item.match![3])])
  }
  for (const [prefix, list] of [...byPrefix.entries()].sort()) {
    const width = Math.max(3, String(Math.max(...list)).length)
    for (let n = 1; n <= Math.max(...list); n += 1) if (!list.includes(n)) missing.push(`${prefix}-${String(n).padStart(width, '0')}`)
  }
  const misdated = numbered.filter((item) => Number(item.match![1]) !== item.row.date.getFullYear() || Number(item.match![2]) !== item.row.date.getMonth() + 1).map((item) => String(item.row.invoice.number))
  const noDue = thisYear.filter((row) => !parseLooseDate(row.invoice.dueDate)).length
  if (missing.length + misdated.length + noDue > 0) {
    const list = (items: string[]) => (items.length > 6 ? `${items.slice(0, 6).join(', ')} …` : items.join(', '))
    const detail: InsightRow[] = []
    if (missing.length) detail.push({ label: '', note: { key: 'insights.recordsMissing', params: { count: missing.length } }, text: list(missing) })
    if (misdated.length) detail.push({ label: '', note: { key: 'insights.recordsMisdated', params: { count: misdated.length } }, text: list(misdated) })
    if (noDue) detail.push({ label: '', note: { key: 'insights.recordsNoDue', params: { count: noDue } } })
    add({ id: 'records', severity: 'medium', priority: 50, params: { count: missing.length + misdated.length + noDue }, rows: detail, link: '/app' })
  }

  // ---- clients that cannot be emailed, or whose invoices lack their number
  const noEmail = clients.filter((item) => !String(item.email || '').trim()).length
  const noNui = clients.filter((item) => !String(item.businessId || '').trim()).length
  if (clients.length > 0 && (noEmail / clients.length >= 0.3 || noNui / clients.length >= 0.3)) {
    add({ id: 'clientData', severity: 'medium', priority: 45, params: { total: clients.length, noEmail, noNui }, link: '/app/clients' })
  }

  // ---- how long clients take to pay, once payments carry their real dates
  const dueDays = (row: Row) => {
    const due = parseLooseDate(row.invoice.dueDate)
    return due ? Math.round((due.getTime() - row.date.getTime()) / DAY) : null
  }
  const termed = thisYear.map((row) => ({ row, days: dueDays(row), total: toNumber(row.invoice.total) })).filter((item) => item.days !== null && item.days >= 0 && item.total > 0)
  const weightedTerm = termed.length ? Math.round(termed.reduce((total, item) => total + (item.days as number) * item.total, 0) / termed.reduce((total, item) => total + item.total, 0)) : 0
  if (!datesUnreliable && payments.length >= 5) {
    const timed = payments.filter((item) => item.paid && item.paid.getTime() >= item.row.date.getTime() && item.row.date.getFullYear() >= year - 1)
    const weight = timed.reduce((total, item) => total + toNumber(item.payment.amount), 0)
    if (timed.length >= 5 && weight > 0) {
      const days = Math.round(timed.reduce((total, item) => total + ((item.paid as Date).getTime() - item.row.date.getTime()) / DAY * toNumber(item.payment.amount), 0) / weight)
      const slow = [...new Set(timed.map((item) => item.row.client))]
        .map((key) => {
          const list = timed.filter((item) => item.row.client === key)
          const amount = list.reduce((total, item) => total + toNumber(item.payment.amount), 0)
          return { key, count: list.length, days: Math.round(list.reduce((total, item) => total + ((item.paid as Date).getTime() - item.row.date.getTime()) / DAY * toNumber(item.payment.amount), 0) / amount) }
        })
        .filter((item) => item.count >= 2 && item.days > weightedTerm)
        .sort((a, b) => b.days - a.days)
      if (days > weightedTerm + 7 || slow.length > 0) {
        add({
          id: 'daysToPay',
          severity: days > weightedTerm + 15 ? 'medium' : 'low',
          priority: 44,
          params: { days, term: weightedTerm },
          rows: slow.slice(0, 5).map((item) => ({ label: nameOf(item.key), note: { key: 'insights.daysAverage', params: { days: item.days, count: item.count } } })),
        })
      }
    }
  }

  // ---- many invoices for little money
  if (thisYear.length >= 20 && netNow > 0) {
    const average = netNow / thisYear.length
    const small = ranked.filter((item) => item.count >= 5 && item.net / item.count < average * 0.3)
    const count = small.reduce((total, item) => total + item.count, 0)
    const net = small.reduce((total, item) => total + item.net, 0)
    if (share(count, thisYear.length) >= 25 && share(net, netNow) <= 15) {
      add({
        id: 'smallInvoices',
        severity: 'low',
        priority: 40,
        params: { clients: small.length, invoiceShare: share(count, thisYear.length), revenueShare: share(net, netNow), count },
        rows: [...small]
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
          .map((item) => ({ label: nameOf(item.key), money: item.net, note: { key: 'insights.invoicesAverage', params: { count: item.count }, money: { avg: cents(item.net / item.count) } } })),
      })
    }
  }

  // ---- the same client on different payment terms from one invoice to the next
  const termsBy = new Map<string, number[]>()
  for (const item of termed) termsBy.set(item.row.client, [...(termsBy.get(item.row.client) || []), item.days as number])
  const mixed = [...termsBy.entries()].filter(([, list]) => list.length >= 3 && new Set(list).size >= 2).sort((a, b) => b[1].length - a[1].length)
  if (mixed.length >= 2) {
    add({
      id: 'terms',
      severity: 'low',
      priority: 35,
      params: { days: weightedTerm, count: mixed.length },
      rows: mixed.slice(0, 6).map(([key, list]) => ({ label: nameOf(key), note: { key: 'insights.termDays', params: { terms: [...new Set(list)].sort((a, b) => a - b).join(' / ') } } })),
      link: '/app/clients',
    })
  }

  // ---- services billed again and again at a price that has never moved
  const series = new Map<string, { date: Date; price: number; amount: number; client: string; description: string }[]>()
  for (const row of rows) {
    for (const line of row.invoice.items || []) {
      const price = toNumber(line.unitPrice)
      const key = `${row.client}|${stem(line.description)}`
      if (!(price > 0) || key.endsWith('|')) continue
      series.set(key, [...(series.get(key) || []), { date: row.date, price: cents(price), amount: cents(price * toNumber(line.quantity)), client: row.client, description: String(line.description || '').trim() }])
    }
  }
  const flat = [...series.values()]
    .map((list) => [...list].sort((a, b) => a.date.getTime() - b.date.getTime()))
    .filter((list) => list.length >= 8 && list[list.length - 1].date.getFullYear() === year && list[list.length - 1].date.getTime() - list[0].date.getTime() >= 548 * DAY && new Set(list.map((item) => item.price)).size === 1)
    .map((list) => ({ client: list[0].client, description: list[list.length - 1].description, since: list[0].date, price: list[0].price, amount: cents(list.filter((item) => item.date.getFullYear() === year).reduce((total, item) => total + item.amount, 0)) }))
    .sort((a, b) => b.amount - a.amount)
  if (flat.length > 0) {
    add({
      id: 'flatPrices',
      severity: 'low',
      priority: 30,
      params: { count: flat.length },
      money: { amount: cents(flat.reduce((total, item) => total + item.amount, 0)) },
      rows: flat.slice(0, 6).map((item) => ({
        label: `${nameOf(item.client)} · ${item.description.replace(/\s+/g, ' ').slice(0, 48)}`,
        money: item.price,
        note: { key: 'insights.sameSince', params: { since: `${String(item.since.getMonth() + 1).padStart(2, '0')}.${item.since.getFullYear()}` } },
      })),
    })
  }

  insights.sort((a, b) => b.priority - a.priority)
  return { insights, hasLastYear, year }
}
