// The second entry the API server is built from (see scripts/build-server-render.mjs). It lets the
// server read the spreadsheets an accountant or a bank sends — the same way the web app reads them —
// and pair a bank statement with the invoices, so a statement that arrives by email settles the
// invoices it pays without anyone opening it. Nothing here may depend on React or on the browser.

import { findColumns, matchStatement, movement, readStatement, reconcilePayload, type BankStatement, type Columns } from './bankMatch'
import { SPEND_CATEGORIES, type SpendCategory } from './finance'
import type { Invoice } from './invoice'
import { isLegacyWorkbook, readLegacyWorkbook } from './xls'
import { readCsv } from './csv'
import { readWorkbook, type CellValue, type Workbook } from './xlsx'

export { matchStatement, readStatement, reconcilePayload, readCsv, SPEND_CATEGORIES }
export type { BankStatement, Invoice, Workbook }


/** Reads a spreadsheet in whichever form it came: .xlsx, the older .xls, or CSV text. */
export async function readAnyWorkbook(bytes: Uint8Array, name = ''): Promise<Workbook> {
  if (isLegacyWorkbook(bytes)) return readLegacyWorkbook(bytes)
  // An .xlsx file is a ZIP archive, which starts with "PK".
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readWorkbook(bytes.slice().buffer as ArrayBuffer)
  if (!/\.(csv|txt|tsv)$/i.test(name) && bytes.includes(0)) throw new Error('NOT_SPREADSHEET')
  return readCsv(new TextDecoder('utf-8').decode(bytes))
}

function cellText(value: CellValue) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (typeof value === 'number') return String(Math.round(value * 10000) / 10000)
  return String(value).replace(/\s+/g, ' ').trim()
}

/**
 * The workbook as plain text, one row per line and the cells separated by " | ", for reading by
 * the language model. Very long sheets keep their beginning and their end, where the totals are.
 */
export function workbookText(workbook: Workbook, maxChars = 60000) {
  const parts: string[] = []
  const share = Math.max(4000, Math.floor(maxChars / Math.max(1, workbook.sheets.length)))
  for (const sheet of workbook.sheets) {
    const lines = sheet.rows
      .map((row) => {
        const cells = row.map(cellText)
        while (cells.length && !cells[cells.length - 1]) cells.pop()
        return cells.join(' | ')
      })
      .filter((line) => line.replace(/[|\s]/g, ''))
    let body = lines.join('\n')
    if (body.length > share) {
      const head: string[] = []
      const tail: string[] = []
      let used = 0
      for (const line of lines) {
        if (used + line.length > share * 0.6) break
        head.push(line)
        used += line.length + 1
      }
      for (let i = lines.length - 1; i >= head.length; i -= 1) {
        if (used + lines[i].length > share) break
        tail.unshift(lines[i])
        used += lines[i].length + 1
      }
      body = `${head.join('\n')}\n… (${lines.length - head.length - tail.length} rows left out) …\n${tail.join('\n')}`
    }
    parts.push(`## Sheet: ${sheet.name}\n${body}`)
  }
  return parts.join('\n\n').slice(0, maxChars)
}

function amountOf(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value ?? '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(text)) return null
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma !== -1 && dot !== -1) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  else if (comma !== -1) text = /,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '')
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : null
}

const plainText = (value: CellValue) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * The balances and totals a bank statement prints, read from the sheet itself: the opening and
 * final balance written above the table ("Previous balance : 103,980.21"), or else the balance
 * column, and the sums of the debit and credit columns. Null for what the sheet does not show.
 */
export function statementFigures(workbook: Workbook) {
  const result = { openingBalance: null as number | null, closingBalance: null as number | null, totalIn: null as number | null, totalOut: null as number | null }
  for (const sheet of workbook.sheets) {
    for (const row of sheet.rows.slice(0, 40)) {
      for (const cell of row) {
        const text = plainText(cell)
        const stated = /(previous balance|opening balance|gjendja fillestare|saldo fillestare|saldo e fillimit)[^\d-]*(-?[\d.,]+\d)/.exec(text)
        if (stated && result.openingBalance === null) result.openingBalance = amountOf(stated[2])
        const final = /(final balance|closing balance|gjendja e fundit|saldo perfundimtare|saldo e fundit)[^\d-]*(-?[\d.,]+\d)/.exec(text)
        if (final && result.closingBalance === null) result.closingBalance = amountOf(final[2])
      }
    }
    const table = statementTable(sheet.rows)
    if (!table) continue
    const { head, columns, balance } = table
    let totalIn = 0
    let totalOut = 0
    const rows: { day: string; credit: number; debit: number; left: number | null }[] = []
    for (const row of sheet.rows.slice(head + 1)) {
      // Only movement rows: they carry a date, a summary line does not.
      const day = excelDay(row[columns.date] ?? null)
      if (!day) continue
      const { credit, debit } = movement(row, columns)
      if (credit <= 0 && debit <= 0) continue
      totalIn += credit
      totalOut += debit
      rows.push({ day, credit, debit, left: balance !== -1 ? amountOf(row[balance] ?? null) : null })
    }
    result.totalIn = Math.round(totalIn * 100) / 100
    result.totalOut = Math.round(totalOut * 100) / 100
    // Without balances printed above the table, the balance column says them: banks list newest
    // first or oldest first, so the newest row is at the end whose date is later.
    const known = rows.filter((row) => row.left !== null)
    if (known.length) {
      const newestFirst = known[0].day > known[known.length - 1].day
      const newest = newestFirst ? known[0] : known[known.length - 1]
      const oldest = newestFirst ? known[known.length - 1] : known[0]
      if (result.closingBalance === null) result.closingBalance = newest.left
      if (result.openingBalance === null && oldest.left !== null) result.openingBalance = Math.round((oldest.left - oldest.credit + oldest.debit) * 100) / 100
    }
    break
  }
  return result
}

