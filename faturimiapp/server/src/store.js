const crypto = require('crypto');
const { initPersist, loadDb, saveDb } = require('./persist');
const {
  allocateInvoiceNumber,
  clientSnapshot,
  companySnapshot,
  hydrateInvoice,
  hydrateObligation,
  similarClient,
  validatePaymentAmount,
  paymentStatus,
  documentTotals,
  money,
} = require('./domain');

const DEFAULT_COMPANY_PROFILE = {
  companyName: 'Kompania juaj (shembull)',
  contactPerson: 'Emri juaj (shembull)',
  nui: '000000000',
  streetAddress: 'Rruga shembull, nr. 1',
  state: 'Kosovë',
  zipCode: '10000',
  email: 'email@shembull.com',
  phone: '+383 00 000 000',
  currency: 'EUR',
  bankName: '',
  iban: '',
  exportNote: 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)',
};

const OBLIGATION_CATEGORIES = ['shipping', 'supplies', 'rent', 'tax', 'other'];

let cache = null;
let persistChain = Promise.resolve();
let writeLock = Promise.resolve();

function withWriteLock(fn) {
  const run = writeLock.then(fn, fn);
  writeLock = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function initStore() {
  await initPersist();
  cache = await loadDb();
  if (!Array.isArray(cache.users)) cache.users = [];
  if (!cache.profiles) cache.profiles = {};
  if (!cache.invoices) cache.invoices = {};
  if (!cache.obligations) cache.obligations = {};
  if (!cache.clients) cache.clients = {};
  if (!cache.syncOps) cache.syncOps = {};
  if (!cache.migrations) cache.migrations = {};
  if (!Array.isArray(cache.passwordResets)) cache.passwordResets = [];
  return cache;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureUserCollections(db, userId) {
  if (!db.invoices[userId]) db.invoices[userId] = [];
  if (!db.obligations) db.obligations = {};
  if (!db.obligations[userId]) db.obligations[userId] = [];
  if (!db.clients) db.clients = {};
  if (!db.clients[userId]) db.clients[userId] = [];
  if (!db.syncOps) db.syncOps = {};
  if (!db.syncOps[userId]) db.syncOps[userId] = {};
  if (!db.migrations) db.migrations = {};
}

function clientIdentityKey(client) {
  return [
    String(client?.fullName || '').trim().toLowerCase(),
    String(client?.phone || '').replace(/\D/g, ''),
    String(client?.email || '').trim().toLowerCase(),
    String(client?.address || '').trim().toLowerCase(),
    String(client?.businessId || '').trim().toLowerCase(),
  ].join('|');
}

function migrateUserData(userId) {
  const db = readDb();
  ensureUserCollections(db, userId);
  const current = db.migrations[userId] || { v: 0 };
  if (current.v >= 1) return;
  const profile = db.profiles[userId];
  const invoiceMap = new Map();
  for (const inv of db.invoices[userId] || []) {
    const hydrated = hydrateInvoice(inv, profile);
    Object.assign(inv, {
      payments: hydrated.payments,
      lifecycle: hydrated.lifecycle,
      currency: hydrated.currency,
      snapshotSource: hydrated.snapshotSource,
      companySnapshot: hydrated.companySnapshot,
      clientSnapshot: hydrated.clientSnapshot,
      clientId: hydrated.clientId,
      revisions: hydrated.revisions,
      updatedAt: inv.updatedAt || inv.createdAt || nowIso(),
    });
    const snap = clientSnapshot(inv.client);
    if (snap.fullName) {
      const key = clientIdentityKey(snap);
      if (!invoiceMap.has(key)) {
        invoiceMap.set(key, {
          id: crypto.randomUUID(),
          ...snap,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          source: 'migrated',
        });
      }
      if (!inv.clientId) inv.clientId = invoiceMap.get(key).id;
    }
  }
  if (!(db.clients[userId] || []).length) {
    db.clients[userId] = [...invoiceMap.values()];
  }
  for (const item of db.obligations[userId] || []) {
    const hydrated = hydrateObligation(item);
    Object.assign(item, {
      payments: hydrated.payments,
      revisions: hydrated.revisions,
      updatedAt: item.updatedAt || item.createdAt || nowIso(),
    });
  }
  db.migrations[userId] = { v: 1, at: nowIso() };
  writeDb(db);
}

function readDb() {
  if (!cache) {
    throw new Error('Store is not initialized.');
  }
  return cache;
}

function writeDb(db) {
  cache = db;
  const snapshot = JSON.parse(JSON.stringify(db));
  persistChain = persistChain.then(() => saveDb(snapshot)).catch((err) => {
    console.error('[store] failed to persist', err);
  });
  return persistChain;
}

function flushStore() {
  return persistChain;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const FREE_MONTHLY_LIMIT = 10;

function isPremiumUser(user) {
  if (!user || user.plan !== 'premium') return false;
  if (user.planExpiresAt) {
    const expires = new Date(user.planExpiresAt).getTime();
    if (Number.isFinite(expires) && expires <= Date.now()) return false;
  }
  return true;
}

function publicUser(user) {
  const premium = isPremiumUser(user);
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    plan: premium ? 'premium' : 'free',
    billingSource: user.billingSource || null,
    planExpiresAt: user.planExpiresAt || null,
  };
}

function normalizeLang(value) {
  return value === 'en' || value === 'it' ? value : 'sq';
}

async function createUser({ email, passwordHash, language }) {
  return withWriteLock(async () => {
    const db = readDb();
    const normalized = normalizeEmail(email);
    if (db.users.some((u) => u.email === normalized)) {
      const err = new Error('EMAIL_TAKEN');
      throw err;
    }
    const user = {
      id: crypto.randomUUID(),
      email: normalized,
      passwordHash,
      createdAt: new Date().toISOString(),
      plan: 'free',
    };
    db.users.push(user);
    db.profiles[user.id] = { ...DEFAULT_COMPANY_PROFILE, language: normalizeLang(language) };
    db.invoices[user.id] = [];
    if (!db.obligations) db.obligations = {};
    db.obligations[user.id] = [];
    if (!db.clients) db.clients = {};
    db.clients[user.id] = [];
    db.migrations[user.id] = { v: 1, at: new Date().toISOString() };
    await writeDb(db);
    return user;
  });
}

function findUserByEmail(email) {
  const db = readDb();
  const normalized = normalizeEmail(email);
  const matches = db.users.filter((u) => u.email === normalized);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
}

function findUserById(id) {
  const db = readDb();
  return db.users.find((u) => u.id === id) || null;
}

function getProfile(userId) {
  const db = readDb();
  migrateUserData(userId);
  return db.profiles[userId] || { ...DEFAULT_COMPANY_PROFILE, language: 'sq' };
}

function updateProfile(userId, partial) {
  migrateUserData(userId);
  const db = readDb();
  const current = db.profiles[userId] || { ...DEFAULT_COMPANY_PROFILE, language: 'sq' };
  db.profiles[userId] = { ...current, ...partial, updatedAt: nowIso() };
  writeDb(db);
  return db.profiles[userId];
}

function listInvoices(userId) {
  migrateUserData(userId);
  const db = readDb();
  const profile = db.profiles[userId];
  return [...(db.invoices[userId] || [])].map((item) => hydrateInvoice(item, profile));
}

function getInvoice(userId, invoiceId) {
  return listInvoices(userId).find((inv) => inv.id === invoiceId) || null;
}

function monthKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function invoicesCreatedThisMonth(userId, now = new Date()) {
  const key = monthKey(now);
  return listInvoices(userId).filter((item) => monthKey(item.createdAt || item.date) === key).length;
}

function canCreateInvoice(userId) {
  const user = findUserById(userId);
  if (isPremiumUser(user)) {
    return {
      ok: true,
      plan: 'premium',
      used: invoicesCreatedThisMonth(userId),
      limit: null,
      billingSource: user.billingSource || null,
      planExpiresAt: user.planExpiresAt || null,
    };
  }
  const used = invoicesCreatedThisMonth(userId);
  return {
    ok: used < FREE_MONTHLY_LIMIT,
    plan: 'free',
    used,
    limit: FREE_MONTHLY_LIMIT,
    billingSource: user?.billingSource || null,
    planExpiresAt: user?.planExpiresAt || null,
  };
}

function updateUserBilling(userId, patch) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) return null;
  Object.assign(user, patch);
  writeDb(db);
  return publicUser(user);
}

