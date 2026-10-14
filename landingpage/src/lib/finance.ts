// The company's financial health: the documents its accountant and bank send (read on the server),
// put together with the invoices kept here, into the few figures an owner watches and the monthly
// detail behind them.

import { parseLooseDate } from './document'
import type { Invoice } from './invoice'
import { buildOverview, startOfDay } from './overview'

export const FINANCE_KINDS = [
  'vat_return',
  'payroll_tax',
  'rent_tax',
  'profit_tax',
  'other_tax',
  'payroll',
  'sales_book',
  'purchase_book',
  'financial_statements',
  'bank_statement',
  'supplier_invoice',
  'own_invoice',
  'legal',
  'other',
] as const
export type FinanceKind = (typeof FINANCE_KINDS)[number]

type N = number | null

export type FinanceFigures = {
  tax?: { taxBase: N; outputVat: N; inputVat: N; vatPayable: N; wageTax: N; pensionEmployee: N; pensionEmployer: N; rentTax: N; profitTax: N } | null
  payroll?: { employees: N; gross: N; net: N; wageTax: N; pensionEmployee: N; pensionEmployer: N; totalCost: N } | null
  book?: { count: N; net: N; vat: N; gross: N } | null
  statements?: {
    revenue: N
    otherIncome: N
    costOfSales: N
    staffCosts: N
    operatingExpenses: N
    depreciation: N
    profitBeforeTax: N
    incomeTax: N
    netProfit: N
    totalAssets: N
    cash: N
    receivables: N
    totalLiabilities: N
    payables: N
    equity: N
  } | null
  invoice?: { number: string; counterparty: string; date: string; net?: N; vat?: N; total: N; inApp?: boolean; invoiceId?: string | null } | null
  bank?: { iban: string; from: string; to: string; openingBalance: N; closingBalance: N; totalIn: N; totalOut: N } | null
  months?: { period: string; gross: N; net: N; wageTax: N; pension: N; amount: N }[] | null
}

export type SettledInvoice = {
  invoiceId: string
  number: string
  client: string
  currency: string
  amount: number
  dates: string[]
  paymentIds: string[]
  paidInFull: boolean
  undoneAt?: string
}

export type ReviewInvoice = { invoiceId: string; number: string; client: string; change: string; basis: string; bankPaid: number; recorded: number; currency: string }

export type FinanceDoc = {
  id: string
  name: string
  mime: string
  size: number
  source: 'email' | 'email-body' | 'upload'
  email: { messageId: string; date: string | null; subject: string; from: string; fromName: string; to: string[]; cc: string[] } | null
  receivedAt: string
  addedAt: string
  status: 'pending' | 'done' | 'failed'
  error?: string | null
  kind?: FinanceKind
  period?: string
  title?: string
  summary?: string
  issuer?: string
  currency?: string
  dueDate?: string
  amountDue?: N
  figures?: FinanceFigures
  statement?: {
    from: string
    to: string
    credits: number
    totalIn: number
    loose: number
    looseTotal: number
    auto: boolean
    matchedAt: string
    applied: SettledInvoice[]
    review: ReviewInvoice[]
  } | null
  excluded?: boolean
  hasFile: boolean
}

export type MailboxSummary = { ready: boolean; email: string }

export type FinanceView = {
  settings: {
    enabled: boolean
    box: 'company' | 'personal'
    boxIsMine: boolean
    watch: string[]
    since: string
    imapHost: string
    imapHostDefault: string
    autoBank: boolean
  }
  mailboxes: { company: MailboxSummary; personal: MailboxSummary }
  check: { lastAt: string | null; lastError: string | null; lastDetail: string | null; found: number }
  progress: { checking: boolean; fetched: number; remaining: number; reading: number }
  messages: number
  documents: FinanceDoc[]
}

const round = (value: number) => Math.round(value * 100) / 100
const has = (value: N | undefined): value is number => typeof value === 'number' && Number.isFinite(value)
const sum = (...values: (N | undefined)[]) => {
  const known = values.filter(has)
  return known.length ? round(known.reduce((total, value) => total + value, 0)) : null
}

/** Names that differ only by "edit", "final", a copy number or the extension are one document sent again. */
function sameDocumentKey(doc: FinanceDoc) {
  const name = String(doc.source === 'email-body' ? '' : doc.name)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/\b(edit|edited|final|korrigjuar|perfundimtar|copy|kopje|v\d+)\b|\(\d+\)/g, '')
    .replace(/[^a-z]/g, '')
  return `${doc.kind}|${doc.period}|${name}`
}

