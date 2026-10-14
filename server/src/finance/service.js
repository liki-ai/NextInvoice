const crypto = require('crypto');
const {
  getFinance,
  financeOwners,
  saveFinance,
  getMailSettings,
  personalMailKey,
  getProfile,
  listInvoices,
  reconcilePayments,
  voidPayment,
} = require('../store');
const { cleanEmail, mailReady, publicMailSettings } = require('../mailer');
const { putFile, getFile, removeFile } = require('./files');
const { extractDocument, emailTables, fileType, nameHint, KINDS } = require('./extract');
const { fetchBatch, testInbox, imapHostFor } = require('./inbox');

// The finance inbox of a company: documents arrive from its mailbox (whatever the accountant sends,
// or is sent, or is copied on) or are uploaded by hand; each is read once, and a bank statement
// among them settles the invoices it shows paid. The page in the web app turns the figures into
// the company's financial health.

const WATCH_MAX = 10;
const MESSAGES_KEPT = 3000;
const DOCUMENTS_MAX = 3000;
const CHECK_EVERY_MS = 15 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function defaultSince() {
  return `${new Date().getFullYear() - 1}-01-01`;
}

function blank() {
  return {
    settings: { enabled: false, box: 'company', accountId: null, watch: [], since: defaultSince(), imapHost: '', autoBank: true },
    cursor: null,
    check: { lastAt: null, lastError: null, lastDetail: null, found: 0 },
    messages: [],
    documents: [],
  };
}

function load(ownerId) {
  const saved = getFinance(ownerId);
  const base = blank();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...(saved.settings || {}) },
    check: { ...base.check, ...(saved.check || {}) },
    messages: Array.isArray(saved.messages) ? saved.messages : [],
    documents: Array.isArray(saved.documents) ? saved.documents : [],
  };
}

/** Reads, changes and saves the company's finance records in one step, with nothing awaited in between. */
function mutate(ownerId, change) {
  const finance = load(ownerId);
  const result = change(finance);
  saveFinance(ownerId, finance);
  return result;
}

function findDoc(finance, id) {
  return finance.documents.find((doc) => doc.id === id) || null;
}

// --- Progress of the mail check and the reading, kept in memory: it only matters while it runs.

const checking = new Map();
const queue = [];
let reading = 0;
const READ_AT_ONCE = 2;

function progress(ownerId) {
  const run = checking.get(ownerId);
  const waiting = queue.filter((item) => item.ownerId === ownerId).length;
  return { checking: Boolean(run), fetched: run ? run.fetched : 0, remaining: run ? run.remaining : 0, reading: waiting + (readingFor.get(ownerId) || 0) };
}

const readingFor = new Map();

/** Queues a document to be read; `first` puts it ahead of the rest (one the user just uploaded). */
function enqueue(ownerId, docId, first = false) {
  if (queue.some((item) => item.ownerId === ownerId && item.docId === docId)) return;
  if (first) queue.unshift({ ownerId, docId });
  else queue.push({ ownerId, docId });
  pump();
}

function pump() {
  while (reading < READ_AT_ONCE && queue.length > 0) {
    const { ownerId, docId } = queue.shift();
    reading += 1;
    readingFor.set(ownerId, (readingFor.get(ownerId) || 0) + 1);
    processDocument(ownerId, docId)
      .catch((err) => console.error('[finance] read failed', err))
      .finally(() => {
        reading -= 1;
        readingFor.set(ownerId, Math.max(0, (readingFor.get(ownerId) || 1) - 1));
        pump();
      });
  }
}

// --- Bringing documents in.

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Keeps a file and queues it to be read. A file already kept (the same bytes, sent again in a
 * reply) is not kept twice; the existing document is returned instead.
 */