function setUserPlan(userId, plan, extra = {}) {
  const patch = {
    plan: plan === 'premium' ? 'premium' : 'free',
    ...extra,
  };
  if (plan === 'premium' && !patch.premiumSince) {
    patch.premiumSince = new Date().toISOString();
  }
  if (plan !== 'premium') {
    patch.planExpiresAt = null;
  }
  return updateUserBilling(userId, patch);
}

function findUserByStripeCustomerId(customerId) {
  if (!customerId) return null;
  const db = readDb();
  return db.users.find((u) => u.stripeCustomerId === customerId) || null;
}

function findUserByIapOriginalId(originalTransactionId) {
  if (!originalTransactionId) return null;
  const db = readDb();
  return db.users.find((u) => u.iapOriginalTransactionId === originalTransactionId) || null;
}

function uniqueIssuedNumber(userId, proposed, date) {
  const existing = readDb().invoices[userId] || [];
  const taken = new Set(
    existing.filter((item) => item.lifecycle !== 'draft').map((item) => String(item.number || '')),
  );
  const next = String(proposed || '');
  if (next && !next.startsWith('DRAFT-') && !taken.has(next)) return next;
  return allocateInvoiceNumber(existing, date || new Date());
}

function attachInvoiceSnapshots(userId, invoice, { issued } = {}) {
  const profile = getProfile(userId);
  const client = clientSnapshot(invoice.client || invoice.clientSnapshot);
  if (issued) {
    return {
      ...invoice,
      client,
      clientSnapshot: client,
      companySnapshot: companySnapshot(profile),
      currency: profile.currency || 'EUR',
      snapshotSource: 'issued',
      issuedAt: invoice.issuedAt || nowIso(),
    };
  }
  return {
    ...invoice,
    client,
    clientSnapshot: invoice.clientSnapshot || client,
    currency: invoice.currency || profile.currency || 'EUR',
    snapshotSource: invoice.snapshotSource || 'migrated',
  };
}

