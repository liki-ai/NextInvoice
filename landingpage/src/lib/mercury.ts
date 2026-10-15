// The Mercury account (the company's US bank, in dollars) as a report: where the money comes from,
// where it goes, how that is changing, and what is worth looking at. Everything here is worked out
// from the transactions the server reads from Mercury; nothing is estimated.

export type MercuryAccount = { id: string; name: string; kind: string; status: string; last4: string; currentBalance: number; availableBalance: number; company: string }

export type MercuryTransaction = {
  id: string
  accountId: string
  /** Dollars; money out is negative. */
  amount: number
  /** The same in euros at the ECB rate of the day, when known. */
  eur: number | null
  status: string
  kind: string
  date: string
  createdAt: string
  counterparty: string
  description: string
  note: string
  category: string
  card: boolean
  link: string
}

export type MercuryView =
  | { connected: false; since: string }
  | {
      connected: true
      since: string
      accounts: MercuryAccount[]
      transactions: MercuryTransaction[]
      lastSyncAt: string | null
      lastWebhookAt: string | null
      lastError: string | null
      lastDetail: string | null
      syncing: boolean
      webhook: { configured: boolean; path: string }
    }

const round = (value: number) => Math.round(value * 100) / 100

/** Moving money between the company's own Mercury accounts is neither income nor spending. */
export function isInternal(tx: MercuryTransaction) {
  return tx.kind === 'internalTransfer' || /^mercury (checking|savings|treasury)/i.test(tx.counterparty)
}

/** One name per payer or payee, however the bank spelled it this time. */
export function partyName(tx: MercuryTransaction) {
  const name = (tx.counterparty || tx.description || '—').replace(/\s+/g, ' ').trim()
  return name.replace(/\b(inc|llc|ltd|corp|co|shpk|sh\.p\.k\.)\.?$/i, '').trim() || name
}

/** What money out went to: Mercury's own category, else what kind of payment it was. */
export function spendGroup(tx: MercuryTransaction): string {
  if (tx.category) return tx.category
  if (tx.card) return 'card'
  if (/payroll|salary|contractor|gusto|deel/i.test(`${tx.counterparty} ${tx.description} ${tx.note}`)) return 'Payroll'
  if (/fee/i.test(tx.kind) || /\bfee\b/i.test(tx.description)) return 'fees'
  return 'transfers'
}

export type MonthFlow = { month: string; in: number; out: number; net: number }
export type PartyTotal = { name: string; total: number; share: number; count: number; recent: number; before: number; change: number | null; months: number }
export type Recurring = { name: string; monthly: number; months: number; group: string }
export type Insight = { key: string; tone: 'good' | 'warn' | 'bad' | 'info'; params: Record<string, string | number> }

export type MercuryReport = {
  balance: number
  available: number
  income: number
  spending: number
  net: number
  margin: number | null
  burn: number | null
  avgIncome: number | null
  runway: number | null
  months: MonthFlow[]
  sources: PartyTotal[]
  vendors: PartyTotal[]
  groups: PartyTotal[]
  recurring: Recurring[]
  recurringMonthly: number
  insights: Insight[]
  fullMonths: string[]
}

const monthOf = (day: string) => day.slice(0, 7)

function lastFullMonths(count: number, now: Date) {
  const list: string[] = []
  for (let back = count; back >= 1; back -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1)
    list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return list
}

/** Totals by name, with how the last three full months compare with the three before them. */
function byName(list: MercuryTransaction[], name: (tx: MercuryTransaction) => string, recent: string[], before: string[]): PartyTotal[] {
  const groups = new Map<string, { total: number; count: number; recent: number; before: number; months: Set<string> }>()
  for (const tx of list) {
    const key = name(tx)
    const group = groups.get(key) ?? { total: 0, count: 0, recent: 0, before: 0, months: new Set<string>() }
    const value = Math.abs(tx.amount)
    group.total += value
    group.count += 1
    group.months.add(monthOf(tx.date))
    if (recent.includes(monthOf(tx.date))) group.recent += value
    if (before.includes(monthOf(tx.date))) group.before += value
    groups.set(key, group)
  }
  const all = [...groups.values()].reduce((sum, group) => sum + group.total, 0)
  return [...groups.entries()]
    .map(([key, group]) => ({
      name: key,
      total: round(group.total),
      share: all > 0 ? group.total / all : 0,
      count: group.count,
      recent: round(group.recent / 3),
      before: round(group.before / 3),
      change: group.before > 0 ? Math.round(((group.recent - group.before) / group.before) * 100) : null,
      months: group.months.size,
    }))
    .sort((a, b) => b.total - a.total)
}

