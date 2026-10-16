// Recurring invoices and automatic delivery.
//
// Every few minutes, for each company:
//   1. each active plan whose next period comes within a week of its send date gets that period's
//      invoice, as a draft scheduled for the send date (one invoice per plan and period, ever);
//   2. every invoice scheduled for today or earlier is issued if it is still a draft and emailed to
//      the customer, with the PDF and a payment link, then the company is told it went out;
//   3. every invoice that has become fully paid since automation was switched on is noted in its
//      history, and the company is told.
//
// Safety: an invoice is marked "sending" before the email leaves. If the server stops in the middle,
// that invoice is found "sending" at the next start and marked failed ("interrupted") instead of
// being sent again, because nobody can know whether the first email went. Failed sends are retried
// a few times only for errors that can pass (network, mail server, PDF), never for a refused address.

const { appUrl } = require('../mail');
const store = require('../store');
const { countSend, deliver: deliverMail, mailReady, messageHtml, parseRecipients, pickSender, cleanEmail } = require('../mailer');
const { pdfAvailable, htmlToPdf } = require('../pdf');
const schedule = require('./schedule');
const templates = require('./templates');
const { stripeReady } = require('./companyStripe');

const TIME_ZONE = 'Europe/Belgrade';
const TICK_MS = Number(process.env.AUTOMATION_TICK_MS) || 10 * 60 * 1000;
const LOOKAHEAD_DAYS = 7;
const RETRY_AFTER_MS = [30 * 60 * 1000, 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];
const RETRYABLE = new Set(['MAIL_CONNECT', 'MAIL_FAILED', 'PDF_FAILED', 'MAIL_LIMIT']);
const NOTIFY_RETRY_MS = 60 * 60 * 1000;

/** What the service uses from the outside world; tests replace parts of it. */
const defaults = {
  now: () => new Date(),
  deliver: deliverMail,
  renderPdf: async (invoice, profile, lang) => {
    const render = shared();
    if (!render || !pdfAvailable()) return null;
    return htmlToPdf(render.renderInvoiceHtml({ invoice, profile, lang }));
  },
};
let deps = { ...defaults };

function setAutomationDeps(next) {
  deps = { ...defaults, ...(next || {}) };
}

function shared() {
  try {
    return require('../generated/invoiceRender');
  } catch {
    return null;
  }
}

function t(lang, key, params) {
  const render = shared();
  return render ? render.translate(lang, key, params) : key;
}

function money(amount, currency) {
  const render = shared();
  return render ? render.formatMoney(Number(amount) || 0, currency || 'EUR') : `${(Number(amount) || 0).toFixed(2)} ${currency || 'EUR'}`;
}

/** Today's date where the companies are (Kosovo), as YYYY-MM-DD. */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(deps.now());
}

function nowIso() {
  return deps.now().toISOString();
}

/** The company's own details, without the sample values a new account starts with. */
function realProfile(ownerId) {
  const profile = store.getProfile(ownerId);
  const render = shared();
  return render && render.realCompany ? { ...profile, ...render.realCompany(profile) } : profile;
}

/** "2026-11-01" as the day.month.year the invoices print. */
function printedDay(day) {
  return templates.formatDay(day);
}

function event(type, detail) {
  return { at: nowIso(), type, ...(detail ? { detail } : {}) };
}

function inFuture(iso) {
  return Boolean(iso) && Date.parse(iso) > deps.now().getTime();
}

// --- plans ---------------------------------------------------------------------------------------

function planIsPaid(ownerId, plan) {
  const invoices = store.listInvoices(ownerId).filter((inv) => inv.recurring && inv.recurring.planId === plan.id);
  return (start) => {
    const invoice = invoices.find((inv) => inv.recurring.period === start);
    return Boolean(invoice && invoice.lifecycle === 'issued' && invoice.status === 'paid');
  };
}

function planHistory(plan, type, detail) {
  return [...(plan.history || []), event(type, detail)].slice(-50);
}

/**
 * Makes the invoice for one period of a plan, unless that period already has one. The plan's record
 * of the period and the invoice's own mark are both checked, so neither a repeated tick nor a restart
 * between the two writes can make a second invoice.
 */
