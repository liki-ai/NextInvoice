// Several companies under one account, against a store in a throwaway folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-companies-'));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'companies-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'companies-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

let owner;
let member;
let stranger;
let llc;

test.before(async () => {
  await store.initStore();
  owner = await store.createUser({ email: 'owner@tretek.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  store.setUserPlan(owner.id, 'premium');
  store.updateProfile(owner.id, { companyName: 'Tretek SH.P.K.', currency: 'EUR' });
  member = await store.addMember(owner.id, { email: 'member@tretek.test', passwordHash: 'x', role: 'member' });
  stranger = await store.createUser({ email: 'other@example.test', passwordHash: 'x' });
  llc = await store.createCompany(owner.id, { companyName: 'Tretek LLC', currency: 'USD', createdBy: owner.email });
});

test('a new company starts with its own profile, in its own currency and the main company\'s language', () => {
  const profile = store.getProfile(llc.id);
  assert.equal(profile.companyName, 'Tretek LLC');
  assert.equal(profile.currency, 'USD');
  assert.equal(profile.language, 'sq');
  assert.equal(store.getProfile(owner.id).companyName, 'Tretek SH.P.K.');
});

test('the session works in the company asked for, and lists all of them with the main one first', () => {
  const main = store.sessionUser(store.findUserById(owner.id));
  assert.equal(main.id, owner.id);
  assert.deepEqual(main.companies.map((item) => item.companyName), ['Tretek SH.P.K.', 'Tretek LLC']);
  const inLlc = store.sessionUser(store.findUserById(owner.id), llc.id);
  assert.equal(inLlc.id, llc.id);
  assert.equal(inLlc.teamId, owner.id);
  assert.equal(inLlc.companyName, 'Tretek LLC');
  assert.equal(inLlc.role, 'owner');
  assert.equal(inLlc.email, owner.email);
});

test('users of the main company reach the new one with the same role; nobody else does', () => {
  const asMember = store.sessionUser(store.findUserById(member.id), llc.id);
  assert.equal(asMember.id, llc.id);
  assert.equal(asMember.role, 'member');
  const asStranger = store.sessionUser(store.findUserById(stranger.id), llc.id);
  assert.equal(asStranger.id, stranger.id);
  assert.deepEqual(asStranger.companies.map((item) => item.id), [stranger.id]);
});

test('invoices and clients stay apart per company', () => {
  store.addClient(llc.id, { fullName: 'US Client Inc.' });
  assert.equal(store.listClients(llc.id).length, 1);
  assert.equal(store.listClients(owner.id).length, 0);
});

test('the new company has the main company\'s plan and nobody signs in as it', () => {
  assert.equal(store.canCreateInvoice(llc.id).plan, 'premium');
  assert.equal(store.sessionUser(store.findUserById(owner.id), llc.id).plan, 'premium');
  assert.equal(store.findUserByEmail(''), null);
  assert.equal(store.findUserByEmail(owner.email).id, owner.id);
});

test('a company needs a name', async () => {
  await assert.rejects(store.createCompany(owner.id, { companyName: '  ' }), /COMPANY_NAME_REQUIRED/);
});
