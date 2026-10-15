const crypto = require('crypto');
const { getMercury, mercuryOwners, saveMercury } = require('../store');
const { encryptSecret, decryptSecret } = require('../mailer');

// The company's account at Mercury, the US bank, read with a read-only API token: its accounts,
// balances and every transaction, kept up to date by a check every ten minutes and, when the company
// has registered a webhook at Mercury, the moment a transaction happens. A webhook is only a nudge:
// whatever it says, the transactions are read again from the API, so a forged one changes nothing.

const API = 'https://api.mercury.com/api/v1';
const SYNC_EVERY_MS = 10 * 60 * 1000;
const PAGE = 500;
const KEPT_STATUSES = new Set(['pending', 'sent']);

function fail(code, detail) {
  const err = new Error(code);
  err.mercuryCode = code;
  if (detail) err.detail = String(detail).slice(0, 300);
  return err;
}

/** A local fake of the API for tests, only outside production. */
function apiBase() {
  const local = process.env.MERCURY_DEV_API;
  if (local && process.env.NODE_ENV !== 'production' && /^http:\/\/127\.0\.0\.1:\d+$/.test(local)) return `${local}/api/v1`;
  return API;
}

function nowIso() {
  return new Date().toISOString();
}

function blank() {
  return {
    token: null,
    webhookSecret: null,
    // The part of the webhook address that names this company; it carries no rights of its own.
    webhookKey: crypto.randomBytes(18).toString('hex'),
    since: `${new Date().getFullYear() - 1}-01-01`,
    accounts: [],
    transactions: {},
    rates: {},
    lastSyncAt: null,
    lastWebhookAt: null,
    lastError: null,
    lastDetail: null,
  };
}

function load(ownerId) {
  const saved = getMercury(ownerId);
  return saved ? { ...blank(), ...saved, transactions: saved.transactions || {}, rates: saved.rates || {}, accounts: saved.accounts || [] } : null;
}

function mutate(ownerId, change) {
  const current = load(ownerId) || blank();
  const result = change(current);
  saveMercury(ownerId, current);
  return result;
}

async function call(token, path) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${token.startsWith('secret-token:') ? token : `secret-token:${token}`}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw fail('MERCURY_CONNECT', err && err.message);
  }
  if (response.status === 401 || response.status === 403) throw fail('MERCURY_AUTH', await response.text().catch(() => ''));
  if (!response.ok) throw fail('MERCURY_FAILED', `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`);
  return response.json();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function account(raw) {
  return {
    id: String(raw.id),
    name: String(raw.nickname || raw.name || raw.legalBusinessName || 'Mercury').slice(0, 120),
    kind: String(raw.kind || raw.type || ''),
    status: String(raw.status || ''),
    last4: String(raw.accountNumber || '').slice(-4),
    currentBalance: money(raw.currentBalance),
    availableBalance: money(raw.availableBalance),
    company: String(raw.legalBusinessName || '').slice(0, 120),
  };
}

