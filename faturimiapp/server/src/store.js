const crypto = require('crypto');
const { initPersist, loadDb, serialize, saveSerialized, hasPostgres } = require('./persist');
const {
  allocateInvoiceNumber,
  clientSnapshot,
  vatFreeClientIds,
  companySnapshot,
  hydrateInvoice,
  hydrateObligation,
  similarClient,
  validatePaymentAmount,
  paymentStatus,
  documentTotals,
  money,
  toNumber,
  invoiceTotals,
  parseLooseDate,
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
  industry: 'other',
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
  if (!cache.items) cache.items = {};
  if (!cache.syncOps) cache.syncOps = {};
  if (!cache.migrations) cache.migrations = {};
  if (!cache.mail) cache.mail = {};
  if (!cache.invites) cache.invites = {};
  if (!cache.recurring) cache.recurring = {};
  if (!cache.finance) cache.finance = {};
  if (!cache.mercury) cache.mercury = {};
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
  if (!db.items) db.items = {};
  if (!db.items[userId]) db.items[userId] = [];
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

// Per-user data version; see MIGRATIONS.md.
const DATA_VERSION = 2;

function markVatFreeClients(db, userId) {
  const ids = new Set(vatFreeClientIds(db.invoices[userId], db.clients[userId]));
  if (ids.size === 0) return 0;
  db.clients[userId] = (db.clients[userId] || []).map((client) => (ids.has(client.id) ? { ...client, taxRate: 0, updatedAt: nowIso() } : client));
  return ids.size;
}

function migrateUserData(userId) {
  const db = readDb();
  ensureUserCollections(db, userId);
  const version = Number((db.migrations[userId] || {}).v) || 0;
  if (version >= DATA_VERSION) return;
  if (version < 1) migrateToV1(db, userId);
  if (version < 2) markVatFreeClients(db, userId);
  db.migrations[userId] = { v: DATA_VERSION, at: nowIso() };
  writeDb(db);
}

function migrateToV1(db, userId) {
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
}

function readDb() {
  if (!cache) {
    throw new Error('Store is not initialized.');
  }
  return cache;
}

// The newest state waiting to be written. Saves run one at a time; when several pile up
// (a draft autosaving while someone types) only the latest one is worth sending.
let pendingSave = null;
let retryTimer = null;
let retryDelay = 0;
const persistState = { ok: true, lastSavedAt: null, error: null, failedSince: null };

function runSave() {
  persistChain = persistChain.then(async () => {
    const snapshot = pendingSave;
    if (!snapshot) return;
    pendingSave = null;
    try {
      await saveSerialized(snapshot);
      persistState.ok = true;
      persistState.error = null;
      persistState.failedSince = null;
      persistState.lastSavedAt = nowIso();
      retryDelay = 0;
    } catch (err) {
      // The change is still in memory and already answered to the client; losing it on the next
      // restart would be silent. Keep it queued and try again until the database takes it.
      console.error('[store] failed to persist, will retry', err.message);
      persistState.ok = false;
      persistState.error = String(err.message || err);
      persistState.failedSince = persistState.failedSince || nowIso();
      if (!pendingSave) pendingSave = snapshot;
      retryDelay = Math.min(retryDelay ? retryDelay * 2 : 1000, 30000);
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          runSave();
        }, retryDelay);
        if (retryTimer.unref) retryTimer.unref();
      }
    }
  });
  return persistChain;
}

function writeDb(db) {
  cache = db;
  pendingSave = serialize(db);
  return runSave();
}

/** Resolves once everything written so far has reached storage (or one more attempt has failed). */
async function flushStore() {
  if (pendingSave) runSave();
  await persistChain;
  return { ...persistState };
}

