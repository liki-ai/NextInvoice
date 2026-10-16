const store = require('./store');
const { appUrl } = require('./mail');

// Messages to a Slack channel of the company's choosing, through an incoming webhook it creates in
// Slack (one channel per webhook): a reminder sent, an invoice sent, an invoice paid. The webhook URL
// is a secret that lets anyone post to the channel, so the page only ever sees its last characters.
// The settings live with the company's other notification settings.

const WEBHOOK = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]{10,300}$/;
const EVENTS = ['sent', 'reminder', 'paid'];
const CHECK_EVERY_MS = 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;

let post = postWebhook;

function slackError(code) {
  const err = new Error(code);
  err.slackCode = code;
  return err;
}

function settingsOf(ownerId) {
  const slack = store.getRecurring(ownerId).settings.slack || {};
  return {
    webhook: typeof slack.webhook === 'string' ? slack.webhook : '',
    channel: typeof slack.channel === 'string' ? slack.channel : '',
    events: { sent: slack.events?.sent !== false, reminder: slack.events?.reminder !== false, paid: slack.events?.paid !== false },
    since: slack.since || null,
    lastError: slack.lastError || null,
    lastAt: slack.lastAt || null,
  };
}

function saveSettings(ownerId, change) {
  const recurring = store.getRecurring(ownerId);
  const current = recurring.settings.slack || {};
  recurring.settings = { ...recurring.settings, slack: { ...current, ...change } };
  store.saveRecurring(ownerId, recurring);
}

/** What the page sees: never the webhook itself. */
function describe(ownerId) {
  const settings = settingsOf(ownerId);
  return {
    connected: Boolean(settings.webhook),
    webhookHint: settings.webhook ? `…${settings.webhook.slice(-6)}` : '',
    channel: settings.channel,
    events: settings.events,
    lastAt: settings.lastAt,
    lastError: settings.lastError,
  };
}

function update(ownerId, body) {
  const change = {};
  if (body.webhook !== undefined) {
    const webhook = String(body.webhook || '').trim();
    if (webhook && !WEBHOOK.test(webhook)) throw slackError('SLACK_WEBHOOK');
    change.webhook = webhook;
    // Payments count from the moment the channel is connected, not the company's whole history.
    if (webhook && !settingsOf(ownerId).webhook) change.since = new Date().toISOString();
    if (!webhook) change.since = null;
    change.lastError = null;
  }
  if (body.channel !== undefined) change.channel = String(body.channel || '').replace(/^#/, '').trim().slice(0, 80);
  if (body.events && typeof body.events === 'object') {
    const current = settingsOf(ownerId).events;
    // Payments switched back on count from now, not from everything paid while they were off.
    if (body.events.paid === true && !current.paid && settingsOf(ownerId).webhook) change.since = new Date().toISOString();
    change.events = Object.fromEntries(EVENTS.map((key) => [key, body.events[key] === undefined ? current[key] : Boolean(body.events[key])]));
  }
  saveSettings(ownerId, change);
  return describe(ownerId);
}

async function postWebhook(webhook, text) {
  const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, unfurl_links: false }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw slackError(`SLACK_${res.status}`);
}

/** Posts to the company's channel; a failure is kept for the page and never stops what triggered it. */
async function send(ownerId, text, { test = false } = {}) {
  const { webhook } = settingsOf(ownerId);
  if (!webhook) {
    if (test) throw slackError('SLACK_NOT_CONNECTED');
    return false;
  }
  try {
    await post(webhook, text);
    saveSettings(ownerId, { lastAt: new Date().toISOString(), lastError: null });
    return true;
  } catch (err) {
    saveSettings(ownerId, { lastError: err.slackCode || 'SLACK_FAILED' });
    if (test) throw err;
    return false;
  }
}

// --- the messages --------------------------------------------------------------------------------

const TEXTS = {
  sq: {
    test: 'Next Invoice u lidh me këtë kanal. Këtu do të vijnë kujtesat, faturat e dërguara dhe pagesat.',
    sent: '📤 Fatura {invoice} u dërgua te *{client}* ({to}) · {amount}',
    reminder: '🔔 Kujtesë pagese u dërgua te *{client}* ({to}) për {count} {invoices}: {numbers} · për t’u paguar {amount}',
    invoiceOne: 'faturë',
    invoiceMany: 'fatura',
    paid: '✅ Fatura {invoice} nga *{client}* u pagua · {amount}{when}',
    paidOn: ' më {date}',
    paidMany: '✅ {count} fatura u paguan:',
  },
  en: {
    test: 'Next Invoice is connected to this channel. Reminders, sent invoices and payments will appear here.',
    sent: '📤 Invoice {invoice} was sent to *{client}* ({to}) · {amount}',
    reminder: '🔔 Payment reminder sent to *{client}* ({to}) for {count} {invoices}: {numbers} · {amount} due',
    invoiceOne: 'invoice',
    invoiceMany: 'invoices',
    paid: '✅ Invoice {invoice} from *{client}* was paid · {amount}{when}',
    paidOn: ' on {date}',
    paidMany: '✅ {count} invoices were paid:',
  },
  it: {
    test: 'Next Invoice è collegato a questo canale. Qui arriveranno promemoria, fatture inviate e pagamenti.',
    sent: '📤 La fattura {invoice} è stata inviata a *{client}* ({to}) · {amount}',
    reminder: '🔔 Promemoria di pagamento inviato a *{client}* ({to}) per {count} {invoices}: {numbers} · da pagare {amount}',
    invoiceOne: 'fattura',
    invoiceMany: 'fatture',
    paid: '✅ La fattura {invoice} di *{client}* è stata pagata · {amount}{when}',
    paidOn: ' il {date}',
    paidMany: '✅ {count} fatture sono state pagate:',
  },
};

