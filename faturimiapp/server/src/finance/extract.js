const zlib = require('zlib');
const { extractStructured } = require('../openaiClient');

// Reads one document an accountant or a bank sent — a tax payment slip, a payroll list, the sales or
// purchase book, the annual statements, a bank statement — and returns what kind it is, the period
// it is about and its figures. The language model only reads; nothing it returns is acted on except
// as numbers to show, and a bank statement's payments are paired with invoices by our own rules.

const KINDS = [
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
];

const num = { type: ['number', 'null'] };
const str = { type: 'string' };

function group(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const SCHEMA = group({
  kind: { type: 'string', enum: KINDS },
  period: { type: 'string', description: 'What the document is about: YYYY-MM for a month, YYYY-Qn for a quarter, YYYY for a year; empty when it has none.' },
  title: { type: 'string', description: 'A short name for the document, in Albanian, as an accountant would call it (e.g. "Fletëpagesa e TVSH-së, gusht 2026").' },
  summary: { type: 'string', description: 'One sentence in Albanian with the main figure(s).' },
  issuer: { type: 'string', description: 'Who issued the document (ATK, the bank, the supplier); empty when unclear.' },
  currency: { type: 'string', description: 'ISO code, EUR when not stated.' },
  dueDate: { type: 'string', description: 'Payment deadline YYYY-MM-DD when the document states one, else empty.' },
  amountDue: { type: ['number', 'null'], description: 'The amount to pay on a payment slip or invoice.' },
  tax: group({ taxBase: num, outputVat: num, inputVat: num, vatPayable: num, wageTax: num, pensionEmployee: num, pensionEmployer: num, rentTax: num, profitTax: num }),
  payroll: group({ employees: num, gross: num, net: num, wageTax: num, pensionEmployee: num, pensionEmployer: num, totalCost: num }),
  book: group({ count: num, net: num, vat: num, gross: num }),
  statements: group({
    revenue: num,
    otherIncome: num,
    costOfSales: num,
    staffCosts: num,
    operatingExpenses: num,
    depreciation: num,
    profitBeforeTax: num,
    incomeTax: num,
    netProfit: num,
    totalAssets: num,
    cash: num,
    receivables: num,
    totalLiabilities: num,
    payables: num,
    equity: num,
  }),
  invoice: group({ number: str, counterparty: str, date: str, net: num, vat: num, total: num }),
  bank: group({
    iban: str,
    from: { type: 'string', description: 'First day the statement covers, YYYY-MM-DD; empty when not a bank statement.' },
    to: { type: 'string', description: 'Last day the statement covers, YYYY-MM-DD.' },
    openingBalance: num,
    closingBalance: num,
    totalIn: num,
    totalOut: num,
  }),
  months: {
    type: 'array',
    description: 'Only for a document covering several months (a yearly payroll list, a book with monthly totals): one entry per month.',
    items: group({ period: str, gross: num, net: num, wageTax: num, pension: num, amount: num }),
  },
  credits: {
    type: 'array',
    description: 'Only for a bank statement that is not a spreadsheet: each incoming payment (credit) with date YYYY-MM-DD, amount and the full description text. At most 300.',
    items: group({ date: str, amount: { type: 'number' }, text: str }),
  },
});

function instructions({ companyName, hint, fileName, email }) {
  return [
    `You read accounting documents for the company "${companyName || 'the company'}" in Kosovo. The documents are usually in Albanian.`,
    'Classify the document and extract its figures. Use null for any figure the document does not state; never invent or estimate one.',
    'Kinds:',
    '- vat_return: TVSH (VAT) return or its payment slip (fletëpagesa e TVSH). vatPayable = VAT to pay; outputVat = VAT on sales; inputVat = VAT on purchases.',
    '- payroll_tax: WM / CM / "WM-CM" slip or declaration: tax withheld on wages (wageTax) and pension contributions (pensionEmployee 5%, pensionEmployer 5%).',
    '- rent_tax: WR slip, tax withheld on rent (qira) → tax.rentTax.',
    '- profit_tax: TM1/TM2 quarterly corporate income tax instalment (kestet tremujore), or the annual corporate declaration (CD, deklarata vjetore) → tax.profitTax.',
    '- other_tax: any other tax or contribution slip.',
    '- payroll: payroll list (lista e pagave): employees, gross pay (bruto), net pay (neto), wage tax, pension contributions, total cost to the employer. A table of net salaries counts too.',
    '- sales_book: libri i shitjeve (LSH): count of sales invoices, net, VAT, gross totals (use the totals row).',
    '- purchase_book: libri i blerjeve (LB): count of purchase invoices, net, VAT, gross totals.',
    '- financial_statements: pasqyrat financiare, pasqyra e fitimit/humbjes (income statement), bilanci (balance sheet), for the year in "period". Take the current year column, not the prior year.',
    '- bank_statement: bank statement / transactions (transaksionet bankare) with balances and movements.',
    `- supplier_invoice: an invoice issued TO "${companyName || 'the company'}" by someone else (e.g. the accountant's fee). invoice.counterparty = the supplier.`,
    `- own_invoice: an invoice issued BY "${companyName || 'the company'}" to a client. invoice.counterparty = the client.`,
    '- legal: statutes, decisions, authorisations, contracts. other: anything else.',
    'The period is what the document is about, not the day it was sent: a slip "8-2026" or "Gusht 2026" is 2026-08; "TM1-2026" is 2026-Q1; the 2025 statements are 2025.',
    'Amounts are plain numbers in the document currency: 1.183,25 and 1,183.25 are both 1183.25.',
    hint ? `Hint: ${hint}` : '',
    fileName ? `File name: ${fileName}` : '',
    email ? `It arrived by email.\n${email}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The text of a Word document (.docx): its paragraphs, read straight from the archive. */
function docxText(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) return '';
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count && offset + 46 <= buffer.length; i += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30);
    const comment = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extra + comment;
    if (name !== 'word/document.xml') continue;
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    const xml = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  return '';
}

function financeLib() {
  try {
    return require('../generated/finance');
  } catch {
    return null;
  }
}

const SPREADSHEET = /\.(xlsx|xlsm|xls|csv|tsv)$/i;

function fileType(name, mime) {
  const lower = String(name || '').toLowerCase();
  if (/\.pdf$/.test(lower) || mime === 'application/pdf') return 'pdf';
  if (SPREADSHEET.test(lower) || /spreadsheet|ms-excel|text\/csv/.test(mime || '')) return 'sheet';
  if (/\.docx$/.test(lower) || /wordprocessingml/.test(mime || '')) return 'docx';
  if (/\.(png|jpe?g|webp|gif)$/.test(lower) || /^image\//.test(mime || '')) return 'image';
  if (/\.(txt|html?)$/.test(lower) || /^text\//.test(mime || '')) return 'text';
  return '';
}

/** What a file name alone says about the document, before anyone reads it. */
function nameHint(name) {
  const text = String(name || '');
  if (/^#?\s*\d{6}-\d{3}\b/.test(text)) return 'own_invoice';
  if (/\bXK\d{2}\s?\d{4}/i.test(text) || /transaksion|ekstrakt|statement/i.test(text)) return 'bank_statement';
  if (/\bLSH\b/i.test(text)) return 'sales_book';
  if (/\bLB\b/i.test(text)) return 'purchase_book';
  if (/\bTVSH\b/i.test(text)) return 'vat_return';
  if (/\bWM\b|\bCM\b/i.test(text)) return 'payroll_tax';
  if (/\bWR\b/i.test(text)) return 'rent_tax';
  if (/\bTM\d\b|\bCD\b|DEKLARATA/i.test(text)) return 'profit_tax';
  if (/pag(a|e)ve|payroll/i.test(text)) return 'payroll';
  if (/pasqyr|bilanc/i.test(text)) return 'financial_statements';
  return '';
}

const HINT_TEXT = {
  own_invoice: 'The file name looks like one of the company\'s own invoice numbers.',
  bank_statement: 'The file name looks like a bank account or a bank statement.',
  sales_book: 'LSH in the file name usually means the sales book.',
  purchase_book: 'LB in the file name usually means the purchase book.',
  vat_return: 'TVSH in the file name means VAT.',
  payroll_tax: 'WM-CM in the file name means wage tax and pension contributions.',
  rent_tax: 'WR in the file name means the tax withheld on rent.',
  profit_tax: 'TM1/TM2/CD in the file name means corporate income tax.',
  payroll: 'The file name suggests a payroll list.',
  financial_statements: 'The file name suggests financial statements.',
};

/**
 * Reads one file. Returns { result, statement } — `result` the extracted figures, `statement` the
 * incoming payments when the file is a bank statement in spreadsheet form. Throws when the file
 * cannot be read.
 */
async function extractDocument({ name, mime, data, companyName, email }) {
  const type = fileType(name, mime);
  if (!type) {
    const err = new Error('UNSUPPORTED_FILE');
    err.code = 'UNSUPPORTED_FILE';
    throw err;
  }
  const guess = nameHint(name);
  const parts = [];
  let statement = null;
  let sheetBank = null;
  let sheetMonths = null;
  let hint = HINT_TEXT[guess] || '';

  if (type === 'pdf') {
    parts.push({ type: 'input_file', filename: name || 'document.pdf', file_data: `data:application/pdf;base64,${data.toString('base64')}` });
  } else if (type === 'image') {
    parts.push({ type: 'input_image', image_url: `data:${mime || 'image/png'};base64,${data.toString('base64')}` });
  } else if (type === 'sheet') {
    const lib = financeLib();
    if (!lib) throw new Error('FINANCE_LIB_MISSING');
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.length);
    const workbook = await lib.readAnyWorkbook(bytes, name);
    // Sales and purchase books have dates and amounts too; only a file the model also takes for a
    // bank statement is treated as one.
    statement = lib.readStatement(workbook);
    if (statement && lib.statementFigures) sheetBank = lib.statementFigures(workbook);
    if (statement && lib.statementMonths) sheetMonths = lib.statementMonths(workbook);
    if (statement && (!guess || guess === 'bank_statement')) hint = 'This spreadsheet may be a bank statement. If it is, fill "bank" and leave "credits" empty: the movements are read separately.';
    parts.push({ type: 'input_text', text: `Spreadsheet contents:\n${lib.workbookText(workbook)}` });
  } else if (type === 'docx') {
    parts.push({ type: 'input_text', text: `Document text:\n${docxText(data).slice(0, 60000)}` });
  } else {
    parts.push({ type: 'input_text', text: `Document text:\n${data.toString('utf8').slice(0, 60000)}` });
  }
  parts.push({ type: 'input_text', text: instructions({ companyName, hint, fileName: name, email }) });

  const result = await extractStructured(parts, SCHEMA, 'finance_document');
  if (result.kind !== 'bank_statement') return { result, statement: null, months: null };
  // The balances and totals the sheet prints are taken as they are; the model's reading fills the rest.
  if (sheetBank && statement) {
    const bank = { ...(result.bank || {}) };
    for (const [key, value] of Object.entries(sheetBank)) if (typeof value === 'number') bank[key] = value;
    bank.from = statement.from;
    bank.to = statement.to;
    result.bank = bank;
  }
  if (sheetMonths) sheetMonths.version = (financeLib() || {}).STATEMENT_MONTHS_VERSION || 1;
  return { result, statement, months: sheetMonths };
}

/** The tables of an email written in HTML, as text, or '' when it has none worth reading. */
function emailTables(html) {
  const source = String(html || '');
  if (!/<table/i.test(source)) return '';
  const text = source
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&euro;/g, '€')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  const amounts = text.match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g) || [];
  return amounts.length >= 3 ? text.slice(0, 30000) : '';
}

module.exports = { KINDS, extractDocument, emailTables, fileType, nameHint, docxText };