function storeHealth() {
  return {
    persist: hasPostgres() ? 'postgres' : 'file',
    // "durable" is what matters to an operator: false means a restart can lose data.
    durable: hasPostgres() && persistState.ok,
    lastSavedAt: persistState.lastSavedAt,
    ...(persistState.ok ? {} : { saveError: persistState.error, failingSince: persistState.failedSince }),
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const FREE_MONTHLY_LIMIT = 10;

/**
 * A company that never pays: its owner's email (or account id) is in PREMIUM_ACCOUNTS on the server,
 * comma-separated. Kept in the server's environment, not in this repository, which is public.
 */
function isComplimentary(user) {
  if (!user) return false;
  const list = String(process.env.PREMIUM_ACCOUNTS || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 && (list.includes(String(user.email || '').toLowerCase()) || list.includes(String(user.id || '').toLowerCase()));
}

function isPremiumUser(user) {
  if (isComplimentary(user)) return true;
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
    // 'complimentary': the app shows no subscription to this company at all.
    billingSource: isComplimentary(user) ? 'complimentary' : user.billingSource || null,
    planExpiresAt: user.planExpiresAt || null,
  };
}

// ---- companies with several users --------------------------------------------------------------
// The person who signed up owns the company's data (it is stored under their id). People they add
// are users of their own, with their own password, who work in that same data.

const MEMBER_ROLES = ['admin', 'member'];
const TEAM_MAX = 25;
const INVITE_DAYS = 14;

/** The account whose data this user works in: their own, or the company they were added to. */
function companyOwner(user) {
  if (!user) return null;
  return user.companyId ? findUserById(user.companyId) : user;
}

/** owner: signed up the company. admin: may change settings and users. member: works with invoices only. */
function roleOf(user) {
  if (!user.companyId) return 'owner';
  return user.role === 'admin' ? 'admin' : 'member';
}

/**
 * The signed-in person as the apps see them. `id` is the company's data key, which every route
 * reads and writes under; `accountId` and `email` are the person's own.
 */
function sessionUser(user) {
  const owner = companyOwner(user);
  if (!owner) return null;
  const profile = readDb().profiles[owner.id] || {};
  return {
    ...publicUser(owner),
    id: owner.id,
    accountId: user.id,
    email: user.email,
    createdAt: user.createdAt,
    role: roleOf(user),
    companyName: profile.companyName || '',
  };
}

function teamError(code) {
  const err = new Error(code);
  err.teamCode = code;
  return err;
}

function liveInvites(db, ownerId) {
  const now = Date.now();
  return ((db.invites && db.invites[ownerId]) || []).filter((item) => new Date(item.expiresAt).getTime() > now);
}

function describeInvite(invite) {
  return { id: invite.id, email: invite.email, role: invite.role, createdAt: invite.createdAt, expiresAt: invite.expiresAt, invitedBy: invite.invitedBy || '' };
}

function listTeam(ownerId) {
  const db = readDb();
  const people = db.users.filter((item) => item.id === ownerId || item.companyId === ownerId);
  people.sort((a, b) => (a.id === ownerId ? -1 : b.id === ownerId ? 1 : String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  return {
    members: people.map((item) => ({ id: item.id, email: item.email, role: roleOf(item), createdAt: item.createdAt, addedBy: item.addedBy || '' })),
    invites: liveInvites(db, ownerId).map(describeInvite),
  };
}

function memberRole(value) {
  return MEMBER_ROLES.includes(value) ? value : 'member';
}

function assertRoomInTeam(db, ownerId, { replacingInvite } = {}) {
  const members = db.users.filter((item) => item.companyId === ownerId).length;
  const invites = liveInvites(db, ownerId).length - (replacingInvite ? 1 : 0);
  if (members + invites >= TEAM_MAX) throw teamError('TEAM_FULL');
}

/** A user created by an administrator, with a password the administrator chose for them. */
function addMember(ownerId, { email, passwordHash, role, addedBy }) {
  return withWriteLock(async () => {
    const db = readDb();
    const normalized = normalizeEmail(email);
    if (db.users.some((item) => item.email === normalized)) throw teamError('EMAIL_TAKEN');
    const pending = liveInvites(db, ownerId).some((item) => item.email === normalized);
    assertRoomInTeam(db, ownerId, { replacingInvite: pending });
    const user = { id: crypto.randomUUID(), email: normalized, passwordHash, createdAt: nowIso(), companyId: ownerId, role: memberRole(role), addedBy: addedBy || '' };
    db.users.push(user);
    if (db.invites[ownerId]) db.invites[ownerId] = db.invites[ownerId].filter((item) => item.email !== normalized);
    await writeDb(db);
    return user;
  });
}

function setMemberRole(ownerId, memberId, role) {
  const db = readDb();
  const user = db.users.find((item) => item.id === memberId && item.companyId === ownerId);
  if (!user) return null;
  user.role = memberRole(role);
  writeDb(db);
  return { id: user.id, email: user.email, role: roleOf(user), createdAt: user.createdAt };
}

/** Takes a user out of the company. Their sign-in stops working at once; what they entered stays. */
function removeMember(ownerId, memberId) {
  const db = readDb();
  const user = db.users.find((item) => item.id === memberId && item.companyId === ownerId);
  if (!user) return false;
  db.users = db.users.filter((item) => item.id !== memberId);
  db.passwordResets = (db.passwordResets || []).filter((item) => item.userId !== memberId);
  // The mailbox they connected for themselves leaves with them.
  if (db.mail) delete db.mail[personalMailKey(memberId)];
  writeDb(db);
  return true;
}

/** An invitation to join the company. Only its hash is kept; the link itself goes to the invited person. */
function createInvite(ownerId, { email, role, invitedBy }) {
  const db = readDb();
  const normalized = normalizeEmail(email);
  if (db.users.some((item) => item.email === normalized)) throw teamError('EMAIL_TAKEN');
  const current = liveInvites(db, ownerId);
  assertRoomInTeam(db, ownerId, { replacingInvite: current.some((item) => item.email === normalized) });
  const token = crypto.randomBytes(24).toString('base64url');
  const invite = {
    id: crypto.randomUUID(),
    email: normalized,
    role: memberRole(role),
    tokenHash: hashToken(token),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: invitedBy || '',
  };
  // One open invitation per address: a new one replaces the old link. Expired ones are dropped here too.
  db.invites[ownerId] = [...current.filter((item) => item.email !== normalized), invite];
  writeDb(db);
  return { invite: describeInvite(invite), token };
}

function revokeInvite(ownerId, inviteId) {
  const db = readDb();
  const list = (db.invites && db.invites[ownerId]) || [];
  if (!list.some((item) => item.id === inviteId)) return false;
  db.invites[ownerId] = list.filter((item) => item.id !== inviteId);
  writeDb(db);
  return true;
}

function findInvite(token) {
  const code = String(token || '');
  if (code.length < 20) return null;
  const hash = hashToken(code);
  const db = readDb();
  for (const ownerId of Object.keys(db.invites || {})) {
    const invite = liveInvites(db, ownerId).find((item) => item.tokenHash === hash);
    if (!invite) continue;
    if (!db.users.some((item) => item.id === ownerId)) return null;
    return { ownerId, invite: describeInvite(invite), companyName: (db.profiles[ownerId] || {}).companyName || '' };
  }
  return null;
}

/** The invited person sets their password and becomes a user of the company. The link works once. */
function acceptInvite(token, passwordHash) {
  return withWriteLock(async () => {
    const found = findInvite(token);
    if (!found) throw teamError('INVITE_INVALID');
    const db = readDb();
    if (db.users.some((item) => item.email === found.invite.email)) throw teamError('EMAIL_TAKEN');
    const user = { id: crypto.randomUUID(), email: found.invite.email, passwordHash, createdAt: nowIso(), companyId: found.ownerId, role: found.invite.role, addedBy: found.invite.invitedBy };
    db.users.push(user);
    db.invites[found.ownerId] = (db.invites[found.ownerId] || []).filter((item) => item.id !== found.invite.id);
    await writeDb(db);
    return user;
  });
}

function normalizeLang(value) {
  return value === 'en' || value === 'it' ? value : 'sq';
}

async function createUser({ email, passwordHash, language, industry }) {
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
    db.profiles[user.id] = {
      ...DEFAULT_COMPANY_PROFILE,
      language: normalizeLang(language),
      industry: ['fashion', 'services', 'retail', 'hospitality', 'construction', 'other'].includes(industry) ? industry : 'other',
    };
    db.invoices[user.id] = [];
    if (!db.obligations) db.obligations = {};
    db.obligations[user.id] = [];
    if (!db.clients) db.clients = {};
    db.clients[user.id] = [];
    if (!db.items) db.items = {};
    db.items[user.id] = [];
    db.migrations[user.id] = { v: DATA_VERSION, at: new Date().toISOString() };
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

const CLIENT_IDENTITY_FIELDS = ['businessId', 'vatNumber', 'fiscalNumber'];

/**
 * An invoice as the apps and the recipient see it. An issued invoice keeps the client as it was
 * when issued; identification numbers (NUI, VAT, fiscal) that were still blank then and have since
 * been entered on the client are shown too, since leaving them off the invoice helps nobody.
 * Nothing that was on the invoice is ever replaced, and nothing is written back.
 */
function hydrateFor(db, userId, raw) {
  const invoice = hydrateInvoice(raw, db.profiles[userId]);
  const snapshot = invoice.clientSnapshot || {};
  const blank = CLIENT_IDENTITY_FIELDS.filter((key) => !String(snapshot[key] || '').trim());
  if (blank.length === 0) return invoice;
  const clients = (db.clients && db.clients[userId]) || [];
  const id = invoice.clientId || snapshot.id;
  let record = id ? clients.find((item) => item.id === id) : null;
  if (!record) {
    const name = String(snapshot.fullName || '').trim().toLowerCase();
    const sameName = name ? clients.filter((item) => String(item.fullName || '').trim().toLowerCase() === name) : [];
    if (sameName.length === 1) record = sameName[0];
  }
  if (!record) return invoice;
  const gained = {};
  for (const key of blank) {
    const value = String(record[key] || '').trim();
    if (value) gained[key] = value;
  }
  if (Object.keys(gained).length === 0) return invoice;
  return { ...invoice, client: { ...(invoice.client || {}), ...gained }, clientSnapshot: { ...snapshot, ...gained } };
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
  return [...(db.invoices[userId] || [])].map((item) => hydrateFor(db, userId, item));
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
      billingSource: isComplimentary(user) ? 'complimentary' : user.billingSource || null,
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

function totalFields(items, discount, taxRate) {
  const totals = invoiceTotals(items, discount, taxRate);
  return { subtotal: totals.subtotal, taxRate: totals.taxRate, taxAmount: totals.taxAmount, total: totals.total };
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
  if (existing) return hydrateFor(db, userId, existing);
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
    ...totalFields(invoice.items, invoice.discount, invoice.taxRate),
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
  return hydrateFor(db, userId, saved);
}

const ISSUED_LOCKED_FIELDS = ['items', 'discount', 'taxRate', 'subtotal', 'total', 'client', 'number', 'currency', 'companySnapshot', 'clientSnapshot'];

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
      ...(partial.sent !== undefined ? { sent: partial.sent } : {}),
      ...(partial.sentAt !== undefined ? { sentAt: partial.sentAt } : {}),
      ...(partial.status === 'paid' || partial.status === 'unpaid' ? { status: partial.status } : {}),
      ...(partial.proofUri !== undefined ? { proofUri: partial.proofUri } : {}),
      ...(partial.proofName !== undefined ? { proofName: partial.proofName } : {}),
      ...(partial.proofMime !== undefined ? { proofMime: partial.proofMime } : {}),
      ...(partial.proofData !== undefined ? { proofData: partial.proofData } : {}),
    };
  }
  if (lifecycle === 'cancelled' && !options.allowCancelledEdit) {
    const err = new Error('CANCELLED_LOCKED');
    throw err;
  }
  const next = { ...current, ...partial, id: invoiceId, updatedAt: nowIso() };
  // Marked as sent by hand: a send that was scheduled for it is done, and must not go out again.
  if (partial.sent === true && next.delivery && ['scheduled', 'failed'].includes(next.delivery.status)) {
    next.delivery = { ...next.delivery, status: 'sent', sentAt: partial.sentAt || nowIso(), nextRetryAt: null };
    next.events = [...(Array.isArray(next.events) ? next.events : []), { at: nowIso(), type: 'marked_sent' }].slice(-INVOICE_EVENTS_MAX);
  }
  if (lifecycle === 'draft') Object.assign(next, totalFields(next.items, next.discount, next.taxRate));
  if (lifecycle === 'draft' && partial.client) {
    next.client = clientSnapshot(partial.client);
    next.clientSnapshot = next.client;
  }
  list[idx] = next;
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateFor(db, userId, list[idx]);
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
    return hydrateFor(db, userId, current);
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
  return hydrateFor(db, userId, issued);
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
  return hydrateFor(db, userId, list[idx]);
}

/** The lines of an invoice reduced to what makes its amounts, for telling whether they changed. */
function lineSignature(items) {
  return JSON.stringify((Array.isArray(items) ? items : []).map((it) => [String(it.description || '').trim(), toNumber(it.quantity), Math.round(toNumber(it.unitPrice) * 1e6) / 1e6]));
}

/**
 * Changes an issued invoice and keeps what it said before. Changing the amounts needs a reason;
 * changing only the invoice date, the due date or the notes does not.
 */
function correctInvoice(userId, invoiceId, { items, discount, taxRate, notes, date, dueDate, reason }) {
  const why = String(reason || '').trim();
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
  const totals = totalFields(nextItems, nextDiscount, taxRate === undefined ? current.taxRate : taxRate);
  const total = totals.total;
  const amountsChanged =
    lineSignature(nextItems) !== lineSignature(current.items) || JSON.stringify(totals) !== JSON.stringify(totalFields(current.items, current.discount, current.taxRate));
  if (amountsChanged && !why) {
    const err = new Error('CORRECT_REASON');
    throw err;
  }
  const nextDate = date === undefined ? current.date : String(date).trim().slice(0, 40);
  const nextDueDate = dueDate === undefined ? current.dueDate || '' : String(dueDate).trim().slice(0, 40);
  if (nextDate !== current.date && !parseLooseDate(nextDate)) throw new Error('DATE_INVALID');
  const nextNotes = notes === undefined ? current.notes : notes;
  const datesChanged = nextDate !== current.date || nextDueDate !== (current.dueDate || '');
  // Nothing to record: the form was saved as it was opened.
  if (!amountsChanged && !datesChanged && (nextNotes || '') === (current.notes || '')) return hydrateFor(db, userId, current);
  const hydrated = hydrateFor(db, userId, current);
  if (hydrated.amountPaid > total) {
    const err = new Error('PAYMENTS_EXCEED');
    err.amountPaid = hydrated.amountPaid;
    err.total = total;
    throw err;
  }
  list[idx] = {
    ...current,
    items: amountsChanged ? nextItems : current.items,
    discount: amountsChanged ? nextDiscount : current.discount,
    notes: nextNotes,
    date: nextDate,
    dueDate: nextDueDate,
    ...(amountsChanged ? totals : {}),
    updatedAt: nowIso(),
    revisions: [
      ...(current.revisions || []),
      {
        type: 'correct',
        reason: why,
        at: nowIso(),
        previous: { items: current.items, discount: current.discount, taxRate: current.taxRate, subtotal: current.subtotal, total: current.total, date: current.date, dueDate: current.dueDate || '' },
      },
    ],
  };
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateFor(db, userId, list[idx]);
}

const IMPORT_MAX_INVOICES = 2000;

function sameImportedClient(existing, incoming) {
  const idA = String(existing?.businessId || '').trim().toLowerCase();
  const idB = String(incoming?.businessId || '').trim().toLowerCase();
  if (idA && idB) return idA === idB;
  const nameA = String(existing?.fullName || '').trim().toLowerCase();
  const nameB = String(incoming?.fullName || '').trim().toLowerCase();
  return Boolean(nameA) && nameA === nameB;
}

function invoiceSortKey(invoice) {
  const date = parseLooseDate(invoice?.date) || parseLooseDate(invoice?.createdAt);
  return date ? date.getTime() : 0;
}

/**
 * Brings in a history of already-issued invoices (for example from a spreadsheet) in one write.
 * Invoices keep their own number and date; a number that already exists is skipped, so the same
 * file can be imported twice without duplicating anything.
 */
function importInvoices(userId, payload) {
  migrateUserData(userId);
  const incoming = Array.isArray(payload?.invoices) ? payload.invoices : [];
  if (incoming.length === 0) throw new Error('IMPORT_EMPTY');
  if (incoming.length > IMPORT_MAX_INVOICES) throw new Error('IMPORT_TOO_LARGE');

  const db = readDb();
  ensureUserCollections(db, userId);
  const profile = getProfile(userId);
  const now = nowIso();

  const clients = [...db.clients[userId]];
  const clientByKey = new Map();
  let clientsCreated = 0;
  for (const raw of Array.isArray(payload?.clients) ? payload.clients : []) {
    const snap = clientSnapshot(raw);
    if (!snap.fullName) continue;
    let client = clients.find((item) => sameImportedClient(item, snap));
    if (!client) {
      client = { ...snap, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      clients.unshift(client);
      clientsCreated += 1;
    }
    if (raw.key !== undefined) clientByKey.set(String(raw.key), client);
  }

  const existing = db.invoices[userId];
  const taken = new Set(existing.filter((item) => item.lifecycle !== 'draft').map((item) => String(item.number || '')));
  const created = [];
  const skipped = [];
  for (const raw of incoming) {
    const number = String(raw?.number || '').trim();
    const skip = (reason) => skipped.push({ number, reason });
    if (!number || number.startsWith('DRAFT-')) {
      skip('number');
      continue;
    }
    if (taken.has(number)) {
      skip('exists');
      continue;
    }
    const client = clientByKey.get(String(raw.clientKey)) || (raw.client ? clientSnapshot(raw.client) : null);
    if (!client || !client.fullName) {
      skip('client');
      continue;
    }
    const date = parseLooseDate(raw.date);
    if (!date) {
      skip('date');
      continue;
    }
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((item) => ({
        id: crypto.randomUUID(),
        description: String(item?.description || '').trim().slice(0, 4000),
        quantity: toNumber(item?.quantity),
        unitPrice: toNumber(item?.unitPrice),
      }))
      .filter((item) => item.description || item.quantity * item.unitPrice !== 0);
    if (items.length === 0) {
      skip('items');
      continue;
    }
    const totals = totalFields(items, raw.discount, raw.taxRate);
    const snapshot = clientSnapshot(client);
    const paidAmount = Math.min(money(raw.amountPaid), totals.total);
    // Noon UTC on the invoice's day: the same calendar day in every time zone the apps run in.
    const stamp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();
    taken.add(number);
    created.push({
      id: crypto.randomUUID(),
      number,
      date: String(raw.date).trim(),
      dueDate: String(raw.dueDate || '').trim(),
      lifecycle: 'issued',
      status: raw.paid ? 'paid' : 'unpaid',
      client: snapshot,
      clientId: snapshot.id || '',
      clientSnapshot: snapshot,
      companySnapshot: companySnapshot(profile),
      snapshotSource: 'issued',
      currency: profile.currency || 'EUR',
      items,
      discount: money(raw.discount),
      notes: String(raw.notes || '').trim().slice(0, 8000),
      ...totals,
      // A deposit recorded in the source file; a fully paid invoice needs no rows (see MIGRATIONS.md).
      payments:
        !raw.paid && paidAmount > 0
          ? [{ id: crypto.randomUUID(), opId: crypto.randomUUID(), amount: paidAmount, date: String(raw.date).trim(), note: 'Import', createdAt: now }]
          : [],
      revisions: [{ type: 'import', at: now }],
      // Dated when the invoice was really issued, so monthly figures and the free-plan counter stay truthful.
      createdAt: stamp,
      issuedAt: stamp,
      updatedAt: now,
    });
  }

  const user = findUserById(userId);
  if (!isPremiumUser(user)) {
    const thisMonth = monthKey(new Date());
    const adding = created.filter((item) => monthKey(item.createdAt) === thisMonth).length;
    const used = invoicesCreatedThisMonth(userId);
    if (adding > 0 && used + adding > FREE_MONTHLY_LIMIT) {
      const err = new Error('PLAN_LIMIT');
      err.usage = canCreateInvoice(userId);
      throw err;
    }
  }

  if (created.length > 0 || clientsCreated > 0) {
    db.clients[userId] = clients;
    // Newest first, like the rest of the list. The sort is stable, so same-day invoices keep their order.
    db.invoices[userId] = [...created, ...existing]
      .map((item, index) => ({ item, index, key: invoiceSortKey(item) }))
      .sort((a, b) => b.key - a.key || String(b.item.number || '').localeCompare(String(a.item.number || '')) || a.index - b.index)
      .map((entry) => entry.item);
    // Export customers in the file (every invoice at 0%) keep that as their starting rate.
    markVatFreeClients(db, userId);
    writeDb(db);
  }
  return { created: created.length, clientsCreated, skipped };
}

/**
 * Records full payment on many invoices in one write. Each invoice gets one payment for whatever
 * is still owed, dated `date` if given and otherwise the invoice's own date (the honest default
 * for a backlog whose real payment days nobody recorded). Drafts, cancelled and already-paid
 * invoices are left alone.
 */
function markInvoicesPaid(userId, { ids, date } = {}) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map(String));
  if (wanted.size === 0) throw new Error('BULK_EMPTY');
  migrateUserData(userId);
  const db = readDb();
  const now = nowIso();
  const paidOn = String(date || '').trim();
  let paid = 0;
  let skipped = 0;
  db.invoices[userId] = (db.invoices[userId] || []).map((invoice) => {
    if (!wanted.has(String(invoice.id))) return invoice;
    const lifecycle = invoice.lifecycle || 'issued';
    const due = documentTotals(invoice).amountDue;
    if (lifecycle !== 'issued' || paymentStatus(invoice) === 'paid' || due <= 0) {
      skipped += 1;
      return invoice;
    }
    paid += 1;
    const payment = { id: crypto.randomUUID(), opId: crypto.randomUUID(), amount: due, date: paidOn || String(invoice.date || '').trim(), method: '', note: '', createdAt: now };
    return { ...invoice, payments: [...(invoice.payments || []), payment], updatedAt: now };
  });
  if (paid > 0) writeDb(db);
  return { paid, skipped };
}

/**
 * The link code for showing one invoice to its recipient without a login. Created the first time
 * the invoice is shared and kept, so a link already sent keeps working.
 */
function shareInvoice(userId, invoiceId) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((item) => item.id === invoiceId);
  if (idx === -1) return null;
  if ((list[idx].lifecycle || 'issued') === 'draft') throw new Error('DRAFT_SHARE');
  if (!list[idx].shareToken) {
    list[idx] = { ...list[idx], shareToken: crypto.randomBytes(18).toString('base64url') };
    db.invoices[userId] = list;
    writeDb(db);
  }
  return list[idx].shareToken;
}

/**
 * A company's connection to its own mailbox, for sending invoices. Kept apart from the profile so it
 * never travels with it: not to the apps, not into a backup file, not onto a shared invoice.
 */
/** Where a person's own mailbox is kept, apart from the company's (which sits under the company's key). */
function personalMailKey(accountId) {
  return `personal:${accountId}`;
}

function getMailSettings(userId) {
  const db = readDb();
  return (db.mail && db.mail[userId]) || null;
}

function saveMailSettings(userId, settings) {
  const db = readDb();
  if (!db.mail) db.mail = {};
  if (settings) db.mail[userId] = { ...settings, updatedAt: nowIso() };
  else delete db.mail[userId];
  writeDb(db);
  return db.mail[userId] || null;
}

/** The company's finance records: the documents its accountant and bank send, and how they are collected. */
function getFinance(userId) {
  const db = readDb();
  return (db.finance && db.finance[userId]) || null;
}

/** Ids of the companies that have finance records, for the background mail check. */
function financeOwners() {
  const db = readDb();
  return Object.keys(db.finance || {});
}

function saveFinance(userId, finance) {
  const db = readDb();
  if (!db.finance) db.finance = {};
  if (finance) db.finance[userId] = { ...finance, updatedAt: nowIso() };
  else delete db.finance[userId];
  writeDb(db);
  return db.finance[userId] || null;
}

/** The company's Mercury bank connection and the transactions read from it. */
function getMercury(userId) {
  const db = readDb();
  return (db.mercury && db.mercury[userId]) || null;
}

/** Ids of the companies with a Mercury connection, for the background sync. */
function mercuryOwners() {
  const db = readDb();
  return Object.keys(db.mercury || {});
}

function saveMercury(userId, mercury) {
  const db = readDb();
  if (!db.mercury) db.mercury = {};
  if (mercury) db.mercury[userId] = { ...mercury, updatedAt: nowIso() };
  else delete db.mercury[userId];
  writeDb(db);
  return db.mercury[userId] || null;
}

const EMAIL_LOG_MAX = 20;

/** Notes on the invoice that it went out by email, and marks it sent. */
function recordInvoiceEmail(userId, invoiceId, { from, to, cc, subject, attached }) {
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((item) => item.id === invoiceId);
  if (idx === -1) return null;
  const at = nowIso();
  const emails = [...(Array.isArray(list[idx].emails) ? list[idx].emails : []), { at, from, to, cc: cc || [], subject, attached: Boolean(attached) }];
  const delivery = list[idx].delivery ? { ...list[idx].delivery, status: 'sent', sentAt: at, nextRetryAt: null, lastError: null } : list[idx].delivery;
  list[idx] = { ...list[idx], sent: true, sentAt: at, delivery, emails: emails.slice(-EMAIL_LOG_MAX), updatedAt: at };
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateFor(db, userId, list[idx]);
}

/**
 * Brings recorded payments in line with a bank statement, in one write. Each change names an
 * invoice, the recorded payments the statement replaces (they are voided, never deleted) and the
 * transfers the statement shows for it. A change that would pay more than the invoice's total,
 * or that touches a draft or cancelled invoice, is skipped.
 */
function reconcilePayments(userId, { changes } = {}) {
  const wanted = new Map((Array.isArray(changes) ? changes : []).map((change) => [String(change && change.id), change]));
  if (wanted.size === 0) throw new Error('BULK_EMPTY');
  if (wanted.size > 2000) throw new Error('IMPORT_TOO_LARGE');
  migrateUserData(userId);
  const db = readDb();
  const now = nowIso();
  const touched = [];
  db.invoices[userId] = (db.invoices[userId] || []).map((invoice) => {
    const change = wanted.get(String(invoice.id));
    if (!change) return invoice;
    const lifecycle = invoice.lifecycle || 'issued';
    const voids = new Set((Array.isArray(change.void) ? change.void : []).map(String));
    const added = (Array.isArray(change.add) ? change.add : []).map((payment) => ({
      id: crypto.randomUUID(),
      opId: crypto.randomUUID(),
      amount: money(payment && payment.amount),
      date: String((payment && payment.date) || '').trim(),
      method: 'bank',
      note: '',
      createdAt: now,
    }));
    const payments = [
      ...(invoice.payments || []).map((item) => (voids.has(String(item.id)) && !item.voidedAt ? { ...item, voidedAt: now, voidReason: 'bank' } : item)),
      ...added,
    ];
    const next = { ...invoice, payments, updatedAt: now };
    // A hand-set "paid" with no payment behind it would keep the invoice paid; the statement decides now.
    if (next.status === 'paid') next.status = 'unpaid';
    const totals = documentTotals(next);
    if (lifecycle !== 'issued' || added.some((payment) => !(payment.amount > 0) || !payment.date) || totals.paidCents > totals.totalCents + 1) {
      return invoice;
    }
    touched.push(next);
    return next;
  });
  if (touched.length > 0) writeDb(db);
  return { invoices: touched.map((item) => hydrateFor(db, userId, item)), skipped: wanted.size - touched.length };
}

/**
 * Notes on each of the invoices that the client was reminded to pay: one entry per reminder,
 * naming every invoice the same message covered. Returns the invoices as they now stand.
 */
function recordInvoiceReminder(userId, invoiceIds, { from, to, cc, subject, emailed }) {
  const wanted = new Set((Array.isArray(invoiceIds) ? invoiceIds : []).map(String));
  const db = readDb();
  const list = db.invoices[userId] || [];
  const at = nowIso();
  const numbers = list.filter((item) => wanted.has(String(item.id))).map((item) => String(item.number || ''));
  const entry = { at, from: from || '', to: to || [], cc: cc || [], subject: subject || '', emailed: Boolean(emailed), invoices: numbers };
  const touched = [];
  db.invoices[userId] = list.map((item) => {
    if (!wanted.has(String(item.id))) return item;
    const reminders = [...(Array.isArray(item.reminders) ? item.reminders : []), entry];
    const next = { ...item, reminders: reminders.slice(-EMAIL_LOG_MAX), updatedAt: at };
    touched.push(next);
    return next;
  });
  if (touched.length > 0) writeDb(db);
  return touched.map((item) => hydrateFor(db, userId, item));
}

// ---- recurring invoices and automatic delivery --------------------------------------------------
// One document per company ('recurring/<ownerId>'): its plans and its notification settings. What
// happens to each invoice (scheduled, sent, failed, paid) is kept on the invoice itself.

const INVOICE_EVENTS_MAX = 60;
const RECURRING_SETTINGS = { notifyEmails: [], notifySent: true, notifyPaid: true, notifySince: null, stripe: null };

function getRecurring(userId) {
  const db = readDb();
  const value = (db.recurring && db.recurring[userId]) || {};
  return { plans: Array.isArray(value.plans) ? value.plans : [], settings: { ...RECURRING_SETTINGS, ...(value.settings || {}) } };
}

function saveRecurring(userId, value) {
  const db = readDb();
  if (!db.recurring) db.recurring = {};
  db.recurring[userId] = { plans: value.plans || [], settings: value.settings || { ...RECURRING_SETTINGS } };
  writeDb(db);
  return db.recurring[userId];
}

/** Companies whose invoices the scheduler looks after: every account that owns data. */
function automationOwners() {
  const db = readDb();
  const owners = new Set(db.users.filter((user) => !user.companyId).map((user) => user.id));
  return Object.keys(db.invoices || {}).filter((id) => owners.has(id));
}

/**
 * Changes an invoice's delivery state and history, nothing printed on it. `change` receives a copy
 * with `delivery` and `events` ready to edit and returns it (or nothing to leave the invoice as it is).
 */
function mutateInvoiceDelivery(userId, invoiceId, change) {
  const db = readDb();
  const list = db.invoices[userId] || [];
  const idx = list.findIndex((item) => item.id === invoiceId);
  if (idx === -1) return null;
  const current = list[idx];
  const draft = { ...current, delivery: current.delivery ? { ...current.delivery } : null, events: Array.isArray(current.events) ? [...current.events] : [] };
  const next = change(draft);
  if (!next) return hydrateFor(db, userId, current);
  next.events = (next.events || []).slice(-INVOICE_EVENTS_MAX);
  next.updatedAt = nowIso();
  list[idx] = next;
  db.invoices[userId] = list;
  writeDb(db);
  return hydrateFor(db, userId, next);
}

/** The invoice a plan already made for a period, if any: the second guard against duplicates. */
function findRecurringInvoice(userId, planId, period) {
  return (readDb().invoices[userId] || []).find((inv) => inv.recurring && inv.recurring.planId === planId && inv.recurring.period === period) || null;
}

/** The company and invoice behind a share link, for paying it online. */
function sharedInvoiceOwner(token) {
  const code = String(token || '');
  if (code.length < 16) return null;
  const db = readDb();
  for (const [userId, list] of Object.entries(db.invoices || {})) {
    const raw = (list || []).find((item) => item.shareToken === code);
    if (raw) return { ownerId: userId, invoice: hydrateFor(db, userId, raw) };
  }
  return null;
}

/** What a recipient may see through a share link: the invoice as printed, nothing internal. */
function sharedInvoice(token) {
  const code = String(token || '');
  if (code.length < 16) return null;
  const db = readDb();
  for (const [userId, list] of Object.entries(db.invoices || {})) {
    const raw = (list || []).find((item) => item.shareToken === code);
    if (!raw) continue;
    const invoice = hydrateFor(db, userId, raw);
    const client = invoice.clientSnapshot || invoice.client || {};
    return {
      invoice: {
        number: invoice.number,
        date: invoice.date,
        dueDate: invoice.dueDate || '',
        lifecycle: invoice.lifecycle,
        status: invoice.status,
        currency: invoice.currency,
        items: (invoice.items || []).map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
        discount: invoice.discount,
        taxRate: invoice.taxRate,
        notes: invoice.notes || '',
        subtotal: invoice.subtotal,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        payments: (invoice.payments || []).filter((item) => !item.voidedAt).map((item) => ({ id: item.id, amount: item.amount, date: item.date })),
        companySnapshot: invoice.companySnapshot || null,
        client: {
          fullName: client.fullName || '',
          address: client.address || '',
          phone: client.phone || '',
          email: client.email || '',
          businessId: client.businessId || '',
          vatNumber: client.vatNumber || '',
          fiscalNumber: client.fiscalNumber || '',
        },
      },
      profile: db.profiles[userId] || null,
    };
  }
  return null;
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
  if (kind === 'invoice') return { listKey: 'invoices', doc: getInvoice(userId, id), hydrate: (item) => hydrateFor(readDb(), userId, item) };
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
      return isInvoice ? hydrateFor(db, userId, current) : hydrateObligation(current);
    }
    payments.push(savedPayment);
  }
  list[idx] = { ...current, payments, updatedAt: nowIso() };
  if (isInvoice) db.invoices[userId] = list;
  else db.obligations[userId] = list;
  writeDb(db);
  return isInvoice ? hydrateFor(db, userId, list[idx]) : hydrateObligation(list[idx]);
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
  return isInvoice ? hydrateFor(db, userId, list[idx]) : hydrateObligation(list[idx]);
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