/** The table of movements in a sheet: its heading row, its columns, and the running balance column. */
function statementTable(rows: CellValue[][]): { head: number; columns: Columns; balance: number } | null {
  for (let head = 0; head < Math.min(rows.length, 60); head += 1) {
    const columns = findColumns(rows[head] || [])
    if (!columns) continue
    const names = (rows[head] || []).map(plainText)
    return { head, columns, balance: names.findIndex((name) => /bilanc|balance|saldo|gjendja/.test(name)) }
  }
  return null
}


/** What an outgoing payment was for, from the words the bank wrote on it. */
export function spendCategory(text: string): SpendCategory {
  const words = plainText(text)
  if (/pagese e komisionit|komisioni mujor|commission|provizion/.test(words)) return 'fees'
  // What the owners take out is not a cost of running the company.
  if (/\bdividen(t|d)/.test(words)) return 'dividends'
  if (/kontribut\w* pensional|mfakp|\btrust\b/.test(words)) return 'pension'
  if (/administraten tatimore|administrata tatimore|\batk\b|fiscal no/.test(words)) return 'taxes'
  if (/\bpag(a|at|en)\b|\brrog|salary|salaries|pune praktike/.test(words)) return 'payroll'
  if (/\bqira|\brent\b/.test(words)) return 'rent'
  if (/terheqje|bankomat|\batm\b|cash withdrawal/.test(words)) return 'cash'
  if (/blerje me kartel|\bpos\b|card purchase/.test(words)) return 'card'
  if (/fatur|invoice|proforma|pagese|payment|transfert/.test(words)) return 'suppliers'
  return 'other'
}

function excelDay(value: CellValue): string {
  const iso = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (typeof value === 'number') return value > 20000 && value < 80000 ? iso(new Date(Math.round((value - 25569) * 86400000))) : ''
  const text = String(value ?? '').trim()
  if (/^\d{5}(\.\d+)?$/.test(text)) return excelDay(Number(text))
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text)
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : ''
}

export type StatementMonth = { in: number; out: number; spend: Record<SpendCategory, number> }

/** Raised whenever the sorting of outgoing payments changes, so statements read before are read again. */
export const STATEMENT_MONTHS_VERSION = 3

/**
 * Money in and out of the account month by month, and what went out for: pay, taxes and
 * contributions, rent, suppliers, card purchases, cash, bank fees. Null when the sheet has no
 * debit and credit columns with dates.
 */
export function statementMonths(workbook: Workbook): { iban: string; months: Record<string, StatementMonth>; days: Record<string, StatementMonth> } | null {
  for (const sheet of workbook.sheets) {
    const table = statementTable(sheet.rows)
    if (!table) continue
    const { head, columns } = table
    const date = columns.date
    const months: Record<string, StatementMonth> = {}
    const days: Record<string, StatementMonth> = {}
    const blankMonth = () => ({ in: 0, out: 0, spend: Object.fromEntries(SPEND_CATEGORIES.map((item) => [item, 0])) as Record<SpendCategory, number> })
    for (const row of sheet.rows.slice(head + 1)) {
      const day = excelDay(row[date] ?? null)
      if (!day) continue
      const { credit: inAmount, debit: outAmount } = movement(row, columns)
      if (!inAmount && !outAmount) continue
      const key = day.slice(0, 7)
      const month = (months[key] ||= blankMonth())
      const today = (days[day] ||= blankMonth())
      month.in += inAmount
      today.in += inAmount
      if (outAmount) {
        month.out += outAmount
        today.out += outAmount
        const text = row
          .filter((cell, index) => typeof cell === 'string' && index !== date)
          .join(' ')
        const category = spendCategory(text)
        month.spend[category] += outAmount
        today.spend[category] += outAmount
      }
    }
    for (const month of [...Object.values(months), ...Object.values(days)]) {
      month.in = Math.round(month.in * 100) / 100
      month.out = Math.round(month.out * 100) / 100
      for (const item of SPEND_CATEGORIES) month.spend[item] = Math.round(month.spend[item] * 100) / 100
    }
    // A day keeps only the categories money went to; a statement has hundreds of days.
    for (const day of Object.values(days)) for (const item of SPEND_CATEGORIES) if (!day.spend[item]) delete day.spend[item]
    let iban = ''
    for (const row of sheet.rows.slice(0, head)) for (const cell of row) iban ||= /\bXK\d{18}\b/.exec(String(cell ?? '').replace(/\s+/g, ''))?.[0] || ''
    return Object.keys(months).length ? { iban, months, days } : null
  }
  return null
}

/** The incoming payments of a statement file, or null when the file holds no statement. */
export async function statementFromFile(bytes: Uint8Array, name = ''): Promise<BankStatement | null> {
  try {
    return readStatement(await readAnyWorkbook(bytes, name))
  } catch {
    return null
  }
}
