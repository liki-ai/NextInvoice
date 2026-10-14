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

/** What money leaving the bank went to, as the server sorts a statement's outgoing payments. */
export const SPEND_CATEGORIES = ['payroll', 'pension', 'taxes', 'rent', 'suppliers', 'card', 'cash', 'fees', 'dividends', 'other'] as const
export type SpendCategory = (typeof SPEND_CATEGORIES)[number]
export type BankMonth = { in: number; out: number; spend: Partial<Record<SpendCategory, number>> }

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
    iban?: string
    months?: Record<string, BankMonth>
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

/** Kinds that come many to a period: each one counts (overlapping statements are sorted out month by month). */
const MANY_PER_PERIOD = new Set<FinanceKind>(['bank_statement', 'supplier_invoice', 'own_invoice', 'legal', 'other'])

/** The documents that count: read, not set aside, and only the newest of anything sent twice. */
export function currentDocuments(docs: FinanceDoc[]) {
  const latest = new Map<string, FinanceDoc>()
  for (const doc of docs) {
    if (doc.status !== 'done' || doc.excluded || !doc.kind) continue
    const key = MANY_PER_PERIOD.has(doc.kind) ? doc.id : sameDocumentKey(doc)
    const seen = latest.get(key)
    if (!seen || String(doc.receivedAt) > String(seen.receivedAt)) latest.set(key, doc)
  }
  return [...latest.values()]
}

export type MonthFigures = {
  period: string
  invoiced: number
  invoicedNet: number
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
  /** Money in and out of the bank this month, and what it went out for; null without a statement. */
  bank: BankMonth | null
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
    invoicedNet: 0,
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
    bank: null,
  }
}

/** The month a quarter's tax belongs to in a monthly table: the quarter's last month. */
function monthOf(period: string) {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period)
  if (quarter) return `${quarter[1]}-${String(Number(quarter[2]) * 3).padStart(2, '0')}`
  return /^\d{4}-\d{2}$/.test(period) ? period : ''
}