/** The documents that count: read, not set aside, and only the newest of anything sent twice. */
export function currentDocuments(docs: FinanceDoc[]) {
  const latest = new Map<string, FinanceDoc>()
  for (const doc of docs) {
    if (doc.status !== 'done' || doc.excluded || !doc.kind) continue
    const key = sameDocumentKey(doc)
    const seen = latest.get(key)
    if (!seen || String(doc.receivedAt) > String(seen.receivedAt)) latest.set(key, doc)
  }
  return [...latest.values()]
}

export type MonthFigures = {
  period: string
  invoiced: number
  collected: number
  salesNet: N
  salesVat: N
  purchasesNet: N
  purchasesVat: N
  vat: N
  payrollTax: N
  rentTax: N
  profitTax: N
  otherTax: N
  payrollGross: N
  payrollNet: N
  payrollCost: N
  employees: N
  kinds: Set<FinanceKind>
}

function taxAmount(doc: FinanceDoc): N {
  const tax = doc.figures?.tax
  if (doc.kind === 'vat_return') return has(doc.amountDue) ? doc.amountDue : has(tax?.vatPayable) ? tax.vatPayable : null
  if (doc.kind === 'payroll_tax') return has(doc.amountDue) ? doc.amountDue : sum(tax?.wageTax, tax?.pensionEmployee, tax?.pensionEmployer)
  if (doc.kind === 'rent_tax') return has(doc.amountDue) ? doc.amountDue : tax?.rentTax ?? null
  if (doc.kind === 'profit_tax') return has(doc.amountDue) ? doc.amountDue : tax?.profitTax ?? null
  if (doc.kind === 'other_tax') return has(doc.amountDue) ? doc.amountDue : null
  return null
}

function payrollCost(payroll: FinanceFigures['payroll']): N {
  if (!payroll) return null
  if (has(payroll.totalCost)) return payroll.totalCost
  if (has(payroll.gross)) return sum(payroll.gross, payroll.pensionEmployer)
  return null
}

const add = (current: N, value: N | undefined) => (has(value) ? round((current ?? 0) + value) : current)

function emptyMonth(period: string): MonthFigures {
  return {
    period,
    invoiced: 0,
    collected: 0,
    salesNet: null,
    salesVat: null,
    purchasesNet: null,
    purchasesVat: null,
    vat: null,
    payrollTax: null,
    rentTax: null,
    profitTax: null,
    otherTax: null,
    payrollGross: null,
    payrollNet: null,
    payrollCost: null,
    employees: null,
    kinds: new Set(),
  }
}

/** The month a quarter's tax belongs to in a monthly table: the quarter's last month. */
function monthOf(period: string) {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period)
  if (quarter) return `${quarter[1]}-${String(Number(quarter[2]) * 3).padStart(2, '0')}`
  return /^\d{4}-\d{2}$/.test(period) ? period : ''
}

/** Month by month for one year: what was invoiced and collected here, and what the accountant's documents say. */
export function monthlyFigures(docs: FinanceDoc[], invoices: Invoice[], year: number, currency: string): MonthFigures[] {
  const months = Array.from({ length: 12 }, (_, index) => emptyMonth(`${year}-${String(index + 1).padStart(2, '0')}`))
  const byPeriod = new Map(months.map((month) => [month.period, month]))

  months.forEach((month, index) => {
    const report = buildOverview({ invoices, period: { start: new Date(year, index, 1), end: new Date(year, index + 1, 0) }, currency, fallbackCurrency: currency })
    month.invoiced = report.invoiced
    month.collected = report.paymentsReceived
  })

  const covered = new Set<string>()
  for (const doc of docs) {
    const month = byPeriod.get(monthOf(doc.period || ''))
    if (!month || !doc.kind) continue
    month.kinds.add(doc.kind)
    const book = doc.figures?.book
    const payroll = doc.figures?.payroll
    switch (doc.kind) {
      case 'vat_return':
        month.vat = add(month.vat, taxAmount(doc))
        break
      case 'payroll_tax':
        month.payrollTax = add(month.payrollTax, taxAmount(doc))
        break
      case 'rent_tax':
        month.rentTax = add(month.rentTax, taxAmount(doc))
        break
      case 'profit_tax':
        month.profitTax = add(month.profitTax, taxAmount(doc))
        break
      case 'other_tax':
        month.otherTax = add(month.otherTax, taxAmount(doc))
        break
      case 'sales_book':
        month.salesNet = add(month.salesNet, book?.net)
        month.salesVat = add(month.salesVat, book?.vat)
        break
      case 'purchase_book':
        month.purchasesNet = add(month.purchasesNet, book?.net)
        month.purchasesVat = add(month.purchasesVat, book?.vat)
        break
      case 'payroll':
        // A payroll list and a table of net salaries for the same month describe the same pay; keep the fuller one.
        if (!has(month.payrollGross) || has(payroll?.gross)) {
          if (has(payroll?.gross)) month.payrollGross = payroll.gross
          if (has(payroll?.net)) month.payrollNet = payroll.net
          if (has(payrollCost(payroll))) month.payrollCost = payrollCost(payroll)
          if (has(payroll?.employees)) month.employees = payroll.employees
        } else if (!has(month.payrollNet) && has(payroll?.net)) month.payrollNet = payroll.net
        covered.add(month.period)
        break
    }
  }

  // A list covering several months fills in the months no list of their own covers.
  for (const doc of docs) {
    if (doc.kind !== 'payroll' || !doc.figures?.months?.length) continue
    for (const part of doc.figures.months) {
      const month = byPeriod.get(monthOf(part.period))
      if (!month || covered.has(month.period)) continue
      month.kinds.add('payroll')
      if (has(part.gross)) month.payrollGross = part.gross
      if (has(part.net)) month.payrollNet = part.net
      if (has(part.gross)) month.payrollCost = part.gross
    }
  }
  return months
}