function addInvoice(userId, invoice) {
  const allowed = canCreateInvoice(userId);
  if (!allowed.ok) {
    const err = new Error('PLAN_LIMIT');
    err.usage = allowed;
    throw err;
  }
  migrateUserData(userId);
  const db = readDb();
  ensureUserCollections(db, userId);
  const lifecycle = invoice.lifecycle === 'draft' ? 'draft' : 'issued';
  const id = invoice.id || crypto.randomUUID();
  const existing = db.invoices[userId].find((item) => item.id === id);
  if (existing) return hydrateInvoice(existing, db.profiles[userId]);
  const createdAt = invoice.createdAt || nowIso();
  let saved = {
    ...invoice,
    id,
    createdAt,
    updatedAt: invoice.updatedAt || createdAt,
    payments: Array.isArray(invoice.payments) ? invoice.payments : [],
    revisions: Array.isArray(invoice.revisions) ? invoice.revisions : [],
    lifecycle,
    status: invoice.status === 'paid' ? 'paid' : invoice.status === 'cancelled' ? 'cancelled' : 'unpaid',
  };
  if (lifecycle === 'issued') {
    saved.number = uniqueIssuedNumber(userId, invoice.number, invoice.date);
    saved = attachInvoiceSnapshots(userId, saved, { issued: true });
  } else {
    saved.number = invoice.number || `DRAFT-${id.slice(0, 8).toUpperCase()}`;
    saved = attachInvoiceSnapshots(userId, saved, { issued: false });
  }
  db.invoices[userId] = [saved, ...db.invoices[userId].filter((item) => item.id !== id)];
  writeDb(db);
  return hydrateInvoice(saved, db.profiles[userId]);
}

const ISSUED_LOCKED_FIELDS = ['items', 'discount', 'subtotal', 'total', 'client', 'number', 'currency', 'companySnapshot', 'clientSnapshot'];

