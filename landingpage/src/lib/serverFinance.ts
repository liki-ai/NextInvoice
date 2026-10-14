// The second entry the API server is built from (see scripts/build-server-render.mjs). It lets the
// server read the spreadsheets an accountant or a bank sends — the same way the web app reads them —
// and pair a bank statement with the invoices, so a statement that arrives by email settles the
// invoices it pays without anyone opening it. Nothing here may depend on React or on the browser.

import { matchStatement, readStatement, reconcilePayload, type BankStatement } from './bankMatch'
import type { Invoice } from './invoice'
import { isLegacyWorkbook, readLegacyWorkbook } from './xls'
import { readWorkbook, type CellValue, type Workbook } from './xlsx'

export { matchStatement, readStatement, reconcilePayload }
export type { BankStatement, Invoice, Workbook }

/** Splits comma-, semicolon- or tab-separated text into rows, honouring quoted cells. */
export function readCsv(text: string): Workbook {
  const source = text.replace(/^﻿/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] || ''
  const counts = [';', ',', '\t'].map((mark) => [mark, firstLine.split(mark).length] as const)
  const separator = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows: CellValue[][] = []
  let row: CellValue[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === separator) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return { sheets: [{ name: 'CSV', rows }] }
}

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
    const head = sheet.rows.findIndex((row) => {
      const names = row.map(plainText)
      return names.some((name) => /debit/.test(name)) && names.some((name) => /kredit|credit/.test(name))
    })
    if (head === -1) continue
    const names = sheet.rows[head].map(plainText)
    const debit = names.findIndex((name) => /debit/.test(name) && !/kredit|credit/.test(name))
    const credit = names.findIndex((name) => /kredit|credit/.test(name) && !/debit/.test(name))
    const balance = names.findIndex((name) => /bilanc|balance|saldo|gjendja/.test(name))
    let totalIn = 0
    let totalOut = 0
    const balances: number[] = []
    for (const row of sheet.rows.slice(head + 1)) {
      // Only movement rows: they carry a running number or a date before the amounts, not a summary.
      if (row.some((cell) => /permbledhje|summary|total/.test(plainText(cell)))) continue
      const inAmount = credit !== -1 ? amountOf(row[credit] ?? null) : null
      const outAmount = debit !== -1 ? amountOf(row[debit] ?? null) : null
      if (inAmount === null && outAmount === null) continue
      totalIn += Math.max(inAmount ?? 0, 0)
      totalOut += Math.max(outAmount ?? 0, 0)
      const left = balance !== -1 ? amountOf(row[balance] ?? null) : null
      if (left !== null) balances.push(left)
    }
    result.totalIn = Math.round(totalIn * 100) / 100
    result.totalOut = Math.round(totalOut * 100) / 100
    if (result.closingBalance === null && balances.length > 0 && result.openingBalance !== null) {
      // Banks list newest first or oldest first; the end that moved away from the opening balance is the newest.
      const first = balances[0]
      const last = balances[balances.length - 1]
      result.closingBalance = Math.abs(last - result.openingBalance) < Math.abs(first - result.openingBalance) ? first : last
    }
    break
  }
  return result
}

/** The incoming payments of a statement file, or null when the file holds no statement. */
export async function statementFromFile(bytes: Uint8Array, name = ''): Promise<BankStatement | null> {
  try {
    return readStatement(await readAnyWorkbook(bytes, name))
  } catch {
    return null
  }
}
