import { parseLooseDate } from './document'
import { computeTotals, normalizeTaxRate, toNumber } from './invoice'
import type { CellValue, Sheet, Workbook } from './xlsx'

/**
 * Turns a spreadsheet of past invoices into something the server can import.
 *
 * Two layouts are understood:
 *  - the "invoice tracker" workbook: one sheet of invoices, one of invoice lines (joined on the
 *    invoice number) and optionally one of customers;
 *  - a single flat sheet with one row per invoice line, the invoice columns repeated on each row.
 * Sheets and columns are found by their header text (Albanian, English or Italian), not by position.
 */

export type ImportClient = {
  key: string
  fullName: string
  address: string
  phone: string
  email: string
  businessId: string
  vatNumber: string
  fiscalNumber: string
  notes: string
}

export type ImportLine = { description: string; quantity: number; unitPrice: number }

export type ImportWarning = 'totalMismatch' | 'other' | 'noLines' | 'unknownClient'

export type ImportInvoice = {
  number: string
  date: string
  dueDate: string
  clientKey: string
  clientName: string
  items: ImportLine[]
  discount: number
  taxRate: number
  notes: string
  amountPaid: number
  total: number
  /** The total the spreadsheet itself shows, when it has one. */
  sheetTotal: number | null
  warnings: ImportWarning[]
}

export type ImportProblem = { number: string; reason: 'date' | 'client' | 'items' | 'duplicate' }

export type ImportPlan = {
  invoices: ImportInvoice[]
  /** Customers at least one invoice refers to. */
  clients: ImportClient[]
  /** Customers listed in the file that no invoice uses. */
  otherClients: ImportClient[]
  problems: ImportProblem[]
  sheets: { invoices: string; lines: string; clients: string }
}

type Role = string
type Table = { sheet: Sheet; header: Map<Role, number>; firstRow: number; score: number }

const INVOICE_COLUMNS: Record<Role, string[]> = {
  number: ['invoice#', 'invoiceno', 'invoicenumber', 'invoicenr', 'invoice', 'faturanr', 'nrfatures', 'nrifatures', 'numriifatures', 'fatura', 'fattura', 'numerofattura', 'nfattura'],
  client: ['company', 'customer', 'client', 'klienti', 'kompania', 'bleresi', 'cliente', 'companyname', 'customername', 'clientname'],
  date: ['invoicedate', 'date', 'data', 'datafatures', 'dataefatures', 'datafattura'],
  dueDate: ['duedate', 'afati', 'afatiipageses', 'scadenza', 'datascadenza'],
  dueDays: ['duedays', 'ditet', 'afatidite', 'paymentdays', 'giorni'],
  taxRate: ['taxrate', 'vatrate', 'vat', 'vat%', 'tax', 'tax%', 'tvsh', 'tvsh%', 'shkallaetvshse', 'iva', 'iva%', 'aliquota'],
  discount: ['invoicediscount', 'totaldiscount'],
  other: ['other', 'tjera', 'tjeter', 'altro'],
  paid: ['deposit', 'kapari', 'paid', 'amountpaid', 'paguar', 'epaguar', 'pagesat', 'pagesa', 'pagato', 'acconto'],
  notes: ['notes', 'note', 'shenime', 'shenim', 'koment'],
  project: ['projectdescription', 'project', 'projekti', 'pershkrimiiprojektit', 'subject', 'titulli', 'progetto'],
  net: ['detailtotal', 'subtotal', 'nentotali', 'net', 'neto', 'imponibile'],
  total: ['invoicetotal', 'total', 'totali', 'totale', 'amount', 'shuma'],
}

const LINE_COLUMNS: Record<Role, string[]> = {
  number: INVOICE_COLUMNS.number,
  description: ['pershkrimi', 'description', 'item', 'artikulli', 'sherbimi', 'produkti', 'descrizione', 'itemdescription'],
  quantity: ['sasia', 'qty', 'qty.', 'quantity', 'quantita', 'ore', 'hours'],
  unitPrice: ['cmimipernjesi', 'unitprice', 'price', 'cmimi', 'unitcost', 'rate', 'prezzo', 'prezzounitario', 'priceperhour'],
  lineDiscount: ['zbritje', 'zbritja', 'discount', 'sconto'],
}