function fieldsChanged(current, partial, keys) {
  return keys.some((key) => {
    if (partial[key] === undefined) return false;
    return JSON.stringify(partial[key]) !== JSON.stringify(current[key]);
  });
}

function updateInvoice(userId, invoiceId, partial, options = {}) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((inv) => inv.id === invoiceId);
  if (idx === -1) return null;
  const current = list[idx];
  const lifecycle = current.lifecycle || 'issued';
  if (!options.allowIssuedEdit && lifecycle === 'issued') {
    partial = {
      ...(partial.dueDate !== undefined ? { dueDate: partial.dueDate } : {}),
      ...(partial.notes !== undefined ? { notes: partial.notes } : {}),
    };
  }
  if (lifecycle === 'cancelled' && !options.allowCancelledEdit) {
    const err = new Error('CANCELLED_LOCKED');
    throw err;
  }
  const next = { ...current, ...partial, id: invoiceId, updatedAt: nowIso() };
  if (lifecycle === 'draft' && partial.client) {
    next.client = clientSnapshot(partial.client);
    next.clientSnapshot = next.client;
  }
  list[idx] = next;
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateInvoice(list[idx], db.profiles[userId]);
}

function deleteInvoice(userId, invoiceId) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const current = list.find((inv) => inv.id === invoiceId);
  if (!current) return false;
  if ((current.lifecycle || 'issued') !== 'draft') {
    const err = new Error('ISSUED_DELETE');
    throw err;
  }
  db.invoices[userId] = list.filter((inv) => inv.id !== invoiceId);
  writeDb(db);
  return true;
}

function issueInvoice(userId, invoiceId) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((inv) => inv.id === invoiceId);
  if (idx === -1) return null;
  const current = list[idx];
  if (current.lifecycle === 'cancelled') {
    const err = new Error('CANCELLED_LOCKED');
    throw err;
  }
  if (current.lifecycle === 'issued' && current.issuedAt) {
    return hydrateInvoice(current, db.profiles[userId]);
  }
  const issued = attachInvoiceSnapshots(
    userId,
    {
      ...current,
      lifecycle: 'issued',
      number: uniqueIssuedNumber(userId, current.number, current.date),
      issuedAt: nowIso(),
      updatedAt: nowIso(),
    },
    { issued: true },
  );
  list[idx] = issued;
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateInvoice(issued, db.profiles[userId]);
}

function cancelInvoice(userId, invoiceId, reason) {
  const why = String(reason || '').trim();
  if (!why) {
    const err = new Error('CANCEL_REASON');
    throw err;
  }
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((inv) => inv.id === invoiceId);
  if (idx === -1) return null;
  if ((list[idx].lifecycle || 'issued') === 'draft') {
    const err = new Error('DRAFT_CANCEL');
    throw err;
  }
  list[idx] = {
    ...list[idx],
    lifecycle: 'cancelled',
    status: 'cancelled',
    cancelledAt: nowIso(),
    cancelReason: why,
    updatedAt: nowIso(),
    revisions: [
      ...(list[idx].revisions || []),
      { type: 'cancel', reason: why, at: nowIso() },
    ],
  };
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateInvoice(list[idx], db.profiles[userId]);
}

function correctInvoice(userId, invoiceId, { items, discount, notes, reason }) {
  const why = String(reason || '').trim();
  if (!why) {
    const err = new Error('CORRECT_REASON');
    throw err;
  }
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((inv) => inv.id === invoiceId);
  if (idx === -1) return null;
  const current = list[idx];
  if ((current.lifecycle || 'issued') !== 'issued') {
    const err = new Error('NOT_ISSUED');
    throw err;
  }
  const nextItems = Array.isArray(items) ? items : current.items;
  const nextDiscount = discount === undefined ? current.discount : discount;
  const subtotal = (nextItems || []).reduce(
    (sum, item) => sum + money(item.quantity) * money(item.unitPrice),
    0,
  );
  const total = Math.max(money(subtotal) - money(nextDiscount), 0);
  const hydrated = hydrateInvoice(current, db.profiles[userId]);
  if (hydrated.amountPaid > total) {
    const err = new Error('PAYMENTS_EXCEED');
    err.amountPaid = hydrated.amountPaid;
    err.total = total;
    throw err;
  }
  list[idx] = {
    ...current,
    items: nextItems,
    discount: nextDiscount,
    notes: notes === undefined ? current.notes : notes,
    subtotal: money(subtotal),
    total: money(total),
    updatedAt: nowIso(),
    revisions: [
      ...(current.revisions || []),
      {
        type: 'correct',
        reason: why,
        at: nowIso(),
        previous: { items: current.items, discount: current.discount, subtotal: current.subtotal, total: current.total },
      },
    ],
  };
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateInvoice(list[idx], db.profiles[userId]);
}

