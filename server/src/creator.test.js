// Who wrote an invoice, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-creator-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'creator-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'creator-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

test('an invoice shows who wrote it, from the web or a phone, and nobody can change it', async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'owner@creator.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  store.setUserPlan(owner.id, 'premium');
  const member = await store.addMember(owner.id, { email: 'member@creator.test', passwordHash: 'x', role: 'member' });
  const client = store.addClient(owner.id, { fullName: 'FINCA' }).client;
  const body = { client, clientId: client.id, items: [{ description: 'Kontabilitet', quantity: 1, unitPrice: 84.75 }], date: '2026-11-10' };

  const web = store.addInvoice(owner.id, body, { createdBy: member.id, createdByEmail: member.email });
  assert.equal(web.createdByEmail, 'member@creator.test');
  assert.equal(store.getInvoice(owner.id, web.id).createdByEmail, 'member@creator.test');

  const synced = store.applySync(owner.id, { opId: 'op-1', changes: [{ collection: 'invoices', op: 'upsert', id: 'phone-1', body: { ...body, createdBy: 'someone-else' } }] }, { createdBy: owner.id, createdByEmail: owner.email });
  assert.equal(synced.results[0].invoice.createdByEmail, 'owner@creator.test');
  assert.equal(store.getInvoice(owner.id, 'phone-1').createdBy, owner.id);

  store.updateInvoice(owner.id, web.id, { createdBy: owner.id, notes: 'x' });
  assert.equal(store.getInvoice(owner.id, web.id).createdByEmail, 'member@creator.test');

  const unknown = store.addInvoice(owner.id, body);
  assert.equal(unknown.createdByEmail, '');
});
