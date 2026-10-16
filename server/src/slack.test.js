// Messages to the company's Slack channel, against a store in a throwaway folder and a fake Slack.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-slack-'));
process.env.APP_URL = 'https://app.example.test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'slack-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'slack-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');
const slack = require('./slack');

const posted = [];
let refuse = false;
slack.setPoster(async (webhook, text) => {
  if (refuse) {
    const err = new Error('SLACK_404');
    err.slackCode = 'SLACK_404';
    throw err;
  }
  posted.push({ webhook, text });
});

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/abcdefghijklmnop';
let ownerId;
let client;

test.before(async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'owner@tretek.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  ownerId = owner.id;
  store.setUserPlan(ownerId, 'premium');
  store.updateProfile(ownerId, { companyName: 'Tretek SH.P.K.', currency: 'EUR', defaultTaxRate: 18, language: 'sq' });
  client = store.addClient(ownerId, { fullName: 'FINCA <Kosovo>', email: 'finance@finca.test' }).client;
});

function issued(number, total) {
  const invoice = store.addInvoice(ownerId, {
    number,
    date: '2026-10-01',
    dueDate: '2026-10-15',
    client,
    clientId: client.id,
    items: [{ id: 'i1', description: 'Mirëmbajtje', quantity: 1, unitPrice: total }],
    discount: 0,
    taxRate: 0,
  });
  return store.issueInvoice(ownerId, invoice.id) || store.getInvoice(ownerId, invoice.id);
}

test('only a Slack webhook URL is accepted, and the page never sees it whole', () => {
  assert.throws(() => slack.update(ownerId, { webhook: 'https://evil.example.com/hook' }), /SLACK_WEBHOOK/);
  const view = slack.update(ownerId, { webhook: WEBHOOK, channel: '#menaxhimi-faturave' });
  assert.equal(view.connected, true);
  assert.equal(view.channel, 'menaxhimi-faturave');
  assert.ok(!JSON.stringify(view).includes('abcdefghij'));
  assert.equal(view.webhookHint, '…klmnop');
});

test('a test message, a sent invoice and a reminder are posted, with names escaped and links to the app', async () => {
  await slack.test(ownerId);
  const invoice = issued('202610-001', 100);
  await slack.invoiceSent(ownerId, invoice, ['finance@finca.test']);
  await slack.reminderSent(ownerId, [invoice], ['finance@finca.test']);
  const [hello, sent, reminder] = posted.splice(0);
  assert.match(hello.text, /Next Invoice u lidh/);
  assert.match(sent.text, /<https:\/\/app\.example\.test\/app\/invoices\/[^|]+\|202610-001>/);
  assert.match(sent.text, /FINCA &lt;Kosovo&gt;/);
  assert.match(reminder.text, /Kujtesë pagese/);
  assert.match(reminder.text, /1 faturë/);
});

test('a switched-off event is not posted', async () => {
  slack.update(ownerId, { events: { sent: false } });
  await slack.invoiceSent(ownerId, issued('202610-002', 50), ['a@b.test']);
  assert.equal(posted.length, 0);
  slack.update(ownerId, { events: { sent: true } });
});

test('invoices paid since connecting are posted once, several together in one message', async () => {
  const one = issued('202610-003', 200);
  const two = issued('202610-004', 300);
  store.addPayment(ownerId, 'invoice', one.id, { amount: 200, date: '2026-10-16' });
  store.addPayment(ownerId, 'invoice', two.id, { amount: 300, date: '2026-10-16' });
  assert.equal(await slack.notifyPaid(ownerId), 2);
  assert.equal(posted.length, 1);
  assert.match(posted[0].text, /2 fatura u paguan/);
  assert.match(posted[0].text, /202610-003/);
  assert.match(posted[0].text, /16\.10\.2026/);
  posted.length = 0;
  assert.equal(await slack.notifyPaid(ownerId), 0);
  assert.equal(posted.length, 0);
});

test('a refused message is kept for the page and the payment is tried again later, not lost', async () => {
  const three = issued('202610-005', 75);
  store.addPayment(ownerId, 'invoice', three.id, { amount: 75, date: '2026-10-16' });
  refuse = true;
  assert.equal(await slack.notifyPaid(ownerId), 0);
  assert.equal(slack.describe(ownerId).lastError, 'SLACK_404');
  refuse = false;
  // Not before the retry time.
  assert.equal(await slack.notifyPaid(ownerId), 0);
  assert.equal(store.getInvoice(ownerId, three.id).notified.slackPaid, undefined);
  assert.ok(store.getInvoice(ownerId, three.id).notified.slackRetryAt);
});

test('disconnecting stops everything', async () => {
  const view = slack.update(ownerId, { webhook: '' });
  assert.equal(view.connected, false);
  await slack.invoiceSent(ownerId, issued('202610-006', 10), ['a@b.test']);
  assert.equal(posted.length, 0);
  await assert.rejects(() => slack.test(ownerId), /SLACK_NOT_CONNECTED/);
});