function listObligations(userId) {
  migrateUserData(userId);
  const db = readDb();
  return [...(db.obligations?.[userId] || [])].map((item) => hydrateObligation(item));
}

function getObligation(userId, obligationId) {
  return listObligations(userId).find((item) => item.id === obligationId) || null;
}

function normalizeObligation(raw) {
  const amount = Number(raw.amount);
  return {
    vendor: String(raw.vendor || '').trim(),
    description: String(raw.description || '').trim(),
    amount: Number.isFinite(amount) ? money(amount) : 0,
    date: String(raw.date || ''),
    dueDate: String(raw.dueDate || ''),
    status: raw.status === 'paid' ? 'paid' : raw.status === 'cancelled' ? 'cancelled' : 'unpaid',
    category: OBLIGATION_CATEGORIES.includes(raw.category) ? raw.category : 'other',
    notes: String(raw.notes || ''),
    relatedInvoiceId: String(raw.relatedInvoiceId || ''),
    proofName: String(raw.proofName || ''),
    proofMime: String(raw.proofMime || ''),
    proofData: String(raw.proofData || ''),
    proofUri: String(raw.proofUri || ''),
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    currency: String(raw.currency || ''),
  };
}

function addObligation(userId, obligation) {
  migrateUserData(userId);
  const db = readDb();
  ensureUserCollections(db, userId);
  const saved = {
    ...normalizeObligation(obligation),
    id: obligation.id || crypto.randomUUID(),
    createdAt: obligation.createdAt || nowIso(),
    updatedAt: obligation.updatedAt || nowIso(),
  };
  db.obligations[userId] = [saved, ...db.obligations[userId].filter((item) => item.id !== saved.id)];
  writeDb(db);
  return hydrateObligation(saved);
}

function updateObligation(userId, obligationId, partial) {
  migrateUserData(userId);
  const db = readDb();
  ensureUserCollections(db, userId);
  const list = db.obligations[userId] || [];
  const idx = list.findIndex((item) => item.id === obligationId);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...partial, id: obligationId };
  list[idx] = {
    ...list[idx],
    ...normalizeObligation(merged),
    id: obligationId,
    createdAt: list[idx].createdAt,
    payments: Array.isArray(partial.payments) ? partial.payments : list[idx].payments || [],
    revisions: Array.isArray(partial.revisions) ? partial.revisions : list[idx].revisions || [],
    updatedAt: nowIso(),
  };
  db.obligations[userId] = list;
  writeDb(db);
  return hydrateObligation(list[idx]);
}

function deleteObligation(userId, obligationId) {
  migrateUserData(userId);
  const db = readDb();
  if (!db.obligations) db.obligations = {};
  const list = db.obligations[userId] || [];
  const next = list.filter((item) => item.id !== obligationId);
  if (next.length === list.length) return false;
  db.obligations[userId] = next;
  writeDb(db);
  return true;
}

function collectionDoc(userId, kind, id) {
  if (kind === 'invoice') return { listKey: 'invoices', doc: getInvoice(userId, id), hydrate: (item) => hydrateInvoice(item, getProfile(userId)) };
  return { listKey: 'obligations', doc: getObligation(userId, id), hydrate: hydrateObligation };
}