const CLIENT_COLUMNS: Record<Role, string[]> = {
  lookup: ['lookup'],
  id: ['company#', 'customer#', 'client#', 'companyno', 'customerno', 'customerid', 'id', 'nr'],
  name: ['companyname', 'customername', 'clientname', 'name', 'emri', 'emriikompanise', 'kompania', 'klienti', 'ragionesociale', 'nome'],
  contact: ['contactname', 'contact', 'contactperson', 'personikontaktues', 'kontakti', 'referente'],
  address: ['address', 'adresa', 'street', 'indirizzo'],
  city: ['city', 'qyteti', 'citta'],
  state: ['state', 'country', 'shteti', 'stato', 'paese'],
  zip: ['zipcode', 'zip', 'postalcode', 'kodipostar', 'cap'],
  businessId: ['businessnumber', 'businessid', 'nui', 'numriibiznesit', 'numriunikidentifikues', 'registrationnumber'],
  vatNumber: ['vatnumber', 'vatno', 'numriitvshse', 'nrtvsh', 'partitaiva', 'piva'],
  fiscalNumber: ['fiscalnumber', 'fiscalno', 'numrifiskal', 'nrfiskal', 'codicefiscale'],
  phone: ['phone', 'telefoni', 'tel', 'telefono', 'mobile'],
  email: ['email', 'e-mail', 'mail'],
}

function normalizeHeader(value: CellValue) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#%.-]/g, '')
}

function text(value: CellValue) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  return String(value).replace(/\r\n?/g, '\n').trim()
}

/** Identifiers arrive as numbers (70041518) or text ("5200419-5"); a lone space or 0 means "none". */
function identifier(value: CellValue) {
  const out = text(value)
  return out === '0' ? '' : out
}