export type HealthStatus = 'good' | 'warn' | 'bad' | 'unknown'
export type HealthSignal = { key: 'collection' | 'liquidity' | 'documents' | 'profit' | 'result'; status: HealthStatus; params: Record<string, string | number> }

export type FinanceSummary = {
  cash: { amount: number; date: string; docId: string } | null
  revenue: number
  revenueLastYear: number
  collected: number
  receivables: number
  overdue: number
  taxesPaid: number
  taxesByKind: Record<'vat' | 'payroll' | 'rent' | 'profit' | 'other', number>
  payroll: { period: string; cost: N; net: N; employees: N } | null
  annual: { year: string; revenue: N; netProfit: N; profitBeforeTax: N; margin: N; docId: string } | null
  estimate: { result: number; months: number } | null
  burn: N
  missing: { period: string; kinds: FinanceKind[] } | null
  upcoming: FinanceDoc[]
  signals: HealthSignal[]
}

function lastStatementCash(docs: FinanceDoc[]) {
  let best: FinanceSummary['cash'] = null
  for (const doc of docs) {
    if (doc.kind !== 'bank_statement') continue
    const bank = doc.figures?.bank
    if (!bank || !has(bank.closingBalance)) continue
    const day = (value: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? (value as string) : '')
    const date = day(bank.to) || day(doc.statement?.to) || doc.period || doc.receivedAt.slice(0, 10)
    if (!best || date > best.date) best = { amount: bank.closingBalance, date, docId: doc.id }
  }
  return best
}

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** The month whose tax documents should be in by now: last month once the 20th has passed, else the one before. */
export function expectedMonth(now = new Date()) {
  const back = now.getDate() > 20 ? 1 : 2
  const date = new Date(now.getFullYear(), now.getMonth() - back, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function buildFinanceSummary(allDocs: FinanceDoc[], invoices: Invoice[], year: number, currency: string, now = new Date()): FinanceSummary {
  const docs = currentDocuments(allDocs)
  const today = startOfDay(now)
  const isThisYear = year === now.getFullYear()
  const end = isThisYear ? today : new Date(year, 11, 31)
  const ytd = buildOverview({ invoices, period: { start: new Date(year, 0, 1), end }, currency, fallbackCurrency: currency })
  const lastYearEnd = new Date(year - 1, end.getMonth(), end.getDate())
  const before = buildOverview({ invoices, period: { start: new Date(year - 1, 0, 1), end: lastYearEnd }, currency, fallbackCurrency: currency })
  const open = buildOverview({ invoices, period: { start: today, end: today }, currency, fallbackCurrency: currency })
  const overdue = round(
    open.receivableDocs
      .filter((doc) => {
        const due = parseLooseDate(doc.dueDate)
        return due && startOfDay(due) < today
      })
      .reduce((total, doc) => total + doc.amountDueAsOf, 0),
  )

  const months = monthlyFigures(docs, invoices, year, currency)
  const taxesByKind = { vat: 0, payroll: 0, rent: 0, profit: 0, other: 0 }
  for (const month of months) {
    taxesByKind.vat = round(taxesByKind.vat + (month.vat ?? 0))
    taxesByKind.payroll = round(taxesByKind.payroll + (month.payrollTax ?? 0))
    taxesByKind.rent = round(taxesByKind.rent + (month.rentTax ?? 0))
    taxesByKind.profit = round(taxesByKind.profit + (month.profitTax ?? 0))
    taxesByKind.other = round(taxesByKind.other + (month.otherTax ?? 0))
  }
  // The annual corporate declaration has a year for its period, not a month.
  for (const doc of docs) if (doc.kind === 'profit_tax' && doc.period === String(year)) taxesByKind.profit = round(taxesByKind.profit + (taxAmount(doc) ?? 0))
  const taxesPaid = round(Object.values(taxesByKind).reduce((total, value) => total + value, 0))

  const payrollMonth = [...months].reverse().find((month) => has(month.payrollCost) || has(month.payrollNet))
  const payroll = payrollMonth ? { period: payrollMonth.period, cost: payrollMonth.payrollCost, net: payrollMonth.payrollNet, employees: payrollMonth.employees } : null

  const annualDoc = docs
    .filter((doc) => doc.kind === 'financial_statements' && /^\d{4}$/.test(doc.period || '') && doc.figures?.statements)
    .sort((a, b) => String(b.period).localeCompare(String(a.period)) || String(b.receivedAt).localeCompare(String(a.receivedAt)))[0]
  const statements = annualDoc?.figures?.statements
  const annual = annualDoc && statements
    ? {
        year: String(annualDoc.period),
        revenue: statements.revenue,
        netProfit: statements.netProfit,
        profitBeforeTax: statements.profitBeforeTax,
        margin: has(statements.netProfit) && has(statements.revenue) && statements.revenue > 0 ? statements.netProfit / statements.revenue : null,
        docId: annualDoc.id,
      }
    : null

  // What the year has earned so far, as far as the books show: sales less purchases less pay.
  const booked = months.filter((month) => has(month.salesNet) && (has(month.purchasesNet) || has(month.payrollCost)))
  const estimate = booked.length
    ? { result: round(booked.reduce((total, month) => total + (month.salesNet ?? 0) - (month.purchasesNet ?? 0) - (month.payrollCost ?? 0), 0)), months: booked.length }
    : null

  // What a month costs to run: what left the bank in the latest statements when they say, otherwise
  // the last three months of pay (gross, with the employer's share), purchases with their VAT and the VAT paid.
  const outflows = docs
    .filter((doc) => doc.kind === 'bank_statement' && has(doc.figures?.bank?.totalOut))
    .map((doc) => {
      const bank = doc.figures!.bank!
      const from = Date.parse(bank.from || doc.statement?.from || '')
      const to = Date.parse(bank.to || doc.statement?.to || '')
      const months = Number.isFinite(from) && Number.isFinite(to) && to > from ? Math.max(1, (to - from) / (30.4 * 86400000)) : 1
      return { to: bank.to || doc.statement?.to || doc.period || '', perMonth: (bank.totalOut as number) / months }
    })
    .sort((a, b) => b.to.localeCompare(a.to))
    .slice(0, 3)
  const recent = [...monthlyFigures(docs, invoices, now.getFullYear(), currency), ...monthlyFigures(docs, invoices, now.getFullYear() - 1, currency)]
    .filter((month) => month.period <= isoDay(now).slice(0, 7))
    .sort((a, b) => b.period.localeCompare(a.period))
    .filter((month) => has(month.payrollCost) || has(month.purchasesNet) || has(month.vat))
    .slice(0, 3)
  const monthCost = (month: MonthFigures) =>
    (has(month.payrollCost) ? month.payrollCost : (month.payrollNet ?? 0) + (month.payrollTax ?? 0)) +
    (month.purchasesNet ?? 0) +
    (month.purchasesVat ?? 0) +
    (month.vat ?? 0) +
    (month.rentTax ?? 0)
  const burn = outflows.length
    ? round(outflows.reduce((total, item) => total + item.perMonth, 0) / outflows.length)
    : recent.length
      ? round(recent.reduce((total, month) => total + monthCost(month), 0) / recent.length)
      : null

  const cash = lastStatementCash(docs)

  // Which of the usual monthly documents have not come for the month that should be complete.
  const due = expectedMonth(now)
  const everKinds = new Set(docs.map((doc) => doc.kind))
  const usual: FinanceKind[] = (['vat_return', 'payroll_tax', 'payroll', 'sales_book', 'purchase_book'] as FinanceKind[]).filter((kind) => everKinds.has(kind))
  const dueYear = Number(due.slice(0, 4))
  const dueMonth = monthlyFigures(docs, invoices, dueYear, currency).find((month) => month.period === due)
  const lacking = usual.filter((kind) => !dueMonth?.kinds.has(kind))
  const missing = usual.length ? { period: due, kinds: lacking } : null

  const upcoming = docs
    .filter((doc) => doc.dueDate && doc.dueDate >= isoDay(now) && has(doc.amountDue))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5)

  const signals: HealthSignal[] = []
  const overdueShare = open.receivables > 0 ? overdue / open.receivables : 0
  signals.push({
    key: 'collection',
    status: open.receivables === 0 ? 'good' : overdueShare < 0.15 ? 'good' : overdueShare < 0.4 ? 'warn' : 'bad',
    params: { share: Math.round(overdueShare * 100) },
  })
  if (cash && has(burn) && burn > 0) {
    const runway = cash.amount / burn
    signals.push({ key: 'liquidity', status: runway >= 3 ? 'good' : runway >= 1 ? 'warn' : 'bad', params: { months: Math.round(runway * 10) / 10 } })
  } else signals.push({ key: 'liquidity', status: 'unknown', params: {} })
  signals.push({
    key: 'documents',
    status: !missing ? 'unknown' : missing.kinds.length === 0 ? 'good' : missing.kinds.length <= 1 ? 'warn' : 'bad',
    params: { count: missing?.kinds.length ?? 0 },
  })
  const margin = annual?.margin
  if (has(margin ?? null)) signals.push({ key: 'profit', status: (margin as number) > 0.1 ? 'good' : (margin as number) > 0 ? 'warn' : 'bad', params: { margin: Math.round((margin as number) * 1000) / 10 } })
  else if (estimate) signals.push({ key: 'result', status: estimate.result > 0 ? 'good' : 'bad', params: { months: estimate.months } })
  else signals.push({ key: 'profit', status: 'unknown', params: {} })

  return {
    cash,
    revenue: ytd.invoiced,
    revenueLastYear: before.invoiced,
    collected: ytd.paymentsReceived,
    receivables: open.receivables,
    overdue,
    taxesPaid,
    taxesByKind,
    payroll,
    annual,
    estimate,
    burn,
    missing,
    upcoming,
    signals,
  }
}

/** The statements of every year that has them, newest first, for the comparison table. */
export function annualStatements(allDocs: FinanceDoc[]) {
  const byYear = new Map<string, FinanceDoc>()
  for (const doc of currentDocuments(allDocs)) {
    if (doc.kind !== 'financial_statements' || !/^\d{4}$/.test(doc.period || '') || !doc.figures?.statements) continue
    const seen = byYear.get(doc.period as string)
    if (!seen || doc.receivedAt > seen.receivedAt) byYear.set(doc.period as string, doc)
  }
  return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, doc]) => ({ year, doc, figures: doc.figures!.statements! }))
}

