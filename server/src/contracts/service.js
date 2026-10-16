const crypto = require('crypto');
const { getContracts, saveContracts, contractOwners, getProfile } = require('../store');
const { putFile, getFile, removeFile } = require('../finance/files');
const { fileType, docxText } = require('../finance/extract');
const { extractStructured } = require('../openaiClient');

// The company's contracts: a short record of each (what it is for, with whom, its number, dates and
// value) and the signed document behind it. A document added to a contract is read once by the
// language model, which fills the fields the person has not filled in themselves. Contracts in
// Kosovo are mostly scanned public procurement contracts, so the reading has to see the pages.

const CONTRACTS_MAX = 2000;
const TEXT_FIELDS = ['title', 'number', 'reference', 'counterparty', 'type', 'summary', 'paymentTerms', 'signatories', 'notes'];
const DATE_FIELDS = ['signedDate', 'startDate', 'endDate'];
const NUMBER_FIELDS = ['value', 'monthlyValue'];
/** What a reading of the document may fill in. */
const READ_FIELDS = ['title', 'number', 'reference', 'counterparty', 'type', 'summary', 'paymentTerms', 'signatories', ...DATE_FIELDS, ...NUMBER_FIELDS, 'currency', 'vatIncluded'];
const TEXT_LIMITS = { summary: 1000, notes: 2000, paymentTerms: 300, signatories: 300 };

function nowIso() {
  return new Date().toISOString();
}

function contractError(code) {
  const err = new Error(code);
  err.contractCode = code;
  return err;
}

function cleanText(value, key) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXT_LIMITS[key] || 200);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? '' : text;
}

function cleanNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

function cleanCurrency(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : '';
}

function cleanBool(value) {
  return value === true || value === false ? value : null;
}

/** One field as it is kept: text trimmed, dates as YYYY-MM-DD, amounts as numbers or null. */
function cleanField(key, value) {
  if (DATE_FIELDS.includes(key)) return cleanDate(value);
  if (NUMBER_FIELDS.includes(key)) return cleanNumber(value);
  if (key === 'currency') return cleanCurrency(value);
  if (key === 'vatIncluded') return cleanBool(value);
  return cleanText(value, key);
}

function isEmpty(value) {
  return value === '' || value == null;
}

function list(ownerId) {
  return getContracts(ownerId);
}

function find(ownerId, id) {
  return getContracts(ownerId).find((item) => item.id === id) || null;
}

function mutate(ownerId, id, change) {
  const contracts = getContracts(ownerId).map((item) => ({ ...item }));
  const index = contracts.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const next = change(contracts[index]);
  if (!next) return null;
  contracts[index] = { ...next, updatedAt: nowIso() };
  saveContracts(ownerId, contracts);
  return contracts[index];
}

/** The fields the person sent, cleaned; only the ones present in the body. */
function fieldsFrom(body) {
  const fields = {};
  for (const key of [...TEXT_FIELDS, ...DATE_FIELDS, ...NUMBER_FIELDS, 'currency', 'vatIncluded']) {
    if (body[key] !== undefined) fields[key] = cleanField(key, body[key]);
  }
  return fields;
}

async function keepFile(ownerId, file) {
  if (!file || !file.data || file.data.length === 0) return null;
  const id = await putFile(ownerId, { name: file.name, mime: file.mime, data: file.data });
  return { id, name: file.name, mime: file.mime, size: file.data.length };
}

function readingFor(file) {
  if (!file) return null;
  const type = fileType(file.name, file.mime);
  return ['pdf', 'docx', 'image', 'text'].includes(type) ? { state: 'pending', at: nowIso() } : { state: 'unsupported', at: nowIso() };
}

async function create(ownerId, account, body, file) {
  if (getContracts(ownerId).length >= CONTRACTS_MAX) throw contractError('CONTRACTS_FULL');
  const fields = fieldsFrom(body || {});
  if (!file && !fields.title && !fields.number) throw contractError('CONTRACT_TITLE');
  const kept = await keepFile(ownerId, file);
  const contract = {
    id: crypto.randomUUID(),
    title: '',
    number: '',
    reference: '',
    counterparty: '',
    type: '',
    summary: '',
    paymentTerms: '',
    signatories: '',
    notes: '',
    signedDate: '',
    startDate: '',
    endDate: '',
    value: null,
    monthlyValue: null,
    currency: '',
    vatIncluded: null,
    ...fields,
    status: 'active',
    completedAt: null,
    file: kept,
    reading: readingFor(kept),
    filled: [],
    createdAt: nowIso(),
    createdBy: (account && account.email) || '',
    updatedAt: nowIso(),
  };
  saveContracts(ownerId, [contract, ...getContracts(ownerId)]);
  if (contract.reading && contract.reading.state === 'pending') enqueue(ownerId, contract.id);
  return contract;
}

