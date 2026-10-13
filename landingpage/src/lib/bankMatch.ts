// Compares a bank statement with the invoices: which invoices the incoming payments settle, which
// invoices the bank shows nothing for, and which payments belong to no invoice here.

import { activePayments, parseLooseDate } from './document'
import type { Invoice } from './invoice'
import { isLegacyWorkbook, readLegacyWorkbook } from './xls'
import { readWorkbook, type CellValue, type Workbook } from './xlsx'

/** One incoming payment on the statement. `date` is YYYY-MM-DD. */
export type BankLine = { date: string; amount: number; text: string }

export type BankStatement = {
  lines: BankLine[]
  /** First and last day the statement has any movement on, incoming or outgoing. */
  from: string
  to: string
}

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100)

function plain(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A statement's date cell: a real date, Excel's day number, or text such as 13.10.2026. */
function cellDate(value: CellValue): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : isoDate(value)
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return ''
    const date = new Date(Math.round((value - 25569) * 86400000))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  }
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{5}(\.\d+)?$/.test(text)) return cellDate(Number(text))
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  const parsed = parseLooseDate(text)
  return parsed ? isoDate(parsed) : ''
}

/** An amount cell: a number, or text written either as 1,183.00 or as 1.183,00. */
function cellAmount(value: CellValue): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let text = String(value ?? '').replace(/[^\d.,-]/g, '')
  if (!text) return 0
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma !== -1 && dot !== -1) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  else if (comma !== -1) text = /,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '')
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : 0
}

const HEADERS = {
  date: ['date', 'data', 'datum'],
  credit: ['kredit', 'credit', 'hyrje', 'hyrese', 'incoming', 'deposit', 'paidin', 'avere', 'entrate'],
  debit: ['debit', 'dalje', 'dalese', 'outgoing', 'withdraw', 'paidout', 'dare', 'uscite'],
  amount: ['amount', 'shuma', 'vlera', 'importo'],
  text: ['koment', 'comment', 'pershkrim', 'description', 'detaj', 'detail', 'narrative', 'qellimi', 'purpose', 'causale', 'descrizione', 'reference'],
}

type Columns = { date: number; credit: number; debit: number; amount: number; text: number[] }

function findColumns(row: CellValue[]): Columns | null {
  const columns: Columns = { date: -1, credit: -1, debit: -1, amount: -1, text: [] }
  row.forEach((cell, index) => {
    const name = plain(cell).replace(/[^a-z]/g, '')
    if (!name) return
    const has = (words: string[]) => words.some((word) => name.includes(word))
    if (has(HEADERS.credit) && !has(HEADERS.debit)) {
      if (columns.credit === -1) columns.credit = index
    } else if (has(HEADERS.debit)) {
      if (columns.debit === -1) columns.debit = index
    } else if (has(HEADERS.text)) columns.text.push(index)
    else if (has(HEADERS.date)) {
      if (columns.date === -1) columns.date = index
    } else if (has(HEADERS.amount)) {
      if (columns.amount === -1) columns.amount = index
    }
  })
  if (columns.date === -1 || (columns.credit === -1 && columns.amount === -1)) return null
  return columns
}

/** Dates written out in the lines above the table, where a statement prints the period it covers. */
function statedDates(rows: CellValue[][]): string[] {
  const found: string[] = []
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue
      for (const [, day, month, year] of cell.matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g)) found.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
      for (const [, year, month, day] of cell.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) found.push(`${year}-${month}-${day}`)
    }
  }
  return found.filter((day) => !Number.isNaN(Date.parse(day)))
}