function itemSnapshot(item) {
  return {
    description: String(item?.description || '').trim(),
    unitCost: Number(item?.unitCost) || 0,
    unit: String(item?.unit || 'pcs'),
    taxable: item?.taxable !== false,
    additionalDetails: String(item?.additionalDetails || '').trim(),
  };
}

function listItems(userId) {
  migrateUserData(userId);
  const db = readDb();
  return [...(db.items?.[userId] || [])];
}

function getItem(userId, itemId) {
  return listItems(userId).find((item) => item.id === itemId) || null;
}

function addItem(userId, item) {
  migrateUserData(userId);
  const snap = itemSnapshot(item);
  if (!snap.description) {
    const err = new Error('ITEM_NAME');
    throw err;
  }
  const db = readDb();
  ensureUserCollections(db, userId);
  const saved = {
    ...snap,
    id: item.id || crypto.randomUUID(),
    createdAt: item.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  db.items[userId] = [saved, ...(db.items[userId] || []).filter((row) => row.id !== saved.id)];
  writeDb(db);
  return { item: saved };
}

function updateItem(userId, itemId, partial) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.items[userId] || [];
  const idx = list.findIndex((item) => item.id === itemId);
  if (idx === -1) return null;
  const snap = itemSnapshot({ ...list[idx], ...partial });
  if (!snap.description) {
    const err = new Error('ITEM_NAME');
    throw err;
  }
  list[idx] = { ...list[idx], ...snap, id: itemId, createdAt: list[idx].createdAt, updatedAt: nowIso() };
  db.items[userId] = list;
  writeDb(db);
  return list[idx];
}

