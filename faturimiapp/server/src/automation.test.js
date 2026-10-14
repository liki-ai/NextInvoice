// Recurring invoices, scheduled sending, notifications and card payments, against a store in a
// throwaway folder, a fake clock, a fake mail server and a fake PDF printer.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nextinvoice-automation-'));
process.env.APP_URL = 'https://app.example.test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'automation-test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'automation-test';
delete process.env.DATABASE_URL;
delete process.env.RENDER;

const test = require('node:test');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const schedule = require('./automation/schedule');
const templates = require('./automation/templates');
const store = require('./store');
const automation = require('./automation/service');
const companyStripe = require('./automation/companyStripe');
const { encryptSecret } = require('./mailer');
const { translate } = require('./generated/invoiceRender');

const t = (lang, key, params) => translate(lang, key, params);

// ---- a fake world -------------------------------------------------------------------------------

let clock = new Date('2026-10-10T10:00:00Z');
const outbox = [];
let failNext = null;

function setDay(day) {
  clock = new Date(`${day}T10:00:00Z`);
}

automation.setAutomationDeps({
  now: () => clock,
  renderPdf: async () => Buffer.from('%PDF-1.4 test'),
  deliver: async (settings, message) => {
    if (failNext) {
      const code = failNext;
      failNext = null;
      const err = new Error(code);
      err.mailCode = code;
      throw err;
    }
    outbox.push(message);
    return { messageId: `m${outbox.length}`, accepted: message.to, rejected: [] };
  },
});

const customerMail = () => outbox.filter((m) => !m.to.includes('owner@tretek.test'));
const companyMail = () => outbox.filter((m) => m.to.includes('owner@tretek.test'));

let ownerId;
let maintenanceClient;
let ipacientiClient;

test.before(async () => {
  await store.initStore();
  const owner = await store.createUser({ email: 'owner@tretek.test', passwordHash: 'x', language: 'sq', industry: 'services' });
  ownerId = owner.id;
  // Premium, so the free plan's monthly invoice limit does not get in the way of the tests.
  store.setUserPlan(ownerId, 'premium');
  store.updateProfile(ownerId, { companyName: 'Tretek SH.P.K.', contactPerson: 'Lirim', currency: 'EUR', defaultTaxRate: 18, language: 'sq' });
  store.saveMailSettings(ownerId, { host: 'smtp.example.test', port: 587, user: 'info@tretek.test', pass: encryptSecret('app-password'), senders: [], verifiedAt: new Date().toISOString() });
  maintenanceClient = store.addClient(ownerId, { fullName: 'FINCA', email: 'finance@finca.test' }).client;
  ipacientiClient = store.addClient(ownerId, { fullName: 'Fiziomed SH.P.K.', email: 'info@fiziomed.test', language: 'en' }).client;
  const recurring = store.getRecurring(ownerId);
  recurring.settings = { ...recurring.settings, notifySince: '2026-01-01T00:00:00.000Z' };
  store.saveRecurring(ownerId, recurring);
});

function pausePlans() {
  const recurring = store.getRecurring(ownerId);
  recurring.plans = recurring.plans.map((item) => ({ ...item, active: false }));
  store.saveRecurring(ownerId, recurring);
}

/** A new plan; the plans of earlier tests are paused so each test sees only its own sends. */
function addPlan(fields) {
  const recurring = store.getRecurring(ownerId);
  recurring.plans = recurring.plans.map((item) => ({ ...item, active: false }));
  const plan = {
    id: `plan-${recurring.plans.length + 1}`,
    clientId: maintenanceClient.id,
    product: '',
    kind: 'auto',
    items: [{ description: 'Mirëmbajtje e aplikacionit', quantity: 1, unitPrice: 135.59 }],
    discount: 0,
    taxRate: 18,
    currency: 'EUR',
    frequency: 'monthly',
    anchorDate: '2026-11-01',
    endDate: '',
    sendDaysBefore: 7,
    dueDays: 7,
    graceDays: 7,
    lang: '',
    to: [],
    cc: [],
    from: '',
    paymentUrl: '',
    notes: '',
    active: true,
    periods: {},
    createdAt: '2026-10-01T08:00:00.000Z',
    history: [],
    ...fields,
  };
  recurring.plans.push(plan);
  store.saveRecurring(ownerId, recurring);
  return plan;
}