function addPayment(userId, kind, docId, payment, options = {}) {
  migrateUserData(userId);
  const isInvoice = kind === 'invoice';
  const db = readDb();
  const list = isInvoice ? db.invoices[userId] || [] : db.obligations[userId] || [];
  const idx = list.findIndex((item) => item.id === docId);
  if (idx === -1) return null;
  const current = list[idx];
  if (isInvoice && (current.lifecycle === 'draft' || current.lifecycle === 'cancelled')) {
    const err = new Error(current.lifecycle === 'draft' ? 'DRAFT_PAYMENT' : 'CANCELLED_LOCKED');
    throw err;
  }
  const totalField = isInvoice ? current.total : current.amount;
  const check = validatePaymentAmount({ ...current, total: totalField }, payment.amount, options.exceptPaymentId);
  if (!check.ok) {
    const err = new Error(check.error);
    err.remaining = check.remaining;
    throw err;
  }
  const savedPayment = {
    id: payment.id || crypto.randomUUID(),
    amount: money(payment.amount),
    date: String(payment.date || '').trim(),
    method: String(payment.method || '').trim(),
    note: String(payment.note || '').trim(),
    createdAt: payment.createdAt || nowIso(),
    opId: payment.opId || options.opId || '',
  };
  if (!savedPayment.date) {
    const err = new Error('DATE_REQUIRED');
    throw err;
  }
  const payments = [...(current.payments || [])];
  if (options.replaceId) {
    const payIdx = payments.findIndex((item) => item.id === options.replaceId);
    if (payIdx === -1) return null;
    const previous = payments[payIdx];
    payments[payIdx] = {
      ...savedPayment,
      id: previous.id,
      createdAt: previous.createdAt,
      revisions: [...(previous.revisions || []), { previous, at: nowIso(), reason: payment.reason || 'edit' }],
    };
  } else {
    if (savedPayment.opId && payments.some((item) => item.opId && item.opId === savedPayment.opId)) {
      return isInvoice ? hydrateInvoice(current, db.profiles[userId]) : hydrateObligation(current);
    }
    payments.push(savedPayment);
  }
  list[idx] = { ...current, payments, updatedAt: nowIso() };
  if (isInvoice) db.invoices[userId] = list;
  else db.obligations[userId] = list;
  writeDb(db);
  return isInvoice ? hydrateInvoice(list[idx], db.profiles[userId]) : hydrateObligation(list[idx]);
}

function voidPayment(userId, kind, docId, paymentId, reason) {
  const why = String(reason || '').trim();
  if (!why) {
    const err = new Error('VOID_REASON');
    throw err;
  }
  migrateUserData(userId);
  const isInvoice = kind === 'invoice';
  const db = readDb();
  const list = isInvoice ? db.invoices[userId] || [] : db.obligations[userId] || [];
  const idx = list.findIndex((item) => item.id === docId);
  if (idx === -1) return null;
  const payments = (list[idx].payments || []).map((item) =>
    item.id === paymentId
      ? { ...item, voidedAt: nowIso(), voidReason: why }
      : item,
  );
  if (!(list[idx].payments || []).some((item) => item.id === paymentId)) return null;
  list[idx] = { ...list[idx], payments, updatedAt: nowIso() };
  if (isInvoice) db.invoices[userId] = list;
  else db.obligations[userId] = list;
  writeDb(db);
  return isInvoice ? hydrateInvoice(list[idx], db.profiles[userId]) : hydrateObligation(list[idx]);
}

function listClients(userId) {
  migrateUserData(userId);
  const db = readDb();
  return [...(db.clients[userId] || [])];
}

function getClient(userId, clientId) {
  return listClients(userId).find((item) => item.id === clientId) || null;
}

