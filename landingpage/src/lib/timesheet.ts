// Where the team's time goes: the hours logged by month, project and person (read from the
// timesheet workbook), the pay those hours stand for, and what each project's client was invoiced
// in the same months. The Projects page draws these figures.

import type { Invoice } from './invoice'
import { buildOverview } from './overview'
import type { CellValue, Workbook } from './xlsx'

export type TimesheetEntry = { month: string; project: string; person: string; hours: number; pay: number | null }
/** `internal`: work for the whole company, whose cost is spread over the projects. */
export type ProjectMeta = { clientId?: string | null; internal?: boolean; bank?: string[]; clients?: string[] }

/** A bank payment no invoice accounts for: `amount` is what is left of it after any invoices. */
export type BankCredit = { date: string; amount: number; text: string; /** A client the payment names, when no project is linked to it. */ client?: string }

/** Lower case words only, so "WISE PAYMENTS LIMITED, Lirim" and "wise payments limited lirim" compare equal. */
function looseText(text: unknown) {
  return plain(String(text ?? ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The project whose bank words this payment carries, if any. */
export function bankProject(text: string, projects: Record<string, ProjectMeta>) {
  const line = ` ${looseText(text)} `
  for (const [name, meta] of Object.entries(projects)) {
    if ((meta.bank || []).some((words) => looseText(words) && line.includes(` ${looseText(words)} `))) return name
  }
  return null
}

/** The words that name who sent a payment: "…hyrese, WISE PAYMENTS LIMITED, Lirim Sylejmani ;CRED ;71A:OUR" → "WISE PAYMENTS LIMITED, Lirim Sylejmani". */
export function payerWords(text: string) {
  const parts = String(text || '')
    .split(/[,;]/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 3 && !/transfer|hyrese|hyrëse|^pages|^cred$|^debi?t?$|\d{2}[a-z]:|^our$|^sha$|^ben$/i.test(part))
  // The sender's bank says nothing about who paid; a payment service (Wise and the like) needs the
  // name of the person who sent through it.
  while (parts.length > 1 && /banc|bank|sparkasse|kasse/i.test(parts[0])) parts.shift()
  if (parts.length > 1 && /wise|payments|paypal|revolut|payoneer|stripe|remitly/i.test(parts[0])) return `${parts[0]}, ${parts[1]}`
  return parts[0] || String(text || '').slice(0, 60).trim()
}


export type Timesheet = {
  fileName: string
  importedAt: string | null
  importedBy: string | null
  months: string[]
  entries: TimesheetEntry[]
  projects: Record<string, ProjectMeta>
  /** Money outside the projects (a subsidy, a grant) by name, with the words of its bank payments. */
  sources?: Record<string, string[]>
}
export type TimesheetView = { timesheet: Timesheet }

const round = (value: number) => Math.round(value * 100) / 100

// --- Reading the workbook.

const MONTH_NAMES: Record<string, number> = {}
;[
  ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nentor', 'dhjetor'],
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
].forEach((names) => names.forEach((name, index) => (MONTH_NAMES[name] = index + 1)))

/** Lower case, without accents: "Orët" → "oret", "Nëntor" → "nentor". */
function plain(value: CellValue) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function monthNumber(text: string) {
  for (const word of plain(text).split(/[^a-z]+/)) {
    if (MONTH_NAMES[word]) return MONTH_NAMES[word]
  }
  return 0
}

function yearIn(text: string) {
  const match = /\b(20\d\d)\b/.exec(text)
  return match ? Number(match[1]) : 0
}

const pad = (month: number) => String(month).padStart(2, '0')

/** A month cell: a date, "2026-01", "01.2026" or "Janar 2026". */
function monthOfCell(value: CellValue, fallbackYear: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`
  const text = String(value ?? '')
  const iso = /^(20\d\d)-(\d{1,2})/.exec(text)
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}`
  const dotted = /^(\d{1,2})[./](20\d\d)$/.exec(text.trim())
  if (dotted) return `${dotted[2]}-${pad(Number(dotted[1]))}`
  const month = monthNumber(text)
  return month ? `${yearIn(text) || fallbackYear}-${pad(month)}` : ''
}

type Columns = { project: number; person: number; hours: number; pay: number; month: number }

function findColumns(row: CellValue[]): Columns | null {
  const cells = row.map(plain)
  const find = (test: (cell: string) => boolean) => cells.findIndex(test)
  const columns = {
    project: find((cell) => /^(projekt|project|progett)/.test(cell)),
    person: find((cell) => /^(punetor|person|employee|emri|name|nome|dipendent|staff)/.test(cell)),
    hours: find((cell) => /^(oret|ore\b|ore$|oret\b|hours|hrs)/.test(cell)),
    pay: find((cell) => /^(pagesa|pay\b|payment|cost|kosto|pagamento)/.test(cell)),
    month: find((cell) => /^(muaj|month|mese)/.test(cell)),
  }
  return columns.project >= 0 && columns.person >= 0 && columns.hours >= 0 ? columns : null
}

function numberOf(value: CellValue) {
  if (typeof value === 'number') return value
  const text = String(value ?? '').replace(/[^\d,.-]/g, '')
  if (!text) return NaN
  return Number(text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/g, ''))
}

/**
 * The rows of hours in a timesheet workbook: a sheet per month (named after it, or titled
 * "Janar 2026") with columns for project, person, hours and optionally pay, or one sheet with a
 * month column. Summary sheets and total rows are left out.
 */
export function readTimesheet(workbook: Workbook, fileName = '', now = new Date()): TimesheetEntry[] {
  const fileYear = yearIn(fileName) || now.getFullYear()
  const entries: TimesheetEntry[] = []
  for (const sheet of workbook.sheets) {
    const headerAt = sheet.rows.slice(0, 15).findIndex((row) => findColumns(row))
    if (headerAt < 0) continue
    const columns = findColumns(sheet.rows[headerAt])!
    const above = sheet.rows.slice(0, headerAt).flat().map((cell) => String(cell ?? '')).join(' ')
    const year = yearIn(sheet.name) || yearIn(above) || fileYear
    const sheetMonth = monthNumber(sheet.name) ? `${year}-${pad(monthNumber(sheet.name))}` : monthOfCell(above, year)
    if (columns.month < 0 && !sheetMonth) continue
    for (const row of sheet.rows.slice(headerAt + 1)) {
      const project = String(row[columns.project] ?? '').replace(/\s+/g, ' ').trim()
      const person = String(row[columns.person] ?? '').replace(/\s+/g, ' ').trim()
      if (!project || !person || /^(total|gjithsej)/.test(plain(project))) continue
      const hours = numberOf(row[columns.hours])
      if (!Number.isFinite(hours) || hours <= 0) continue
      const month = columns.month >= 0 ? monthOfCell(row[columns.month], year) || sheetMonth : sheetMonth
      if (!month) continue
      const pay = columns.pay >= 0 ? numberOf(row[columns.pay]) : NaN
      entries.push({ month, project, person, hours: round(hours), pay: Number.isFinite(pay) && pay > 0 ? round(pay) : null })
    }
  }
  return entries
}

// --- The figures.

/**
 * client: work for a client. product: one of the company's own products, linked to the company
 * itself as client. shared: work for the whole company (management, marketing, administration),
 * whose cost is spread over the projects. unset: not said yet.
 */
export type ProjectKind = 'client' | 'product' | 'shared' | 'unset'

/**
 * What a month cost the company, from the finance documents: what each euro of net pay costs with
 * the wage tax and contributions, the running costs other than pay, and the full cost of pay.
 */
export type MonthCosts = { taxFactor: number | null; running: number | null; payrollCost: number | null }

type ClientRef = { id?: string; fullName?: string }

export type Suggestion = { clientId: string; reason: 'initials' | 'name' | 'invoices' }

export type ProjectFigures = {
  name: string
  kind: ProjectKind
  clientId: string | null
  hours: number
  rawHours: number
  share: number
  /** Net pay of the hours, and the same with taxes and contributions. */
  net: number
  direct: number
  /** The project's part of the shared costs, by its hours. */
  overhead: number
  /** direct + overhead; for a shared project only its direct cost, which is part of what is spread. */
  cost: number
  unpaidHours: number
  revenue: number | null
  profit: number | null
  revenuePerHour: number | null
  costPerHour: number | null
  invoices: number
  /** Of the revenue, what came into the bank without an invoice, and in how many payments. */
  bankRevenue: number
  bankPayments: number
  people: { person: string; hours: number }[]
  lead: { person: string; share: number } | null
  byMonth: Record<string, number>
  suggestion: Suggestion | null
}

export type PersonMonth = { month: string; hours: number; rawHours: number; net: number; taxed: number; overhead: number; full: number; perHour: number | null }

export type PersonFigures = {
  person: string
  hours: number
  rawHours: number
  net: number
  taxed: number
  full: number
  paid: boolean
  /** An hour of this person: net pay, with taxes and contributions, and with the shared costs on top. */
  perHour: { net: number; taxed: number; full: number } | null
  projects: number
  projectsPerMonth: number
  busiest: { month: string; hours: number }
  byProject: { project: string; hours: number }[]
  months: PersonMonth[]
}

export type MonthTotals = {
  month: string
  hours: number
  rawHours: number
  client: number
  product: number
  shared: number
  unset: number
  net: number
  taxed: number
  taxFactor: number
  /** No payroll documents for the month: the factor is the average of the other months (or 1). */
  taxFactorEstimated: boolean
  running: number | null
  payrollCost: number | null
  /** Pay in the payroll documents that no hours account for (people without pay in the workbook). */
  unexplained: number
  sharedWork: number
  pool: number
  productiveHours: number
  overheadRate: number | null
}

export type OtherRevenue = { clientId: string; client: string; total: number; invoices: { id: string; number: string; date: string; net: number }[]; bank: BankCredit[] }

export type IncomeSource = { name: string; words: string[]; total: number; payments: BankCredit[] }

export type Correction = { person: string; month: string; from: number; to: number }

export type Signal =
  | { key: 'overHours'; person: string; months: number; month: string; hours: number; to: number }
  | { key: 'keyPerson'; project: string; person: string; share: number }
  | { key: 'scattered'; person: string; projects: number; perMonth: number }
  | { key: 'unpaid'; people: number; hours: number }
  | { key: 'shared'; share: number; hours: number }
  | { key: 'unset'; projects: number; hours: number }
  | { key: 'missingCosts'; months: string[]; all: boolean }

export type ProjectsReport = {
  months: string[]
  hours: number
  rawHours: number
  net: number
  taxed: number
  /** Everything the months cost: pay with taxes, running costs and pay without hours. */
  cost: number
  pool: { shared: { project: string; cost: number }[]; running: number; unexplained: number; total: number }
  revenue: number
  otherRevenue: OtherRevenue[]
  sources: IncomeSource[]
  otherTotal: number
  /** Bank money with no invoice that no project's words claim. */
  bankLeft: BankCredit[]
  bankRevenue: number
  linkedHours: number
  sharedHours: number
  projects: ProjectFigures[]
  people: PersonFigures[]
  byMonth: MonthTotals[]
  corrections: Correction[]
  signals: Signal[]
}

/** More than this in a month is more than one person can work: a timer left running, or shared logins. */
export const MONTH_HOURS_LIMIT = 220
const KEY_PERSON_SHARE = 0.7
const KEY_PERSON_MIN_HOURS = 100
const SCATTERED_PER_MONTH = 5

/** A full-time month: its weekdays, eight hours each. What an impossible month is brought down to. */
export function workHours(month: string) {
  const [year, number] = month.split('-').map(Number)
  let days = 0
  for (let day = new Date(year, number - 1, 1); day.getMonth() === number - 1; day.setDate(day.getDate() + 1)) {
    if (day.getDay() !== 0 && day.getDay() !== 6) days += 1
  }
  return days * 8
}

const COMPANY_WORDS = new Set(['shpk', 'sh', 'pk', 'sha', 'llc', 'ltd', 'gmbh', 'srl', 'doo', 'inc', 'ngo', 'jsc'])
const SMALL_WORDS = new Set(['e', 'i', 'te', 'se', 'per', 'dhe', 'ne', 'nga', 'me', 'of', 'the', 'and', 'for', 'di', 'del', 'della'])

function words(text: unknown) {
  // Dots join: "SH.P.K." is one word, "shpk".
  return plain(String(text ?? ''))
    .replace(/\./g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** A name without "SHPK" and the like, joined: "Tretek SH.P.K." → "tretek". */
function compactName(text: unknown) {
  return words(text)
    .filter((word) => !COMPANY_WORDS.has(word))
    .join('')
}

/** The clients that are the company itself: projects linked to them are its own products. */
export function ownClientIds(clients: ClientRef[], companyName: string | undefined) {
  const own = compactName(companyName)
  return new Set(clients.filter((client) => client.id && own && compactName(client.fullName) === own).map((client) => client.id as string))
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does the text (already plain) name the project, as a word: "ipacienti" in "licenca ipacienti 2026". */
function mentions(text: string, name: string) {
  const parts = words(name)
  if (parts.join('').length < 3) return false
  return new RegExp(`(^|[^a-z0-9])${parts.map(escapeRegex).join('[^a-z0-9]*')}([^a-z0-9]|$)`).test(text)
}

function invoiceText(invoice: Invoice) {
  return plain([...(invoice.items || []).map((item) => item.description), invoice.notes].join(' \n '))
}

function invoiceClientId(invoice: Invoice, idByName: Map<string, string>) {
  return invoice.clientId || invoice.client?.id || idByName.get(String(invoice.client?.fullName || '').trim().toLowerCase()) || ''
}

/** Issued invoices of the months, net of VAT. */
function issuedInMonths(invoices: Invoice[], months: string[], currency: string) {
  const out: { invoice: Invoice; month: string; net: number }[] = []
  for (const month of months) {
    const [year, number] = month.split('-').map(Number)
    const report = buildOverview({ invoices, period: { start: new Date(year, number - 1, 1), end: new Date(year, number, 0) }, currency, fallbackCurrency: currency })
    for (const invoice of report.issuedInPeriod as Invoice[]) {
      out.push({ invoice, month, net: (Number(invoice.total) || 0) / (1 + (Number(invoice.taxRate) || 0) / 100) })
    }
  }
  return out
}

/**
 * A client for a project nobody has linked yet, when the name points to one: the client's initials
 * (APK → Agjencia Kosovare e Privatizimit), the client's name, or the client's invoices naming the project.
 */
export function suggestClient(project: string, clients: ClientRef[], invoices: Invoice[], skip: Set<string>): Suggestion | null {
  const tokens = words(project).filter((word) => word.length >= 2)
  const compact = tokens.join('')
  const strong: Suggestion[] = []
  for (const client of clients) {
    if (!client.id || skip.has(client.id)) continue
    const significant = words(client.fullName).filter((word) => !COMPANY_WORDS.has(word) && !SMALL_WORDS.has(word))
    if (significant.length === 0) continue
    const initials = significant.map((word) => word[0]).join('')
    // The same letters in another order count too: APK for Agjencia Kosovare e Privatizimit.
    const sorted = (text: string) => [...text].sort().join('')
    if (initials.length >= 2 && (initials === compact || tokens.includes(initials) || tokens.some((token) => token.length === initials.length && sorted(token) === sorted(initials)))) {
      strong.push({ clientId: client.id, reason: 'initials' })
      continue
    }
    const name = significant.join('')
    if ((compact.length >= 4 && name.includes(compact)) || significant.some((word) => word.length >= 4 && tokens.includes(word))) {
      strong.push({ clientId: client.id, reason: 'name' })
    }
  }
  if (strong.length === 1) return strong[0]
  // Several or none by name: the client whose invoices name the project most.
  const idByName = new Map(clients.filter((client) => client.id).map((client) => [String(client.fullName || '').trim().toLowerCase(), client.id as string]))
  const counts = new Map<string, number>()
  for (const invoice of invoices) {
    const id = invoiceClientId(invoice, idByName)
    if (!id || skip.has(id) || (strong.length > 1 && !strong.some((item) => item.clientId === id))) continue
    if (mentions(invoiceText(invoice), project)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
    return strong.find((item) => item.clientId === ranked[0][0]) ?? { clientId: ranked[0][0], reason: 'invoices' }
  }
  return null
}

type Acc = { hours: number; raw: number; net: number; direct: number; overhead: number; unpaid: number; people: Map<string, number>; byMonth: Record<string, number> }
type PersonAcc = { paid: boolean; projects: Set<string>; byProject: Map<string, number>; months: Map<string, { hours: number; raw: number; net: number; taxed: number; projects: Set<string> }> }

export function buildProjectsReport({
  timesheet,
  months,
  invoices,
  clients,
  currency,
  ownClients = new Set<string>(),
  monthCosts = {},
  bankCredits = [],
  correct = true,
}: {
  timesheet: Timesheet
  months: string[]
  invoices: Invoice[]
  clients: ClientRef[]
  currency: string
  ownClients?: Set<string>
  monthCosts?: Record<string, MonthCosts>
  bankCredits?: BankCredit[]
  correct?: boolean
}): ProjectsReport {
  const wanted = new Set(months)
  const meta = (name: string): ProjectMeta => timesheet.projects[name] || {}
  const kindOf = (name: string): ProjectKind => {
    const item = meta(name)
    if (item.internal) return 'shared'
    if (!item.clientId) return 'unset'
    return ownClients.has(item.clientId) ? 'product' : 'client'
  }

  // Hours one person cannot have worked in a month are brought down to a full-time month, every
  // project in the same proportion.
  const personMonth = new Map<string, number>()
  for (const entry of timesheet.entries) {
    if (wanted.has(entry.month)) personMonth.set(`${entry.person}|${entry.month}`, (personMonth.get(`${entry.person}|${entry.month}`) ?? 0) + entry.hours)
  }
  const corrections: Correction[] = []
  const scale = new Map<string, number>()
  for (const [key, total] of personMonth) {
    if (total <= MONTH_HOURS_LIMIT) continue
    const [person, month] = key.split('|')
    const to = workHours(month)
    corrections.push({ person, month, from: round(total), to })
    if (correct) scale.set(key, to / total)
  }
  const entries = timesheet.entries
    .filter((entry) => wanted.has(entry.month))
    .map((entry) => ({ ...entry, raw: entry.hours, hours: entry.hours * (scale.get(`${entry.person}|${entry.month}`) ?? 1) }))

  // What each euro of net pay costs: the month's own payroll documents, else the average of the others.
  const factors = Object.values(monthCosts)
    .map((item) => item.taxFactor)
    .filter((value): value is number => typeof value === 'number')
  const averageFactor = factors.length ? factors.reduce((sum, value) => sum + value, 0) / factors.length : 1

  const byMonth = new Map<string, MonthTotals>()
  for (const month of months) {
    const costs = monthCosts[month]
    const own = typeof costs?.taxFactor === 'number'
    byMonth.set(month, {
      month,
      hours: 0,
      rawHours: 0,
      client: 0,
      product: 0,
      shared: 0,
      unset: 0,
      net: 0,
      taxed: 0,
      taxFactor: own ? (costs.taxFactor as number) : averageFactor,
      taxFactorEstimated: !own,
      running: costs?.running ?? null,
      payrollCost: costs?.payrollCost ?? null,
      unexplained: 0,
      sharedWork: 0,
      pool: 0,
      productiveHours: 0,
      overheadRate: null,
    })
  }
  for (const entry of entries) {
    const month = byMonth.get(entry.month)!
    const kind = kindOf(entry.project)
    const taxed = (entry.pay ?? 0) * month.taxFactor
    month.hours += entry.hours
    month.rawHours += entry.raw
    month[kind] += entry.hours
    month.net += entry.pay ?? 0
    month.taxed += taxed
    if (kind === 'shared') month.sharedWork += taxed
    else month.productiveHours += entry.hours
  }
  // The shared costs of a month: the shared work, the running costs, and pay no hours account for;
  // spread over the month's project hours.
  for (const month of byMonth.values()) {
    month.unexplained = month.payrollCost !== null ? Math.max(0, month.payrollCost - month.taxed) : 0
    month.pool = month.sharedWork + (month.running ?? 0) + month.unexplained
    month.overheadRate = month.productiveHours > 0 ? month.pool / month.productiveHours : null
  }
  const rate = (month: string) => byMonth.get(month)?.overheadRate ?? 0
  const factor = (month: string) => byMonth.get(month)?.taxFactor ?? 1

  const projects = new Map<string, Acc>()
  const people = new Map<string, PersonAcc>()
  for (const entry of entries) {
    const kind = kindOf(entry.project)
    const taxed = (entry.pay ?? 0) * factor(entry.month)
    const project = projects.get(entry.project) ?? { hours: 0, raw: 0, net: 0, direct: 0, overhead: 0, unpaid: 0, people: new Map<string, number>(), byMonth: {} as Record<string, number> }
    project.hours += entry.hours
    project.raw += entry.raw
    project.net += entry.pay ?? 0
    project.direct += taxed
    if (kind !== 'shared') project.overhead += entry.hours * rate(entry.month)
    if (entry.pay === null) project.unpaid += entry.hours
    project.people.set(entry.person, (project.people.get(entry.person) ?? 0) + entry.hours)
    project.byMonth[entry.month] = (project.byMonth[entry.month] ?? 0) + entry.hours
    projects.set(entry.project, project)

    const person: PersonAcc = people.get(entry.person) ?? { paid: false, projects: new Set<string>(), byProject: new Map<string, number>(), months: new Map() }
    if (entry.pay !== null) person.paid = true
    person.projects.add(entry.project)
    person.byProject.set(entry.project, (person.byProject.get(entry.project) ?? 0) + entry.hours)
    const month = person.months.get(entry.month) ?? { hours: 0, raw: 0, net: 0, taxed: 0, projects: new Set<string>() }
    month.hours += entry.hours
    month.raw += entry.raw
    month.net += entry.pay ?? 0
    month.taxed += taxed
    month.projects.add(entry.project)
    person.months.set(entry.month, month)
    people.set(entry.person, person)
  }

  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0)

  // Revenue: an invoice naming a project (or a product) goes to it; otherwise to the client's
  // projects, shared by their hours; an invoice of a client with no project is listed apart.
  const idByName = new Map(clients.filter((client) => client.id).map((client) => [String(client.fullName || '').trim().toLowerCase(), client.id as string]))
  const clientName = new Map(clients.filter((client) => client.id).map((client) => [client.id as string, String(client.fullName || '')]))
  const linked = [...projects.keys()].filter((name) => kindOf(name) === 'client' || kindOf(name) === 'product').sort((a, b) => b.length - a.length)
  // Every project a client's money goes to: the project's own client, and the other clients the
  // user gave it (a laboratory that pays for a product).
  const byClient = new Map<string, string[]>()
  const addClient = (id: string, name: string) => byClient.set(id, [...new Set([...(byClient.get(id) ?? []), name])])
  for (const name of linked) {
    if (kindOf(name) === 'client') addClient(meta(name).clientId as string, name)
    for (const id of meta(name).clients || []) addClient(id, name)
  }
  const revenue = new Map<string, number>()
  const invoiceCount = new Map<string, number>()
  const others = new Map<string, OtherRevenue>()
  const credit = (name: string, amount: number) => {
    revenue.set(name, (revenue.get(name) ?? 0) + amount)
    invoiceCount.set(name, (invoiceCount.get(name) ?? 0) + 1)
  }
  const otherGroup = (id: string, fallbackName: string) => {
    const key = id || `name:${fallbackName.trim().toLowerCase()}`
    const group = others.get(key) ?? { clientId: id, client: clientName.get(id) || fallbackName || '—', total: 0, invoices: [], bank: [] }
    others.set(key, group)
    return group
  }
  for (const { invoice, net } of issuedInMonths(invoices, months, currency)) {
    const id = invoiceClientId(invoice, idByName)
    const text = invoiceText(invoice)
    const named = linked.find((name) => mentions(text, name) && (kindOf(name) === 'product' || meta(name).clientId === id || (meta(name).clients || []).includes(id)))
    if (named) {
      credit(named, net)
      continue
    }
    const own = byClient.get(id)
    if (own && own.length) {
      const total = own.reduce((sum, name) => sum + (projects.get(name)?.hours ?? 0), 0)
      for (const name of own) credit(name, total ? net * ((projects.get(name)?.hours ?? 0) / total) : net / own.length)
      continue
    }
    if (ownClients.has(id)) continue
    const group = otherGroup(id, String(invoice.client?.fullName || ''))
    group.total += net
    group.invoices.push({ id: invoice.id, number: invoice.number, date: invoice.date, net: round(net) })
  }

  // Money into the bank with no invoice goes, in this order, to: the project whose saved words it
  // carries; the project it names (SITA); the project of the client it names (GIS S.R.L. → Dentora),
  // shared by hours when the client has several; a source of money outside the projects (a subsidy);
  // a client with no project. A payment naming an invoice that is here is already counted with it.
  const bankRevenue = new Map<string, number>()
  const bankCount = new Map<string, number>()
  const bankLeft: BankCredit[] = []
  const sourceTotals = new Map<string, BankCredit[]>()
  const counted = invoices
    .filter((invoice) => invoice.lifecycle !== 'draft' && invoice.status !== 'draft')
    .map((invoice) => String(invoice.number || '').replace(/\D/g, ''))
    .filter((digits) => digits.length >= 5)
  const projectNames = [...projects.keys()].filter((name) => kindOf(name) !== 'shared').sort((a, b) => b.length - a.length)
  const nameWords = (name: unknown) => looseText(words(name).filter((word) => !COMPANY_WORDS.has(word)).join(' '))
  const clientWords = [...byClient.keys()].map((id) => ({ id, words: nameWords(clientName.get(id)) })).filter((item) => item.words.replace(/ /g, '').length >= 3)
  const bankCredit = (name: string, amount: number) => {
    revenue.set(name, (revenue.get(name) ?? 0) + amount)
    bankRevenue.set(name, (bankRevenue.get(name) ?? 0) + amount)
    bankCount.set(name, (bankCount.get(name) ?? 0) + 1)
  }
  for (const line of bankCredits) {
    if (!wanted.has(line.date.slice(0, 7))) continue
    // "202601-008" and "202601.017" both read as one number, as invoice numbers are kept.
    const digits = ` ${line.text.replace(/(\d)[-/._](?=\d)/g, '$1').replace(/\D+/g, ' ')} `
    if (counted.some((number) => digits.includes(` ${number} `))) continue
    const saved = bankProject(line.text, timesheet.projects)
    if (saved && projects.has(saved) && kindOf(saved) !== 'shared') {
      bankCredit(saved, line.amount)
      continue
    }
    const text = plain(line.text)
    const named = projectNames.find((name) => mentions(text, name))
    if (named) {
      bankCredit(named, line.amount)
      continue
    }
    const loose = ` ${looseText(line.text)} `
    const client = clientWords.find((item) => loose.includes(` ${item.words} `))
    if (client) {
      const own = byClient.get(client.id)!
      const total = own.reduce((sum, name) => sum + (projects.get(name)?.hours ?? 0), 0)
      for (const name of own) bankCredit(name, total ? line.amount * ((projects.get(name)?.hours ?? 0) / total) : line.amount / own.length)
      continue
    }
    const source = Object.entries(timesheet.sources || {}).find(([, list]) => list.some((item) => looseText(item) && loose.includes(` ${looseText(item)} `)))
    if (source) {
      sourceTotals.set(source[0], [...(sourceTotals.get(source[0]) ?? []), line])
      continue
    }
    const anyClient = clients.find((item) => item.id && !ownClients.has(item.id) && nameWords(item.fullName).replace(/ /g, '').length >= 3 && loose.includes(` ${nameWords(item.fullName)} `))
    if (anyClient) {
      const group = otherGroup(anyClient.id as string, String(anyClient.fullName || ''))
      group.total += line.amount
      group.bank.push(line)
      continue
    }
    bankLeft.push(line)
  }
  const sources = Object.entries(timesheet.sources || {}).map(([name, list]) => {
    const payments = sourceTotals.get(name) ?? []
    return { name, words: list, payments, total: round(payments.reduce((sum, line) => sum + line.amount, 0)) }
  })

  const projectRows: ProjectFigures[] = [...projects.entries()].map(([name, project]) => {
    const kind = kindOf(name)
    const team = [...project.people.entries()].map(([person, value]) => ({ person, hours: round(value) })).sort((a, b) => b.hours - a.hours)
    const cost = kind === 'shared' ? project.direct : project.direct + project.overhead
    const linkedProject = kind === 'client' || kind === 'product'
    // A project with no client yet still shows money that came for it by name.
    const projectRevenue = linkedProject || revenue.has(name) ? round(revenue.get(name) ?? 0) : null
    return {
      name,
      kind,
      clientId: linkedProject ? (meta(name).clientId as string) : null,
      hours: round(project.hours),
      rawHours: round(project.raw),
      share: hours ? project.hours / hours : 0,
      net: round(project.net),
      direct: round(project.direct),
      overhead: round(project.overhead),
      cost: round(cost),
      unpaidHours: round(project.unpaid),
      revenue: projectRevenue,
      profit: projectRevenue === null ? null : round(projectRevenue - cost),
      revenuePerHour: projectRevenue === null || !project.hours ? null : round(projectRevenue / project.hours),
      costPerHour: project.hours ? round(cost / project.hours) : null,
      invoices: invoiceCount.get(name) ?? 0,
      bankRevenue: round(bankRevenue.get(name) ?? 0),
      bankPayments: bankCount.get(name) ?? 0,
      people: team,
      lead: team.length ? { person: team[0].person, share: team[0].hours / project.hours } : null,
      byMonth: project.byMonth,
      suggestion: kind === 'unset' ? suggestClient(name, clients, invoices, ownClients) : null,
    }
  })
  projectRows.sort((a, b) => b.hours - a.hours)

  const personRows: PersonFigures[] = [...people.entries()].map(([person, value]) => {
    const monthRows: PersonMonth[] = [...value.months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, item]) => {
        const overhead = item.hours * rate(month)
        const full = item.taxed + overhead
        return {
          month,
          hours: round(item.hours),
          rawHours: round(item.raw),
          net: round(item.net),
          taxed: round(item.taxed),
          overhead: round(overhead),
          full: round(full),
          perHour: item.hours && item.net ? round(full / item.hours) : null,
        }
      })
    // The hourly figures count only the months with pay, so a month without it does not lower them.
    const paidMonths = [...value.months.entries()].filter(([, item]) => item.net > 0)
    const paidHours = paidMonths.reduce((sum, [, item]) => sum + item.hours, 0)
    const paidNet = paidMonths.reduce((sum, [, item]) => sum + item.net, 0)
    const paidTaxed = paidMonths.reduce((sum, [, item]) => sum + item.taxed, 0)
    const paidOverhead = paidMonths.reduce((sum, [month, item]) => sum + item.hours * rate(month), 0)
    const busiest = [...value.months.entries()].reduce((best, [month, item]) => (item.raw > best.hours ? { month, hours: round(item.raw) } : best), { month: '', hours: 0 })
    return {
      person,
      hours: round(monthRows.reduce((sum, item) => sum + item.hours, 0)),
      rawHours: round(monthRows.reduce((sum, item) => sum + item.rawHours, 0)),
      net: round(monthRows.reduce((sum, item) => sum + item.net, 0)),
      taxed: round(monthRows.reduce((sum, item) => sum + item.taxed, 0)),
      full: round(monthRows.reduce((sum, item) => sum + item.full, 0)),
      paid: value.paid,
      perHour: paidHours ? { net: round(paidNet / paidHours), taxed: round(paidTaxed / paidHours), full: round((paidTaxed + paidOverhead) / paidHours) } : null,
      projects: value.projects.size,
      projectsPerMonth: value.months.size ? round([...value.months.values()].reduce((sum, item) => sum + item.projects.size, 0) / value.months.size) : 0,
      busiest,
      byProject: [...value.byProject.entries()].map(([project, h]) => ({ project, hours: round(h) })).sort((a, b) => b.hours - a.hours),
      months: monthRows,
    }
  })
  personRows.sort((a, b) => b.hours - a.hours)

  const signals: Signal[] = []
  const over = new Map<string, Correction[]>()
  for (const item of corrections) over.set(item.person, [...(over.get(item.person) ?? []), item])
  const worstOf = (items: Correction[]) => items.reduce((best, item) => (item.from > best.from ? item : best))
  for (const [person, items] of [...over.entries()].sort((a, b) => worstOf(b[1]).from - worstOf(a[1]).from)) {
    const worst = worstOf(items)
    signals.push({ key: 'overHours', person, months: items.length, month: worst.month, hours: worst.from, to: worst.to })
  }
  for (const project of projectRows) {
    if ((project.kind === 'client' || project.kind === 'product') && project.hours >= KEY_PERSON_MIN_HOURS && project.lead && project.lead.share >= KEY_PERSON_SHARE) {
      signals.push({ key: 'keyPerson', project: project.name, person: project.lead.person, share: Math.round(project.lead.share * 100) })
    }
  }
  for (const person of personRows) {
    if (person.projectsPerMonth >= SCATTERED_PER_MONTH) signals.push({ key: 'scattered', person: person.person, projects: person.projects, perMonth: person.projectsPerMonth })
  }
  const missing = [...byMonth.values()].filter((month) => month.taxFactorEstimated || month.running === null).map((month) => month.month)
  if (missing.length) signals.push({ key: 'missingCosts', months: missing, all: missing.length === byMonth.size })
  const unpaidPeople = personRows.filter((person) => !person.paid)
  const unpaidHours = projectRows.reduce((sum, project) => sum + project.unpaidHours, 0)
  if (unpaidPeople.length) signals.push({ key: 'unpaid', people: unpaidPeople.length, hours: round(unpaidHours) })
  const sharedHours = projectRows.filter((project) => project.kind === 'shared').reduce((sum, project) => sum + project.hours, 0)
  if (hours && sharedHours / hours >= 0.25) signals.push({ key: 'shared', share: Math.round((sharedHours / hours) * 100), hours: round(sharedHours) })
  const unset = projectRows.filter((project) => project.kind === 'unset')
  if (unset.length) signals.push({ key: 'unset', projects: unset.length, hours: round(unset.reduce((sum, project) => sum + project.hours, 0)) })

  const monthRows = [...byMonth.values()]
  const otherRevenue = [...others.values()].map((group) => ({ ...group, total: round(group.total) })).sort((a, b) => b.total - a.total)
  return {
    months,
    hours: round(hours),
    rawHours: round(entries.reduce((sum, entry) => sum + entry.raw, 0)),
    net: round(monthRows.reduce((sum, month) => sum + month.net, 0)),
    taxed: round(monthRows.reduce((sum, month) => sum + month.taxed, 0)),
    cost: round(monthRows.reduce((sum, month) => sum + month.taxed + (month.running ?? 0) + month.unexplained, 0)),
    pool: {
      shared: projectRows.filter((project) => project.kind === 'shared').map((project) => ({ project: project.name, cost: project.direct })),
      running: round(monthRows.reduce((sum, month) => sum + (month.running ?? 0), 0)),
      unexplained: round(monthRows.reduce((sum, month) => sum + month.unexplained, 0)),
      total: round(monthRows.reduce((sum, month) => sum + month.pool, 0)),
    },
    revenue: round(projectRows.reduce((sum, project) => sum + (project.revenue ?? 0), 0)),
    otherRevenue,
    sources,
    otherTotal: round(otherRevenue.reduce((sum, group) => sum + group.total, 0) + sources.reduce((sum, item) => sum + item.total, 0)),
    bankLeft,
    bankRevenue: round([...bankRevenue.values()].reduce((sum, value) => sum + value, 0)),
    linkedHours: round(projectRows.filter((project) => project.kind === 'client' || project.kind === 'product').reduce((sum, project) => sum + project.hours, 0)),
    sharedHours: round(sharedHours),
    projects: projectRows,
    people: personRows,
    byMonth: monthRows.map((month) => ({
      ...month,
      hours: round(month.hours),
      rawHours: round(month.rawHours),
      net: round(month.net),
      taxed: round(month.taxed),
      unexplained: round(month.unexplained),
      sharedWork: round(month.sharedWork),
      pool: round(month.pool),
      overheadRate: month.overheadRate === null ? null : round(month.overheadRate),
    })),
    corrections,
    signals,
  }
}