export function buildMercuryReport(accounts: MercuryAccount[], transactions: MercuryTransaction[], year: number, now = new Date()): MercuryReport {
  const flows = transactions.filter((tx) => !isInternal(tx))
  const inYear = flows.filter((tx) => tx.date.startsWith(`${year}-`))
  const income = round(inYear.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0))
  const spending = round(inYear.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum - tx.amount, 0))

  const months: MonthFlow[] = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    const list = inYear.filter((tx) => monthOf(tx.date) === month)
    const into = round(list.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0))
    const out = round(list.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum - tx.amount, 0))
    return { month, in: into, out, net: round(into - out) }
  })

  // The last three full months, and the three before them, whatever year is shown.
  const six = lastFullMonths(6, now)
  const before = six.slice(0, 3)
  const recent = six.slice(3)
  const flowIn = (list: string[]) => flows.filter((tx) => tx.amount > 0 && list.includes(monthOf(tx.date))).reduce((sum, tx) => sum + tx.amount, 0)
  const flowOut = (list: string[]) => flows.filter((tx) => tx.amount < 0 && list.includes(monthOf(tx.date))).reduce((sum, tx) => sum - tx.amount, 0)
  const hasRecent = flows.some((tx) => recent.includes(monthOf(tx.date)))
  const burn = hasRecent ? round(flowOut(recent) / 3) : null
  const avgIncome = hasRecent ? round(flowIn(recent) / 3) : null
  const balance = round(accounts.reduce((sum, item) => sum + item.currentBalance, 0))
  const available = round(accounts.reduce((sum, item) => sum + item.availableBalance, 0))
  const netBurn = burn !== null && avgIncome !== null ? burn - avgIncome : null
  const runway = netBurn !== null && netBurn > 0 ? round(balance / netBurn) : null

  const incoming = inYear.filter((tx) => tx.amount > 0)
  const outgoing = inYear.filter((tx) => tx.amount < 0)
  const recentFlows = flows.filter((tx) => six.includes(monthOf(tx.date)))
  const sources = byName(incoming, partyName, recent, before)
  const vendors = byName(outgoing, partyName, recent, before)
  const groups = byName(outgoing, spendGroup, recent, before)

  // Subscriptions and services paid month after month (in at least three of the last four full
  // months); transfers and pay are left out, they are not something to cancel.
  const four = six.slice(2)
  const recurringMap = new Map<string, { amounts: number[]; months: Set<string>; group: string }>()
  for (const tx of recentFlows) {
    if (tx.amount >= 0 || !four.includes(monthOf(tx.date)) || ['transfers', 'Payroll'].includes(spendGroup(tx))) continue
    const key = partyName(tx)
    const item = recurringMap.get(key) ?? { amounts: [], months: new Set<string>(), group: spendGroup(tx) }
    item.amounts.push(-tx.amount)
    item.months.add(monthOf(tx.date))
    recurringMap.set(key, item)
  }
  const recurring = [...recurringMap.entries()]
    .filter(([, item]) => item.months.size >= 3)
    .map(([name, item]) => ({ name, monthly: round(item.amounts.reduce((sum, value) => sum + value, 0) / item.months.size), months: item.months.size, group: item.group }))
    .sort((a, b) => b.monthly - a.monthly)
  const recurringMonthly = round(recurring.reduce((sum, item) => sum + item.monthly, 0))

  const insights: Insight[] = []
  const inRecent = flowIn(recent)
  const inBefore = flowIn(before)
  if (inBefore > 0 && inRecent > 0) {
    const change = Math.round(((inRecent - inBefore) / inBefore) * 100)
    insights.push({ key: change >= 0 ? 'incomeUp' : 'incomeDown', tone: change >= 5 ? 'good' : change <= -5 ? 'bad' : 'info', params: { change: Math.abs(change), recent: round(inRecent / 3), before: round(inBefore / 3) } })
  }
  const outRecent = flowOut(recent)
  const outBefore = flowOut(before)
  if (outBefore > 0 && outRecent > 0) {
    const change = Math.round(((outRecent - outBefore) / outBefore) * 100)
    if (Math.abs(change) >= 10) insights.push({ key: change > 0 ? 'spendUp' : 'spendDown', tone: change > 0 ? 'warn' : 'good', params: { change: Math.abs(change), recent: round(outRecent / 3), before: round(outBefore / 3) } })
  }
  if (sources[0] && sources[0].share >= 0.6 && sources.length >= 1) insights.push({ key: 'concentration', tone: 'warn', params: { name: sources[0].name, share: Math.round(sources[0].share * 100) } })
  const grower = vendors
    .filter((item) => item.change !== null && item.change >= 30 && item.recent - item.before >= 150)
    .sort((a, b) => b.recent - b.before - (a.recent - a.before))[0]
  if (grower) insights.push({ key: 'vendorUp', tone: 'warn', params: { name: grower.name, before: grower.before, recent: grower.recent, change: grower.change as number } })
  if (recurring.length) insights.push({ key: 'recurring', tone: 'info', params: { count: recurring.length, monthly: recurringMonthly, share: outRecent > 0 ? Math.round((recurringMonthly / (outRecent / 3)) * 100) : 0 } })
  if (income > 0) {
    const margin = (income - spending) / income
    insights.push({ key: margin >= 0 ? 'marginPositive' : 'marginNegative', tone: margin >= 0.15 ? 'good' : margin >= 0 ? 'info' : 'bad', params: { margin: Math.round(margin * 100) } })
  }
  if (runway !== null) insights.push({ key: 'runway', tone: runway >= 6 ? 'info' : runway >= 3 ? 'warn' : 'bad', params: { months: Math.round(runway * 10) / 10 } })
  else if (netBurn !== null && netBurn <= 0) insights.push({ key: 'selfFunded', tone: 'good', params: { surplus: round(-netBurn) } })

  return {
    balance,
    available,
    income,
    spending,
    net: round(income - spending),
    margin: income > 0 ? (income - spending) / income : null,
    burn,
    avgIncome,
    runway,
    months,
    sources,
    vendors,
    groups,
    recurring,
    recurringMonthly,
    insights,
    fullMonths: recent,
  }
}

/** Every dollar that came in counts for iPacienti: the payments as bank credits in euros, for the Projects tab. */
export function ipacientiCredits(transactions: MercuryTransaction[]) {
  return transactions
    .filter((tx) => tx.amount > 0 && !isInternal(tx) && tx.eur !== null)
    .map((tx) => ({ date: tx.date, amount: tx.eur as number, text: `iPacienti Mercury ${tx.counterparty} ${tx.note}`.trim(), origin: 'llc' as const }))
}

export function mercuryYears(transactions: MercuryTransaction[], now = new Date()) {
  const years = new Set<number>([now.getFullYear()])
  for (const tx of transactions) {
    const year = Number(tx.date.slice(0, 4))
    if (year > 2000) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}
