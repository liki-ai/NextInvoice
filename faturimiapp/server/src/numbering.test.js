const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-numbering-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'numbering-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

const item = { description: 'Mirëmbajtja', quantity: '1', unitPrice: '100' };

test('issuing a draft keeps its number, also when it was already marked issued by an update', async () => {
  await store.initStore();
  const { id: uid } = await store.createUser({ email: 'numbers@tretek.test', passwordHash: 'x' });
  for (const n of ['001', '002']) store.addInvoice(uid, { number: `202610-${n}`, date: 'Oct 20, 2026', client: { fullName: 'A' }, items: [item] });

  // What the web form did: autosave a draft, update it with the issued lifecycle, then issue it.
  const draft = store.addInvoice(uid, { number: '202610-003', date: 'Oct 20, 2026', client: { fullName: 'B' }, items: [item], lifecycle: 'draft' });
  store.updateInvoice(uid, draft.id, { lifecycle: 'issued' });
  assert.equal(store.issueInvoice(uid, draft.id).number, '202610-003');

  // A number another invoice was issued with still moves on to the next free one.
  const late = store.addInvoice(uid, { number: '202610-003', date: 'Oct 20, 2026', client: { fullName: 'C' }, items: [item], lifecycle: 'draft' });
  assert.equal(store.issueInvoice(uid, late.id).number, '202610-004');
});
