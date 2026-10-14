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

/** The incoming payments of a statement file, or null when the file holds no statement. */
export async function statementFromFile(bytes: Uint8Array, name = ''): Promise<BankStatement | null> {
  try {
    return readStatement(await readAnyWorkbook(bytes, name))
  } catch {
    return null
  }
}
