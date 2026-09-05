const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function emptyDb() {
  return {
    users: [],
    profiles: {},
    invoices: {},
    obligations: {},
    clients: {},
    syncOps: {},
    migrations: {},
    passwordResets: [],
  };
}

let pool = null;

function hasPostgres() {
  return Boolean(process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim());
}

async function initPersist() {
  if (!hasPostgres()) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (process.env.RENDER) {
      console.warn(
        '[store] Running on Render without DATABASE_URL. Accounts are wiped on every restart. Add a Postgres database and set DATABASE_URL.',
      );
    } else {
      console.log(`[store] file persistence at ${DB_PATH}`);
    }
    return { mode: 'file', path: DB_PATH };
  }

  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
    max: 2,
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('[store] postgres persistence enabled');
  return { mode: 'postgres' };
}

function readFileDb() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch {
    return emptyDb();
  }
}

function writeFileDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

async function loadDb() {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (rows[0] && rows[0].data) {
      return { ...emptyDb(), ...rows[0].data };
    }
    const fromFile = readFileDb();
    if ((fromFile.users || []).length) {
      await saveDb(fromFile);
    }
    return fromFile;
  }
  return readFileDb();
}

async function saveDb(db) {
  if (pool) {
    await pool.query(
      `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(db)],
    );
    return;
  }
  writeFileDb(db);
}

module.exports = {
  emptyDb,
  initPersist,
  loadDb,
  saveDb,
  hasPostgres,
  DATA_DIR,
  DB_PATH,
};