function createPeriodInvoice(ownerId, plan, period) {
  const existing = store.findRecurringInvoice(ownerId, plan.id, period.start);
  const recurring = store.getRecurring(ownerId);
  const index = recurring.plans.findIndex((item) => item.id === plan.id);
  if (index === -1) return null;
  if (existing || (recurring.plans[index].periods || {})[period.start]) {
    if (existing && !(recurring.plans[index].periods || {})[period.start]) {
      recurring.plans[index] = { ...recurring.plans[index], periods: { ...(recurring.plans[index].periods || {}), [period.start]: { invoiceId: existing.id, at: nowIso() } } };
      store.saveRecurring(ownerId, recurring);
    }
    return existing;
  }
  const client = plan.clientId ? store.getClient(ownerId, plan.clientId) : null;
  if (!client) {
    recurring.plans[index] = { ...recurring.plans[index], lastError: 'CLIENT_MISSING', history: planHistory(plan, 'error', { code: 'CLIENT_MISSING', period: period.start }) };
    store.saveRecurring(ownerId, recurring);
    return null;
  }
  const day = today();
  const sendOn = period.sendOn < day ? day : period.sendOn;
  const lang = templates.pickLang(plan.lang, client.language);
  const periodNote = t(lang, 'recurring.periodNote', { from: printedDay(period.start), to: printedDay(period.end) });
  let invoice;
  try {
    invoice = store.addInvoice(ownerId, {
      lifecycle: 'draft',
      clientId: client.id,
      client: { ...client },
      items: (plan.items || []).map((item, i) => ({ id: String(i + 1), description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      discount: plan.discount || 0,
      taxRate: plan.taxRate,
      currency: plan.currency || undefined,
      date: printedDay(sendOn),
      dueDate: printedDay(schedule.dueDateFor(plan, sendOn)),
      notes: [String(plan.notes || '').trim(), periodNote].filter(Boolean).join('\n'),
      sent: false,
      recurring: {
        planId: plan.id,
        period: period.start,
        periodEnd: period.end,
        graceEnds: schedule.addDays(period.start, Math.max(0, Number(plan.graceDays) || 0)),
      },
      delivery: { status: 'scheduled', scheduledFor: sendOn, to: plan.to || [], cc: plan.cc || [], lang: plan.lang || '', from: plan.from || '', attempts: [], createdBy: 'plan' },
      events: [event('generated', { planId: plan.id, period: period.start })],
    });
  } catch (err) {
    const code = err.message === 'PLAN_LIMIT' ? 'PLAN_LIMIT' : 'GENERATE_FAILED';
    recurring.plans[index] = { ...recurring.plans[index], lastError: code, history: planHistory(plan, 'error', { code, period: period.start }) };
    store.saveRecurring(ownerId, recurring);
    return null;
  }
  const fresh = store.getRecurring(ownerId);
  const at = fresh.plans.findIndex((item) => item.id === plan.id);
  if (at !== -1) {
    const current = fresh.plans[at];
    fresh.plans[at] = {
      ...current,
      lastError: null,
      periods: { ...(current.periods || {}), [period.start]: { invoiceId: invoice.id, at: nowIso() } },
      history: planHistory(current, 'generated', { period: period.start, invoiceId: invoice.id, sendOn }),
    };
    store.saveRecurring(ownerId, fresh);
  }
  return invoice;
}

/** Makes every invoice whose period is coming up; a plan never runs ahead more than a few periods per tick. */
function generateDue(ownerId) {
  const day = today();
  const made = [];
  for (const plan of store.getRecurring(ownerId).plans) {
    if (!plan.active || plan.archived) continue;
    const createdDay = String(plan.createdAt || '').slice(0, 10) || day;
    // Up to three invoices per plan per round; periods skipped as history do not count.
    for (let made_ = 0, guard = 0; made_ < 3 && guard < 1000; guard += 1) {
      const current = store.getRecurring(ownerId).plans.find((item) => item.id === plan.id);
      if (!current || !current.active) break;
      const period = schedule.nextPeriod(current, day, { lookahead: LOOKAHEAD_DAYS });
      if (!period || !period.due) break;
      // A period that was over before the plan existed is history, not something to bill now.
      if (period.end < createdDay) {
        const recurring = store.getRecurring(ownerId);
        const i = recurring.plans.findIndex((item) => item.id === plan.id);
        recurring.plans[i] = { ...recurring.plans[i], periods: { ...(recurring.plans[i].periods || {}), [period.start]: { skipped: true, at: nowIso() } } };
        store.saveRecurring(ownerId, recurring);
        continue;
      }
      const invoice = createPeriodInvoice(ownerId, current, period);
      if (!invoice) break;
      made.push(invoice);
      made_ += 1;
    }
  }
  return made;
}

// --- delivery ------------------------------------------------------------------------------------

const inFlight = new Set();

function fail(code, detail) {
  const err = new Error(code);
  err.mailCode = code;
  if (detail) err.detail = detail;
  return err;
}

function ownerAccount(ownerId) {
  const owner = store.findUserById(ownerId);
  return { id: ownerId, accountId: ownerId, email: owner ? owner.email : '' };
}

function planOf(ownerId, invoice) {
  if (!invoice.recurring) return null;
  return store.getRecurring(ownerId).plans.find((plan) => plan.id === invoice.recurring.planId) || null;
}

function recipientsFor(ownerId, invoice) {
  const given = invoice.delivery && Array.isArray(invoice.delivery.to) ? invoice.delivery.to.filter(Boolean) : [];
  if (given.length) return parseRecipients(given);
  const record = invoice.clientId ? store.getClient(ownerId, invoice.clientId) : null;
  const email = cleanEmail((record && record.email) || (invoice.client && invoice.client.email));
  if (!email) throw fail('NO_RECIPIENT');
  return [email];
}

/** The invoice is sent today: a draft takes today's date (and the due date that follows) and is issued. */
function issueForSending(ownerId, invoice, plan) {
  if (invoice.lifecycle !== 'draft') return invoice;
  const day = today();
  const patch = { date: printedDay(day) };
  if (plan) patch.dueDate = printedDay(schedule.dueDateFor(plan, day));
  store.updateInvoice(ownerId, invoice.id, patch);
  return store.issueInvoice(ownerId, invoice.id);
}

/**
 * Emails one invoice now: the scheduled send, a retry, or "Send now" from the page.
 * Returns the invoice as it is afterwards; throws (after noting the failure) when the email did not go.
 */
async function deliverInvoice(ownerId, invoiceId, { manual = false, by = '' } = {}) {
  const key = `${ownerId}:${invoiceId}`;
  if (inFlight.has(key)) throw fail('SENDING');
  let invoice = store.getInvoice(ownerId, invoiceId);
  if (!invoice) return null;
  if (invoice.lifecycle === 'cancelled') throw fail('CANCELLED');
  if (!manual && invoice.delivery && invoice.delivery.status === 'sent') return invoice;
  if (invoice.delivery && invoice.delivery.status === 'sending') throw fail('SENDING');
  const settings = store.getMailSettings(ownerId);
  if (!mailReady(settings)) throw fail('MAIL_NOT_CONFIGURED');

  inFlight.add(key);
  const attemptAt = nowIso();
  try {
    let to;
    try {
      to = recipientsFor(ownerId, invoice);
    } catch (err) {
      recordFailure(ownerId, invoiceId, err, { manual, by, attemptAt });
      throw err;
    }
    const cc = invoice.delivery && Array.isArray(invoice.delivery.cc) ? parseRecipients(invoice.delivery.cc) : [];
    store.mutateInvoiceDelivery(ownerId, invoiceId, (draft) => {
      draft.delivery = { ...(draft.delivery || { attempts: [] }), status: 'sending', attemptAt };
      draft.events.push(event('send_attempt', { manual, by: by || undefined }));
      return draft;
    });

    try {
      const plan = planOf(ownerId, invoice);
      invoice = issueForSending(ownerId, invoice, plan);
      const profile = realProfile(ownerId);
      const record = invoice.clientId ? store.getClient(ownerId, invoice.clientId) : null;
      const lang = templates.pickLang(invoice.delivery && invoice.delivery.lang, plan && plan.lang, record && record.language, invoice.client && invoice.client.language);
      const link = `${appUrl()}/i/?t=${store.shareInvoice(ownerId, invoiceId)}`;
      const paymentUrl = (plan && plan.paymentUrl) || (stripeReady(ownerId) ? `${link}&pay=1` : '');
      const { sender } = pickSender({ company: settings }, ownerAccount(ownerId), profile.companyName, invoice.delivery && invoice.delivery.from);
      const email = templates.invoiceEmail({
        t,
        lang,
        today: today(),
        plan,
        invoice,
        clientName: (record && record.fullName) || (invoice.client && invoice.client.fullName) || '',
        companyName: profile.companyName || 'Next Invoice',
        senderName: [profile.contactPerson, profile.companyName].filter(Boolean).join('\n'),
        money: money(invoice.total, invoice.currency),
        link,
        paymentUrl,
      });
      const attachments = [];
      let pdf = null;
      try {
        pdf = await deps.renderPdf(invoice, profile, lang);
      } catch (err) {
        throw fail('PDF_FAILED', err && err.message);
      }
      if (pdf) attachments.push({ filename: `${String(invoice.number || 'invoice').replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' });
      countSend(ownerId);
      const button = paymentUrl ? { url: paymentUrl, label: t(lang, 'recurring.mail.payButton') } : { url: link, label: t(lang, 'send.viewInvoice') };
      await deps.deliver(settings, { sender, to, cc, subject: email.subject, text: email.text, html: messageHtml(email.text, { button, accent: profile.accentColor }), attachments });

      store.recordInvoiceEmail(ownerId, invoiceId, { from: sender.email, to, cc, subject: email.subject, attached: attachments.length > 0 });
      invoice = store.mutateInvoiceDelivery(ownerId, invoiceId, (draft) => {
        const attempts = [...((draft.delivery && draft.delivery.attempts) || []), { at: attemptAt, ok: true, manual, by: by || undefined }].slice(-20);
        draft.delivery = { ...(draft.delivery || {}), status: 'sent', sentAt: nowIso(), attempts, lastError: null, lastDetail: null, nextRetryAt: null, template: email.kind, lang };
        draft.events.push(event('sent', { to, template: email.kind, attached: attachments.length > 0 }));
        return draft;
      });
      if (plan) touchPlan(ownerId, plan.id, 'sent', { invoiceId, number: invoice.number });
      await notifySent(ownerId, invoice, to).catch(() => {});
      return store.getInvoice(ownerId, invoiceId);
    } catch (err) {
      recordFailure(ownerId, invoiceId, err, { manual, by, attemptAt });
      throw err;
    }
  } finally {
    inFlight.delete(key);
  }
}

function recordFailure(ownerId, invoiceId, err, { manual, by, attemptAt }) {
  const code = String((err && (err.mailCode || err.message)) || 'MAIL_FAILED');
  const detail = err && err.detail ? String(err.detail).slice(0, 300) : null;
  store.mutateInvoiceDelivery(ownerId, invoiceId, (draft) => {
    const attempts = [...((draft.delivery && draft.delivery.attempts) || []), { at: attemptAt, ok: false, code, detail, manual, by: by || undefined }].slice(-20);
    const failures = attempts.filter((item) => !item.ok).length;
    const retry = RETRYABLE.has(code) && failures <= RETRY_AFTER_MS.length ? new Date(deps.now().getTime() + RETRY_AFTER_MS[failures - 1]).toISOString() : null;
    draft.delivery = { ...(draft.delivery || {}), status: 'failed', attempts, lastError: code, lastDetail: detail, nextRetryAt: retry };
    draft.events.push(event('send_failed', { code, detail, retryAt: retry }));
    return draft;
  });
  const invoice = store.getInvoice(ownerId, invoiceId);
  if (invoice && invoice.recurring) touchPlan(ownerId, invoice.recurring.planId, 'send_failed', { invoiceId, code });
}

function touchPlan(ownerId, planId, type, detail) {
  const recurring = store.getRecurring(ownerId);
  const i = recurring.plans.findIndex((item) => item.id === planId);
  if (i === -1) return;
  recurring.plans[i] = { ...recurring.plans[i], history: planHistory(recurring.plans[i], type, detail) };
  store.saveRecurring(ownerId, recurring);
}

/** Whether the scheduler should email this invoice now. */
function dueForSending(invoice, day) {
  const delivery = invoice.delivery;
  if (!delivery || invoice.lifecycle === 'cancelled') return false;
  if (delivery.status === 'scheduled') return Boolean(delivery.scheduledFor) && delivery.scheduledFor <= day;
  if (delivery.status === 'failed') return Boolean(delivery.nextRetryAt) && !inFuture(delivery.nextRetryAt);
  return false;
}

async function sendDue(ownerId) {
  if (!mailReady(store.getMailSettings(ownerId))) return 0;
  const day = today();
  // A paused (or deleted) plan holds back the invoices it made that have not gone out yet.
  const held = new Set(store.getRecurring(ownerId).plans.filter((plan) => !plan.active || plan.archived).map((plan) => plan.id));
  let sent = 0;
  for (const invoice of store.listInvoices(ownerId)) {
    if (!dueForSending(invoice, day)) continue;
    if (invoice.recurring && held.has(invoice.recurring.planId)) continue;
    try {
      await deliverInvoice(ownerId, invoice.id, { manual: false, by: 'scheduler' });
      sent += 1;
    } catch (err) {
      // Noted on the invoice; the next tick decides about a retry.
    }
  }
  return sent;
}

/** Sends found half-done after a restart are marked failed, never sent again on a guess. */
function recoverInterrupted() {
  for (const ownerId of store.automationOwners()) {
    for (const invoice of store.listInvoices(ownerId)) {
      if (!invoice.delivery || invoice.delivery.status !== 'sending') continue;
      store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
        draft.delivery = { ...draft.delivery, status: 'failed', lastError: 'INTERRUPTED', lastDetail: null, nextRetryAt: null };
        draft.events.push(event('send_failed', { code: 'INTERRUPTED' }));
        return draft;
      });
    }
  }
}

// --- scheduling by hand --------------------------------------------------------------------------

function scheduleInvoice(ownerId, invoiceId, { date, to, cc, lang } = {}) {
  if (!schedule.isDay(date)) throw fail('DATE_INVALID');
  const invoice = store.getInvoice(ownerId, invoiceId);
  if (!invoice) return null;
  if (invoice.lifecycle === 'cancelled') throw fail('CANCELLED');
  if (invoice.delivery && invoice.delivery.status === 'sending') throw fail('SENDING');
  const recipients = to === undefined ? undefined : parseRecipients(to);
  const copies = cc === undefined ? undefined : parseRecipients(cc);
  return store.mutateInvoiceDelivery(ownerId, invoiceId, (draft) => {
    const before = draft.delivery && draft.delivery.scheduledFor;
    draft.delivery = {
      ...(draft.delivery || { attempts: [] }),
      status: 'scheduled',
      scheduledFor: date,
      nextRetryAt: null,
      ...(recipients !== undefined ? { to: recipients } : {}),
      ...(copies !== undefined ? { cc: copies } : {}),
      ...(lang !== undefined ? { lang: templates.LANGS.includes(lang) ? lang : '' } : {}),
    };
    draft.events.push(event(before ? 'rescheduled' : 'scheduled', { date, from: before || undefined }));
    return draft;
  });
}

function unscheduleInvoice(ownerId, invoiceId) {
  const invoice = store.getInvoice(ownerId, invoiceId);
  if (!invoice) return null;
  if (invoice.delivery && invoice.delivery.status === 'sending') throw fail('SENDING');
  return store.mutateInvoiceDelivery(ownerId, invoiceId, (draft) => {
    if (!draft.delivery || !['scheduled', 'failed'].includes(draft.delivery.status)) return null;
    draft.delivery = { ...draft.delivery, status: 'cancelled', nextRetryAt: null };
    draft.events.push(event('unscheduled'));
    return draft;
  });
}

// --- notifications to the company ----------------------------------------------------------------

function notifyTargets(ownerId) {
  const settings = store.getRecurring(ownerId).settings;
  const owner = store.findUserById(ownerId);
  const list = (settings.notifyEmails || []).length ? settings.notifyEmails : owner ? [owner.email] : [];
  return { settings, to: list.map(cleanEmail).filter(Boolean) };
}

async function sendNotice(ownerId, notice) {
  const mail = store.getMailSettings(ownerId);
  if (!mailReady(mail)) throw fail('MAIL_NOT_CONFIGURED');
  const { to } = notifyTargets(ownerId);
  if (!to.length) throw fail('NO_RECIPIENT');
  const profile = realProfile(ownerId);
  const { sender } = pickSender({ company: mail }, ownerAccount(ownerId), profile.companyName);
  countSend(ownerId);
  await deps.deliver(mail, { sender: { ...sender, name: 'Next Invoice' }, to, subject: notice.subject, text: notice.text, html: messageHtml(notice.text, { accent: profile.accentColor }) });
  return to;
}

function subscriptionFacts(ownerId, invoice) {
  const plan = planOf(ownerId, invoice);
  if (!plan || !templates.isSubscription(plan)) return null;
  return { plan, product: templates.productName(plan, invoice) };
}

async function notifySent(ownerId, invoice, to) {
  // The Slack channel hears of it whatever the email notices are set to.
  require('../slack').invoiceSent(ownerId, invoice, to).catch(() => {});
  const { settings } = notifyTargets(ownerId);
  if (!settings.notifySent) return;
  const profile = realProfile(ownerId);
  const lang = templates.pickLang(profile.language);
  const facts = subscriptionFacts(ownerId, invoice);
  const notice = templates.sentNotice({
    t,
    lang,
    invoice,
    clientName: (invoice.client && invoice.client.fullName) || '',
    money: money(invoice.total, invoice.currency),
    to,
    subscription: facts ? { product: facts.product, from: invoice.recurring.period, to: invoice.recurring.periodEnd } : null,
  });
  try {
    const recipients = await sendNotice(ownerId, notice);
    store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
      draft.notified = { ...(draft.notified || {}), sent: nowIso() };
      draft.events.push(event('notified_sent', { to: recipients }));
      return draft;
    });
  } catch (err) {
    store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
      draft.events.push(event('notify_failed', { kind: 'sent', code: err.mailCode || err.message }));
      return draft;
    });
  }
}

/** The last payment that made the invoice paid: its date and where it came from. */
function closingPayment(invoice) {
  const payments = (invoice.payments || []).filter((payment) => !payment.voidedAt);
  return payments.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).pop() || null;
}

/**
 * Invoices that became fully paid since automation was switched on: each is noted once in its
 * history, and the company is told once. Several paid in the same round (a bank statement, "mark all
 * paid") go out as one email listing them, not one email each. A failed email is tried again later.
 */
async function notifyPayments(ownerId) {
  const { settings } = notifyTargets(ownerId);
  const since = settings.notifySince;
  if (!since) return 0;
  const fresh = [];
  for (const invoice of store.listInvoices(ownerId)) {
    if (invoice.lifecycle !== 'issued' || invoice.status !== 'paid') continue;
    const notified = invoice.notified || {};
    if (notified.paid) continue;
    const payment = closingPayment(invoice);
    if (!payment || String(payment.createdAt || '') < since) continue;
    const facts = subscriptionFacts(ownerId, invoice);
    const through = facts ? schedule.paidThrough(facts.plan, planIsPaid(ownerId, facts.plan)) : null;
    if (!notified.paidEvent) {
      store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
        draft.notified = { ...(draft.notified || {}), paidEvent: nowIso() };
        draft.events.push(event('paid', { amount: payment.amount, date: payment.date, method: payment.method || undefined, through: through || undefined }));
        return draft;
      });
      if (facts) touchPlan(ownerId, facts.plan.id, 'paid', { invoiceId: invoice.id, through });
    }
    if (!settings.notifyPaid) continue;
    if (notified.paidRetryAt && inFuture(notified.paidRetryAt)) continue;
    fresh.push({ invoice, payment, facts, through });
  }
  if (fresh.length === 0) return 0;

  const profile = realProfile(ownerId);
  const lang = templates.pickLang(profile.language);
  const row = ({ invoice, payment, facts, through }) => ({
    invoice,
    clientName: (invoice.client && invoice.client.fullName) || '',
    money: money(invoice.total, invoice.currency),
    paidOn: payment.date,
    source: payment.method || '',
    subscription: facts ? { product: facts.product, through } : null,
  });
  const notice = fresh.length === 1 ? templates.paidNotice({ t, lang, ...row(fresh[0]) }) : templates.paidDigest({ t, lang, rows: fresh.map(row) });
  try {
    const recipients = await sendNotice(ownerId, notice);
    for (const { invoice } of fresh) {
      store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
        draft.notified = { ...(draft.notified || {}), paid: nowIso(), paidRetryAt: null };
        draft.events.push(event('notified_paid', { to: recipients, together: fresh.length > 1 ? fresh.length : undefined }));
        return draft;
      });
    }
    return fresh.length;
  } catch (err) {
    for (const { invoice } of fresh) {
      store.mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
        draft.notified = { ...(draft.notified || {}), paidRetryAt: new Date(deps.now().getTime() + NOTIFY_RETRY_MS).toISOString() };
        draft.events.push(event('notify_failed', { kind: 'paid', code: err.mailCode || err.message }));
        return draft;
      });
    }
    return 0;
  }
}

// --- the loop ------------------------------------------------------------------------------------

const running = new Set();

async function runOwner(ownerId) {
  if (running.has(ownerId)) return { skipped: true };
  running.add(ownerId);
  try {
    const generated = generateDue(ownerId).length;
    const sent = await sendDue(ownerId);
    const paid = await notifyPayments(ownerId);
    return { generated, sent, paid };
  } finally {
    running.delete(ownerId);
  }
}

async function runAll() {
  for (const ownerId of store.automationOwners()) {
    await runOwner(ownerId).catch((err) => console.error('[automation]', ownerId, err));
  }
}

let timer = null;

function startAutomation() {
  if (timer || process.env.AUTOMATION === 'off') return;
  recoverInterrupted();
  setTimeout(() => runAll().catch(() => {}), Number(process.env.AUTOMATION_FIRST_MS) || 90 * 1000).unref();
  timer = setInterval(() => runAll().catch(() => {}), TICK_MS);
  timer.unref();
}

// --- what the pages see ----------------------------------------------------------------------------

function planView(ownerId, plan) {
  const day = today();
  const period = plan.active ? schedule.nextPeriod(plan, day, { lookahead: LOOKAHEAD_DAYS }) : null;
  const invoices = store
    .listInvoices(ownerId)
    .filter((inv) => inv.recurring && inv.recurring.planId === plan.id)
    .sort((a, b) => String(b.recurring.period).localeCompare(String(a.recurring.period)));
  const subscription = templates.isSubscription(plan) ? schedule.subscriptionStatus(plan, day, planIsPaid(ownerId, plan)) : null;
  return {
    ...plan,
    isSubscription: templates.isSubscription(plan),
    productName: templates.productName(plan),
    next: period ? { start: period.start, end: period.end, sendOn: period.sendOn } : null,
    subscription,
    invoices: invoices.slice(0, 12).map((inv) => ({
      id: inv.id,
      number: inv.number,
      period: inv.recurring.period,
      periodEnd: inv.recurring.periodEnd,
      lifecycle: inv.lifecycle,
      status: inv.status,
      total: inv.total,
      currency: inv.currency,
      delivery: inv.delivery ? { status: inv.delivery.status, scheduledFor: inv.delivery.scheduledFor, sentAt: inv.delivery.sentAt, lastError: inv.delivery.lastError } : null,
    })),
  };
}

module.exports = {
  LOOKAHEAD_DAYS,
  setAutomationDeps,
  today,
  generateDue,
  createPeriodInvoice,
  deliverInvoice,
  sendDue,
  dueForSending,
  recoverInterrupted,
  scheduleInvoice,
  unscheduleInvoice,
  notifySent,
  notifyPayments,
  runOwner,
  runAll,
  startAutomation,
  planView,
};
