import { parseLooseDate } from './document'
import type { CellValue, Workbook } from './xlsx'
import type { Contract, ContractFields } from './contracts'

// Reads a list of contracts kept in a spreadsheet (one contract per row, a header row naming the
// columns) into contracts to add. Columns are recognised by their names in Albanian or English;
// twelve month columns, when present, give the monthly amount the contract is billed.

export type ImportField = 'title' | 'counterparty' | 'number' | 'reference' | 'type' | 'status' | 'signedDate' | 'startDate' | 'endDate' | 'value' | 'monthlyValue' | 'notes'

export type ContractImportRow = {
  fields: Partial<ContractFields>
  status: Contract['status']
  /** A contract with the same name (and other party) is already in the list. */
  existing: boolean
}

export type ContractImportPlan = { sheet: string; columns: ImportField[]; rows: ContractImportRow[] }

const HEADERS: Record<ImportField, string[]> = {
  title: ['titulli', 'titulli i kontrates', 'emri i kontrates', 'kontrata', 'emertimi', 'lenda', 'projekti', 'pershkrimi', 'title', 'contract', 'contract name', 'name', 'subject'],
  counterparty: ['ak', 'autoriteti', 'autoriteti kontraktues', 'klienti', 'pala', 'pala tjeter', 'porositesi', 'institucioni', 'bleresi', 'client', 'customer', 'party', 'authority'],
  number: ['nr i kontrates', 'numri i kontrates', 'nr kontrates', 'numri', 'nr', 'contract number', 'contract no', 'number'],
  reference: ['nr i prokurimit', 'numri i prokurimit', 'numri identifikues', 'nr i brendshem', 'reference', 'ref'],
  type: ['lloji', 'tipi', 'type'],
  status: ['status', 'statusi', 'gjendja', 'state'],
  signedDate: ['data e nenshkrimit', 'nenshkruar', 'nenshkruar me', 'signed', 'signed on', 'signing date'],
  startDate: ['data e fillimit', 'data fillimit', 'fillimi', 'fillon', 'fillon me', 'start', 'start date', 'from'],
  endDate: ['data e mbarimit', 'data e perfundimit', 'mbarimi', 'perfundimi', 'perfundon', 'perfundon me', 'skadon', 'end', 'end date', 'to', 'until'],
  value: ['buxheti', 'vlera', 'vlera totale', 'vlera e kontrates', 'cmimi', 'shuma', 'totali', 'value', 'budget', 'amount', 'total', 'price'],
  monthlyValue: ['vlera mujore', 'mujore', 'ne muaj', 'monthly', 'per month'],
  notes: ['shenime', 'komente', 'verejtje', 'notes', 'comments'],
}

const MONTHS = [
  ['janar', 'january', 'jan'],
  ['shkurt', 'february', 'feb'],
  ['mars', 'march', 'mar'],
  ['prill', 'april', 'apr'],
  ['maj', 'may'],
  ['qershor', 'june', 'jun'],
  ['korrik', 'july', 'jul'],
  ['gusht', 'august', 'aug'],
  ['shtator', 'september', 'sep'],
  ['tetor', 'october', 'oct'],
  ['nentor', 'november', 'nov'],
  ['dhjetor', 'december', 'dec'],
]

const DONE = /^(perfunduar|perfunduara|e perfunduar|mbyllur|perfundoi|completed|complete|finished|done|closed)$/

/** A cell or a name as plain lowercase words: no accents, no punctuation. */
export function plainText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cellText(value: CellValue) {
  if (value instanceof Date) return isoDay(value)
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A date cell in whichever form it came: a date, an Excel day number, or text such as 21.07.2025. */
function dateOf(value: CellValue) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : isoDay(value)
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return ''
    return isoDay(new Date(Math.round((value - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000))
  }
  const text = cellText(value)
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(text)
  if (dotted) {
    const year = dotted[3].length === 2 ? 2000 + Number(dotted[3]) : Number(dotted[3])
    return `${year}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`
  }
  const parsed = parseLooseDate(text)
  return parsed ? isoDay(parsed) : ''
}

/** An amount cell: a number, or text such as "1.234,56 €" or "1,234.56". */
function amountOf(value: CellValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
  let text = cellText(value).replace(/[^\d.,-]/g, '')
  if (!text) return null
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma > dot) text = text.replace(/\./g, '').replace(',', '.')
  else text = text.replace(/,/g, '')
  const number = Number(text)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null
}

function fieldOf(header: CellValue): ImportField | null {
  const name = plainText(header)
  if (!name) return null
  for (const [field, names] of Object.entries(HEADERS) as [ImportField, string[]][]) {
    if (names.includes(name)) return field
  }
  return null
}

function monthOf(header: CellValue) {
  const name = plainText(header)
  const index = MONTHS.findIndex((names) => names.includes(name))
  return index === -1 ? null : index
}

/** The amount billed most months, when it repeats at least three times: the contract's monthly fee. */
function regularMonthly(amounts: number[]) {
  const counts = new Map<number, number>()
  for (const amount of amounts) if (amount > 0) counts.set(amount, (counts.get(amount) || 0) + 1)
  let best: number | null = null
  let most = 0
  for (const [amount, count] of counts) {
    if (count > most) {
      best = amount
      most = count
    }
  }
  return most >= 3 ? best : null
}

/** Finds the header row: the first of the first rows that names a contract column and at least one more. */
function findHeader(rows: CellValue[][]) {
  for (let index = 0; index < Math.min(rows.length, 15); index++) {
    const fields = rows[index].map(fieldOf)
    if (fields.includes('title') && fields.filter(Boolean).length >= 2) return { index, fields }
  }
  return null
}

export function planContractImport(workbook: Workbook, existing: Contract[]): ContractImportPlan | null {
  const known = new Set(existing.map((item) => `${plainText(item.title)}|${plainText(item.counterparty)}`))
  const knownTitles = new Set(existing.map((item) => plainText(item.title)))
  for (const sheet of workbook.sheets) {
    const header = findHeader(sheet.rows)
    if (!header) continue
    const column = (field: ImportField) => header.fields.indexOf(field)
    const monthColumns = sheet.rows[header.index].map((cell, index) => (monthOf(cell) == null ? -1 : index)).filter((index) => index !== -1)
    const rows: ContractImportRow[] = []
    for (const row of sheet.rows.slice(header.index + 1)) {
      const get = (field: ImportField) => (column(field) === -1 ? null : row[column(field)] ?? null)
      const title = cellText(get('title'))
      if (!title) continue
      const counterparty = cellText(get('counterparty'))
      const months = monthColumns.map((index) => amountOf(row[index] ?? null) || 0)
      const fields: Partial<ContractFields> = {
        title,
        counterparty,
        number: cellText(get('number')),
        reference: cellText(get('reference')),
        type: cellText(get('type')),
        signedDate: dateOf(get('signedDate')),
        startDate: dateOf(get('startDate')),
        endDate: dateOf(get('endDate')),
        value: amountOf(get('value')),
        monthlyValue: amountOf(get('monthlyValue')) ?? regularMonthly(months),
        notes: cellText(get('notes')),
      }
      const key = `${plainText(title)}|${plainText(counterparty)}`
      rows.push({
        fields,
        status: DONE.test(plainText(get('status'))) ? 'completed' : 'active',
        existing: known.has(key) || (!counterparty && knownTitles.has(plainText(title))),
      })
    }
    if (rows.length > 0) {
      const columns = (Object.keys(HEADERS) as ImportField[]).filter((field) => column(field) !== -1)
      return { sheet: sheet.name, columns, rows }
    }
  }
  return null
}
