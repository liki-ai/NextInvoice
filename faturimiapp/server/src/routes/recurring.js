const crypto = require('crypto');
const express = require('express');
const { authRequired, managerRequired } = require('../auth');
const store = require('../store');
const { normalizeTaxRate, toNumber } = require('../domain');
const { parseRecipients, cleanEmail } = require('../mailer');
const schedule = require('../automation/schedule');
const automation = require('../automation/service');
const companyStripe = require('../automation/companyStripe');

// Recurring invoices: the company's plans, the notifications it gets, and card payments by Stripe.

const router = express.Router();
router.use(authRequired);

const PLAN_MAX = 200;

const ERRORS = {
  PLAN_CLIENT: [400, 'Choose a client.'],
  PLAN_ITEMS: [400, 'Add at least one line with a description and a price.'],
  PLAN_FREQUENCY: [400, 'Choose how often the invoice repeats.'],
  PLAN_DATE: [400, 'Enter a valid renewal date.'],
  PLAN_NUMBERS: [400, 'Days must be whole numbers within the allowed range.'],
  PLAN_URL: [400, 'The payment link must start with https://'],
  PLAN_DATES_LOCKED: [409, 'The renewal date and frequency cannot change once invoices have been made; stop this plan and start a new one.'],
  PLAN_LIMIT: [409, 'Too many plans.'],
  PLAN_FIRST: [400, 'This invoice cannot start a plan.'],
  MAIL_RECIPIENT: [400, 'Enter valid email addresses.'],
  STRIPE_KEY: [400, 'This is not a Stripe secret key (sk_live_… or sk_test_…).'],
  STRIPE_WEBHOOK: [400, 'This is not a Stripe webhook signing secret (whsec_…).'],
  STRIPE_INCOMPLETE: [400, 'Enter both the secret key and the webhook signing secret.'],
};

function sendError(res, err) {
  const code = err && (err.planCode || err.stripeCode || err.mailCode || err.message);
  const mapped = ERRORS[code];
  if (!mapped) return false;
  res.status(mapped[0]).json({ error: mapped[1], code });
  return true;
}

function fail(code) {
  const err = new Error(code);
  err.planCode = code;
  return err;
}

function wholeNumber(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw fail('PLAN_NUMBERS');
  return n;
}

/** A plan as the form sent it, checked; `current` is the saved plan when editing. */
function sanitizePlan(ownerId, body, current) {
  const src = body && typeof body === 'object' ? body : {};
  const clientId = String(src.clientId || (current && current.clientId) || '');
  if (!clientId || !store.getClient(ownerId, clientId)) throw fail('PLAN_CLIENT');
  const items = (Array.isArray(src.items) ? src.items : (current && current.items) || [])
    .map((item) => ({ description: String((item && item.description) || '').trim().slice(0, 500), quantity: toNumber(item && item.quantity) || 1, unitPrice: toNumber(item && item.unitPrice) }))
    .filter((item) => item.description && item.unitPrice >= 0);
  if (items.length === 0 || items.length > 50) throw fail('PLAN_ITEMS');
  const frequency = String(src.frequency || (current && current.frequency) || '');
  if (!schedule.FREQUENCIES[frequency]) throw fail('PLAN_FREQUENCY');
  const anchorDate = String(src.anchorDate || (current && current.anchorDate) || '');
  if (!schedule.isDay(anchorDate)) throw fail('PLAN_DATE');
  const endDate = src.endDate ? String(src.endDate) : '';
  if (endDate && (!schedule.isDay(endDate) || endDate < anchorDate)) throw fail('PLAN_DATE');
  if (current && Object.keys(current.periods || {}).length && (anchorDate !== current.anchorDate || frequency !== current.frequency)) throw fail('PLAN_DATES_LOCKED');
  const paymentUrl = String(src.paymentUrl || '').trim();
  if (paymentUrl && !/^https:\/\/[^\s]+$/.test(paymentUrl)) throw fail('PLAN_URL');
  return {
    clientId,
    product: String(src.product || '').trim().slice(0, 80),
    kind: ['auto', 'subscription', 'invoice'].includes(src.kind) ? src.kind : 'auto',
    items,
    discount: Math.max(0, toNumber(src.discount)),
    taxRate: normalizeTaxRate(src.taxRate),
    currency: String(src.currency || store.getProfile(ownerId).currency || 'EUR').toUpperCase().slice(0, 3),
    frequency,
    anchorDate,
    endDate,
    sendDaysBefore: wholeNumber(src.sendDaysBefore, 0, 90, 7),
    dueDays: wholeNumber(src.dueDays, 0, 120, wholeNumber(src.sendDaysBefore, 0, 90, 7)),
    graceDays: wholeNumber(src.graceDays, 0, 60, 7),
    lang: ['sq', 'en', 'it'].includes(src.lang) ? src.lang : '',
    to: parseRecipients(src.to || []),
    cc: parseRecipients(src.cc || []),
    from: cleanEmail(src.from) || '',
    paymentUrl,
    notes: String(src.notes || '').trim().slice(0, 1000),
    // 'manual': each period's invoice is made as a draft for the company to check and send itself.
    sendMode: src.sendMode === 'manual' ? 'manual' : 'auto',
    active: src.active === undefined ? (current ? current.active : true) : Boolean(src.active),
  };
}

