// A payment proof on issued and cancelled invoices, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-proof-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'proof-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'proof-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

const pdf = { proofName: 'pagesa.pdf', proofMime: 'application/pdf', proofData: 'data:application/pdf;base64,JVBERi0xLjQK' };

test('a PDF proof can be attached to an issued invoice and to a cancelled one, nothing else changes', async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'proof@tretek.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  store.setUserPlan(owner.id, 'premium');
  const client = store.addClient(owner.id, { fullName: 'NZG Group SH.P.K.' }).client;
  const make = () => store.issueInvoice(owner.id, store.addInvoice(owner.id, { client, clientId: client.id, items: [{ description: 'Taxon', quantity: 1, unitCost: 58.47 }], date: '2026-11-18' }).id);

  const issued = make();
  assert.equal(store.updateInvoice(owner.id, issued.id, pdf).proofName, 'pagesa.pdf');

  const cancelled = store.cancelInvoice(owner.id, make().id, 'Hetekthimi i shitjes');
  const saved = store.updateInvoice(owner.id, cancelled.id, pdf);
  assert.equal(saved.proofMime, 'application/pdf');
  assert.equal(saved.lifecycle, 'cancelled');
  assert.throws(() => store.updateInvoice(owner.id, cancelled.id, { ...pdf, notes: 'tjetër' }), /CANCELLED_LOCKED/);
  assert.throws(() => store.updateInvoice(owner.id, cancelled.id, { notes: 'tjetër' }), /CANCELLED_LOCKED/);
});