function addClient(userId, client) {
  migrateUserData(userId);
  const snap = clientSnapshot(client);
  if (!snap.fullName) {
    const err = new Error('CLIENT_NAME');
    throw err;
  }
  const db = readDb();
  ensureUserCollections(db, userId);
  const existing = (db.clients[userId] || []).find((item) => similarClient(item, snap) && clientIdentityKey(item) === clientIdentityKey(snap));
  if (existing && !client.id) {
    return { client: existing, duplicate: true };
  }
  const saved = {
    ...snap,
    id: client.id || crypto.randomUUID(),
    createdAt: client.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  db.clients[userId] = [saved, ...db.clients[userId].filter((item) => item.id !== saved.id)];
  writeDb(db);
  return { client: saved, duplicate: false, similar: (db.clients[userId] || []).filter((item) => item.id !== saved.id && similarClient(item, saved)) };
}

function updateClient(userId, clientId, partial) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.clients[userId] || [];
  const idx = list.findIndex((item) => item.id === clientId);
  if (idx === -1) return null;
  const snap = clientSnapshot({ ...list[idx], ...partial });
  if (!snap.fullName) {
    const err = new Error('CLIENT_NAME');
    throw err;
  }
  list[idx] = { ...list[idx], ...snap, id: clientId, createdAt: list[idx].createdAt, updatedAt: nowIso() };
  db.clients[userId] = list;
  writeDb(db);
  return list[idx];
}

function deleteClient(userId, clientId) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.clients[userId] || [];
  const next = list.filter((item) => item.id !== clientId);
  if (next.length === list.length) return false;
  db.clients[userId] = next;
  writeDb(db);
  return true;
}

function checksumPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function exportBackup(userId) {
  migrateUserData(userId);
  const payload = {
    invoices: listInvoices(userId),
    obligations: listObligations(userId),
    clients: listClients(userId),
    profile: getProfile(userId),
  };
  return {
    version: 1,
    exportedAt: nowIso(),
    userId,
    checksum: checksumPayload(payload),
    data: payload,
  };
}

function restoreBackup(userId, backup) {
  if (!backup || backup.confirm !== 'RESTORE') {
    const err = new Error('RESTORE_CONFIRM');
    throw err;
  }
  const data = backup.data || backup.payload;
  if (!data) {
    const err = new Error('RESTORE_EMPTY');
    throw err;
  }
  if (backup.checksum && checksumPayload(data) !== backup.checksum) {
    const err = new Error('RESTORE_CHECKSUM');
    throw err;
  }
  migrateUserData(userId);
  const db = readDb();
  ensureUserCollections(db, userId);
  db.invoices[userId] = Array.isArray(data.invoices) ? data.invoices : [];
  db.obligations[userId] = Array.isArray(data.obligations) ? data.obligations : [];
  db.clients[userId] = Array.isArray(data.clients) ? data.clients : [];
  if (data.profile) db.profiles[userId] = { ...getProfile(userId), ...data.profile };
  db.migrations[userId] = { v: 1, at: nowIso(), restoredAt: nowIso() };
  writeDb(db);
  return exportBackup(userId);
}

function rememberedOp(userId, opId) {
  if (!opId) return null;
  const db = readDb();
  return db.syncOps?.[userId]?.[opId] || null;
}

function rememberOp(userId, opId, result) {
  if (!opId) return;
  const db = readDb();
  ensureUserCollections(db, userId);
  const ops = db.syncOps[userId];
  ops[opId] = { result, at: nowIso() };
  const keys = Object.keys(ops);
  if (keys.length > 2000) {
    const oldest = keys.sort((a, b) => String(ops[a].at).localeCompare(String(ops[b].at))).slice(0, keys.length - 2000);
    for (const key of oldest) delete ops[key];
  }
  writeDb(db);
}