const monthEndDay = (period: string) => {
  const [year, month] = period.split('-').map(Number)
  return `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

/**
 * Each month's bank figures. Statements overlap (one for the year, one per month sent by email);
 * for each account and month the statement that covers the whole month, and of those the newest,
 * is the one counted.
 */
export function bankMonths(docs: FinanceDoc[]) {
  const best = new Map<string, { doc: FinanceDoc; full: boolean; month: BankMonth }>()
  for (const doc of docs) {
    const statement = doc.statement
    if (doc.kind !== 'bank_statement' || !statement?.months) continue
    for (const [period, month] of Object.entries(statement.months)) {
      const full = Boolean(statement.from && statement.to && statement.from <= `${period}-01` && statement.to >= monthEndDay(period))
      const key = `${statement.iban || doc.figures?.bank?.iban || ''}|${period}`
      const seen = best.get(key)
      const newer = !seen || String(statement.to) > String(seen.doc.statement?.to) || (String(statement.to) === String(seen.doc.statement?.to) && doc.receivedAt > seen.doc.receivedAt)
      if (!seen || (full && !seen.full) || (full === seen.full && newer)) best.set(key, { doc, full, month })
    }
  }
  const byMonth = new Map<string, BankMonth>()
  for (const [key, { month }] of best) {
    const period = key.split('|')[1]
    const total = byMonth.get(period) || { in: 0, out: 0, spend: {} }
    total.in = round(total.in + month.in)
    total.out = round(total.out + month.out)
    for (const item of SPEND_CATEGORIES) if (month.spend[item]) total.spend[item] = round((total.spend[item] ?? 0) + (month.spend[item] as number))
    byMonth.set(period, total)
  }
  return byMonth
}

/** What a month cost to run by the bank: everything that went out except what the owners took. */
export function operatingOut(month: BankMonth) {
  return round(month.out - (month.spend.dividends ?? 0))
}

/** Month by month for one year: what was invoiced and collected here, and what the accountant's documents say. */
export function monthlyFigures(docs: FinanceDoc[], invoices: Invoice[], year: number, currency: string): MonthFigures[] {
  const months = Array.from({ length: 12 }, (_, index) => emptyMonth(`${year}-${String(index + 1).padStart(2, '0')}`))
  const byPeriod = new Map(months.map((month) => [month.period, month]))

  months.forEach((month, index) => {
    const report = buildOverview({ invoices, period: { start: new Date(year, index, 1), end: new Date(year, index + 1, 0) }, currency, fallbackCurrency: currency })
    month.invoiced = report.invoiced
    month.collected = report.paymentsReceived
    // Invoices carry VAT on top of their net price; the result counts the net.
    month.invoicedNet = round(report.issuedInPeriod.reduce((total, invoice) => total + (Number(invoice.total) || 0) / (1 + (Number((invoice as { taxRate?: unknown }).taxRate) || 0) / 100), 0))
  })

  const bank = bankMonths(docs)
  for (const month of months) {
    month.bank = bank.get(month.period) ?? null
    if (month.bank) month.kinds.add('bank_statement')
  }

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
  payroll: { period: string; cost: N; net: N; taxes: N; employees: N; fromBank: boolean } | null
  /** Running costs other than pay and taxes, from the bank. */
  otherSpending: { total: number; average: number; top: { category: SpendCategory; amount: number }[] } | null
  /** The year's spending as the bank shows it, by what it went to; dividends are kept apart. */
  spending: { total: number; average: number; months: number; dividends: number; byCategory: { category: SpendCategory; amount: number }[]; taxesFromBank: number } | null
  annual: { year: string; revenue: N; netProfit: N; profitBeforeTax: N; margin: N; docId: string } | null
  estimate: { result: number; revenue: number; costs: number; months: number; from: string; to: string } | null
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

  // A month is complete once it is over; the current one would pull every average down.
  const thisMonth = isoDay(now).slice(0, 7)
  const complete = (month: MonthFigures) => month.period < thisMonth

  const payrollMonth = [...months].reverse().find((month) => complete(month) && (has(month.payrollCost) || has(month.payrollNet)))
  // Without a payroll list the bank still shows what was paid out as pay and contributions.
  const bankPayMonth = [...months].reverse().find((month) => complete(month) && (month.bank?.spend.payroll ?? 0) > 0)
  // The full cost of a month's pay: the payroll list's gross with the employer's share, or else the
  // net pay with the wage tax and contributions on top (from the WM-CM slip, or what the bank paid
  // the pension fund).
  const fullCost = (month: MonthFigures, net: number) => {
    const taxes = has(month.payrollTax) ? month.payrollTax : month.bank?.spend.pension ? month.bank.spend.pension : null
    return { cost: has(taxes) ? round(net + taxes) : null, taxes }
  }
  const payroll = payrollMonth
    ? {
        period: payrollMonth.period,
        net: payrollMonth.payrollNet,
        employees: payrollMonth.employees,
        fromBank: false,
        ...(has(payrollMonth.payrollCost)
          ? { cost: payrollMonth.payrollCost, taxes: null }
          : has(payrollMonth.payrollNet)
            ? fullCost(payrollMonth, payrollMonth.payrollNet)
            : { cost: null, taxes: null }),
      }
    : bankPayMonth
      ? { period: bankPayMonth.period, net: bankPayMonth.bank!.spend.payroll as number, employees: null, fromBank: true, ...fullCost(bankPayMonth, bankPayMonth.bank!.spend.payroll as number) }
      : null

  // Everything else it takes to run the company: suppliers, rent, power, internet, card purchases,
  // cash and bank fees; not pay, taxes or what the owners took out.
  const OTHER_SPEND: SpendCategory[] = ['suppliers', 'rent', 'card', 'cash', 'fees', 'other']
  const otherMonths = months.filter((month) => month.bank)
  const otherFull = otherMonths.filter(complete)
  const otherOf = (month: MonthFigures) => OTHER_SPEND.reduce((total, item) => total + (month.bank!.spend[item] ?? 0), 0)
  const otherSpending = otherMonths.length
    ? {
        total: round(otherMonths.reduce((total, month) => total + otherOf(month), 0)),
        average: otherFull.length ? round(otherFull.reduce((total, month) => total + otherOf(month), 0) / otherFull.length) : 0,
        top: OTHER_SPEND.map((category) => ({ category, amount: round(otherMonths.reduce((total, month) => total + (month.bank!.spend[category] ?? 0), 0)) }))
          .filter((item) => item.amount > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3),
      }
    : null

  const spentMonths = months.filter((month) => month.bank)
  const fullMonths = spentMonths.filter(complete)
  const byCategory = SPEND_CATEGORIES.filter((item) => item !== 'dividends')
    .map((category) => ({ category, amount: round(spentMonths.reduce((total, month) => total + (month.bank!.spend[category] ?? 0), 0)) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const spending = spentMonths.length
    ? {
        total: round(spentMonths.reduce((total, month) => total + operatingOut(month.bank!), 0)),
        average: fullMonths.length ? round(fullMonths.reduce((total, month) => total + operatingOut(month.bank!), 0) / fullMonths.length) : 0,
        months: fullMonths.length,
        dividends: round(spentMonths.reduce((total, month) => total + (month.bank!.spend.dividends ?? 0), 0)),
        byCategory,
        taxesFromBank: round(spentMonths.reduce((total, month) => total + (month.bank!.spend.taxes ?? 0), 0)),
      }
    : null

  // The newest year whose statements state a profit; a balance sheet alone says nothing about it.
  const annualDoc = docs
    .filter((doc) => doc.kind === 'financial_statements' && /^\d{4}$/.test(doc.period || '') && (has(doc.figures?.statements?.netProfit) || has(doc.figures?.statements?.profitBeforeTax)))
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

  // What the year has earned so far, before profit tax, month by month from the best source there is:
  // sales from the sales book (or the invoices here, without VAT); purchases from the purchase book
  // (or what the bank paid suppliers, by card, for rent and in cash); pay from the payroll list (or
  // the net pay and pension contributions the bank paid, with the wage tax slip when there is one).
  const BANK_COSTS: SpendCategory[] = ['suppliers', 'card', 'rent', 'cash', 'fees', 'other']
  const earned = months.filter(complete).flatMap((month) => {
    const revenue = has(month.salesNet) ? month.salesNet : month.invoicedNet > 0 ? month.invoicedNet : null
    const bankCosts = month.bank ? BANK_COSTS.reduce((total, item) => total + (month.bank!.spend[item] ?? 0), 0) : null
    const purchases = has(month.purchasesNet) ? month.purchasesNet : bankCosts
    const bankPay = month.bank ? (month.bank.spend.payroll ?? 0) + (month.bank.spend.pension ?? 0) : null
    const pay = has(month.payrollCost) ? month.payrollCost : has(month.payrollNet) || bankPay ? (month.payrollNet ?? month.bank?.spend.payroll ?? 0) + (has(month.payrollTax) ? month.payrollTax : (month.bank?.spend.pension ?? 0)) : null
    if (revenue === null || (purchases === null && pay === null)) return []
    return [{ period: month.period, revenue, costs: (purchases ?? 0) + (pay ?? 0) }]
  })
  const estimate = earned.length
    ? {
        result: round(earned.reduce((total, month) => total + month.revenue - month.costs, 0)),
        revenue: round(earned.reduce((total, month) => total + month.revenue, 0)),
        costs: round(earned.reduce((total, month) => total + month.costs, 0)),
        months: earned.length,
        from: earned[0].period,
        to: earned[earned.length - 1].period,
      }
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
  // Best of all: the last three complete months the bank shows, without dividends.
  const bankRecent = [...bankMonths(docs).entries()]
    .filter(([period]) => period < thisMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3)
  const burn = bankRecent.length
    ? round(bankRecent.reduce((total, [, month]) => total + operatingOut(month), 0) / bankRecent.length)
    : outflows.length
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
    spending,
    otherSpending,
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
