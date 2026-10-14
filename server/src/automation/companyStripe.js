// Card payments for a company's own invoices, through the company's own Stripe account (not the one
// Next Invoice bills its subscriptions with). The customer opens the invoice link, presses "Pay by
// card", and is sent to a Stripe Checkout page for what is still owed. Stripe then calls the
// company's webhook; only an event whose signature checks out records the payment, and each Stripe
// session is recorded once however often Stripe repeats it.

const Stripe = require('stripe');
const { decryptSecret, encryptSecret } = require('../mailer');
const { appUrl } = require('../mail');
const { getRecurring, saveRecurring, mutateInvoiceDelivery, addPayment, getInvoice } = require('../store');

let factory = (key) => new Stripe(key);

/** Tests swap in a stand-in for the Stripe library. */
function setStripeFactory(next) {
  factory = next || ((key) => new Stripe(key));
}

function stripeSettings(ownerId) {
  const saved = getRecurring(ownerId).settings.stripe || null;
  if (!saved) return null;
  const secretKey = decryptSecret(saved.secretKey);
  const webhookSecret = decryptSecret(saved.webhookSecret);
  return secretKey && webhookSecret ? { secretKey, webhookSecret } : null;
}

function stripeReady(ownerId) {
  return Boolean(stripeSettings(ownerId));
}

function webhookUrl(ownerId) {
  const api = String(process.env.PUBLIC_API_URL || 'https://api.mynextinvoice.com').replace(/\/+$/, '');
  return `${api}/api/public/stripe/${ownerId}/webhook`;
}

function publicStripe(ownerId) {
  const saved = getRecurring(ownerId).settings.stripe || null;
  return { ready: stripeReady(ownerId), mode: saved ? saved.mode || '' : '', webhookUrl: webhookUrl(ownerId) };
}

function fail(code) {
  const err = new Error(code);
  err.stripeCode = code;
  return err;
}

/** Saves the keys after checking their shape; a blank field keeps what is saved. */
function saveStripe(ownerId, body) {
  const current = getRecurring(ownerId);
  const saved = current.settings.stripe || {};
  const secretKey = String((body && body.secretKey) || '').trim();
  const webhookSecret = String((body && body.webhookSecret) || '').trim();
  if (secretKey && !/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(secretKey)) throw fail('STRIPE_KEY');
  if (webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) throw fail('STRIPE_WEBHOOK');
  const next = {
    secretKey: secretKey ? encryptSecret(secretKey) : saved.secretKey || null,
    webhookSecret: webhookSecret ? encryptSecret(webhookSecret) : saved.webhookSecret || null,
    mode: secretKey ? (secretKey.includes('_live_') ? 'live' : 'test') : saved.mode || '',
    updatedAt: new Date().toISOString(),
  };
  if (!next.secretKey || !next.webhookSecret) throw fail('STRIPE_INCOMPLETE');
  saveRecurring(ownerId, { ...current, settings: { ...current.settings, stripe: next } });
  return publicStripe(ownerId);
}

function removeStripe(ownerId) {
  const current = getRecurring(ownerId);
  saveRecurring(ownerId, { ...current, settings: { ...current.settings, stripe: null } });
  return publicStripe(ownerId);
}

const ZERO_DECIMAL = new Set(['jpy', 'krw', 'vnd', 'clp', 'xof', 'xaf', 'ugx', 'rwf', 'pyg', 'mga', 'kmf', 'gnf', 'djf', 'bif', 'vuv', 'xpf']);

function minorUnits(amount, currency) {
  return ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

/** A Stripe Checkout page for what is still owed on the invoice; its address is returned. */
async function createCheckout(ownerId, invoice, shareToken) {
  const keys = stripeSettings(ownerId);
  if (!keys) throw fail('STRIPE_NOT_CONFIGURED');
  if (invoice.lifecycle !== 'issued' || !(Number(invoice.amountDue) > 0)) throw fail('NOTHING_DUE');
  const currency = String(invoice.currency || 'EUR').toLowerCase();
  const back = `${appUrl()}/i/?t=${encodeURIComponent(shareToken)}`;
  const metadata = { ownerId, invoiceId: invoice.id, number: String(invoice.number || '') };
  const session = await factory(keys.secretKey).checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency, unit_amount: minorUnits(Number(invoice.amountDue), currency), product_data: { name: `${invoice.number}` } } }],
    customer_email: (invoice.client && invoice.client.email) || undefined,
    success_url: `${back}&paid=1`,
    cancel_url: back,
    metadata,
    payment_intent_data: { metadata },
  });
  mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
    draft.events.push({ at: new Date().toISOString(), type: 'stripe_checkout', detail: { session: session.id } });
    return draft;
  });
  return session.url;
}

/**
 * Stripe's call after a payment. The raw body and its signature are checked with the company's own
 * webhook secret before anything is believed.
 */
async function handleCompanyWebhook(req, res) {
  const ownerId = String(req.params.ownerId || '');
  const keys = stripeSettings(ownerId);
  if (!keys) return res.status(503).json({ error: 'Stripe is not configured for this company.' });
  let event;
  try {
    event = factory(keys.secretKey).webhooks.constructEvent(req.body, req.headers['stripe-signature'], keys.webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    const result = recordCheckout(ownerId, event);
    return res.json({ received: true, result });
  } catch (err) {
    console.error('[stripe/company webhook]', ownerId, err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
}

/** Records the payment a verified checkout event reports. Safe to call again for the same event. */
function recordCheckout(ownerId, event) {
  if (!event || (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded')) return 'ignored';
  const session = event.data && event.data.object;
  if (!session || session.payment_status !== 'paid') return 'not_paid';
  const meta = session.metadata || {};
  if (meta.ownerId !== ownerId || !meta.invoiceId) return 'not_ours';
  const invoice = getInvoice(ownerId, meta.invoiceId);
  if (!invoice) return 'no_invoice';
  const opId = `stripe:${session.id}`;
  if ((invoice.payments || []).some((payment) => payment.opId === opId)) return 'duplicate';
  const currency = String(session.currency || '').toLowerCase();
  const amount = ZERO_DECIMAL.has(currency) ? Number(session.amount_total) : Number(session.amount_total) / 100;
  const note = (type, detail) =>
    mutateInvoiceDelivery(ownerId, invoice.id, (draft) => {
      draft.events.push({ at: new Date().toISOString(), type, detail });
      return draft;
    });
  if (currency !== String(invoice.currency || 'EUR').toLowerCase()) {
    note('payment_mismatch', { source: 'stripe', session: session.id, amount, currency });
    return 'currency_mismatch';
  }
  try {
    addPayment(ownerId, 'invoice', invoice.id, { amount, date: new Date().toISOString().slice(0, 10), method: 'Stripe', note: String(session.payment_intent || session.id), opId });
  } catch (err) {
    // More than is owed (paid twice, or by bank meanwhile): kept for the user to sort out by hand.
    note('payment_mismatch', { source: 'stripe', session: session.id, amount, reason: err.message });
    return 'not_recorded';
  }
  note('payment', { source: 'stripe', session: session.id, amount });
  return 'recorded';
}

module.exports = { setStripeFactory, stripeReady, publicStripe, saveStripe, removeStripe, createCheckout, handleCompanyWebhook, recordCheckout, webhookUrl };
