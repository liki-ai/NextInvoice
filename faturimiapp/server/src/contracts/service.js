const crypto = require('crypto');
const { getContracts, saveContracts, contractOwners, getProfile, listClients } = require('../store');
const { putFile, getFile, removeFile } = require('../finance/files');
const { fileType, docxText } = require('../finance/extract');
const { extractStructured } = require('../openaiClient');

// The company's contracts: a short record of each (what it is for, with whom, its number, dates and
// value) and the signed document behind it. A document added to a contract is read once by the
// language model, which fills the fields the person has not filled in themselves. Contracts in
// Kosovo are mostly scanned public procurement contracts, so the reading has to see the pages.

const CONTRACTS_MAX = 2000;
const TEXT_FIELDS = ['title', 'number', 'reference', 'counterparty', 'counterpartyAddress', 'counterpartyBusinessId', 'clientId', 'type', 'summary', 'paymentTerms', 'signatories', 'notes'];
const DATE_FIELDS = ['signedDate', 'startDate', 'endDate', 'maintenanceEndDate'];
const NUMBER_FIELDS = ['value', 'monthlyValue', 'maintenanceMonths'];
/** What a reading of the document may fill in. */
const READ_FIELDS = ['title', 'number', 'reference', 'counterparty', 'counterpartyAddress', 'counterpartyBusinessId', 'type', 'summary', 'paymentTerms', 'signatories', ...DATE_FIELDS, ...NUMBER_FIELDS, 'currency', 'vatIncluded'];
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
  const contract = newContract(account, fields, kept);
  saveContracts(ownerId, [contract, ...getContracts(ownerId)]);
  if (contract.reading && contract.reading.state === 'pending') enqueue(ownerId, contract.id);
  return contract;
}