async function addFile(ownerId, { name, mime, data, source, email }) {
  const hash = sha256(data);
  const existing = load(ownerId).documents.find((doc) => doc.hash === hash);
  if (existing) return { doc: existing, duplicate: true };
  if (load(ownerId).documents.length >= DOCUMENTS_MAX) throw new Error('FINANCE_FULL');
  const fileId = await putFile(ownerId, { name, mime, data });
  const doc = {
    id: crypto.randomUUID(),
    fileId,
    name,
    mime,
    size: data.length,
    hash,
    source,
    email: email || null,
    receivedAt: (email && email.date) || nowIso(),
    addedAt: nowIso(),
    status: 'pending',
  };
  const saved = mutate(ownerId, (finance) => {
    const again = finance.documents.find((item) => item.hash === hash);
    if (again) return again;
    finance.documents.push(doc);
    return doc;
  });
  if (saved.id === doc.id) enqueue(ownerId, doc.id, source === 'upload');
  else await removeFile(ownerId, fileId);
  return { doc: saved, duplicate: saved.id !== doc.id };
}

function emailContext(message) {
  return {
    messageId: message.messageId,
    date: message.date,
    subject: message.subject,
    from: message.from,
    fromName: message.fromName,
    to: message.to.slice(0, 10),
    cc: message.cc.slice(0, 10),
  };
}

async function addMessage(ownerId, message) {
  const known = load(ownerId).messages.some((item) => item.id === message.messageId);
  if (known) return;
  const email = emailContext(message);
  const docs = [];
  for (const file of message.attachments) {
    if (!fileType(file.name, file.mime)) continue;
    const { doc } = await addFile(ownerId, { ...file, source: 'email', email });
    docs.push(doc.id);
  }
  // A table written into the message itself (a list of net salaries) is a document too.
  const tables = emailTables(message.html);
  if (tables) {
    const text = `${message.subject}\n\n${tables}`;
    const { doc } = await addFile(ownerId, { name: `${message.subject || 'Email'}.txt`.slice(0, 200), mime: 'text/plain', data: Buffer.from(text, 'utf8'), source: 'email-body', email });
    docs.push(doc.id);
  }
  mutate(ownerId, (finance) => {
    finance.messages.push({ id: message.messageId, date: message.date, from: message.from, subject: message.subject, docs });
    if (finance.messages.length > MESSAGES_KEPT) finance.messages = finance.messages.slice(-MESSAGES_KEPT);
  });
}

// --- Reading one document.

const FIGURE_KEYS = ['tax', 'payroll', 'book', 'statements', 'invoice', 'bank', 'months'];

function cleanPeriod(value) {
  const text = String(value || '').trim();
  return /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/.test(text) ? text : '';
}

function ownInvoiceFromName(ownerId, name) {
  const found = /^#?\s*(\d{6}-\d{3})/.exec(String(name || ''));
  const number = found ? found[1] : '';
  const invoice = number ? listInvoices(ownerId).find((item) => String(item.number || '') === number) : null;
  return {
    kind: 'own_invoice',
    period: number ? `${number.slice(0, 4)}-${number.slice(4, 6)}` : '',
    title: number ? `Fatura ${number}` : String(name || ''),
    summary: invoice ? 'Faturë e lëshuar nga kompania; është në Next Invoice.' : 'Faturë e lëshuar nga kompania që nuk gjendet në Next Invoice.',
    figures: { invoice: { number, counterparty: invoice ? String((invoice.client && invoice.client.fullName) || '') : '', date: invoice ? invoice.date : '', total: invoice ? Number(invoice.total) || null : null, inApp: Boolean(invoice), invoiceId: invoice ? invoice.id : null } },
  };
}

