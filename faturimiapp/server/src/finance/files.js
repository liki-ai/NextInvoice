const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pgPool, DATA_DIR } = require('../persist');

// The files behind the finance documents (tax slips, payroll lists, statements). They are kept out
// of the in-memory database, which is rewritten on every change: in Postgres in a table of their
// own, read only when someone downloads one, and in a folder next to db.json without a database.

const FILE_DIR = path.join(DATA_DIR, 'finance-files');
let tableReady = null;

function ensureTable(pool) {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS finance_files (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          data BYTEA NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

function safeId(id) {
  return /^[a-f0-9-]{36}$/.test(String(id)) ? String(id) : null;
}

/** Keeps one file and returns its id. */
async function putFile(owner, { name, mime, data }) {
  const id = crypto.randomUUID();
  const pool = pgPool();
  if (pool) {
    await ensureTable(pool);
    await pool.query('INSERT INTO finance_files (id, owner, name, mime, size, data) VALUES ($1, $2, $3, $4, $5, $6)', [id, owner, name, mime, data.length, data]);
  } else {
    fs.mkdirSync(FILE_DIR, { recursive: true });
    fs.writeFileSync(path.join(FILE_DIR, id), data);
  }
  return id;
}

/** The file's bytes, only when it belongs to `owner`; null otherwise. */
async function getFile(owner, id) {
  const key = safeId(id);
  if (!key) return null;
  const pool = pgPool();
  if (pool) {
    await ensureTable(pool);
    const { rows } = await pool.query('SELECT data FROM finance_files WHERE id = $1 AND owner = $2', [key, owner]);
    return rows[0] ? rows[0].data : null;
  }
  try {
    return fs.readFileSync(path.join(FILE_DIR, key));
  } catch {
    return null;
  }
}

async function removeFile(owner, id) {
  const key = safeId(id);
  if (!key) return;
  const pool = pgPool();
  if (pool) {
    await ensureTable(pool);
    await pool.query('DELETE FROM finance_files WHERE id = $1 AND owner = $2', [key, owner]);
    return;
  }
  fs.rmSync(path.join(FILE_DIR, key), { force: true });
}

module.exports = { putFile, getFile, removeFile };