function applySyncChange(userId, change) {
  const collection = change.collection;
  const op = change.op;
  const id = change.id;
  const body = change.body || {};
  const baseUpdatedAt = change.baseUpdatedAt;

  function conflictIfNeeded(current) {
    if (!current || !baseUpdatedAt || !current.updatedAt) return null;
    if (current.updatedAt !== baseUpdatedAt && current.updatedAt > baseUpdatedAt) {
      return { conflict: true, server: current };
    }
    return null;
  }

  if (collection === 'profile' && op === 'upsert') {
    const saved = updateProfile(userId, body);
    return { profile: saved };
  }
  if (collection === 'clients') {
    if (op === 'delete') {
      deleteClient(userId, id);
      return { ok: true, id };
    }
    const current = getClient(userId, id);
    const hit = conflictIfNeeded(current);
    if (hit) return hit;
    if (current) return { client: updateClient(userId, id, body) };
    return addClient(userId, { ...body, id });
  }
  if (collection === 'invoices') {
    if (op === 'delete') {
      deleteInvoice(userId, id);
      return { ok: true, id };
    }
    if (op === 'issue') return { invoice: issueInvoice(userId, id) };
    if (op === 'cancel') return { invoice: cancelInvoice(userId, id, body.reason) };
    if (op === 'correct') return { invoice: correctInvoice(userId, id, body) };
    if (op === 'payment') return { invoice: addPayment(userId, 'invoice', id, body, { opId: change.opId || body.opId }) };
    if (op === 'voidPayment') return { invoice: voidPayment(userId, 'invoice', id, body.paymentId, body.reason) };
    const current = getInvoice(userId, id);
    const hit = conflictIfNeeded(current);
    if (hit) return hit;
    if (current) return { invoice: updateInvoice(userId, id, body) };
    return { invoice: addInvoice(userId, { ...body, id }) };
  }
  if (collection === 'obligations') {
    if (op === 'delete') {
      deleteObligation(userId, id);
      return { ok: true, id };
    }
    if (op === 'payment') return { obligation: addPayment(userId, 'obligation', id, body, { opId: change.opId || body.opId }) };
    if (op === 'voidPayment') return { obligation: voidPayment(userId, 'obligation', id, body.paymentId, body.reason) };
    const current = getObligation(userId, id);
    const hit = conflictIfNeeded(current);
    if (hit) return hit;
    if (current) return { obligation: updateObligation(userId, id, body) };
    return { obligation: addObligation(userId, { ...body, id }) };
  }
  const err = new Error('UNKNOWN_CHANGE');
  throw err;
}

function applySync(userId, { opId, changes }) {
  const remembered = rememberedOp(userId, opId);
  if (remembered) return remembered.result;
  const results = [];
  for (const change of changes || []) {
    results.push(applySyncChange(userId, change));
  }
  const result = { ok: true, results };
  rememberOp(userId, opId, result);
  return result;
}

function snapshotForUser(userId) {
  return {
    invoices: listInvoices(userId),
    obligations: listObligations(userId),
    clients: listClients(userId),
    profile: getProfile(userId),
    serverTime: nowIso(),
  };
}

async function createPasswordReset(email) {
  return withWriteLock(async () => {
    const user = findUserByEmail(email);
    if (!user) return { user: null, token: null };
    const token = crypto.randomBytes(32).toString('hex');
    const db = readDb();
    const now = Date.now();
    db.passwordResets = (db.passwordResets || []).filter(
      (item) => new Date(item.expiresAt).getTime() > now && item.userId !== user.id,
    );
    db.passwordResets.push({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    await writeDb(db);
    return { user, token };
  });
}

async function resetPasswordWithToken(token, passwordHash) {
  return withWriteLock(async () => {
    const db = readDb();
    const tokenHash = hashToken(token);
    const now = Date.now();
    const reset = (db.passwordResets || []).find(
      (item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now,
    );
    if (!reset) return null;
    const user = db.users.find((item) => item.id === reset.userId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    db.passwordResets = (db.passwordResets || []).filter((item) => item.userId !== user.id);
    await writeDb(db);
    return user;
  });
}

module.exports = {
  DEFAULT_COMPANY_PROFILE,
  FREE_MONTHLY_LIMIT,
  publicUser,
  isPremiumUser,
  initStore,
  flushStore,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByStripeCustomerId,
  findUserByIapOriginalId,
  getProfile,
  updateProfile,
  listInvoices,
  getInvoice,
  addInvoice,
  updateInvoice,
  deleteInvoice,
  listObligations,
  getObligation,
  addObligation,
  updateObligation,
  deleteObligation,
  canCreateInvoice,
  setUserPlan,
  updateUserBilling,
  createPasswordReset,
  resetPasswordWithToken,
  listClients,
  getClient,
  addClient,
  updateClient,
  deleteClient,
  addPayment,
  voidPayment,
  issueInvoice,
  cancelInvoice,
  correctInvoice,
  exportBackup,
  restoreBackup,
  applySync,
  snapshotForUser,
};
