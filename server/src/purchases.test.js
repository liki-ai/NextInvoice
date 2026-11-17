// Purchases (obligations) keep the supplier's invoice number and their item lines, through the API itself.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-purchases-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'purchases-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'purchases-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const store = require('./store');
const { signToken } = require('./auth');

let server;
let base;
let token;

async function call(method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.before(async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'owner@purchases.test', passwordHash: 'x', language: 'sq' });
  token = signToken(owner);
  const app = express();
  app.use(express.json());
  app.use('/api/obligations', require('./routes/obligations'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('a purchase keeps its invoice number and lines, and an edit without lines leaves them', async () => {
  const created = await call('POST', '/api/obligations', {
    vendor: 'Viva Fresh',
    invoiceNumber: ' F-2026/118 ',
    amount: 23.5,
    date: 'NOV 17, 2026',
    items: [
      { description: 'Letër A4', quantity: '2', unitPrice: '4,25' },
      { description: 'Toner', quantity: 1, unitPrice: 15 },
      { description: '', quantity: 0, unitPrice: 0 },
    ],
  });
  assert.equal(created.status, 201);
  const saved = created.body.obligation;
  assert.equal(saved.invoiceNumber, 'F-2026/118');
  assert.deepEqual(saved.items, [
    { description: 'Letër A4', quantity: 2, unitPrice: 4.25 },
    { description: 'Toner', quantity: 1, unitPrice: 15 },
  ]);

  // An older phone app sends a purchase without the new fields: they stay as they were.
  const edited = await call('PUT', `/api/obligations/${saved.id}`, { vendor: 'Viva Fresh', amount: 23.5, date: 'NOV 18, 2026', status: 'paid' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.obligation.invoiceNumber, 'F-2026/118');
  assert.equal(edited.body.obligation.items.length, 2);
  assert.equal(edited.body.obligation.date, 'NOV 18, 2026');
});
