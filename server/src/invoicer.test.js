// The invoicer role, through the API itself, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-invoicer-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'invoicer-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'invoicer-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const store = require('./store');
const { signToken } = require('./auth');

let server;
let base;
const tokens = {};
let ownerInvoice;

async function call(who, method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const draft = (name) => ({ client: { fullName: name }, items: [{ description: 'Service', quantity: 1, unitPrice: 50 }], date: '2026-11-12', lifecycle: 'draft' });

test.before(async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'owner@tretek.test', passwordHash: 'x', language: 'sq' });
  store.setUserPlan(owner.id, 'premium');
  const invoicer = await store.addMember(owner.id, { email: 'sales@tretek.test', passwordHash: 'x', role: 'invoicer' });
  const member = await store.addMember(owner.id, { email: 'member@tretek.test', passwordHash: 'x', role: 'member' });
  Object.assign(tokens, { owner: signToken(owner), invoicer: signToken(invoicer), member: signToken(member) });
  ownerInvoice = store.addInvoice(owner.id, draft('Owner Client'), { createdBy: owner.id });

  const app = express();
  app.use(express.json());
  for (const name of ['invoices', 'clients', 'items', 'obligations', 'profile', 'team', 'sync']) app.use(`/api/${name}`, require(`./routes/${name}`));
  app.use('/api/auth', require('./routes/auth'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('an invoicer has that role in the session', async () => {
  const me = await call('invoicer', 'GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'invoicer');
});

test('an invoicer writes an invoice and a client, and sees only the invoices they wrote', async () => {
  const client = await call('invoicer', 'POST', '/api/clients', { fullName: 'Sales Client' });
  assert.equal(client.status, 201);
  const created = await call('invoicer', 'POST', '/api/invoices', { ...draft('Sales Client'), createdBy: 'someone-else' });
  assert.equal(created.status, 201);
  const list = await call('invoicer', 'GET', '/api/invoices');
  assert.deepEqual(list.body.invoices.map((item) => item.id), [created.body.invoice.id]);
  // Written by the person signed in, whatever the request says.
  const ownerList = await call('owner', 'GET', '/api/invoices');
  assert.equal(ownerList.body.invoices.length, 2);
  assert.equal(ownerList.body.invoices.find((item) => item.id === created.body.invoice.id).createdBy, store.findUserByEmail('sales@tretek.test').id);

  const issued = await call('invoicer', 'POST', `/api/invoices/${created.body.invoice.id}/issue`);
  assert.equal(issued.status, 200);
  const shared = await call('invoicer', 'POST', `/api/invoices/${created.body.invoice.id}/share`);
  assert.equal(shared.status, 200);
  // The creator stays put when the invoice is changed.
  await call('invoicer', 'PUT', `/api/invoices/${created.body.invoice.id}`, { notes: 'x', createdBy: 'someone-else' });
  assert.equal((await call('invoicer', 'GET', `/api/invoices/${created.body.invoice.id}`)).body.invoice.createdBy, store.findUserByEmail('sales@tretek.test').id);
});

test('another person\'s invoice is not there for an invoicer', async () => {
  assert.equal((await call('invoicer', 'GET', `/api/invoices/${ownerInvoice.id}`)).status, 404);
  assert.equal((await call('invoicer', 'PUT', `/api/invoices/${ownerInvoice.id}`, { notes: 'x' })).status, 404);
  assert.equal((await call('invoicer', 'DELETE', `/api/invoices/${ownerInvoice.id}`)).status, 404);
  assert.equal((await call('invoicer', 'POST', `/api/invoices/${ownerInvoice.id}/issue`)).status, 404);
  assert.equal((await call('owner', 'GET', `/api/invoices/${ownerInvoice.id}`)).status, 200);
});

test('an invoicer reaches nothing beyond writing and sending invoices', async () => {
  const id = ownerInvoice.id;
  const refused = [
    ['GET', '/api/obligations'],
    ['GET', '/api/team'],
    ['GET', '/api/sync'],
    ['PUT', '/api/profile', {}],
    ['POST', '/api/invoices/mark-paid', { ids: [id] }],
    ['POST', '/api/invoices/import', {}],
    ['POST', '/api/invoices/remind', {}],
    ['POST', `/api/invoices/${id}/cancel`, { reason: 'x' }],
    ['POST', `/api/invoices/${id}/payments`, { amount: 1, date: '2026-11-12' }],
    ['PUT', '/api/clients/abc', { fullName: 'x' }],
    ['DELETE', '/api/clients/abc'],
    ['POST', '/api/items', { name: 'x' }],
  ];
  for (const [method, url, body] of refused) {
    const res = await call('invoicer', method, url, body);
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.equal(res.body.code, 'INVOICER_ONLY');
  }
  for (const url of ['/api/profile', '/api/clients', '/api/items']) assert.equal((await call('invoicer', 'GET', url)).status, 200, url);
});

test('a plain user still sees every invoice and the rest of the app', async () => {
  assert.equal((await call('member', 'GET', '/api/invoices')).body.invoices.length, 2);
  assert.equal((await call('member', 'GET', '/api/obligations')).status, 200);
});

test('an invoicer is proposed the next number after everyone\'s invoices', async () => {
  const owners = await call('owner', 'POST', '/api/invoices', { ...draft('Owner Client'), number: 'NOV-007', lifecycle: 'issued' });
  assert.equal(owners.status, 201);
  const numbers = await call('invoicer', 'GET', '/api/invoices/numbers');
  assert.equal(numbers.status, 200);
  assert.ok(numbers.body.numbers.some((item) => item.number === 'NOV-007'));
  // Whatever number an invoicer sends, an issued invoice never takes one already used.
  const clash = await call('invoicer', 'POST', '/api/invoices', { ...draft('Sales Client'), number: 'NOV-007', lifecycle: 'issued' });
  assert.equal(clash.status, 201);
  assert.notEqual(clash.body.invoice.number, 'NOV-007');
});
