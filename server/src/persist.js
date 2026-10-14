const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// In Postgres each of these collections is stored as one document per user, so saving one
// person's invoice rewrites that person's invoices and nothing else. Everything else in the
// database object (the user list, password resets) is one document each.
const PER_USER = ['profiles', 'invoices', 'obligations', 'clients', 'items', 'syncOps', 'migrations', 'mail', 'invites', 'finance', 'recurring'];

function emptyDb() {
  return {
    users: [],
    profiles: {},
    invoices: {},
    obligations: {},
    clients: {},
    items: {},
    syncOps: {},
    migrations: {},
    mail: {},
    invites: {},
    finance: {},
    recurring: {},
    passwordResets: [],
  };
}

let pool = null;
/** What Postgres holds right now: document key → its JSON text. A save sends only the difference. */
let stored = new Map();

// A database on this machine, or on the same private Docker network (sslmode=disable in the
// address), is reached without TLS; a hosted one always with it.
function sslFor(url) {
  if (/localhost|127\.0\.0\.1/.test(url) || /[?&]sslmode=disable(&|$)/.test(url)) return false;
  return { rejectUnauthorized: false };
}

/**
 * The database's address. Its password can sit in a file of its own (DATABASE_PASSWORD_FILE, a
 * Docker secret) instead of in the address, so it shows in no setting of the running container.
 */
function databaseUrl() {
  const url = String(process.env.DATABASE_URL || '').trim();
  const file = String(process.env.DATABASE_PASSWORD_FILE || '').trim();
  if (!url || !file) return url;
  const address = new URL(url);
  // Encoded here: the URL setter leaves a "%" as it is, and the driver decodes what it reads.
  address.password = encodeURIComponent(fs.readFileSync(file, 'utf8').trim());
  return address.toString();
}

function hasPostgres() {
  return Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
}

async function initPersist() {
  if (!hasPostgres()) {
    // On Render the disk is rebuilt on every deploy, so a file there loses every account.
    // Starting anyway is how that went unnoticed; refuse instead, and the previous deploy stays live.
    if (process.env.RENDER && process.env.ALLOW_EPHEMERAL_STORE !== '1') {
      throw new Error('DATABASE_URL is not set. On Render the local disk is wiped on every deploy; add a Postgres database and set DATABASE_URL.');
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[store] file persistence at ${DB_PATH}`);
    return { mode: 'file', path: DB_PATH };
  }

  const { Pool } = require('pg');
  const url = databaseUrl();
  pool = new Pool({
    connectionString: url,
    ssl: sslFor(url),
    max: 2,
  });
  // A dropped idle connection must not crash the process; the next query opens a new one.
  pool.on('error', (err) => console.error('[store] postgres connection error', err.message));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('[store] postgres persistence enabled');
  return { mode: 'postgres' };
}

/** The database connection, for what is kept outside the in-memory documents (files); null without Postgres. */
function pgPool() {
  return pool;
}

async function closePersist() {
  const closing = pool;
  pool = null;
  stored = new Map();
  if (closing) await closing.end();
}

function readFileDb() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch {
    return emptyDb();
  }
}

// JSONB cannot hold a NUL character; a stray one in pasted text would fail the whole save.
function jsonText(value) {
  return JSON.stringify(value, (_key, item) => (typeof item === 'string' && item.includes('\u0000') ? item.replace(/\u0000/g, '') : item));
}

/** The database object as documents: "users", "invoices/<userId>", … → JSON text. */
function toDocuments(db) {
  const docs = new Map();
  for (const [name, value] of Object.entries(db || {})) {
    if (value === undefined) continue;
    if (PER_USER.includes(name)) {
      for (const [userId, userValue] of Object.entries(value || {})) {
        if (userValue !== undefined) docs.set(`${name}/${userId}`, jsonText(userValue));
      }
    } else {
      docs.set(name, jsonText(value));
    }
  }
  return docs;
}

function fromDocuments(rows) {
  const db = emptyDb();
  for (const { key, data } of rows) {
    const slash = key.indexOf('/');
    if (slash === -1) {
      db[key] = data;
      continue;
    }
    const name = key.slice(0, slash);
    if (!db[name] || typeof db[name] !== 'object') db[name] = {};
    db[name][key.slice(slash + 1)] = data;
  }
  return db;
}

async function legacyState() {
  // Before app_documents the whole database was one row in app_state.
  const { rows } = await pool.query(`SELECT to_regclass('app_state') AS found`);
  if (!rows[0] || !rows[0].found) return null;
  const legacy = await pool.query('SELECT data FROM app_state WHERE id = 1');
  return legacy.rows[0] && legacy.rows[0].data ? { ...emptyDb(), ...legacy.rows[0].data } : null;
}

async function loadDb() {
  if (!pool) return readFileDb();
  const { rows } = await pool.query('SELECT key, data FROM app_documents');
  if (rows.length > 0) {
    const db = fromDocuments(rows);
    stored = toDocuments(db);
    return db;
  }
  // First start on an empty database: carry over whatever an earlier setup left behind.
  stored = new Map();
  const previous = (await legacyState()) || readFileDb();
  if ((previous.users || []).length > 0) await saveDb(previous);
  return previous;
}

/**
 * Freezes the database as it is now, ready to be written. Done synchronously so a save
 * queued behind others still writes the state it was asked to, not a later one.
 */
function serialize(db) {
  return pool ? { documents: toDocuments(db) } : { file: JSON.stringify(db, null, 2) };
}

async function saveSerialized(snapshot) {
  if (!pool) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, snapshot.file);
    fs.renameSync(tmp, DB_PATH);
    return { written: 1, removed: 0 };
  }
  const next = snapshot.documents;
  const changed = [...next].filter(([key, text]) => stored.get(key) !== text);
  const removed = [...stored.keys()].filter((key) => !next.has(key));
  if (changed.length === 0 && removed.length === 0) return { written: 0, removed: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, text] of changed) {
      await client.query(
        `INSERT INTO app_documents (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [key, text],
      );
    }
    if (removed.length > 0) await client.query('DELETE FROM app_documents WHERE key = ANY($1)', [removed]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  stored = next;
  return { written: changed.length, removed: removed.length };
}

function saveDb(db) {
  return saveSerialized(serialize(db));
}

module.exports = {
  emptyDb,
  initPersist,
  closePersist,
  loadDb,
  saveDb,
  serialize,
  saveSerialized,
  hasPostgres,
  databaseUrl,
  pgPool,
  DATA_DIR,
  DB_PATH,
};