/** The one figure that best describes a document in a list. */
export function headlineAmount(doc: FinanceDoc): N {
  const figures = doc.figures || {}
  switch (doc.kind) {
    case 'vat_return':
    case 'payroll_tax':
    case 'rent_tax':
    case 'profit_tax':
    case 'other_tax':
      return taxAmount(doc)
    case 'payroll':
      return payrollCost(figures.payroll) ?? figures.payroll?.net ?? null
    case 'sales_book':
    case 'purchase_book':
      return figures.book?.gross ?? figures.book?.net ?? null
    case 'financial_statements':
      return figures.statements?.netProfit ?? null
    case 'bank_statement':
      return figures.bank?.closingBalance ?? doc.statement?.totalIn ?? null
    case 'supplier_invoice':
    case 'own_invoice':
      return figures.invoice?.total ?? doc.amountDue ?? null
    default:
      return doc.amountDue ?? null
  }
}

export function financeYears(docs: FinanceDoc[], invoices: Invoice[], now = new Date()) {
  const years = new Set<number>([now.getFullYear()])
  for (const doc of docs) {
    const year = Number(String(doc.period || '').slice(0, 4))
    if (year > 2000) years.add(year)
  }
  for (const invoice of invoices) {
    const date = parseLooseDate(invoice.date)
    if (date) years.add(date.getFullYear())
  }
  return [...years].sort((a, b) => b - a)
}