function describe(ownerId) {
  const recurring = store.getRecurring(ownerId);
  const settings = recurring.settings;
  return {
    plans: recurring.plans.filter((plan) => !plan.archived).map((plan) => automation.planView(ownerId, plan)),
    settings: {
      notifyEmails: settings.notifyEmails || [],
      notifySent: settings.notifySent !== false,
      notifyPaid: settings.notifyPaid !== false,
      notifySince: settings.notifySince,
      stripe: companyStripe.publicStripe(ownerId),
    },
    today: automation.today(),
    lookahead: automation.LOOKAHEAD_DAYS,
  };
}

/** Notifications about payments count from the moment the company starts using automation. */
function ensureNotifySince(recurring) {
  if (!recurring.settings.notifySince) recurring.settings = { ...recurring.settings, notifySince: new Date().toISOString() };
  return recurring;
}

router.get('/', (req, res) => {
  res.json(describe(req.user.id));
});

/**
 * The invoice a plan starts from, when it is made from the invoice form: that invoice is the plan's
 * first period, so the plan goes on with the next one.
 */
function firstInvoiceOf(ownerId, invoiceId) {
  if (!invoiceId) return null;
  const invoice = store.getInvoice(ownerId, String(invoiceId));
  if (!invoice || invoice.recurring || invoice.lifecycle === 'cancelled') throw fail('PLAN_FIRST');
  return invoice;
}

router.post('/', (req, res, next) => {
  try {
    const recurring = ensureNotifySince(store.getRecurring(req.user.id));
    if (recurring.plans.length >= PLAN_MAX) throw fail('PLAN_LIMIT');
    const now = new Date().toISOString();
    const first = firstInvoiceOf(req.user.id, req.body && req.body.firstInvoiceId);
    const fields = sanitizePlan(req.user.id, req.body, null);
    const periods = first ? { [fields.anchorDate]: { invoiceId: first.id, at: now } } : {};
    const plan = { id: crypto.randomUUID(), ...fields, periods, createdAt: now, updatedAt: now, createdBy: req.user.email, history: [{ at: now, type: 'created', detail: { by: req.user.email, ...(first ? { invoiceId: first.id } : {}) } }] };
    recurring.plans.push(plan);
    store.saveRecurring(req.user.id, recurring);
    if (first) {
      store.mutateInvoiceDelivery(req.user.id, first.id, (draft) => {
        draft.recurring = {
          planId: plan.id,
          period: plan.anchorDate,
          periodEnd: schedule.periodOf(plan, 0).end,
          graceEnds: schedule.addDays(plan.anchorDate, Math.max(0, Number(plan.graceDays) || 0)),
        };
        draft.events.push({ at: now, type: 'planStarted', detail: { planId: plan.id, by: req.user.email } });
        return draft;
      });
    }
    // A period due now is made at once, so the page shows it without waiting for the next round.
    automation.generateDue(req.user.id);
    res.status(201).json({ ...describe(req.user.id), planId: plan.id });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.put('/settings', managerRequired, (req, res, next) => {
  try {
    const recurring = ensureNotifySince(store.getRecurring(req.user.id));
    const body = req.body || {};
    recurring.settings = {
      ...recurring.settings,
      notifyEmails: body.notifyEmails === undefined ? recurring.settings.notifyEmails : parseRecipients(body.notifyEmails),
      notifySent: body.notifySent === undefined ? recurring.settings.notifySent : Boolean(body.notifySent),
      notifyPaid: body.notifyPaid === undefined ? recurring.settings.notifyPaid : Boolean(body.notifyPaid),
    };
    store.saveRecurring(req.user.id, recurring);
    res.json(describe(req.user.id));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.put('/stripe', managerRequired, (req, res, next) => {
  try {
    companyStripe.saveStripe(req.user.id, req.body || {});
    res.json(describe(req.user.id));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.delete('/stripe', managerRequired, (req, res) => {
  companyStripe.removeStripe(req.user.id);
  res.json(describe(req.user.id));
});

router.put('/:id', (req, res, next) => {
  try {
    const recurring = store.getRecurring(req.user.id);
    const index = recurring.plans.findIndex((plan) => plan.id === req.params.id && !plan.archived);
    if (index === -1) return res.status(404).json({ error: 'Plan not found.' });
    const current = recurring.plans[index];
    const next = sanitizePlan(req.user.id, { ...current, ...(req.body || {}) }, current);
    const changes = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]));
    const type = changes.length === 1 && changes[0] === 'active' ? (next.active ? 'resumed' : 'paused') : 'edited';
    recurring.plans[index] = {
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
      history: [...(current.history || []), { at: new Date().toISOString(), type, detail: { by: req.user.email, fields: changes } }].slice(-50),
    };
    store.saveRecurring(req.user.id, recurring);
    automation.generateDue(req.user.id);
    res.json(describe(req.user.id));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

/** A plan that has made invoices is kept, out of sight, so their history still points somewhere. */
router.delete('/:id', (req, res) => {
  const recurring = store.getRecurring(req.user.id);
  const index = recurring.plans.findIndex((plan) => plan.id === req.params.id && !plan.archived);
  if (index === -1) return res.status(404).json({ error: 'Plan not found.' });
  const plan = recurring.plans[index];
  if (Object.keys(plan.periods || {}).length) {
    recurring.plans[index] = { ...plan, active: false, archived: true, history: [...(plan.history || []), { at: new Date().toISOString(), type: 'archived', detail: { by: req.user.email } }].slice(-50) };
  } else {
    recurring.plans.splice(index, 1);
  }
  store.saveRecurring(req.user.id, recurring);
  res.json(describe(req.user.id));
});

module.exports = router;
module.exports.sendRecurringError = sendError;