async function processDocument(ownerId, docId) {
  const doc = findDoc(load(ownerId), docId);
  if (!doc) return;
  const update = (patch) =>
    mutate(ownerId, (finance) => {
      const current = findDoc(finance, docId);
      if (current) Object.assign(current, patch);
      return current;
    });
  try {
    if (doc.source !== 'email-body' && nameHint(doc.name) === 'own_invoice') {
      update({ ...ownInvoiceFromName(ownerId, doc.name), status: 'done', readAt: nowIso(), error: null });
      return;
    }
    const data = await getFile(ownerId, doc.fileId);
    if (!data) throw new Error('FILE_MISSING');
    const profile = getProfile(ownerId) || {};
    const email = doc.email ? `Subject: ${doc.email.subject}\nFrom: ${doc.email.fromName || ''} <${doc.email.from}>\nDate: ${doc.email.date || ''}` : '';
    const { result, statement, months } = await extractDocument({ name: doc.name, mime: doc.mime, data, companyName: profile.companyName, email });
    const figures = {};
    for (const key of FIGURE_KEYS) figures[key] = result[key];
    if (figures.bank) {
      for (const key of ['from', 'to']) if (!/^\d{4}-\d{2}-\d{2}$/.test(figures.bank[key] || '')) figures.bank[key] = '';
    }
    const kind = KINDS.includes(result.kind) ? result.kind : 'other';
    update({
      kind,
      period: cleanPeriod(result.period),
      title: String(result.title || '').slice(0, 200),
      summary: String(result.summary || '').slice(0, 500),
      issuer: String(result.issuer || '').slice(0, 120),
      currency: /^[A-Z]{3}$/.test(result.currency || '') ? result.currency : 'EUR',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate || '') ? result.dueDate : '',
      amountDue: Number.isFinite(result.amountDue) ? result.amountDue : null,
      figures,
      // A document read again starts over; only a bank statement gets its pairing back below.
      statement: null,
      status: 'done',
      readAt: nowIso(),
      error: null,
    });
    if (kind === 'bank_statement') {
      const fromSheet = Boolean(statement && statement.lines.length);
      const lines = fromSheet
        ? statement.lines
        : (result.credits || [])
            .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line.date) && Number(line.amount) > 0)
            .map((line) => ({ date: line.date, amount: Math.round(Number(line.amount) * 100) / 100, text: String(line.text || '') }));
      if (lines.length) {
        const dates = lines.map((line) => line.date).sort();
        const read = fromSheet ? statement : { lines, from: result.bank && result.bank.from ? result.bank.from : dates[0], to: result.bank && result.bank.to ? result.bank.to : dates[dates.length - 1] };
        settleInvoices(ownerId, docId, read, { auto: fromSheet && load(ownerId).settings.autoBank !== false });
      }
      // Money in and out month by month, and what it went out for.
      if (months) {
        mutate(ownerId, (finance) => {
          const current = findDoc(finance, docId);
          if (!current) return;
          current.statement = { ...(current.statement || { from: statement.from, to: statement.to, credits: 0, totalIn: 0, loose: 0, looseTotal: 0, auto: false, applied: [], review: [] }), iban: months.iban || (result.bank && result.bank.iban) || '', months: months.months, monthsVersion: months.version };
        });
      }
    }
  } catch (err) {
    console.error('[finance] could not read', doc.name, err && err.message);
    const error = String((err && (err.code || err.message)) || 'FAILED').slice(0, 200);
    // A document read well before keeps what was read; only a first reading that fails is marked failed.
    update(doc.status === 'done' ? { error, readAt: nowIso() } : { status: 'failed', error, readAt: nowIso() });
  }
}

// --- Bank statements settle invoices.

function financeLib() {
  try {
    return require('../generated/finance');
  } catch {
    return null;
  }
}

function verdictRow(verdict) {
  return {
    invoiceId: verdict.invoice.id,
    number: verdict.invoice.number,
    client: String((verdict.invoice.client && verdict.invoice.client.fullName) || ''),
    change: verdict.change,
    basis: verdict.basis,
    bankPaid: verdict.bankPaid,
    recorded: verdict.recorded,
    currency: verdict.invoice.currency || 'EUR',
  };
}

/**
 * Pairs the statement's incoming payments with the invoices. Payments that only add to an invoice
 * (nothing recorded is replaced) are recorded straight away when `auto` is set; anything that would
 * take a recorded payment back, or move its date, is left for the user to look at.
 */