function deleteItem(userId, itemId) {
  migrateUserData(userId);
  const db = readDb();
  const list = db.items[userId] || [];
  const next = list.filter((item) => item.id !== itemId);
  if (next.length === list.length) return false;
  db.items[userId] = next;
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
    items: listItems(userId),
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
  db.items[userId] = Array.isArray(data.items) ? data.items : [];
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
  if (collection === 'items') {
    if (op === 'delete') {
      deleteItem(userId, id);
      return { ok: true, id };
    }
    const current = getItem(userId, id);
    const hit = conflictIfNeeded(current);
    if (hit) return hit;
    if (current) return { item: updateItem(userId, id, body) };
    return addItem(userId, { ...body, id });
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
    items: listItems(userId),
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
  sessionUser,
  listTeam,
  addMember,
  setMemberRole,
  removeMember,
  createInvite,
  revokeInvite,
  findInvite,
  acceptInvite,
  isPremiumUser,
  initStore,
  flushStore,
  storeHealth,
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
  listItems,
  getItem,
  addItem,
  updateItem,
  deleteItem,
  addPayment,
  voidPayment,
  issueInvoice,
  cancelInvoice,
  correctInvoice,
  importInvoices,
  markInvoicesPaid,
  shareInvoice,
  sharedInvoice,
  sharedInvoiceOwner,
  getRecurring,
  saveRecurring,
  automationOwners,
  mutateInvoiceDelivery,
  findRecurringInvoice,
  INVOICE_EVENTS_MAX,
  personalMailKey,
  getMailSettings,
  saveMailSettings,
  getFinance,
  financeOwners,
  getMercury,
  mercuryOwners,
  saveMercury,
  saveFinance,
  recordInvoiceEmail,
  recordInvoiceReminder,
  reconcilePayments,
  exportBackup,
  restoreBackup,
  applySync,
  snapshotForUser,
};