function update(ownerId, id, body) {
  const fields = fieldsFrom(body || {});
  return mutate(ownerId, id, (contract) => {
    const next = { ...contract, ...fields };
    if (!next.title && !next.number && !next.file) throw contractError('CONTRACT_TITLE');
    // A field the person changed is theirs now; reading the document again leaves it alone.
    const changed = Object.keys(fields).filter((key) => fields[key] !== contract[key]);
    next.filled = (contract.filled || []).filter((key) => !changed.includes(key));
    if (body.status === 'completed' && contract.status !== 'completed') {
      next.status = 'completed';
      next.completedAt = cleanDate(body.completedAt) || nowIso().slice(0, 10);
    } else if (body.status === 'active') {
      next.status = 'active';
      next.completedAt = null;
    }
    return next;
  });
}

/** Puts a new document behind the contract, in place of the one it had, and reads it. */
async function replaceFile(ownerId, id, file) {
  const contract = find(ownerId, id);
  if (!contract) return null;
  const kept = await keepFile(ownerId, file);
  if (!kept) throw contractError('FILE_REQUIRED');
  const saved = mutate(ownerId, id, (current) => ({ ...current, file: kept, reading: readingFor(kept) }));
  if (!saved) {
    await removeFile(ownerId, kept.id).catch(() => {});
    return null;
  }
  if (contract.file && contract.file.id) await removeFile(ownerId, contract.file.id).catch(() => {});
  if (saved.reading && saved.reading.state === 'pending') enqueue(ownerId, id);
  return saved;
}

function readAgain(ownerId, id) {
  const saved = mutate(ownerId, id, (contract) => (contract.file ? { ...contract, reading: readingFor(contract.file) } : null));
  if (saved && saved.reading && saved.reading.state === 'pending') enqueue(ownerId, id);
  return saved;
}

async function remove(ownerId, id) {
  const contract = find(ownerId, id);
  if (!contract) return null;
  saveContracts(
    ownerId,
    getContracts(ownerId).filter((item) => item.id !== id),
  );
  if (contract.file && contract.file.id) await removeFile(ownerId, contract.file.id).catch(() => {});
  return contract;
}

async function contractFile(ownerId, id) {
  const contract = find(ownerId, id);
  if (!contract || !contract.file) return null;
  const data = await getFile(ownerId, contract.file.id);
  return data ? { contract, data } : null;
}

/** The words of a Word or text document, for showing it on the page; '' for other files. */
async function contractText(ownerId, id) {
  const found = await contractFile(ownerId, id);
  if (!found) return null;
  const type = fileType(found.contract.file.name, found.contract.file.mime);
  if (type === 'docx') return docxText(found.data);
  if (type === 'text') return found.data.toString('utf8');
  return '';
}

// --- Reading the document.

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'What the contract is for, as its title or subject states it (e.g. "Mirëmbajtja për Deklarime Online"). Not the word "Kontratë" alone.' },
    number: { type: 'string', description: 'The contract number exactly as printed ("Numri i kontratës", "Nr i Kontratës"), e.g. 318-26-5977-2-2-1/C220; empty when none.' },
    reference: { type: 'string', description: 'Another identifier the contract carries: the procurement identification number ("numër identifikues"), the internal number ("Nr. i brendshëm") or a registry number; empty when none.' },
    counterparty: { type: 'string', description: 'The other party to the contract, the one that is not the company: usually the contracting authority or the client. Its proper name, without "në vazhdim".' },
    type: { type: 'string', description: 'A short kind in Albanian, e.g. "Kontratë publike", "Kontratë publike kornizë", "Kontratë shërbimi", "Aneks kontrate", "Marrëveshje".' },
    summary: { type: 'string', description: 'One or two sentences in Albanian on what the company has to deliver.' },
    signedDate: { type: 'string', description: 'The day it was signed, YYYY-MM-DD; when the parties signed on different days, the later day. Empty when not stated.' },
    startDate: { type: 'string', description: 'The day it takes effect or the work starts, YYYY-MM-DD. When it says it takes effect on signing, the signing day. Empty when not stated.' },
    endDate: { type: 'string', description: 'The day it ends, YYYY-MM-DD. When only a duration is given (12 muaj, 3 vite) count it from the start day: start 2026-09-17 + 3 years = 2029-09-16. Empty when neither is stated.' },
    value: { type: ['number', 'null'], description: 'The total contract price or the estimated ceiling of a framework contract; null when only unit prices are given.' },
    monthlyValue: { type: ['number', 'null'], description: 'The price per month when the contract states one; else null.' },
    currency: { type: 'string', description: 'ISO code of the amounts, EUR when the sign is € or none is stated.' },
    vatIncluded: { type: ['boolean', 'null'], description: 'true when the price says it includes VAT (me TVSH), false when it says without VAT (pa TVSH), null when it does not say.' },
    paymentTerms: { type: 'string', description: 'When the company is paid, in a short Albanian phrase (e.g. "Brenda 30 ditëve pas faturës, çdo muaj"); empty when not stated.' },
    signatories: { type: 'string', description: 'Who signed, name and position, for each party, separated by "; ". Empty when not legible.' },
  },
  required: ['title', 'number', 'reference', 'counterparty', 'type', 'summary', 'signedDate', 'startDate', 'endDate', 'value', 'monthlyValue', 'currency', 'vatIncluded', 'paymentTerms', 'signatories'],
};