/** The incoming payments of a bank statement, found by its column headings. Null when it has none. */
export function readStatement(workbook: Workbook): BankStatement | null {
  for (const sheet of workbook.sheets) {
    for (let head = 0; head < Math.min(sheet.rows.length, 60); head += 1) {
      const columns = findColumns(sheet.rows[head] || [])
      if (!columns) continue
      const lines: BankLine[] = []
      let from = ''
      let to = ''
      for (const row of sheet.rows.slice(head + 1)) {
        const date = cellDate(row[columns.date] ?? null)
        if (!date) continue
        const credit = columns.credit !== -1 ? cellAmount(row[columns.credit] ?? null) : Math.max(cellAmount(row[columns.amount] ?? null), 0)
        const debit = columns.debit !== -1 ? cellAmount(row[columns.debit] ?? null) : Math.max(-cellAmount(row[columns.amount] ?? null), 0)
        if (credit <= 0 && debit <= 0) continue
        if (!from || date < from) from = date
        if (!to || date > to) to = date
        if (credit <= 0) continue
        const text = columns.text
          .map((index) => String(row[index] ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ')
        lines.push({ date, amount: Math.round(credit * 100) / 100, text })
      }
      if (lines.length === 0) continue
      // The period printed above the table ("From date: 01.01.2026") is wider than the first and
      // last movement; a date far from them is something else, such as when the account was opened.
      const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 45 * 86400000
      const stated = statedDates(sheet.rows.slice(0, head))
      const start = stated.filter((day) => day < from && near(day, from)).sort()[0] || from
      const end = stated.filter((day) => day > to && near(day, to)).sort().pop() || to
      return { lines: lines.sort((a, b) => a.date.localeCompare(b.date)), from: start, to: end }
    }
  }
  return null
}

/** Reads a statement file in either Excel format. */
export async function readStatementFile(file: Blob): Promise<BankStatement | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return readStatement(isLegacyWorkbook(bytes) ? readLegacyWorkbook(bytes) : await readWorkbook(bytes.buffer as ArrayBuffer))
}

/** How sure a pairing is: the payment names the invoice number, or only payer and amount fit. */
export type MatchBasis = 'number' | 'amount'

export type BankPayment = { date: string; amount: number; basis: MatchBasis }

export type InvoiceVerdict = {
  invoice: Invoice
  /** What the statement shows as paid towards this invoice. */
  payments: BankPayment[]
  bankPaid: number
  /** What the app has recorded as paid within the statement's period, cash aside: what the statement can check. */
  recorded: number
  /** Recorded payments the statement cannot speak for (cash, or dated outside its period); they stay. */
  kept: number
  /** What applying the statement would do to the invoice. */
  change: 'none' | 'paid' | 'partial' | 'unpaid' | 'dates'
  basis: MatchBasis
  /** The recorded payments that applying the statement replaces. */
  replaces: string[]
}

export type BankMatch = {
  statement: BankStatement
  verdicts: InvoiceVerdict[]
  /** Incoming payments, or the part of one, that no invoice here accounts for. */
  loose: (BankLine & { rest: number })[]
}

const COMPANY_WORDS = new Set(['shpk', 'sha', 'llc', 'ltd', 'gmbh', 'srl', 'doo', 'inc', 'the', 'dhe', 'and', 'per', 'del', 'von'])

function words(text: string) {
  return plain(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function isoOfInvoice(invoice: Invoice) {
  const date = parseLooseDate(invoice.date)
  return date ? isoDate(date) : ''
}

/** An invoice number as a pattern that also finds it written 202609/014, 202609 014 or 202609-14. */
function numberPattern(number: string): RegExp | null {
  const parts = String(number || '').match(/[a-z]+|\d+/gi)
  if (!parts || parts.join('').replace(/\D/g, '').length < 5) return null
  const body = parts
    .map((part, index) => (/^\d+$/.test(part) && index === parts.length - 1 && parts.length > 1 ? `0*${Number(part)}` : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('[\\s\\-/._]{0,3}')
  return new RegExp(`(?<![a-z0-9])${body}(?![0-9])`, 'i')
}

/** The digit layout the invoice numbers share (202609-014 → 6 digits, dash, 3 digits), to spot a number of the same kind that is not ours. */
function numberShapes(invoices: Invoice[]): RegExp[] {
  const shapes = new Set<string>()
  for (const invoice of invoices) {
    const number = String(invoice.number || '').trim()
    if (number.replace(/\D/g, '').length < 5 || !/\d[^\da-z]+\d/i.test(number)) continue
    shapes.add(number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\d+/g, (digits) => `\\d{${digits.length}}`).replace(/[a-z]+/gi, (letters) => letters))
  }
  return [...shapes].slice(0, 8).map((shape) => new RegExp(`(?<![a-z0-9])${shape}(?![0-9])`, 'gi'))
}

/** The bank's own charge on an international transfer, when the statement states it (":71F:EUR33.00"). */
function statedFee(text: string) {
  const found = /71F:\s*[A-Z]{3}\s*([\d.,]+)/i.exec(text)
  return found ? cents(cellAmount(found[1])) : 0
}

/**
 * Pairs the statement's incoming payments with the issued invoices, oldest payment first:
 * 1. a payment that names invoice numbers settles those invoices;
 * 2. what is left of a payment goes to open invoices of the client it names, when the amounts add up exactly;
 * 3. a payment naming nobody goes to the one open invoice of exactly that amount.
 * A payment a few euros short of an invoice it names is taken as paid in full, the difference being bank charges.
 */
export function matchStatement(statement: BankStatement, invoices: Invoice[], options: { dates?: boolean } = {}): BankMatch {
  const issued = invoices.filter((invoice) => invoice.lifecycle !== 'draft' && invoice.lifecycle !== 'cancelled' && invoice.status !== 'cancelled' && cents(invoice.total) > 0)
  const inPeriod = (iso: string) => Boolean(iso) && iso >= statement.from && iso <= statement.to
  const entries = issued.map((invoice) => {
    const total = cents(invoice.total)
    const date = isoOfInvoice(invoice)
    const live = activePayments(invoice.payments)
    // The statement can only confirm or deny transfers made within its own period.
    const checkable = live.filter((payment) => payment.method !== 'cash' && inPeriod(cellDate(payment.date)))
    // An invoice marked paid by hand, with no payment row, counts as paid in full on its own date.
    const byHand = live.length === 0 && invoice.status === 'paid'
    const recorded = byHand ? (inPeriod(date) ? total : 0) : checkable.reduce((sum, payment) => sum + cents(payment.amount), 0)
    const kept = byHand ? total - recorded : live.reduce((sum, payment) => sum + cents(payment.amount), 0) - recorded
    const start = Math.max(total - kept, 0)
    return { invoice, total, date, live, checkable, recorded, kept, start, open: start, pattern: numberPattern(invoice.number), payments: [] as BankPayment[], names: [] as string[] }
  })
  const shapes = numberShapes(issued)

  // A word of a client's name counts only if it is not all over the statement (a country, "bank" …).
  const lineWords = statement.lines.map((line) => new Set(words(line.text)))
  const frequency = new Map<string, number>()
  for (const set of lineWords) for (const word of set) frequency.set(word, (frequency.get(word) || 0) + 1)
  const common = (word: string) => (frequency.get(word) || 0) > Math.max(statement.lines.length * 0.15, 8)
  for (const entry of entries) {
    const all = words(entry.invoice.client?.fullName || '').filter((word) => !COMPANY_WORDS.has(word) && !/^\d+$/.test(word))
    const long = all.filter((word) => word.length >= 4 && !common(word))
    entry.names = long.length > 0 ? long : all.filter((word) => word.length === 3 && !common(word))
  }
  const namesClient = (entry: (typeof entries)[number], set: Set<string>) =>
    entry.names.some((name) => {
      if (set.has(name)) return true
      // Banks cut long names short: "MITROVI" for Mitrovica.
      for (const word of set) if (word.length >= 5 && name.length > word.length && name.startsWith(word)) return true
      return false
    })

  const clientKey = (entry: (typeof entries)[number]) => entry.invoice.clientId || entry.invoice.client?.id || plain(entry.invoice.client?.fullName)
  const ownNumbers = new Set(entries.map((entry) => plain(entry.invoice.number)))
  const loose: BankMatch['loose'] = []
  const leftovers: { line: BankLine; set: Set<string>; rest: number; payers: Set<string>; foreign: boolean }[] = []

  // 1. Payments that name invoice numbers.
  statement.lines.forEach((line, index) => {
    let rest = cents(line.amount) + statedFee(line.text)
    const set = lineWords[index]
    let named = entries.filter((entry) => entry.pattern && entry.pattern.test(line.text))
    // A number that belongs to another client is a slip of the payer's pen when the sums do not fit.
    const sumOpen = (list: typeof entries) => list.reduce((sum, entry) => sum + entry.open, 0)
    if (named.length > 1 && Math.abs(sumOpen(named) - rest) > 5) {
      const own = named.filter((entry) => namesClient(entry, set))
      if (own.length > 0 && own.length < named.length) named = own
    }
    // A number of the same kind as ours that is not ours: the payment is for an invoice kept elsewhere.
    const foreign = shapes.some((shape) => (line.text.match(shape) || []).some((found) => !ownNumbers.has(plain(found))))
    named
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry, position) => {
        if (entry.open <= 0 || rest <= 0) return
        const last = position === named.length - 1
        // Short by a little on the last invoice it names: bank charges, the invoice is settled.
        const short = entry.open - rest
        const settles = short <= 0 || (last && short <= Math.min(5000, Math.max(entry.open * 0.03, 5)))
        const paid = settles ? entry.open : rest
        entry.payments.push({ date: line.date, amount: paid / 100, basis: 'number' })
        entry.open -= paid
        rest -= Math.min(paid, rest)
      })
    if (rest > 5) leftovers.push({ line, set, rest, payers: new Set(named.map(clientKey)), foreign })
  })

  // 2. What is left goes to open invoices of one client — the one whose invoices the payment named,
  //    or whose name it carries — when they add up exactly. The oldest invoices that fit are taken.
  const unexplained: typeof leftovers = []
  for (const left of leftovers) {
    const pool = left.foreign && left.payers.size === 0 ? [] : entries.filter((entry) => entry.open > 0 && entry.date && entry.date <= left.line.date && (left.payers.has(clientKey(entry)) || namesClient(entry, left.set)))
    const byClient = new Map<string, typeof entries>()
    for (const entry of pool) byClient.set(clientKey(entry), [...(byClient.get(clientKey(entry)) || []), entry])
    let best: typeof entries | null = null
    const newest = (list: typeof entries) => list[list.length - 1].date
    for (const group of byClient.values()) {
      const candidates = group.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14)
      for (let mask = 1; mask < 1 << candidates.length; mask += 1) {
        const chosen = candidates.filter((_, bit) => mask & (1 << bit))
        if (Math.abs(chosen.reduce((sum, entry) => sum + entry.open, 0) - left.rest) > 5) continue
        if (!best || newest(chosen) < newest(best) || (newest(chosen) === newest(best) && chosen.length < best.length)) best = chosen
      }
    }
    if (!best) {
      unexplained.push(left)
      continue
    }
    for (const entry of best) {
      entry.payments.push({ date: left.line.date, amount: entry.open / 100, basis: 'amount' })
      entry.open = 0
    }
  }

  // 3. A payment naming nobody we know: the one open invoice of exactly that amount, if there is only one client it could be.
  for (const left of unexplained) {
    const fits = left.foreign || left.payers.size > 0 ? [] : entries.filter((entry) => entry.open > 0 && entry.date && entry.date <= left.line.date && Math.abs(entry.open - left.rest) <= 5 && entry.open === entry.start)
    const clients = new Set(fits.map(clientKey))
    const mentionsOther = entries.some((entry) => namesClient(entry, left.set))
    if (fits.length > 0 && clients.size === 1 && !mentionsOther) {
      const entry = fits.sort((a, b) => a.date.localeCompare(b.date))[0]
      entry.payments.push({ date: left.line.date, amount: entry.open / 100, basis: 'amount' })
      entry.open = 0
    } else {
      loose.push({ ...left.line, rest: Math.min(left.rest, cents(left.line.amount)) / 100 })
    }
  }

  const verdicts: InvoiceVerdict[] = entries.map((entry) => {
    const bankPaid = entry.start - entry.open
    const basis: MatchBasis = entry.payments.some((payment) => payment.basis === 'amount') ? 'amount' : 'number'
    let change: InvoiceVerdict['change'] = 'none'
    if (bankPaid !== entry.recorded) {
      if (bankPaid + entry.kept >= entry.total) change = 'paid'
      else change = bankPaid + entry.kept > 0 ? 'partial' : 'unpaid'
    } else if (bankPaid > 0 && options.dates) {
      const sameDays =
        entry.checkable.length === entry.payments.length &&
        entry.payments.every((payment) => entry.checkable.some((row) => cellDate(row.date) === payment.date && cents(row.amount) === cents(payment.amount)))
      if (!sameDays) change = 'dates'
    }
    return {
      invoice: entry.invoice,
      payments: entry.payments,
      bankPaid: bankPaid / 100,
      recorded: entry.recorded / 100,
      kept: entry.kept / 100,
      change,
      basis,
      replaces: change === 'none' ? [] : entry.checkable.map((payment) => payment.id),
    }
  })

  return { statement, verdicts, loose }
}

/** What to send the server for the verdicts the user kept ticked. Dates go out as DD.MM.YYYY. */
export function reconcilePayload(verdicts: InvoiceVerdict[]) {
  const local = (iso: string) => {
    const [year, month, day] = iso.split('-')
    return `${day}.${month}.${year}`
  }
  return verdicts
    .filter((verdict) => verdict.change !== 'none')
    .map((verdict) => ({ id: verdict.invoice.id, void: verdict.replaces, add: verdict.payments.map((payment) => ({ amount: payment.amount, date: local(payment.date) })) }))
}