function textsFor(ownerId) {
  const language = String((store.getProfile(ownerId) || {}).language || 'sq').slice(0, 2);
  return TEXTS[language] || TEXTS.sq;
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (_m, key) => (params[key] === undefined ? '' : String(params[key])));
}

/** Slack treats <, > and & as markup; names and emails are shown as typed. */
function plain(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function money(amount, currency) {
  const value = Number(amount) || 0;
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency && currency !== 'EUR' ? `${formatted} ${currency}` : `${formatted} €`;
}

function invoiceLink(invoice) {
  return `<${appUrl()}/app/invoices/${encodeURIComponent(invoice.id)}|${plain(invoice.number)}>`;
}

function clientOf(invoice) {
  return plain((invoice.clientSnapshot && invoice.clientSnapshot.fullName) || (invoice.client && invoice.client.fullName) || '—');
}

function recipients(to) {
  return plain((Array.isArray(to) ? to : [to]).filter(Boolean).join(', '));
}

/** The invoice went out by email (from the send dialog or on schedule). */
function invoiceSent(ownerId, invoice, to) {
  const settings = settingsOf(ownerId);
  if (!settings.webhook || !settings.events.sent || !invoice) return Promise.resolve(false);
  const texts = textsFor(ownerId);
  return send(ownerId, fill(texts.sent, { invoice: invoiceLink(invoice), client: clientOf(invoice), to: recipients(to), amount: money(invoice.total, invoice.currency) }));
}

/** A payment reminder went out by email for one or more invoices of one client. */
function reminderSent(ownerId, invoices, to) {
  const settings = settingsOf(ownerId);
  const list = (invoices || []).filter(Boolean);
  if (!settings.webhook || !settings.events.reminder || list.length === 0) return Promise.resolve(false);
  const texts = textsFor(ownerId);
  const due = list.reduce((sum, invoice) => sum + (Number(invoice.amountDue) || 0), 0);
  return send(
    ownerId,
    fill(texts.reminder, {
      client: clientOf(list[0]),
      to: recipients(to),
      count: list.length,
      invoices: list.length === 1 ? texts.invoiceOne : texts.invoiceMany,
      numbers: list.map(invoiceLink).join(', '),
      amount: money(due, list[0].currency),
    }),
  );
}

function closingPayment(invoice) {
  const payments = (invoice.payments || []).filter((payment) => !payment.voidedAt);
  return payments.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).pop() || null;
}

function dayText(value) {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return day ? `${day[3]}.${day[2]}.${day[1]}` : '';
}

/**
 * Invoices fully paid since the channel was connected, each told once; several paid in one go
 * (a bank statement, "mark all paid") make one message. Whatever marked them paid, it is found here.
 */
async function notifyPaid(ownerId) {
  const settings = settingsOf(ownerId);
  if (!settings.webhook || !settings.events.paid || !settings.since) return 0;
  const fresh = [];
  for (const invoice of store.listInvoices(ownerId)) {
    if (invoice.lifecycle !== 'issued' || invoice.status !== 'paid') continue;
    const notified = invoice.notified || {};
    if (notified.slackPaid) continue;
    if (notified.slackRetryAt && new Date(notified.slackRetryAt) > new Date()) continue;
    const payment = closingPayment(invoice);
    if (!payment || String(payment.createdAt || '') < settings.since) continue;
    fresh.push({ invoice, payment });
  }
  if (fresh.length === 0) return 0;
  const texts = textsFor(ownerId);
  const line = ({ invoice, payment }) =>
    fill(texts.paid, { invoice: invoiceLink(invoice), client: clientOf(invoice), amount: money(invoice.total, invoice.currency), when: dayText(payment.date) ? fill(texts.paidOn, { date: dayText(payment.date) }) : '' });
  const text = fresh.length === 1 ? line(fresh[0]) : [fill(texts.paidMany, { count: fresh.length }), ...fresh.map((item) => `• ${line(item).replace(/^✅ /, '')}`)].join('\n');
  const ok = await send(ownerId, text);
  const at = new Date().toISOString();
  for (const { invoice } of fresh) {
    store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
      draft.notified = ok ? { ...(draft.notified || {}), slackPaid: at, slackRetryAt: null } : { ...(draft.notified || {}), slackRetryAt: new Date(Date.now() + RETRY_MS).toISOString() };
      return draft;
    });
  }
  return ok ? fresh.length : 0;
}

function test(ownerId) {
  return send(ownerId, textsFor(ownerId).test, { test: true });
}

// --- the loop ------------------------------------------------------------------------------------

let timer = null;
let busy = false;

async function checkAll() {
  if (busy) return;
  busy = true;
  try {
    for (const ownerId of store.automationOwners()) {
      if (!settingsOf(ownerId).webhook) continue;
      await notifyPaid(ownerId).catch((err) => console.error('[slack]', ownerId, err.message));
    }
  } finally {
    busy = false;
  }
}

function startSlack() {
  if (timer || process.env.SLACK_CHECKS === 'off') return;
  timer = setInterval(() => checkAll().catch(() => {}), CHECK_EVERY_MS);
  timer.unref();
}

/** For tests: messages go to the given function instead of Slack. */
function setPoster(fn) {
  post = fn || postWebhook;
}

module.exports = { describe, update, test, invoiceSent, reminderSent, notifyPaid, startSlack, setPoster };
