// Reads CSV text the way a spreadsheet would, for bank statements exported as CSV.

import type { CellValue, Workbook } from './xlsx'

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