/** What the reports need of a transaction, and nothing more. Out is negative. */
function transaction(raw, accountId) {
  const category = (raw.categoryData && raw.categoryData.name) || raw.mercuryCategory || '';
  return {
    id: String(raw.id),
    accountId,
    amount: money(raw.amount),
    status: String(raw.status || ''),
    kind: String(raw.kind || ''),
    date: String(raw.postedAt || raw.createdAt || '').slice(0, 10),
    createdAt: String(raw.createdAt || ''),
    counterparty: String(raw.counterpartyNickname || raw.counterpartyName || (raw.merchant && raw.merchant.name) || '').slice(0, 160),
    description: String(raw.bankDescription || '').slice(0, 240),
    note: String(raw.note || raw.externalMemo || '').slice(0, 240),
    category: String(category).slice(0, 80),
    card: Boolean(raw.cardId),
    link: /^https:\/\/app\.mercury\.com\//.test(String(raw.dashboardLink || '')) ? String(raw.dashboardLink) : '',
  };
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** ECB rates from US dollars to euros for every day in the range, from the free Frankfurter service. */
async function fetchRates(from, to) {
  for (const base of ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app']) {
    try {
      const response = await fetch(`${base}/${from}..${to}?from=USD&to=EUR`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) continue;
      const data = await response.json();
      const rates = {};
      for (const [day, value] of Object.entries(data.rates || {})) if (value && Number(value.EUR) > 0) rates[day] = Number(value.EUR);
      if (Object.keys(rates).length) return rates;
    } catch {
      // try the other address
    }
  }
  return {};
}

const running = new Map();

/**
 * Reads the accounts and their transactions from Mercury and keeps them. The first time from the
 * chosen start; after that the last few weeks again, since pending transactions settle later.
 */
async function sync(ownerId) {
  if (running.has(ownerId)) return running.get(ownerId);
  const job = (async () => {
    const saved = load(ownerId);
    if (!saved || !saved.token) return;
    const token = decryptSecret(saved.token);
    try {
      if (!token) throw fail('MERCURY_AUTH');
      const { accounts = [] } = await call(token, '/accounts');
      const first = !saved.lastSyncAt;
      const start = first ? saved.since : isoDay(new Date(Date.now() - 45 * 86400000));
      const end = isoDay(new Date(Date.now() + 86400000));
      const found = {};
      for (const raw of accounts) {
        for (let offset = 0; offset < 50000; offset += PAGE) {
          const page = await call(token, `/account/${encodeURIComponent(raw.id)}/transactions?start=${start}&end=${end}&limit=${PAGE}&offset=${offset}&order=asc`);
          const list = Array.isArray(page.transactions) ? page.transactions : [];
          for (const item of list) found[String(item.id)] = transaction(item, String(raw.id));
          if (list.length < PAGE) break;
        }
      }
      // Dollars become euros at the ECB rate of the day for the parts of the app that count in euros.
      const days = Object.values({ ...saved.transactions, ...found }).map((item) => item.date).filter(Boolean).sort();
      // There are no rates on weekends and holidays; a few days' gap at either end is not a gap.
      const known = Object.keys(saved.rates).sort();
      const shift = (day, by) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000));
      const missing = days.length && (!known.length || known[0] > shift(days[0], 4) || known[known.length - 1] < shift(isoDay(new Date()), -4));
      const rates = missing ? await fetchRates(days[0] < saved.since ? days[0] : saved.since, isoDay(new Date())) : {};
      mutate(ownerId, (current) => {
        current.accounts = accounts.map(account);
        for (const [id, item] of Object.entries(found)) {
          // Failed, cancelled and returned transfers never moved money; they are dropped.
          if (KEPT_STATUSES.has(item.status)) current.transactions[id] = item;
          else delete current.transactions[id];
        }
        current.rates = { ...current.rates, ...rates };
        current.lastSyncAt = nowIso();
        current.lastError = null;
        current.lastDetail = null;
      });
    } catch (err) {
      console.error('[mercury] sync failed', ownerId, err && (err.detail || err.message));
      mutate(ownerId, (current) => {
        current.lastError = String((err && (err.mercuryCode || err.message)) || 'MERCURY_FAILED');
        current.lastDetail = err && err.detail ? String(err.detail) : null;
        current.lastSyncAt = current.lastSyncAt || null;
      });
    }
  })().finally(() => running.delete(ownerId));
  running.set(ownerId, job);
  return job;
}

/** The rate for a day: that day's, or the last one before it (no rates on weekends and holidays). */
function rateOn(rates, day) {
  if (rates[day]) return rates[day];
  const earlier = Object.keys(rates).filter((item) => item <= day).sort().pop();
  return earlier ? rates[earlier] : Object.values(rates)[0] || null;
}

