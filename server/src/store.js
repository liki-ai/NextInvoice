const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

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
};

function emptyDb() {
  return { users: [], profiles: {}, invoices: {} };
}

function readDb() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function normalizeLang(value) {
  return value === 'en' || value === 'it' ? value : 'sq';
}

function createUser({ email, passwordHash, language }) {
  const db = readDb();
  const normalized = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === normalized)) {
    const err = new Error('EMAIL_TAKEN');
    throw err;
  }
  const user = {
    id: crypto.randomUUID(),
    email: normalized,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  db.profiles[user.id] = { ...DEFAULT_COMPANY_PROFILE, language: normalizeLang(language) };
  db.invoices[user.id] = [];
  writeDb(db);
  return user;
}

function findUserByEmail(email) {
  const db = readDb();
  return db.users.find((u) => u.email === String(email || '').trim().toLowerCase()) || null;
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

function addInvoice(userId, invoice) {
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

module.exports = {
  DEFAULT_COMPANY_PROFILE,
  publicUser,
  createUser,
  findUserByEmail,
  findUserById,
  getProfile,
  updateProfile,
  listInvoices,
  getInvoice,
  addInvoice,
  updateInvoice,
  deleteInvoice,
};
