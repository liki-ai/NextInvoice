// Where the team's time goes: the hours logged by month, project and person (read from the
// timesheet workbook), the pay those hours stand for, and what each project's client was invoiced
// in the same months. The Projects page draws these figures.

import type { Invoice } from './invoice'
import { buildOverview } from './overview'
import type { CellValue, Workbook } from './xlsx'

export type TimesheetEntry = { month: string; project: string; person: string; hours: number; pay: number | null }
export type ProjectMeta = { clientId?: string | null; internal?: boolean }
export type Timesheet = {
  fileName: string
  importedAt: string | null
  importedBy: string | null
  months: string[]
  entries: TimesheetEntry[]
  projects: Record<string, ProjectMeta>
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

export type ProjectKind = 'client' | 'internal' | 'unset'

export type ProjectFigures = {
  name: string
  kind: ProjectKind
  clientId: string | null
  hours: number
  share: number
  cost: number
  unpaidHours: number
  revenue: number | null
  profit: number | null
  revenuePerHour: number | null
  people: { person: string; hours: number }[]
  lead: { person: string; share: number } | null
  byMonth: Record<string, number>
}

export type PersonFigures = {
  person: string
  hours: number
  cost: number
  paid: boolean
  projects: number
  projectsPerMonth: number
  busiest: { month: string; hours: number }
  byProject: { project: string; hours: number }[]
}

export type MonthTotals = { month: string; hours: number; cost: number; client: number; internal: number; unset: number }

export type Signal =
  | { key: 'overHours'; person: string; months: number; month: string; hours: number }
  | { key: 'keyPerson'; project: string; person: string; share: number }
  | { key: 'scattered'; person: string; projects: number; perMonth: number }
  | { key: 'unpaid'; people: number; hours: number }
  | { key: 'internal'; share: number; hours: number }
  | { key: 'unset'; projects: number; hours: number }

export type ProjectsReport = {
  months: string[]
  hours: number
  cost: number
  unpaidHours: number
  revenue: number
  linkedHours: number
  internalHours: number
  projects: ProjectFigures[]
  people: PersonFigures[]
  byMonth: MonthTotals[]
  signals: Signal[]
}

/** More than this in a month is more than one person can work: a timer left running, or shared logins. */
export const MONTH_HOURS_LIMIT = 220
const KEY_PERSON_SHARE = 0.7
const KEY_PERSON_MIN_HOURS = 100
const SCATTERED_PER_MONTH = 5

type ClientRef = { id?: string; fullName?: string }

/** What each client was invoiced, net of VAT, in each month: issued invoices, not cancelled ones. */
function revenueByClient(invoices: Invoice[], clients: ClientRef[], months: string[], currency: string) {
  const idByName = new Map(clients.filter((client) => client.id).map((client) => [String(client.fullName || '').trim().toLowerCase(), client.id as string]))
  const result = new Map<string, Map<string, number>>()
  for (const month of months) {
    const [year, number] = month.split('-').map(Number)
    const report = buildOverview({ invoices, period: { start: new Date(year, number - 1, 1), end: new Date(year, number, 0) }, currency, fallbackCurrency: currency })
    for (const invoice of report.issuedInPeriod as Invoice[]) {
      const id = invoice.clientId || invoice.client?.id || idByName.get(String(invoice.client?.fullName || '').trim().toLowerCase())
      if (!id) continue
      const net = (Number(invoice.total) || 0) / (1 + (Number(invoice.taxRate) || 0) / 100)
      const byMonth = result.get(id) ?? new Map<string, number>()
      byMonth.set(month, (byMonth.get(month) ?? 0) + net)
      result.set(id, byMonth)
    }
  }
  return result
}

export function buildProjectsReport({
  timesheet,
  months,
  invoices,
  clients,
  currency,
}: {
  timesheet: Timesheet
  months: string[]
  invoices: Invoice[]
  clients: ClientRef[]
  currency: string
}): ProjectsReport {
  const wanted = new Set(months)
  const entries = timesheet.entries.filter((entry) => wanted.has(entry.month))
  const meta = (name: string): ProjectMeta => timesheet.projects[name] || {}
  const kindOf = (name: string): ProjectKind => (meta(name).internal ? 'internal' : meta(name).clientId ? 'client' : 'unset')

  const projects = new Map<string, { hours: number; cost: number; unpaid: number; people: Map<string, number>; byMonth: Record<string, number> }>()
  const people = new Map<string, { hours: number; cost: number; paid: boolean; projects: Set<string>; byMonth: Map<string, { hours: number; projects: Set<string> }>; byProject: Map<string, number> }>()
  const byMonth = new Map<string, MonthTotals>(months.map((month) => [month, { month, hours: 0, cost: 0, client: 0, internal: 0, unset: 0 }]))

  for (const entry of entries) {
    const project = projects.get(entry.project) ?? { hours: 0, cost: 0, unpaid: 0, people: new Map<string, number>(), byMonth: {} as Record<string, number> }
    project.hours += entry.hours
    project.cost += entry.pay ?? 0
    if (entry.pay === null) project.unpaid += entry.hours
    project.people.set(entry.person, (project.people.get(entry.person) ?? 0) + entry.hours)
    project.byMonth[entry.month] = (project.byMonth[entry.month] ?? 0) + entry.hours
    projects.set(entry.project, project)

    const person = people.get(entry.person) ?? { hours: 0, cost: 0, paid: false, projects: new Set(), byMonth: new Map(), byProject: new Map() }
    person.hours += entry.hours
    person.cost += entry.pay ?? 0
    if (entry.pay !== null) person.paid = true
    person.projects.add(entry.project)
    const month = person.byMonth.get(entry.month) ?? { hours: 0, projects: new Set<string>() }
    month.hours += entry.hours
    month.projects.add(entry.project)
    person.byMonth.set(entry.month, month)
    person.byProject.set(entry.project, (person.byProject.get(entry.project) ?? 0) + entry.hours)
    people.set(entry.person, person)

    const totals = byMonth.get(entry.month)
    if (totals) {
      totals.hours += entry.hours
      totals.cost += entry.pay ?? 0
      totals[kindOf(entry.project)] += entry.hours
    }
  }

  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0)

  // A client invoiced for several projects: its revenue is shared among them by their hours.
  const revenue = revenueByClient(invoices, clients, months, currency)
  const clientHours = new Map<string, number>()
  for (const [name, project] of projects) {
    const clientId = kindOf(name) === 'client' ? meta(name).clientId! : null
    if (clientId) clientHours.set(clientId, (clientHours.get(clientId) ?? 0) + project.hours)
  }

  const projectRows: ProjectFigures[] = [...projects.entries()].map(([name, project]) => {
    const kind = kindOf(name)
    const clientId = kind === 'client' ? meta(name).clientId! : null
    let projectRevenue: number | null = null
    if (clientId) {
      const invoiced = [...(revenue.get(clientId)?.values() ?? [])].reduce((sum, value) => sum + value, 0)
      projectRevenue = round(invoiced * (project.hours / (clientHours.get(clientId) || project.hours)))
    }
    const team = [...project.people.entries()].map(([person, value]) => ({ person, hours: round(value) })).sort((a, b) => b.hours - a.hours)
    return {
      name,
      kind,
      clientId,
      hours: round(project.hours),
      share: hours ? project.hours / hours : 0,
      cost: round(project.cost),
      unpaidHours: round(project.unpaid),
      revenue: projectRevenue,
      profit: projectRevenue === null ? null : round(projectRevenue - project.cost),
      revenuePerHour: projectRevenue === null || !project.hours ? null : round(projectRevenue / project.hours),
      people: team,
      lead: team.length ? { person: team[0].person, share: team[0].hours / project.hours } : null,
      byMonth: project.byMonth,
    }
  })
  projectRows.sort((a, b) => b.hours - a.hours)

  const personRows: PersonFigures[] = [...people.entries()].map(([person, value]) => {
    const monthsWorked = [...value.byMonth.entries()]
    const busiest = monthsWorked.reduce((best, [month, item]) => (item.hours > best.hours ? { month, hours: round(item.hours) } : best), { month: '', hours: 0 })
    return {
      person,
      hours: round(value.hours),
      cost: round(value.cost),
      paid: value.paid,
      projects: value.projects.size,
      projectsPerMonth: monthsWorked.length ? round(monthsWorked.reduce((sum, [, item]) => sum + item.projects.size, 0) / monthsWorked.length) : 0,
      busiest,
      byProject: [...value.byProject.entries()].map(([project, h]) => ({ project, hours: round(h) })).sort((a, b) => b.hours - a.hours),
    }
  })
  personRows.sort((a, b) => b.hours - a.hours)

  const signals: Signal[] = []
  // One line a person: in how many months, and the worst of them.
  const over: Signal[] = []
  for (const [person, value] of people) {
    const months = [...value.byMonth.entries()].filter(([, item]) => item.hours > MONTH_HOURS_LIMIT).sort((a, b) => b[1].hours - a[1].hours)
    if (months.length) over.push({ key: 'overHours', person, months: months.length, month: months[0][0], hours: round(months[0][1].hours) })
  }
  signals.push(...over.sort((a, b) => (b.key === 'overHours' ? b.hours : 0) - (a.key === 'overHours' ? a.hours : 0)))
  for (const project of projectRows) {
    if (project.kind !== 'internal' && project.hours >= KEY_PERSON_MIN_HOURS && project.lead && project.lead.share >= KEY_PERSON_SHARE) {
      signals.push({ key: 'keyPerson', project: project.name, person: project.lead.person, share: Math.round(project.lead.share * 100) })
    }
  }
  for (const person of personRows) {
    if (person.projectsPerMonth >= SCATTERED_PER_MONTH) signals.push({ key: 'scattered', person: person.person, projects: person.projects, perMonth: person.projectsPerMonth })
  }
  const unpaidPeople = personRows.filter((person) => !person.paid)
  const unpaidHours = projectRows.reduce((sum, project) => sum + project.unpaidHours, 0)
  if (unpaidPeople.length) signals.push({ key: 'unpaid', people: unpaidPeople.length, hours: round(unpaidHours) })
  const internalHours = projectRows.filter((project) => project.kind === 'internal').reduce((sum, project) => sum + project.hours, 0)
  if (hours && internalHours / hours >= 0.25) signals.push({ key: 'internal', share: Math.round((internalHours / hours) * 100), hours: round(internalHours) })
  const unset = projectRows.filter((project) => project.kind === 'unset')
  if (unset.length) signals.push({ key: 'unset', projects: unset.length, hours: round(unset.reduce((sum, project) => sum + project.hours, 0)) })

  return {
    months,
    hours: round(hours),
    cost: round(projectRows.reduce((sum, project) => sum + project.cost, 0)),
    unpaidHours: round(unpaidHours),
    revenue: round(projectRows.reduce((sum, project) => sum + (project.revenue ?? 0), 0)),
    linkedHours: round(projectRows.filter((project) => project.kind === 'client').reduce((sum, project) => sum + project.hours, 0)),
    internalHours: round(internalHours),
    projects: projectRows,
    people: personRows,
    byMonth: [...byMonth.values()].map((month) => ({ ...month, hours: round(month.hours), cost: round(month.cost) })),
    signals,
  }
}
