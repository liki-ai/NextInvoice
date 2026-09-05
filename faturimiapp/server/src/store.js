const crypto = require('crypto');
const { initPersist, loadDb, saveDb } = require('./persist');

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
  if (!Array.isArray(cache.passwordResets)) cache.passwordResets = [];
  return cache;
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
  return db.profiles[userId] || { ...DEFAULT_COMPANY_PROFILE, language: 'sq' };
}

function updateProfile(userId, partial) {
  const db = readDb();
  const current = db.profiles[userId] || { ...DEFAULT_COMPANY_PROFILE, language: 'sq' };
  db.profiles[userId] = { ...current, ...partial };
  writeDb(db);
  return db.profiles[userId];
}

function listInvoices(userId) {
  const db = readDb();
  return [...(db.invoices[userId] || [])];
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

function addInvoice(userId, invoice) {
  const allowed = canCreateInvoice(userId);
  if (!allowed.ok) {
    const err = new Error('PLAN_LIMIT');
    err.usage = allowed;
    throw err;
  }
  const db = readDb();
  if (!db.invoices[userId]) db.invoices[userId] = [];
  const saved = {
    ...invoice,
    id: invoice.id || crypto.randomUUID(),
    createdAt: invoice.createdAt || new Date().toISOString(),
  };
  db.invoices[userId] = [saved, ...db.invoices[userId]];
  writeDb(db);
  return saved;
}

function updateInvoice(userId, invoiceId, partial) {
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((inv) => inv.id === invoiceId);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...partial, id: invoiceId, updatedAt: new Date().toISOString() };
  db.invoices[userId] = list;
  writeDb(db);
  return list[idx];
}

function deleteInvoice(userId, invoiceId) {
  const db = readDb();
  const list = db.invoices[userId] || [];
  const next = list.filter((inv) => inv.id !== invoiceId);
  if (next.length === list.length) return false;
  db.invoices[userId] = next;
  writeDb(db);
  return true;
}

function listObligations(userId) {
  const db = readDb();
  return [...(db.obligations?.[userId] || [])];
}

function getObligation(userId, obligationId) {
  return listObligations(userId).find((item) => item.id === obligationId) || null;
}

function normalizeObligation(raw) {
  const amount = Number(raw.amount);
  return {
    vendor: String(raw.vendor || '').trim(),
    description: String(raw.description || '').trim(),
    amount: Number.isFinite(amount) ? amount : 0,
    date: String(raw.date || ''),
    dueDate: String(raw.dueDate || ''),
    status: raw.status === 'paid' ? 'paid' : 'unpaid',
    category: OBLIGATION_CATEGORIES.includes(raw.category) ? raw.category : 'other',
    notes: String(raw.notes || ''),
    relatedInvoiceId: String(raw.relatedInvoiceId || ''),
    proofName: String(raw.proofName || ''),
    proofMime: String(raw.proofMime || ''),
    proofData: String(raw.proofData || ''),
    proofUri: String(raw.proofUri || ''),
  };
}

function addObligation(userId, obligation) {
  const db = readDb();
  if (!db.obligations) db.obligations = {};
  if (!db.obligations[userId]) db.obligations[userId] = [];
  const saved = {
    ...normalizeObligation(obligation),
    id: obligation.id || crypto.randomUUID(),
    createdAt: obligation.createdAt || new Date().toISOString(),
  };
  db.obligations[userId] = [saved, ...db.obligations[userId]];
  writeDb(db);
  return saved;
}

function updateObligation(userId, obligationId, partial) {
  const db = readDb();
  if (!db.obligations) db.obligations = {};
  const list = db.obligations[userId] || [];
  const idx = list.findIndex((item) => item.id === obligationId);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...partial, id: obligationId };
  list[idx] = {
    ...list[idx],
    ...normalizeObligation(merged),
    id: obligationId,
    createdAt: list[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  db.obligations[userId] = list;
  writeDb(db);
  return list[idx];
}

function deleteObligation(userId, obligationId) {
  const db = readDb();
  if (!db.obligations) db.obligations = {};
  const list = db.obligations[userId] || [];
  const next = list.filter((item) => item.id !== obligationId);
  if (next.length === list.length) return false;
  db.obligations[userId] = next;
  writeDb(db);
  return true;
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
};