const planInvoices = (planId) => store.listInvoices(ownerId).filter((inv) => inv.recurring && inv.recurring.planId === planId);

// ---- dates --------------------------------------------------------------------------------------

test('periods are counted from the anchor, keeping the day of month where it exists', () => {
  const plan = { anchorDate: '2026-01-31', frequency: 'monthly' };
  assert.deepEqual([0, 1, 2, 3].map((k) => schedule.periodStart(plan, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(schedule.periodOf(plan, 0).end, '2026-02-27');
  assert.equal(schedule.periodStart({ anchorDate: '2024-02-29', frequency: 'yearly' }, 1), '2025-02-28');
  assert.equal(schedule.periodStart({ anchorDate: '2024-02-29', frequency: 'yearly' }, 4), '2028-02-29');
  assert.equal(schedule.periodStart({ anchorDate: '2026-11-01', frequency: 'quarterly' }, 2), '2027-05-01');
});

test('the next period is due once its send date is within the lookahead', () => {
  const plan = { anchorDate: '2026-11-01', frequency: 'monthly', sendDaysBefore: 7, periods: {} };
  assert.equal(schedule.nextPeriod(plan, '2026-10-10').sendOn, '2026-10-25');
  assert.equal(schedule.nextPeriod(plan, '2026-10-10').due, false);
  assert.equal(schedule.nextPeriod(plan, '2026-10-18').due, true);
  assert.equal(schedule.nextPeriod({ ...plan, periods: { '2026-11-01': {} } }, '2026-10-18').start, '2026-12-01');
  assert.equal(schedule.nextPeriod({ ...plan, endDate: '2026-11-15', periods: { '2026-11-01': {} } }, '2026-10-18'), null);
});

test('a late payment never moves the renewal dates', () => {
  const plan = { anchorDate: '2026-11-01', frequency: 'yearly', graceDays: 7 };
  const paid = new Set(['2026-11-01']);
  assert.equal(schedule.paidThrough(plan, (start) => paid.has(start)), '2027-11-01');
  assert.equal(schedule.paidThrough(plan, () => false), '2026-11-01');
  // Paid late (after the renewal), the term still runs from the original renewal date.
  assert.deepEqual(schedule.subscriptionStatus(plan, '2026-11-20', (start) => paid.has(start)).expires, '2027-11-01');
  assert.equal(schedule.subscriptionStatus(plan, '2026-11-03', () => false).state, 'grace');
  assert.equal(schedule.subscriptionStatus(plan, '2026-11-08', () => false).state, 'expired');
  assert.equal(schedule.subscriptionStatus(plan, '2026-10-25', () => false).state, 'active');
});

// ---- email texts --------------------------------------------------------------------------------

const subscriptionInvoice = (period) => ({ number: '202610-020', dueDate: '01.11.2026', items: [{ description: 'iPacienti – Abonim Vjetor' }], recurring: { period, periodEnd: '2027-10-31', graceEnds: '2026-11-08' } });
const ipacientiPlan = { kind: 'auto', items: [{ description: 'iPacienti – Abonim Vjetor' }] };

test('an iPacienti subscription gets a renewal reminder that counts the days', () => {
  const base = { t, lang: 'sq', plan: ipacientiPlan, invoice: subscriptionInvoice('2026-11-01'), clientName: 'Fiziomed', companyName: 'Tretek', senderName: 'Lirim', money: '381.60€', link: 'https://x.test/i', paymentUrl: 'https://pay.test/x' };
  const week = templates.invoiceEmail({ ...base, today: '2026-10-25' });
  assert.equal(week.subject, 'iPacienti – Abonimi juaj skadon pas 7 ditësh');
  assert.equal(week.kind, 'subscription');
  assert.match(week.text, /skadon më 01\.11\.2026, pas 7 ditësh/);
  assert.match(week.text, /faturën e rinovimit 202610-020 për periudhën 01\.11\.2026 – 31\.10\.2027, në vlerë 381\.60€/);
  assert.match(week.text, /Afati i pagesës: 01\.11\.2026/);
  assert.match(week.text, /Paguani këtu: https:\/\/pay\.test\/x/);
  assert.equal(templates.invoiceEmail({ ...base, today: '2026-10-31' }).subject, 'iPacienti – Abonimi juaj skadon nesër');
  assert.equal(templates.invoiceEmail({ ...base, today: '2026-11-01' }).subject, 'iPacienti – Abonimi juaj skadon sot');
  const grace = templates.invoiceEmail({ ...base, today: '2026-11-03' });
  assert.equal(grace.subject, 'iPacienti – Abonimi juaj ka skaduar');
  assert.match(grace.text, /aktiv edhe 5 ditë, deri më 08\.11\.2026/);
  assert.match(templates.invoiceEmail({ ...base, today: '2026-11-10' }).text, /Për ta rifilluar shërbimin/);
  assert.equal(templates.invoiceEmail({ ...base, lang: 'en', today: '2026-10-25' }).subject, 'iPacienti – Your subscription expires in 7 days');
});

test('other invoices get the standard email with every detail the customer needs', () => {
  const mail = templates.invoiceEmail({ t, lang: 'sq', today: '2026-10-25', plan: { kind: 'auto', items: [{ description: 'Mirëmbajtje' }] }, invoice: { number: '202610-021', dueDate: '01.11.2026', items: [{ description: 'Mirëmbajtje e aplikacionit - Tetor 2026' }] }, clientName: 'FINCA', companyName: 'Tretek SH.P.K.', senderName: 'Lirim', money: '160.00€', link: 'https://x.test/i', paymentUrl: '' });
  assert.equal(mail.kind, 'invoice');
  assert.equal(mail.subject, 'Faturë 202610-021 nga Tretek SH.P.K.');
  for (const part of ['Përshëndetje FINCA', '202610-021', 'Mirëmbajtje e aplikacionit - Tetor 2026', '160.00€', 'Afati i pagesës: 01.11.2026', 'bashkëngjitje', 'https://x.test/i']) assert.ok(mail.text.includes(part), part);
  assert.ok(!mail.text.includes('Paguani këtu'));
  assert.equal(templates.pickLang('', undefined), 'sq');
  assert.equal(templates.pickLang('', 'it'), 'it');
  assert.equal(templates.isSubscription({ kind: 'subscription', items: [{ description: 'Hosting' }] }), true);
  assert.equal(templates.isSubscription({ kind: 'invoice', items: [{ description: 'iPacienti' }] }), false);
});

// ---- the scheduler ------------------------------------------------------------------------------

test('a plan makes one invoice per period, sends it on its day, once, and tells the company', async () => {
  const plan = addPlan({});
  setDay('2026-10-10');
  assert.equal(automation.generateDue(ownerId).length, 0, 'too early: the send date is 15 days away');

  setDay('2026-10-18');
  automation.generateDue(ownerId);
  automation.generateDue(ownerId);
  await automation.runOwner(ownerId);
  let invoices = planInvoices(plan.id);
  assert.equal(invoices.length, 1, 'one invoice, however often the scheduler runs');
  assert.equal(invoices[0].lifecycle, 'draft');
  assert.equal(invoices[0].delivery.status, 'scheduled');
  assert.equal(invoices[0].delivery.scheduledFor, '2026-10-25');
  assert.equal(invoices[0].recurring.period, '2026-11-01');
  assert.match(invoices[0].notes, /Periudha: 01\.11\.2026 – 30\.11\.2026/);
  assert.equal(customerMail().length, 0, 'nothing is sent before the date');

  setDay('2026-10-25');
  await automation.runOwner(ownerId);
  await automation.runOwner(ownerId);
  invoices = planInvoices(plan.id);
  assert.equal(invoices.length, 1);
  const sent = invoices[0];
  assert.equal(sent.lifecycle, 'issued');
  assert.match(sent.number, /^[A-Z]{3}-\d{3}$|^\d{6}-\d{3}$/);
  assert.equal(sent.date, '25.10.2026');
  assert.equal(sent.dueDate, '01.11.2026');
  assert.equal(sent.delivery.status, 'sent');
  assert.equal(sent.sent, true);
  const toCustomer = customerMail();
  assert.equal(toCustomer.length, 1, 'one email to the customer');
  assert.deepEqual(toCustomer[0].to, ['finance@finca.test']);
  assert.equal(toCustomer[0].subject, `Faturë ${sent.number} nga Tretek SH.P.K.`);
  assert.equal(toCustomer[0].attachments[0].contentType, 'application/pdf');
  assert.equal(companyMail().length, 1, 'one note to the company');
  assert.match(companyMail()[0].subject, /U dërgua fatura/);
  assert.ok(sent.events.some((e) => e.type === 'generated') && sent.events.some((e) => e.type === 'sent') && sent.events.some((e) => e.type === 'notified_sent'));

  setDay('2026-11-20');
  await automation.runOwner(ownerId);
  assert.equal(planInvoices(plan.id).length, 2, 'the next month comes in its turn');
  assert.equal(customerMail().length, 1, 'and waits for its own send date');
  setDay('2026-11-24');
  await automation.runOwner(ownerId);
  assert.equal(customerMail().length, 2);
});

test('the renewal reminder goes out in the customer’s language with the PDF and the payment link', async () => {
  outbox.length = 0;
  const plan = addPlan({ clientId: ipacientiClient.id, items: [{ description: 'iPacienti – Abonim Vjetor', quantity: 1, unitPrice: 323.38983051 }], frequency: 'yearly', anchorDate: '2026-12-01', paymentUrl: 'https://pay.example.test/fiziomed' });
  setDay('2026-11-24');
  await automation.runOwner(ownerId);
  const mail = customerMail()[0];
  assert.equal(mail.subject, 'iPacienti – Your subscription expires in 7 days');
  assert.match(mail.text, /renewal invoice .* for the period 01\.12\.2026 – 30\.11\.2027/);
  assert.match(mail.text, /Pay here: https:\/\/pay\.example\.test\/fiziomed/);
  assert.ok(mail.html.includes('https://pay.example.test/fiziomed'));
  assert.equal(mail.attachments.length, 1);
  const invoice = planInvoices(plan.id)[0];
  assert.equal(invoice.total, 381.6);
  assert.equal(invoice.delivery.template, 'subscription');
});

test('a period that ended before the plan existed is not billed', () => {
  const plan = addPlan({ anchorDate: '2026-01-01', createdAt: '2026-11-25T08:00:00.000Z' });
  setDay('2026-11-25');
  automation.generateDue(ownerId);
  const periods = planInvoices(plan.id).map((inv) => inv.recurring.period);
  assert.ok(!periods.includes('2026-01-01') && !periods.includes('2026-09-01'), periods.join(','));
  assert.ok(periods.includes('2026-11-01') || periods.includes('2026-12-01'), periods.join(','));
});

test('a failed send is retried only for errors that can pass, and not before its time', async () => {
  outbox.length = 0;
  const plan = addPlan({ anchorDate: '2027-02-01' });
  setDay('2027-01-25');
  failNext = 'MAIL_CONNECT';
  await automation.runOwner(ownerId);
  let invoice = planInvoices(plan.id)[0];
  assert.equal(invoice.delivery.status, 'failed');
  assert.equal(invoice.delivery.lastError, 'MAIL_CONNECT');
  assert.ok(invoice.delivery.nextRetryAt);
  assert.equal(invoice.lifecycle, 'issued', 'the number is taken once; a retry reuses the same invoice');
  const number = invoice.number;

  await automation.runOwner(ownerId);
  assert.equal(customerMail().length, 0, 'no retry before its time');

  clock = new Date(clock.getTime() + 31 * 60 * 1000);
  await automation.runOwner(ownerId);
  invoice = planInvoices(plan.id)[0];
  assert.equal(invoice.delivery.status, 'sent');
  assert.equal(invoice.number, number);
  assert.equal(planInvoices(plan.id).length, 1);
  assert.equal(customerMail().length, 1);

  const other = addPlan({ anchorDate: '2027-03-01' });
  setDay('2027-02-22');
  failNext = 'MAIL_AUTH';
  await automation.runOwner(ownerId);
  const refused = planInvoices(other.id)[0];
  assert.equal(refused.delivery.status, 'failed');
  assert.equal(refused.delivery.nextRetryAt, null, 'a refused password is not retried by itself');
});

test('a send cut off by a restart is marked failed, never sent again on a guess', async () => {
  outbox.length = 0;
  const plan = addPlan({ anchorDate: '2027-04-01' });
  setDay('2027-03-20');
  automation.generateDue(ownerId);
  const invoice = planInvoices(plan.id)[0];
  store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
    draft.delivery = { ...draft.delivery, status: 'sending' };
    return draft;
  });
  automation.recoverInterrupted();
  setDay('2027-03-25');
  await automation.runOwner(ownerId);
  const after = store.getInvoice(ownerId, invoice.id);
  assert.equal(after.delivery.status, 'failed');
  assert.equal(after.delivery.lastError, 'INTERRUPTED');
  assert.equal(customerMail().length, 0);
});

test('two sends of the same invoice at once make one email', async () => {
  outbox.length = 0;
  const plan = addPlan({ anchorDate: '2027-05-01' });
  setDay('2027-04-24');
  automation.generateDue(ownerId);
  const invoice = planInvoices(plan.id)[0];
  const results = await Promise.allSettled([automation.deliverInvoice(ownerId, invoice.id, { manual: true }), automation.deliverInvoice(ownerId, invoice.id, { manual: true })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.mailCode, 'SENDING');
  assert.equal(customerMail().length, 1);
});

test('any invoice can be scheduled, moved, unscheduled, or marked sent by hand', async () => {
  outbox.length = 0;
  pausePlans();
  setDay('2027-06-01');
  const invoice = store.addInvoice(ownerId, { lifecycle: 'issued', clientId: maintenanceClient.id, client: maintenanceClient, items: [{ id: '1', description: 'Konsulencë', quantity: 1, unitPrice: 100 }], discount: 0, taxRate: 18, date: '01.06.2027', dueDate: '15.06.2027', sent: false });
  assert.throws(() => automation.scheduleInvoice(ownerId, invoice.id, { date: '2027-13-01' }), /DATE_INVALID/);
  automation.scheduleInvoice(ownerId, invoice.id, { date: '2027-06-05' });
  automation.scheduleInvoice(ownerId, invoice.id, { date: '2027-06-03', to: 'boss@finca.test' });
  let saved = store.getInvoice(ownerId, invoice.id);
  assert.equal(saved.delivery.scheduledFor, '2027-06-03');
  assert.deepEqual(saved.events.slice(-2).map((e) => e.type), ['scheduled', 'rescheduled']);
  setDay('2027-06-03');
  await automation.runOwner(ownerId);
  assert.deepEqual(customerMail()[0].to, ['boss@finca.test']);

  const second = store.addInvoice(ownerId, { lifecycle: 'issued', clientId: maintenanceClient.id, client: maintenanceClient, items: [{ id: '1', description: 'Konsulencë', quantity: 1, unitPrice: 50 }], discount: 0, taxRate: 18, date: '03.06.2027', sent: false });
  automation.scheduleInvoice(ownerId, second.id, { date: '2027-06-04' });
  store.updateInvoice(ownerId, second.id, { sent: true, sentAt: '2027-06-03T12:00:00.000Z' });
  saved = store.getInvoice(ownerId, second.id);
  assert.equal(saved.delivery.status, 'sent', 'marked sent by hand: the scheduled email is off');
  const third = store.addInvoice(ownerId, { lifecycle: 'issued', clientId: maintenanceClient.id, client: maintenanceClient, items: [{ id: '1', description: 'Konsulencë', quantity: 1, unitPrice: 70 }], discount: 0, taxRate: 18, date: '03.06.2027', sent: false });
  automation.scheduleInvoice(ownerId, third.id, { date: '2027-06-04' });
  automation.unscheduleInvoice(ownerId, third.id);
  setDay('2027-06-04');
  await automation.runOwner(ownerId);
  assert.equal(customerMail().length, 1, 'neither the hand-sent nor the unscheduled invoice went out');
});

test('payments are announced once; several at once in one email', async () => {
  outbox.length = 0;
  pausePlans();
  setDay('2027-06-10');
  const make = (price) => store.addInvoice(ownerId, { lifecycle: 'issued', clientId: maintenanceClient.id, client: maintenanceClient, items: [{ id: '1', description: 'Punë', quantity: 1, unitPrice: price }], discount: 0, taxRate: 0, date: '10.06.2027', sent: true });
  const one = make(10);
  store.addPayment(ownerId, 'invoice', one.id, { amount: 10, date: '2027-06-10' });
  await automation.notifyPayments(ownerId);
  await automation.notifyPayments(ownerId);
  const paidNotes = () => companyMail().filter((m) => /pagua/.test(m.subject));
  assert.equal(paidNotes().length, 1);
  assert.match(paidNotes()[0].subject, /U pagua fatura/);
  assert.ok(store.getInvoice(ownerId, one.id).events.some((e) => e.type === 'paid'));

  const batch = [make(11), make(12), make(13)];
  store.markInvoicesPaid(ownerId, { ids: batch.map((inv) => inv.id), date: '2027-06-10' });
  await automation.notifyPayments(ownerId);
  assert.equal(paidNotes().length, 2);
  assert.match(paidNotes()[1].subject, /U paguan 3 fatura/);
});

test('a subscription paid late renews from its original date', async () => {
  const plan = addPlan({ clientId: ipacientiClient.id, items: [{ description: 'iPacienti – Abonim Vjetor', quantity: 1, unitPrice: 100 }], frequency: 'yearly', anchorDate: '2027-08-01' });
  setDay('2027-07-25');
  await automation.runOwner(ownerId);
  const invoice = planInvoices(plan.id)[0];
  setDay('2027-08-20');
  store.addPayment(ownerId, 'invoice', invoice.id, { amount: invoice.total, date: '2027-08-20' });
  const view = automation.planView(ownerId, store.getRecurring(ownerId).plans.find((p) => p.id === plan.id));
  assert.equal(view.subscription.expires, '2028-08-01');
  assert.equal(view.subscription.state, 'active');
  assert.equal(view.next.start, '2028-08-01');
});

// ---- card payments ----------------------------------------------------------------------------------

test('a Stripe payment is recorded only from a signed event, and only once', async () => {
  companyStripe.saveStripe(ownerId, { secretKey: 'sk_test_fake123', webhookSecret: 'whsec_testsecret' });
  assert.equal(companyStripe.stripeReady(ownerId), true);
  setDay('2027-09-01');
  const invoice = store.addInvoice(ownerId, { lifecycle: 'issued', clientId: maintenanceClient.id, client: maintenanceClient, items: [{ id: '1', description: 'Hosting', quantity: 1, unitPrice: 50 }], discount: 0, taxRate: 0, date: '01.09.2027', currency: 'EUR' });

  let created = null;
  companyStripe.setStripeFactory((key) => {
    const real = new Stripe(key);
    return { webhooks: real.webhooks, checkout: { sessions: { create: async (params) => ((created = params), { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }) } } };
  });
  const url = await companyStripe.createCheckout(ownerId, store.getInvoice(ownerId, invoice.id), 'share-token-1234567890');
  assert.equal(url, 'https://checkout.stripe.test/cs_test_1');
  assert.equal(created.line_items[0].price_data.unit_amount, 5000);
  assert.equal(created.line_items[0].price_data.currency, 'eur');
  assert.equal(created.metadata.invoiceId, invoice.id);

  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 5000, currency: 'eur', payment_intent: 'pi_1', metadata: { ownerId, invoiceId: invoice.id } } } });
  const call = async (body, signature) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
    await companyStripe.handleCompanyWebhook({ params: { ownerId }, body: Buffer.from(body), headers: { 'stripe-signature': signature } }, res);
    return res;
  };
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_testsecret' });
  assert.equal((await call(payload, 'v1=forged,t=1')).code, 400, 'a forged event is refused');
  assert.equal(store.getInvoice(ownerId, invoice.id).status, 'unpaid');
  assert.equal((await call(payload, signature)).body.result, 'recorded');
  assert.equal((await call(payload, signature)).body.result, 'duplicate', 'Stripe repeating the event pays nothing twice');
  const paid = store.getInvoice(ownerId, invoice.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.payments.filter((p) => !p.voidedAt).length, 1);
  assert.equal(paid.payments[0].method, 'Stripe');
  companyStripe.setStripeFactory(null);
});

test.after(async () => {
  await store.flushStore();
});
