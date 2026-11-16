// The phone's sync, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-sync-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sync-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sync-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

let owner;
const change = (body, extra = {}) => ({ opId: `op-${Math.random()}`, changes: [{ collection: 'invoices', op: 'upsert', id: 'phone-1', body, ...extra }] });

test.before(async () => {
  await store.initStore();
  owner = await store.createUser({ email: 'owner@sync.test', passwordHash: 'x' });
  store.setUserPlan(owner.id, 'premium');
});

test('a "sent" or "paid" change for an invoice the account does not have makes no blank invoice', () => {
  assert.throws(() => store.applySync(owner.id, change({ sent: true, sentAt: '2026-11-13T10:00:00.000Z', status: 'sent' })), /RECORD_GONE/);
  assert.throws(
    () => store.applySync(owner.id, change({ client: { fullName: 'Ariana Grande' }, items: [] }, { baseUpdatedAt: '2026-09-07T07:55:04.829Z' })),
    /RECORD_GONE/,
  );
  assert.equal(store.listInvoices(owner.id).length, 0);
});

test('a whole new invoice from the phone is still added, also a draft with no lines yet', () => {
  store.applySync(owner.id, change({ client: { fullName: 'Client' }, items: [], lifecycle: 'draft', number: 'DRAFT-1' }));
  assert.equal(store.listInvoices(owner.id).length, 1);
  // An edit to it goes through.
  const saved = store.getInvoice(owner.id, 'phone-1');
  store.applySync(owner.id, change({ notes: 'later' }, { baseUpdatedAt: saved.updatedAt }));
  assert.equal(store.getInvoice(owner.id, 'phone-1').notes, 'later');
});

test('an edit to a client that is gone does not bring it back blank', () => {
  assert.throws(
    () => store.applySync(owner.id, { opId: 'c1', changes: [{ collection: 'clients', op: 'upsert', id: 'gone', body: { phone: '1' }, baseUpdatedAt: '2026-10-01T00:00:00.000Z' }] }),
    /RECORD_GONE/,
  );
  store.applySync(owner.id, { opId: 'c2', changes: [{ collection: 'clients', op: 'upsert', id: 'new', body: { fullName: 'New Client' } }] });
  assert.ok(store.getClient(owner.id, 'new'));
});
