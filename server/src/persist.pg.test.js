// Storage tests against a real Postgres. Run with:
//   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/postgres npm run test:pg
// Each run works in its own throwaway database and drops it afterwards.
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ADMIN_URL = process.env.TEST_DATABASE_URL

describe('postgres storage', { skip: ADMIN_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  const { Client } = require('pg')
  const dbName = `nextinvoice_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const url = () => {
    const parsed = new URL(ADMIN_URL)
    parsed.pathname = `/${dbName}`
    return parsed.toString()
  }
  let persist
  let store
  let sql

  async function reopen() {
    await store.flushStore()
    await persist.closePersist()
    await store.initStore()
  }

  before(async () => {
    const admin = new Client({ connectionString: ADMIN_URL })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${dbName}`)
    await admin.end()
    // Nothing may leak in from a local db.json.
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-test-'))
    process.env.DATABASE_URL = url()
    delete process.env.RENDER
    persist = require('./persist')
    store = require('./store')
    sql = new Client({ connectionString: url() })
    await sql.connect()
  })

  after(async () => {
    await store.flushStore()
    await persist.closePersist()
    await sql.end()
    const admin = new Client({ connectionString: ADMIN_URL })
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
    await admin.end()
  })

  it('starts empty and keeps an account, its profile and its invoices across a restart', async () => {
    await store.initStore()
    assert.equal(store.findUserByEmail('owner@example.test'), null)

    const user = await store.createUser({ email: 'Owner@Example.test', passwordHash: 'hash', language: 'sq', industry: 'services' })
    store.updateProfile(user.id, { companyName: 'Tretek', logoData: 'data:image/png;base64,AAAA', defaultTaxRate: 18 })
    const invoice = store.addInvoice(user.id, {
      number: '202610-001',
      date: '13.10.2026',
      client: { fullName: 'FINCA' },
      items: [{ id: '1', description: 'Punë', quantity: 2, unitPrice: 100 }],
      discount: 0,
      taxRate: 18,
    })
    store.addPayment(user.id, 'invoice', invoice.id, { amount: 36, date: '13.10.2026' })

    await reopen()

    const again = store.findUserByEmail('owner@example.test')
    assert.equal(again.id, user.id)
    assert.equal(again.passwordHash, 'hash')
    assert.equal(store.getProfile(user.id).companyName, 'Tretek')
    assert.equal(store.getProfile(user.id).logoData, 'data:image/png;base64,AAAA')
    const saved = store.getInvoice(user.id, invoice.id)
    assert.equal(saved.total, 236)
    assert.equal(saved.amountDue, 200)
    assert.equal(store.storeHealth().persist, 'postgres')
    assert.equal(store.storeHealth().durable, true)
  })

  it('writes only the documents that changed', async () => {
    const first = await store.createUser({ email: 'a@example.test', passwordHash: 'h' })
    const second = await store.createUser({ email: 'b@example.test', passwordHash: 'h' })
    store.addClient(second.id, { fullName: 'Someone' })
    await store.flushStore()
    const stamp = async (key) => (await sql.query('SELECT updated_at FROM app_documents WHERE key = $1', [key])).rows[0].updated_at.getTime()
    const untouched = await stamp(`clients/${second.id}`)
    const users = await stamp('users')

    store.addClient(first.id, { fullName: 'New client' })
    await store.flushStore()

    assert.equal(await stamp(`clients/${second.id}`), untouched, "another user's clients were rewritten")
    assert.equal(await stamp('users'), users, 'the user list was rewritten')
    const { rows } = await sql.query('SELECT data FROM app_documents WHERE key = $1', [`clients/${first.id}`])
    assert.equal(rows[0].data[0].fullName, 'New client')
  })

  it('imports a batch of invoices in one go and finds them after a restart', async () => {
    const user = await store.createUser({ email: 'import@example.test', passwordHash: 'h' })
    store.setUserPlan(user.id, 'premium')
    const result = store.importInvoices(user.id, {
      clients: [{ key: 'k', fullName: 'MINISTRIA', businessId: '123', vatNumber: '330', fiscalNumber: '600' }],
      invoices: Array.from({ length: 150 }, (_, i) => ({
        number: `202601-${String(i + 1).padStart(3, '0')}`,
        date: '05.01.2026',
        clientKey: 'k',
        taxRate: 0.18,
        items: [{ description: `Rreshti ${i}`, quantity: 1, unitPrice: 42.37288 }],
      })),
    })
    assert.equal(result.created, 150)
    await reopen()
    assert.equal(store.listInvoices(user.id).length, 150)
    assert.equal(store.listClients(user.id)[0].vatNumber, '330')
    assert.equal(store.findUserByEmail('import@example.test').plan, 'premium')
  })

  it('keeps trying after a failed write and reports it meanwhile', async () => {
    const user = await store.createUser({ email: 'retry@example.test', passwordHash: 'h' })
    await store.flushStore()
    await sql.query('ALTER TABLE app_documents RENAME TO app_documents_away')

    store.addClient(user.id, { fullName: 'Written while the database was unreachable' })
    const failed = await store.flushStore()
    assert.equal(failed.ok, false)
    assert.equal(store.storeHealth().durable, false)
    assert.match(store.storeHealth().saveError, /app_documents/)

    await sql.query('ALTER TABLE app_documents_away RENAME TO app_documents')
    for (let i = 0; i < 40 && !store.storeHealth().durable; i++) await new Promise((resolve) => setTimeout(resolve, 250))
    assert.equal(store.storeHealth().durable, true, 'the write was not retried')
    const { rows } = await sql.query('SELECT data FROM app_documents WHERE key = $1', [`clients/${user.id}`])
    assert.equal(rows[0].data[0].fullName, 'Written while the database was unreachable')
  })

  it('strips characters Postgres cannot store instead of failing the save', async () => {
    const user = await store.createUser({ email: 'nul@example.test', passwordHash: 'h' })
    store.addClient(user.id, { fullName: 'Bad\u0000Name' })
    const state = await store.flushStore()
    assert.equal(state.ok, true)
    await reopen()
    assert.equal(store.listClients(user.id)[0].fullName, 'BadName')
  })

  it('takes over data left in the old single-row layout', async () => {
    await store.flushStore()
    await persist.closePersist()
    await sql.query('DELETE FROM app_documents')
    await sql.query('CREATE TABLE app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL)')
    const legacy = { users: [{ id: 'u1', email: 'old@example.test', passwordHash: 'h', plan: 'free' }], profiles: { u1: { companyName: 'Old Co' } }, invoices: { u1: [] } }
    await sql.query('INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)', [JSON.stringify(legacy)])

    await store.initStore()
    assert.equal(store.findUserByEmail('old@example.test').id, 'u1')
    await reopen()
    assert.equal(store.getProfile('u1').companyName, 'Old Co')
    const { rows } = await sql.query(`SELECT key FROM app_documents ORDER BY key`)
    assert.ok(rows.some((row) => row.key === 'profiles/u1'))
  })
})

describe('storage on a host with a throwaway disk', () => {
  it('refuses to start without a database instead of losing accounts on the next deploy', async () => {
    const saved = { url: process.env.DATABASE_URL, render: process.env.RENDER, allow: process.env.ALLOW_EPHEMERAL_STORE }
    delete process.env.DATABASE_URL
    delete process.env.ALLOW_EPHEMERAL_STORE
    process.env.RENDER = 'true'
    try {
      await assert.rejects(() => require('./persist').initPersist(), /DATABASE_URL is not set/)
    } finally {
      if (saved.url === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = saved.url
      if (saved.render === undefined) delete process.env.RENDER
      else process.env.RENDER = saved.render
      if (saved.allow !== undefined) process.env.ALLOW_EPHEMERAL_STORE = saved.allow
    }
  })
})
