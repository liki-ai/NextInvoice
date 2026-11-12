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

test('a user given only some companies works in those alone, and starts in the first of them', async () => {
  const accountant = await store.addMember(owner.id, { email: 'llc@tretek.test', passwordHash: 'x', role: 'invoicer', companyIds: [llc.id, 'not-ours'] });
  assert.deepEqual(accountant.companyIds, [llc.id]);
  const session = store.sessionUser(store.findUserById(accountant.id));
  assert.equal(session.id, llc.id);
  assert.deepEqual(session.companies.map((item) => item.id), [llc.id]);
  // Asking for the main company gives the one they have.
  assert.equal(store.sessionUser(store.findUserById(accountant.id), owner.id).id, llc.id);
  assert.deepEqual(store.listTeam(owner.id).members.find((item) => item.id === accountant.id).companyIds, [llc.id]);
});

test('picking every company means all of them, later ones too; picking none is refused', async () => {
  const all = await store.addMember(owner.id, { email: 'all@tretek.test', passwordHash: 'x', companyIds: [owner.id, llc.id] });
  assert.equal(all.companyIds, undefined);
  await assert.rejects(store.addMember(owner.id, { email: 'none@tretek.test', passwordHash: 'x', companyIds: [] }), /COMPANIES_REQUIRED/);
  assert.throws(() => store.createInvite(owner.id, { email: 'none@tretek.test', companyIds: ['not-ours'] }), /COMPANIES_REQUIRED/);
});

test('the companies of a user can be changed without touching the role, and an invitation carries them', async () => {
  const user = store.findUserByEmail('member@tretek.test');
  store.setMemberRole(owner.id, user.id, undefined, { companyIds: [owner.id] });
  assert.equal(store.findUserById(user.id).role, 'member');
  assert.deepEqual(store.sessionUser(store.findUserById(user.id), llc.id).companies.map((item) => item.id), [owner.id]);
  store.setMemberRole(owner.id, user.id, undefined, { companyIds: null });
  assert.equal(store.sessionUser(store.findUserById(user.id), llc.id).id, llc.id);

  const { token } = store.createInvite(owner.id, { email: 'invited@tretek.test', role: 'member', companyIds: [llc.id] });
  const joined = await store.acceptInvite(token, 'x');
  assert.deepEqual(joined.companyIds, [llc.id]);
});

test('an administrator given some companies may work in the one they open', async () => {
  const admin = await store.addMember(owner.id, { email: 'admin@tretek.test', passwordHash: 'x', role: 'admin', companyIds: [llc.id] });
  const opened = await store.createCompany(owner.id, { companyName: 'Tretek GmbH', createdById: admin.id });
  assert.deepEqual(store.findUserById(admin.id).companyIds, [llc.id, opened.id]);
});