function formatDate(date: Date) {
  // Spreadsheet dates are built in UTC by the reader, so read them back in UTC.
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${date.getUTCFullYear()}`
}

function formatLocalDate(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

/** A date cell as the text the invoice will show, or '' if it is not a date. */
function dateText(value: CellValue) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? formatDate(value) : ''
  const raw = text(value)
  return raw && parseLooseDate(raw) ? raw : ''
}

function findTable(sheet: Sheet, columns: Record<Role, string[]>): Table | null {
  let best: Table | null = null
  const limit = Math.min(sheet.rows.length, 25)
  for (let r = 0; r < limit; r++) {
    const header = new Map<Role, number>()
    sheet.rows[r].forEach((cell, col) => {
      const name = normalizeHeader(cell)
      if (!name) return
      for (const [role, aliases] of Object.entries(columns)) {
        if (!header.has(role) && aliases.includes(name)) {
          header.set(role, col)
          break
        }
      }
    })
    if (header.size >= 2 && (!best || header.size > best.score)) best = { sheet, header, firstRow: r + 1, score: header.size }
  }
  return best
}

function rowsOf(table: Table) {
  return table.sheet.rows.slice(table.firstRow).filter((row) => row.some((cell) => cell !== null && text(cell) !== ''))
}

function cell(table: Table, row: CellValue[], role: Role): CellValue {
  const col = table.header.get(role)
  return col === undefined ? null : (row[col] ?? null)
}

function clientFromRow(table: Table, row: CellValue[]): ImportClient | null {
  const fullName = text(cell(table, row, 'name'))
  if (!fullName) return null
  const id = text(cell(table, row, 'id'))
  const contact = text(cell(table, row, 'contact'))
  const address = ['address', 'city', 'state', 'zip']
    .map((role) => text(cell(table, row, role)).replace(/[,\s]+$/, ''))
    .filter(Boolean)
    .join(', ')
  return {
    key: text(cell(table, row, 'lookup')) || (id ? `${id} - ${fullName}` : fullName),
    fullName,
    address,
    phone: text(cell(table, row, 'phone')),
    email: text(cell(table, row, 'email')),
    businessId: identifier(cell(table, row, 'businessId')),
    vatNumber: identifier(cell(table, row, 'vatNumber')),
    fiscalNumber: identifier(cell(table, row, 'fiscalNumber')),
    notes: contact,
  }
}

function nameKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** "64 - MINISTRIA E SHËNDETËSISË" → "MINISTRIA E SHËNDETËSISË" */
function withoutIdPrefix(value: string) {
  return value.replace(/^\s*\d+\s*[-–.]\s*/, '').trim()
}

function addDays(dateString: string, days: number) {
  const date = parseLooseDate(dateString)
  if (!date || !Number.isFinite(days) || days <= 0) return ''
  return formatLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + Math.round(days)))
}

export function planInvoiceImport(workbook: Workbook): ImportPlan {
  let invoiceTable: Table | null = null
  let lineTable: Table | null = null
  let clientTable: Table | null = null
  for (const sheet of workbook.sheets) {
    const asInvoices = findTable(sheet, INVOICE_COLUMNS)
    const asLines = findTable(sheet, LINE_COLUMNS)
    const asClients = findTable(sheet, CLIENT_COLUMNS)
    const invoiceOk = asInvoices && asInvoices.header.has('number') && asInvoices.header.has('date')
    const lineOk = asLines && asLines.header.has('number') && (asLines.header.has('quantity') || asLines.header.has('unitPrice'))
    const clientOk = asClients && asClients.header.has('name') && !invoiceOk && !lineOk
    if (invoiceOk && (!invoiceTable || asInvoices.score > invoiceTable.score)) invoiceTable = asInvoices
    if (lineOk && (!lineTable || asLines.score > lineTable.score)) lineTable = asLines
    if (clientOk && (!clientTable || asClients.score > clientTable.score)) clientTable = asClients
  }
  if (!invoiceTable) throw new Error('NO_INVOICE_SHEET')

  // Customers, findable by their lookup text, by "id - name", or by name alone.
  const directory = new Map<string, ImportClient>()
  const listed: ImportClient[] = []
  if (clientTable) {
    for (const row of rowsOf(clientTable)) {
      const client = clientFromRow(clientTable, row)
      if (!client) continue
      listed.push(client)
      for (const key of [client.key, client.fullName]) if (!directory.has(nameKey(key))) directory.set(nameKey(key), client)
    }
  }

  // Lines grouped by invoice number.
  const lines = new Map<string, { items: ImportLine[]; discount: number }>()
  if (lineTable) {
    for (const row of rowsOf(lineTable)) {
      const number = text(cell(lineTable, row, 'number'))
      if (!number) continue
      const description = text(cell(lineTable, row, 'description'))
      const unitPrice = toNumber(cell(lineTable, row, 'unitPrice'))
      const quantityCell = cell(lineTable, row, 'quantity')
      const quantity = quantityCell === null || text(quantityCell) === '' ? 1 : toNumber(quantityCell)
      if (!description && quantity * unitPrice === 0) continue
      const group = lines.get(number) || { items: [], discount: 0 }
      group.items.push({ description, quantity, unitPrice })
      group.discount += Math.max(toNumber(cell(lineTable, row, 'lineDiscount')), 0)
      lines.set(number, group)
    }
  }

  const flat = lineTable !== null && lineTable.sheet === invoiceTable.sheet
  const invoices: ImportInvoice[] = []
  const problems: ImportProblem[] = []
  const used = new Map<string, ImportClient>()
  const seen = new Set<string>()

  for (const row of rowsOf(invoiceTable)) {
    const number = text(cell(invoiceTable, row, 'number'))
    const clientCell = text(cell(invoiceTable, row, 'client'))
    // Totals rows and stray cells under the table are not invoices.
    if (!number || /^(totals?|totali|totale|gjithsej)$/i.test(number)) continue
    if (seen.has(number)) {
      // In a flat sheet every further row of an invoice repeats its number; elsewhere it is a real duplicate.
      if (!flat) problems.push({ number, reason: 'duplicate' })
      continue
    }
    seen.add(number)

    const date = dateText(cell(invoiceTable, row, 'date'))
    if (!date) {
      problems.push({ number, reason: 'date' })
      continue
    }
    if (!clientCell) {
      problems.push({ number, reason: 'client' })
      continue
    }

    const warnings: ImportWarning[] = []
    let client = directory.get(nameKey(clientCell)) || directory.get(nameKey(withoutIdPrefix(clientCell)))
    if (!client) {
      if (clientTable) warnings.push('unknownClient')
      const fullName = withoutIdPrefix(clientCell) || clientCell
      client = { key: clientCell, fullName, address: '', phone: '', email: '', businessId: '', vatNumber: '', fiscalNumber: '', notes: '' }
      directory.set(nameKey(clientCell), client)
    }
    used.set(client.key, client)

    const project = text(cell(invoiceTable, row, 'project'))
    const notes = [project, text(cell(invoiceTable, row, 'notes'))].filter(Boolean).join('\n\n')
    const group = lines.get(number)
    let items = group?.items || []
    let discount = (group?.discount || 0) + Math.max(toNumber(cell(invoiceTable, row, 'discount')), 0)
    const taxRate = normalizeTaxRate(cell(invoiceTable, row, 'taxRate'))
    const sheetTotalCell = cell(invoiceTable, row, 'total')
    const sheetTotal = sheetTotalCell === null || text(sheetTotalCell) === '' ? null : Math.round(toNumber(sheetTotalCell) * 100) / 100

    if (items.length === 0) {
      // No line rows: fall back to one line carrying the invoice's net amount, if the sheet gives one.
      const netCell = cell(invoiceTable, row, 'net')
      const net = netCell !== null && text(netCell) !== '' ? toNumber(netCell) : sheetTotal !== null ? sheetTotal / (1 + taxRate / 100) : 0
      if (net <= 0) {
        problems.push({ number, reason: 'items' })
        continue
      }
      items = [{ description: project.split('\n')[0] || number, quantity: 1, unitPrice: net }]
      discount = 0
      warnings.push('noLines')
    }

    const other = toNumber(cell(invoiceTable, row, 'other'))
    if (other !== 0) warnings.push('other')
    const totals = computeTotals(
      items.map((item, index) => ({ id: String(index), ...item })),
      discount,
      taxRate,
    )
    // The sheet's own total may already have a deposit taken off.
    const paidInSheet = toNumber(cell(invoiceTable, row, 'paid'))
    if (sheetTotal !== null && other === 0 && Math.abs(sheetTotal - totals.total) > 0.011 && Math.abs(sheetTotal + paidInSheet - totals.total) > 0.011) {
      warnings.push('totalMismatch')
    }

    const dueDate = dateText(cell(invoiceTable, row, 'dueDate')) || addDays(date, toNumber(cell(invoiceTable, row, 'dueDays')))
    invoices.push({
      number,
      date,
      dueDate,
      clientKey: client.key,
      clientName: client.fullName,
      items,
      discount: Math.round(discount * 100) / 100,
      taxRate,
      notes,
      amountPaid: Math.max(Math.round(toNumber(cell(invoiceTable, row, 'paid')) * 100) / 100, 0),
      total: totals.total,
      sheetTotal,
      warnings,
    })
  }

  return {
    invoices,
    clients: [...used.values()],
    otherClients: listed.filter((client) => !used.has(client.key)),
    problems,
    sheets: { invoices: invoiceTable.sheet.name, lines: lineTable && !flat ? lineTable.sheet.name : '', clients: clientTable?.sheet.name || '' },
  }
}

export type ImportOptions = { markPaid: boolean; includeOtherClients: boolean }

/** The request body for POST /api/invoices/import. */
export function importPayload(plan: ImportPlan, existingNumbers: Set<string>, options: ImportOptions) {
  const invoices = plan.invoices.filter((item) => !existingNumbers.has(item.number))
  const needed = new Set(invoices.map((item) => item.clientKey))
  const clients = [...plan.clients.filter((client) => needed.has(client.key)), ...(options.includeOtherClients ? plan.otherClients : [])]
  return {
    clients,
    invoices: invoices.map((item) => ({
      number: item.number,
      date: item.date,
      dueDate: item.dueDate,
      clientKey: item.clientKey,
      items: item.items,
      discount: item.discount,
      taxRate: item.taxRate,
      notes: item.notes,
      amountPaid: item.amountPaid,
      paid: options.markPaid,
    })),
  }
}