function publicView(ownerId) {
  const saved = load(ownerId);
  if (!saved || !saved.token) return { connected: false, since: (saved && saved.since) || blank().since };
  const transactions = Object.values(saved.transactions)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const rate = rateOn(saved.rates, item.date);
      return { ...item, eur: rate ? Math.round(item.amount * rate * 100) / 100 : null };
    });
  return {
    connected: true,
    since: saved.since,
    accounts: saved.accounts,
    transactions,
    lastSyncAt: saved.lastSyncAt,
    lastWebhookAt: saved.lastWebhookAt,
    lastError: saved.lastError,
    lastDetail: saved.lastDetail,
    syncing: running.has(ownerId),
    webhook: { configured: Boolean(saved.webhookSecret), path: `/api/mercury/webhook/${saved.webhookKey}` },
  };
}

/** Saves the token after Mercury has accepted it; a blank token keeps the saved one. */
async function connect(ownerId, body) {
  const current = load(ownerId) || blank();
  const token = String(body.token || '').trim();
  const since = String(body.since || current.since || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw fail('MERCURY_SINCE');
  if (token) {
    if (token.length > 400 || /\s/.test(token)) throw fail('MERCURY_AUTH');
    await call(token, '/accounts');
  } else if (!current.token) {
    throw fail('MERCURY_TOKEN');
  }
  const secret = typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : null;
  const restart = since !== current.since;
  mutate(ownerId, (saved) => {
    if (token) saved.token = encryptSecret(token);
    if (secret !== null) saved.webhookSecret = secret ? encryptSecret(secret.slice(0, 400)) : null;
    saved.since = since;
    // An earlier start date reads everything again from there.
    if (restart || token) saved.lastSyncAt = null;
  });
  sync(ownerId).catch(() => {});
}

function disconnect(ownerId) {
  saveMercury(ownerId, null);
}

/**
 * A delivery from Mercury: checked against the company's signing secret (the HMAC of
 * "<timestamp>.<raw body>"), no older than five minutes, then answered by reading the API again.
 */
function webhook(key, rawBody, signatureHeader) {
  const owner = mercuryOwners().find((id) => {
    const saved = getMercury(id);
    return saved && saved.webhookKey && saved.webhookKey.length === String(key).length && crypto.timingSafeEqual(Buffer.from(saved.webhookKey), Buffer.from(String(key)));
  });
  if (!owner) return 404;
  const saved = load(owner);
  const secret = saved && saved.webhookSecret ? decryptSecret(saved.webhookSecret) : '';
  if (!secret) return 401;
  const parts = Object.fromEntries(
    String(signatureHeader || '')
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length >= 2)
      .map(([name, ...rest]) => [name, rest.join('=')]),
  );
  const stamp = Number(parts.t);
  if (!parts.t || !parts.v1 || !Number.isFinite(stamp)) return 401;
  const seconds = stamp > 1e12 ? stamp / 1000 : stamp;
  if (Math.abs(Date.now() / 1000 - seconds) > 300) return 401;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.`).update(rawBody).digest('hex');
  const given = String(parts.v1);
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return 401;
  mutate(owner, (current) => {
    current.lastWebhookAt = nowIso();
  });
  // Several transactions often arrive together; one read a few seconds later covers them all.
  setTimeout(() => sync(owner).catch(() => {}), 3000).unref();
  return 200;
}

let timer = null;

function startMercurySync() {
  if (timer || process.env.MERCURY_SYNC === 'off') return;
  const round = async () => {
    for (const ownerId of mercuryOwners()) {
      const saved = load(ownerId);
      if (saved && saved.token) await sync(ownerId).catch(() => {});
    }
  };
  setTimeout(() => round().catch(() => {}), 90 * 1000).unref();
  timer = setInterval(() => round().catch(() => {}), SYNC_EVERY_MS);
  timer.unref();
}

module.exports = { connect, disconnect, publicView, startMercurySync, sync, webhook };