function settleInvoices(ownerId, docId, statement, { auto }) {
  const lib = financeLib();
  if (!lib) return;
  const invoices = listInvoices(ownerId);
  const match = lib.matchStatement(statement, invoices);
  const changes = match.verdicts.filter((verdict) => verdict.change !== 'none');
  const adds = changes.filter((verdict) => (verdict.change === 'paid' || verdict.change === 'partial') && verdict.replaces.length === 0 && verdict.payments.length > 0);
  const toApply = auto ? adds : [];
  const review = changes.filter((verdict) => !toApply.includes(verdict));

  const applied = [];
  if (toApply.length > 0) {
    const before = new Map(invoices.map((invoice) => [invoice.id, new Set((invoice.payments || []).map((payment) => payment.id))]));
    const { invoices: touched } = reconcilePayments(ownerId, { changes: lib.reconcilePayload(toApply) });
    for (const invoice of touched) {
      const known = before.get(invoice.id) || new Set();
      const added = (invoice.payments || []).filter((payment) => !known.has(payment.id) && !payment.voidedAt);
      if (added.length === 0) continue;
      applied.push({
        invoiceId: invoice.id,
        number: invoice.number,
        client: String((invoice.client && invoice.client.fullName) || ''),
        currency: invoice.currency || 'EUR',
        amount: Math.round(added.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100,
        dates: [...new Set(added.map((payment) => payment.date))],
        paymentIds: added.map((payment) => payment.id),
        paidInFull: !(Number(invoice.amountDue) > 0.004),
      });
    }
  }
  const totalIn = Math.round(statement.lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  mutate(ownerId, (finance) => {
    const doc = findDoc(finance, docId);
    if (!doc) return;
    doc.statement = {
      from: statement.from,
      to: statement.to,
      credits: statement.lines.length,
      totalIn,
      loose: match.loose.length,
      looseTotal: Math.round(match.loose.reduce((sum, line) => sum + line.rest, 0) * 100) / 100,
      auto: Boolean(auto),
      matchedAt: nowIso(),
      applied,
      review: review.map(verdictRow).slice(0, 200),
    };
  });
}

/** Takes back the payments a statement recorded on its own. */
function undoSettlement(ownerId, docId) {
  const doc = findDoc(load(ownerId), docId);
  if (!doc || !doc.statement) return null;
  for (const entry of doc.statement.applied || []) {
    if (entry.undoneAt) continue;
    for (const paymentId of entry.paymentIds || []) {
      try {
        voidPayment(ownerId, 'invoice', entry.invoiceId, paymentId, 'bank-undo');
      } catch (err) {
        console.error('[finance] undo failed', err && err.message);
      }
    }
  }
  return mutate(ownerId, (finance) => {
    const current = findDoc(finance, docId);
    const at = nowIso();
    for (const entry of current.statement.applied || []) if (!entry.undoneAt) entry.undoneAt = at;
    return current;
  });
}

// --- Checking the mailbox.

function mailboxFor(ownerId, settings) {
  if (settings.box === 'personal' && settings.accountId) return getMailSettings(personalMailKey(settings.accountId));
  return getMailSettings(ownerId);
}

function sinceDate(settings) {
  const date = new Date(`${settings.since || defaultSince()}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date(`${defaultSince()}T00:00:00Z`) : date;
}

function readyToCheck(settings) {
  return Boolean(settings.enabled && settings.watch.length > 0);
}

/** Looks for new messages from or to the watched addresses and brings in what they carry. */
async function checkMail(ownerId) {
  if (checking.has(ownerId)) return;
  const finance = load(ownerId);
  const settings = finance.settings;
  if (!readyToCheck(settings)) return;
  const box = mailboxFor(ownerId, settings);
  const run = { fetched: 0, remaining: 0 };
  checking.set(ownerId, run);
  const note = (patch) =>
    mutate(ownerId, (current) => {
      current.check = { ...current.check, ...patch };
    });
  try {
    if (!mailReady(box)) throw Object.assign(new Error('MAIL_NOT_CONFIGURED'), { mailCode: 'MAIL_NOT_CONFIGURED' });
    let cursor = finance.cursor;
    for (let round = 0; round < 200; round += 1) {
      const batch = await fetchBatch(box, { imapHost: settings.imapHost, watch: settings.watch, since: sinceDate(settings), cursor });
      for (const message of batch.messages) {
        await addMessage(ownerId, message);
        run.fetched += 1;
      }
      run.remaining = batch.remaining;
      cursor = batch.cursor;
      mutate(ownerId, (current) => {
        current.cursor = cursor;
      });
      if (batch.done) break;
    }
    note({ lastAt: nowIso(), lastError: null, lastDetail: null, found: run.fetched });
  } catch (err) {
    console.error('[finance] mail check failed', ownerId, err && (err.detail || err.message));
    note({ lastAt: nowIso(), lastError: String((err && (err.mailCode || err.message)) || 'MAIL_READ'), lastDetail: err && err.detail ? String(err.detail) : null });
  } finally {
    checking.delete(ownerId);
  }
}

let timer = null;

/** Checks every company's mailbox now and then, one company at a time. */
function startFinanceChecks() {
  if (timer || process.env.FINANCE_MAIL === 'off') return;
  const round = async () => {
    for (const ownerId of financeOwners()) {
      if (readyToCheck(load(ownerId).settings)) await checkMail(ownerId).catch(() => {});
    }
  };
  // Documents left half-read by a restart are read again.
  // Spreadsheet statements read before money in and out was counted month by month (or counted
  // under older categories) are read again.
  const version = (financeLib() || {}).STATEMENT_MONTHS_VERSION || 1;
  for (const ownerId of financeOwners()) {
    for (const doc of load(ownerId).documents) {
      const unsplit = doc.status === 'done' && doc.kind === 'bank_statement' && /\.(xlsx|xls|csv)$/i.test(doc.name) && !(doc.statement && doc.statement.months && doc.statement.monthsVersion >= version);
      if (doc.status === 'pending' || unsplit) enqueue(ownerId, doc.id);
    }
  }
  setTimeout(() => round().catch(() => {}), 60 * 1000).unref();
  timer = setInterval(() => round().catch(() => {}), CHECK_EVERY_MS);
  timer.unref();
}

// --- What the page sees, and what it may change.

function mailboxSummary(settings) {
  return mailReady(settings) ? { ready: true, email: publicMailSettings(settings).user || settings.user } : { ready: false, email: '' };
}

function publicDoc(doc) {
  const { hash, fileId, ...rest } = doc;
  return { ...rest, hasFile: Boolean(fileId) };
}

function describe(ownerId, account) {
  const finance = load(ownerId);
  const settings = finance.settings;
  const company = getMailSettings(ownerId);
  const personal = getMailSettings(personalMailKey(account.accountId));
  return {
    settings: {
      enabled: settings.enabled,
      box: settings.box,
      // A colleague's own mailbox: this person sees that one is used, not which.
      boxIsMine: settings.box !== 'personal' || settings.accountId === account.accountId,
      watch: settings.watch,
      since: settings.since,
      imapHost: settings.imapHost,
      imapHostDefault: imapHostFor((mailboxFor(ownerId, settings) || {}).host || ''),
      autoBank: settings.autoBank !== false,
    },
    mailboxes: { company: mailboxSummary(company), personal: mailboxSummary(personal) },
    check: finance.check,
    progress: progress(ownerId),
    messages: finance.messages.length,
    documents: finance.documents.map(publicDoc).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))),
  };
}

function settingsError(code) {
  const err = new Error(code);
  err.financeCode = code;
  return err;
}

/** The settings the form asks for, checked, over the saved ones; nothing is saved. */
function settingsFrom(ownerId, account, body) {
  const current = load(ownerId).settings;
  const next = { ...current };
  if (body.watch !== undefined) {
    const list = (Array.isArray(body.watch) ? body.watch : String(body.watch).split(/[,;\s]+/)).map((item) => String(item).trim()).filter(Boolean);
    const clean = [...new Set(list.map(cleanEmail))];
    if (clean.includes('') || clean.length > WATCH_MAX) throw settingsError('FINANCE_WATCH');
    next.watch = clean;
  }
  if (body.since !== undefined) {
    const since = String(body.since || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(Date.parse(since))) throw settingsError('FINANCE_SINCE');
    next.since = since;
  }
  if (body.box !== undefined) {
    if (body.box === 'personal') {
      if (!mailReady(getMailSettings(personalMailKey(account.accountId)))) throw settingsError('FINANCE_BOX');
      next.box = 'personal';
      next.accountId = account.accountId;
    } else {
      next.box = 'company';
      next.accountId = null;
    }
  }
  if (body.imapHost !== undefined) {
    const host = String(body.imapHost || '').trim().toLowerCase();
    if (host && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) throw settingsError('FINANCE_HOST');
    next.imapHost = host;
  }
  if (body.autoBank !== undefined) next.autoBank = Boolean(body.autoBank);
  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled);
  return { current, next };
}

function updateSettings(ownerId, account, body) {
  const { current, next } = settingsFrom(ownerId, account, body);
  if (next.enabled && next.watch.length === 0) throw settingsError('FINANCE_WATCH');
  if (next.enabled && !mailReady(mailboxFor(ownerId, next))) throw settingsError('FINANCE_BOX');
  // Another mailbox, other addresses or an earlier start: look through the mailbox again. Messages
  // already brought in are recognised and skipped.
  const rescan = next.box !== current.box || next.accountId !== current.accountId || next.since !== current.since || next.imapHost !== current.imapHost || next.watch.join() !== current.watch.join();
  mutate(ownerId, (finance) => {
    finance.settings = next;
    if (rescan) finance.cursor = null;
  });
  return next;
}

/** Signs in with the settings as the form has them, saved or not. */
async function testSettings(ownerId, account, body) {
  const { next: settings } = settingsFrom(ownerId, account, body || {});
  if (settings.watch.length === 0) throw settingsError('FINANCE_WATCH');
  return testInbox(mailboxFor(ownerId, settings), { imapHost: settings.imapHost, watch: settings.watch, since: sinceDate(settings) });
}

function editDocument(ownerId, docId, body) {
  return mutate(ownerId, (finance) => {
    const doc = findDoc(finance, docId);
    if (!doc) return null;
    if (body.kind !== undefined && KINDS.includes(body.kind)) doc.kind = body.kind;
    if (body.period !== undefined) doc.period = cleanPeriod(body.period);
    if (body.excluded !== undefined) doc.excluded = Boolean(body.excluded);
    doc.editedAt = nowIso();
    return doc;
  });
}

function retryDocument(ownerId, docId) {
  // Read again on request: ahead of the documents still waiting.
  const doc = mutate(ownerId, (finance) => {
    const current = findDoc(finance, docId);
    if (current) Object.assign(current, { status: 'pending', error: null });
    return current;
  });
  if (doc) enqueue(ownerId, docId, true);
  return doc;
}

async function deleteDocument(ownerId, docId) {
  const doc = mutate(ownerId, (finance) => {
    const current = findDoc(finance, docId);
    if (!current) return null;
    finance.documents = finance.documents.filter((item) => item.id !== docId);
    return current;
  });
  if (doc && doc.fileId) await removeFile(ownerId, doc.fileId).catch(() => {});
  return doc;
}

async function documentFile(ownerId, docId) {
  const doc = findDoc(load(ownerId), docId);
  if (!doc || !doc.fileId) return null;
  const data = await getFile(ownerId, doc.fileId);
  return data ? { doc, data } : null;
}

module.exports = {
  addFile,
  checkMail,
  deleteDocument,
  describe,
  documentFile,
  editDocument,
  retryDocument,
  startFinanceChecks,
  testSettings,
  undoSettlement,
  updateSettings,
};