function newContract(account, fields, kept) {
  return {
    id: crypto.randomUUID(),
    title: '',
    number: '',
    reference: '',
    counterparty: '',
    counterpartyAddress: '',
    counterpartyBusinessId: '',
    clientId: '',
    type: '',
    summary: '',
    paymentTerms: '',
    signatories: '',
    notes: '',
    signedDate: '',
    startDate: '',
    endDate: '',
    maintenanceMonths: null,
    maintenanceEndDate: '',
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
}

const IMPORT_MAX = 500;

function sameKey(contract) {
  return `${nameWords(contract.title).join(' ')}|${nameWords(contract.counterparty).join(' ')}`;
}

/**
 * Adds the contracts of a spreadsheet, each linked to its client when the other party is one. A row
 * whose contract is already in the list (same name and other party) is left out.
 */
function importContracts(ownerId, account, rows) {
  const list = Array.isArray(rows) ? rows.slice(0, IMPORT_MAX) : [];
  const current = getContracts(ownerId);
  if (current.length + list.length > CONTRACTS_MAX) throw contractError('CONTRACTS_FULL');
  const known = new Set(current.map(sameKey));
  const clients = listClients(ownerId);
  const added = [];
  for (const row of list) {
    const fields = fieldsFrom(row || {});
    if (!fields.title && !fields.number) continue;
    const contract = newContract(account, fields, null);
    if (known.has(sameKey(contract))) continue;
    known.add(sameKey(contract));
    if (row.status === 'completed') {
      contract.status = 'completed';
      contract.completedAt = contract.endDate && contract.endDate <= nowIso().slice(0, 10) ? contract.endDate : nowIso().slice(0, 10);
    }
    if (!contract.maintenanceEndDate) contract.maintenanceEndDate = maintenanceEnd(contract.endDate, contract.maintenanceMonths);
    const client = contract.counterparty ? matchClient(clients, contract) : null;
    if (client) contract.clientId = client.id;
    contract.clientChecked = true;
    added.push(contract);
  }
  if (added.length > 0) saveContracts(ownerId, [...added, ...current]);
  return { added: added.length, skipped: list.length - added.length };
}

function update(ownerId, id, body) {
  const fields = fieldsFrom(body || {});
  return mutate(ownerId, id, (contract) => {
    const next = { ...contract, ...fields };
    if (!next.title && !next.number && !next.file) throw contractError('CONTRACT_TITLE');
    // A field the person changed is theirs now; reading the document again leaves it alone.
    const changed = Object.keys(fields).filter((key) => fields[key] !== contract[key]);
    next.filled = (contract.filled || []).filter((key) => !changed.includes(key));
    if (!next.maintenanceEndDate) next.maintenanceEndDate = maintenanceEnd(next.endDate, next.maintenanceMonths);
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
    counterpartyAddress: { type: 'string', description: 'Address of the other party as the contract gives it; empty when not stated.' },
    counterpartyBusinessId: { type: 'string', description: 'Business or fiscal number of the other party (NUI, NRB, numri fiskal); empty when not stated.' },
    type: { type: 'string', description: 'A short kind in Albanian, e.g. "Kontratë publike", "Kontratë publike kornizë", "Kontratë shërbimi", "Aneks kontrate", "Marrëveshje".' },
    summary: { type: 'string', description: 'One or two sentences in Albanian on what the company has to deliver.' },
    signedDate: { type: 'string', description: 'The day it was signed, YYYY-MM-DD; when the parties signed on different days, the later day. Empty when not stated.' },
    startDate: { type: 'string', description: 'The day it takes effect or the work starts, YYYY-MM-DD. When it says it takes effect on signing, the signing day. Empty when not stated.' },
    endDate: { type: 'string', description: 'The day it ends, YYYY-MM-DD. When only a duration is given (12 muaj, 3 vite) count it from the start day: start 2026-09-17 + 3 years = 2029-09-16. Empty when neither is stated.' },
    value: { type: ['number', 'null'], description: 'The total contract price or the estimated ceiling of a framework contract; null when only unit prices are given.' },
    monthlyValue: { type: ['number', 'null'], description: 'The price per month when the contract states one; else null.' },
    maintenanceMonths: { type: ['number', 'null'], description: 'Many contracts go on after the work is delivered: a warranty or maintenance period (garancioni, mirëmbajtja, periudha e garancisë, "garancioni për 24 muaj pas pranimit"). Its length in months (2 vite = 24); null when the contract has none.' },
    maintenanceEndDate: { type: 'string', description: 'The last day of that warranty or maintenance period, YYYY-MM-DD, when the contract states it or the day it is counted from (pranimi, the acceptance) is stated. Empty otherwise; it is then counted from endDate.' },
    currency: { type: 'string', description: 'ISO code of the amounts, EUR when the sign is € or none is stated.' },
    vatIncluded: { type: ['boolean', 'null'], description: 'true when the price says it includes VAT (me TVSH), false when it says without VAT (pa TVSH), null when it does not say.' },
    paymentTerms: { type: 'string', description: 'When the company is paid, in a short Albanian phrase (e.g. "Brenda 30 ditëve pas faturës, çdo muaj"); empty when not stated.' },
    signatories: { type: 'string', description: 'Who signed, name and position, for each party, separated by "; ". Empty when not legible.' },
  },
  required: ['title', 'number', 'reference', 'counterparty', 'counterpartyAddress', 'counterpartyBusinessId', 'type', 'summary', 'signedDate', 'startDate', 'endDate', 'maintenanceMonths', 'maintenanceEndDate', 'value', 'monthlyValue', 'currency', 'vatIncluded', 'paymentTerms', 'signatories'],
};

function instructions(companyName, fileName) {
  return [
    `You read a contract that the company "${companyName || 'the company'}" (in Kosovo) signed. It is usually in Albanian, often a scanned public procurement contract with its special and general conditions.`,
    'Fill the fields from the document. Leave a text empty and an amount null when the document does not state it; never invent one.',
    'Dates are often printed as 17.09.2026 or 27/04/26: write them as 2026-09-17 and 2026-04-27.',
    'Amounts are plain numbers: 2.987,76 € and 2,987.76 € are both 2987.76.',
    'The duration and the payment terms are often in the special conditions (Kushtet e Veçanta) further in, not on the first page; read the whole document.',
    'endDate is the end of the term for doing the work (afati i realizimit); a warranty or maintenance period after it goes into maintenanceMonths and maintenanceEndDate, not into endDate.',
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
  // A warranty of so many months counts from the end of the work when the contract gives no last day.
  const counted = maintenanceEnd(next.endDate, next.maintenanceMonths);
  if (counted && (isEmpty(next.maintenanceEndDate) || (filled.has('maintenanceEndDate') && isEmpty(cleanDate(result.maintenanceEndDate))))) {
    next.maintenanceEndDate = counted;
    filled.add('maintenanceEndDate');
  }
  next.filled = [...filled];
  return next;
}

/** 2026-01-20 + 24 months → 2028-01-20; '' without both. */
function maintenanceEnd(endDate, months) {
  if (!endDate || !months) return '';
  const [year, month, day] = endDate.split('-').map(Number);
  const total = month - 1 + Math.round(months);
  const last = new Date(Date.UTC(year + Math.floor(total / 12), (total % 12) + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year + Math.floor(total / 12), total % 12, Math.min(day, last))).toISOString().slice(0, 10);
}

// --- Finding the client the contract is with.

const LEGAL_WORDS = new Set(['shpk', 'sh', 'sha', 'pk', 'llc', 'ltd', 'inc', 'gmbh', 'srl', 'spa', 'doo', 'dooel']);

/** A name as words to compare: no accents, no punctuation, no legal form (sh.p.k., Sh.A., LLC). */
function nameWords(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !LEGAL_WORDS.has(word));
}

/** "Komisioni i Pavarur për Miniera dhe Minerale" → "kpmm": the first letters of its longer words. */
function initials(words) {
  return words.filter((word) => word.length > 3).map((word) => word[0]).join('');
}

const LINK_WORDS = new Set(['e', 'i', 'te', 'se', 'ne', 'me', 'per', 'dhe', 'nga', 'of', 'the', 'and', 'for']);

/** "KRU Mitrovica" → "krum": a short word kept whole (it is an abbreviation already), the first letter of the others. */
function shortForm(words) {
  return words.filter((word) => !LINK_WORDS.has(word)).map((word) => (word.length <= 3 ? word : word[0])).join('');
}

function sameName(a, b) {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const ja = wa.join(' ');
  const jb = wb.join(' ');
  if (ja === jb) return true;
  // One name written out in full and the other as its short form (KPMM, AME).
  if (wa.length === 1 && wa[0].length >= 3 && (wa[0] === initials(wb) || wa[0] === shortForm(wb))) return true;
  if (wb.length === 1 && wb[0].length >= 3 && (wb[0] === initials(wa) || wb[0] === shortForm(wa))) return true;
  // "KRU Mitrovica" and "K.R.U. Mitrovica Sh.A.": every word of the shorter name in the longer one.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.join('').length >= 6 && short.every((word) => long.includes(word) || long.join('').includes(word));
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** The one client the other party of the contract is; null when none or several could be. */
function matchClient(clients, { counterparty, counterpartyBusinessId }) {
  const id = digits(counterpartyBusinessId);
  if (id.length >= 6) {
    const byId = clients.filter((client) => [client.businessId, client.fiscalNumber, client.vatNumber].some((value) => digits(value) === id));
    if (byId.length === 1) return byId[0];
  }
  const byName = clients.filter((client) => sameName(client.fullName, counterparty));
  return byName.length === 1 ? byName[0] : null;
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
      const next = { ...applyReading(current, result), reading: { state: 'done', at: nowIso() } };
      if (!next.clientId) {
        const client = matchClient(listClients(ownerId), next);
        if (client) {
          next.clientId = client.id;
          next.filled = [...next.filled, 'clientId'];
        }
      }
      return next;
    });
  } catch (err) {
    mutate(ownerId, id, (current) => {
      if (!current.file || current.file.id !== fileId) return null;
      return { ...current, reading: { state: 'failed', at: nowIso(), error: String(err.message || err).slice(0, 200) } };
    });
    throw err;
  }
}

/**
 * Documents still waiting when the server last stopped are read now. Contracts read before clients
 * were matched get their client once.
 */
function startContractReading() {
  for (const ownerId of contractOwners()) {
    const unmatched = getContracts(ownerId).filter((item) => !item.clientId && !item.clientChecked && item.counterparty);
    if (unmatched.length > 0) {
      const clients = listClients(ownerId);
      saveContracts(
        ownerId,
        getContracts(ownerId).map((item) => {
          if (!unmatched.some((other) => other.id === item.id)) return item;
          const client = matchClient(clients, item);
          return client ? { ...item, clientId: client.id, clientChecked: true, filled: [...(item.filled || []), 'clientId'] } : { ...item, clientChecked: true };
        }),
      );
    }
    for (const contract of getContracts(ownerId)) {
      if (contract.reading && contract.reading.state === 'pending') enqueue(ownerId, contract.id);
    }
  }
}

module.exports = {
  applyReading,
  importContracts,
  matchClient,
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
