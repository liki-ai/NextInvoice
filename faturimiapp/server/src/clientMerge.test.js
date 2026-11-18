// Merging clients that are the same, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-merge-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'merge-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'merge-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

let owner;

test.before(async () => {
  await store.initStore();
  owner = await store.createUser({ email: 'merge@tretek.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  store.setUserPlan(owner.id, 'premium');
});

test('duplicates become one client that keeps every invoice, plan, contract and project', () => {
  const keep = store.addClient(owner.id, { fullName: 'Dogana e Kosovës', address: 'Lagjja Kalabri' }).client;
  const plain = store.addClient(owner.id, { fullName: 'Dogana e Kosoves', businessId: '810' }).client;
  const other = store.addClient(owner.id, { fullName: 'Dogana e Kosovës', email: 'info@dogana.test', phone: '044' }).client;
  const stranger = store.addClient(owner.id, { fullName: 'Tjetër' }).client;
  const line = [{ description: 'Shërbim', quantity: 1, unitCost: 100 }];
  const a = store.addInvoice(owner.id, { client: keep, clientId: keep.id, items: line, date: '2026-11-01' });
  const b = store.addInvoice(owner.id, { client: plain, clientId: plain.id, items: line, date: '2026-11-02' });
  const c = store.issueInvoice(owner.id, store.addInvoice(owner.id, { client: other, clientId: other.id, items: line, date: '2026-11-03' }).id);
  const d = store.addInvoice(owner.id, { client: stranger, clientId: stranger.id, items: line, date: '2026-11-04' });
  store.saveRecurring(owner.id, { plans: [{ id: 'p1', clientId: other.id }] });
  store.saveContracts(owner.id, [{ id: 'k1', clientId: plain.id }]);
  store.saveFinance(owner.id, { timesheet: { projects: { Dogana: { clientId: other.id } } } });

  const result = store.mergeClients(owner.id, keep.id, [plain.id, other.id]);
  assert.equal(result.merged, 2);
  assert.equal(result.invoices, 2);

  const clients = store.listClients(owner.id);
  assert.deepEqual(clients.map((item) => item.id).sort(), [keep.id, stranger.id].sort());
  const kept = store.getClient(owner.id, keep.id);
  assert.equal(kept.address, 'Lagjja Kalabri', 'its own details stay');
  assert.equal(kept.businessId, '810', 'blank details are taken from the others');
  assert.equal(kept.email, 'info@dogana.test');

  for (const inv of [a, b, c]) assert.equal(store.getInvoice(owner.id, inv.id).clientId, keep.id);
  const issued = store.getInvoice(owner.id, c.id);
  assert.equal(issued.lifecycle, 'issued');
  assert.equal(issued.clientSnapshot.email, 'info@dogana.test', 'an issued invoice still shows the client as it was');
  assert.equal(store.getInvoice(owner.id, d.id).clientId, stranger.id, 'other clients are left alone');
  assert.equal(store.getRecurring(owner.id).plans[0].clientId, keep.id);
  assert.equal(store.getContracts(owner.id)[0].clientId, keep.id);
  assert.equal(store.getFinance(owner.id).timesheet.projects.Dogana.clientId, keep.id);
});

test('merging needs the kept client and every other one to exist', () => {
  const one = store.addClient(owner.id, { fullName: 'Alfa' }).client;
  assert.throws(() => store.mergeClients(owner.id, 'missing', [one.id]), /CLIENT_NOT_FOUND/);
  assert.throws(() => store.mergeClients(owner.id, one.id, ['missing']), /CLIENT_NOT_FOUND/);
  assert.throws(() => store.mergeClients(owner.id, one.id, [one.id]), /CLIENT_NOT_FOUND/);
  assert.ok(store.getClient(owner.id, one.id));
});