function instructions(companyName, fileName) {
  return [
    `You read a contract that the company "${companyName || 'the company'}" (in Kosovo) signed. It is usually in Albanian, often a scanned public procurement contract with its special and general conditions.`,
    'Fill the fields from the document. Leave a text empty and an amount null when the document does not state it; never invent one.',
    'Dates are often printed as 17.09.2026 or 27/04/26: write them as 2026-09-17 and 2026-04-27.',
    'Amounts are plain numbers: 2.987,76 € and 2,987.76 € are both 2987.76.',
    'The duration and the payment terms are often in the special conditions (Kushtet e Veçanta) further in, not on the first page; read the whole document.',
    fileName ? `File name: ${fileName}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function readDocument({ name, mime, data, companyName }) {
  const type = fileType(name, mime);
  const parts = [];
  if (type === 'pdf') {
    parts.push({ type: 'input_file', filename: name || 'contract.pdf', file_data: `data:application/pdf;base64,${data.toString('base64')}` });
  } else if (type === 'image') {
    parts.push({ type: 'input_image', image_url: `data:${mime || 'image/png'};base64,${data.toString('base64')}` });
  } else if (type === 'docx') {
    parts.push({ type: 'input_text', text: `Document text:\n${docxText(data).slice(0, 80000)}` });
  } else {
    parts.push({ type: 'input_text', text: `Document text:\n${data.toString('utf8').slice(0, 80000)}` });
  }
  parts.push({ type: 'input_text', text: instructions(companyName, name) });
  return extractStructured(parts, SCHEMA, 'contract');
}

/**
 * Puts what the reading found into the contract: into the fields still empty, and into those an
 * earlier reading filled and nobody changed since. What the person typed stays.
 */
function applyReading(contract, result) {
  const next = { ...contract };
  const filled = new Set(contract.filled || []);
  for (const key of READ_FIELDS) {
    const value = cleanField(key, result[key]);
    if (isEmpty(value)) continue;
    if (!isEmpty(contract[key]) && !filled.has(key)) continue;
    next[key] = value;
    filled.add(key);
  }
  next.filled = [...filled];
  return next;
}

const queue = [];
let busy = false;

function enqueue(ownerId, id) {
  if (queue.some((item) => item.ownerId === ownerId && item.id === id)) return;
  queue.push({ ownerId, id });
  pump();
}

function pump() {
  if (busy || queue.length === 0) return;
  busy = true;
  const { ownerId, id } = queue.shift();
  readOne(ownerId, id)
    .catch((err) => console.error('[contracts] read failed', err.message))
    .finally(() => {
      busy = false;
      pump();
    });
}

async function readOne(ownerId, id) {
  const contract = find(ownerId, id);
  if (!contract || !contract.file || !contract.reading || contract.reading.state !== 'pending') return;
  const fileId = contract.file.id;
  try {
    const data = await getFile(ownerId, fileId);
    if (!data) throw new Error('FILE_MISSING');
    const profile = getProfile(ownerId) || {};
    const result = await readDocument({ name: contract.file.name, mime: contract.file.mime, data, companyName: profile.companyName });
    mutate(ownerId, id, (current) => {
      // A different document was put in while this one was being read; its own reading follows.
      if (!current.file || current.file.id !== fileId) return null;
      return { ...applyReading(current, result), reading: { state: 'done', at: nowIso() } };
    });
  } catch (err) {
    mutate(ownerId, id, (current) => {
      if (!current.file || current.file.id !== fileId) return null;
      return { ...current, reading: { state: 'failed', at: nowIso(), error: String(err.message || err).slice(0, 200) } };
    });
    throw err;
  }
}

/** Documents still waiting when the server last stopped are read now. */
function startContractReading() {
  for (const ownerId of contractOwners()) {
    for (const contract of getContracts(ownerId)) {
      if (contract.reading && contract.reading.state === 'pending') enqueue(ownerId, contract.id);
    }
  }
}

module.exports = {
  applyReading,
  contractFile,
  contractText,
  create,
  list,
  readAgain,
  remove,
  replaceFile,
  startContractReading,
  update,
};
