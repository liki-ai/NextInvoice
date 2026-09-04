const express = require('express');
const { authRequired } = require('../auth');
const {
  canCreateInvoice,
  setUserPlan,
  publicUser,
  findUserById,
  findUserByStripeCustomerId,
  findUserByIapOriginalId,
  updateUserBilling,
} = require('../store');
const { stripeClient, appUrl, priceId, isPremiumSubscription } = require('../billing/stripe');
const {
  verifyAppleReceipt,
  verifyGooglePurchase,
  isAllowedProduct,
} = require('../billing/iapVerify');

const router = express.Router();

router.get('/usage', authRequired, (req, res) => {
  res.json(canCreateInvoice(req.user.id));
});

router.get('/me', authRequired, (req, res) => {
  const stored = findUserById(req.user.id);
  res.json({ user: stored ? publicUser(stored) : req.user, usage: canCreateInvoice(req.user.id) });
});

router.post('/checkout', authRequired, async (req, res) => {
  try {
    const stripe = stripeClient();
    const price = priceId();
    if (!stripe || !price) {
      return res.status(503).json({
        error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.',
      });
    }

    const user = findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      updateUserBilling(user.id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl()}/app/upgrade?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/app/upgrade?canceled=1`,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: {
        metadata: { userId: user.id },
      },
      allow_promotion_codes: true,
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[billing/checkout]', err);
    return res.status(500).json({ error: err.message || 'Could not start checkout.' });
  }
});

router.get('/checkout/status', authRequired, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    const sessionId = String(req.query.session_id || '');
    if (!sessionId) return res.status(400).json({ error: 'session_id is required.' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });
    if (session.metadata?.userId && session.metadata.userId !== req.user.id) {
      return res.status(403).json({ error: 'Session does not belong to this account.' });
    }

    if (session.status === 'complete' && session.subscription) {
      const sub = typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
      const premium = isPremiumSubscription(sub);
      setUserPlan(req.user.id, premium ? 'premium' : 'free', {
        billingSource: 'stripe',
        stripeCustomerId: session.customer || undefined,
        stripeSubscriptionId: sub.id,
        planExpiresAt: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      });
    }

    return res.json({
      status: session.status,
      usage: canCreateInvoice(req.user.id),
      user: publicUser(findUserById(req.user.id)),
    });
  } catch (err) {
    console.error('[billing/checkout/status]', err);
    return res.status(500).json({ error: err.message || 'Could not confirm checkout.' });
  }
});

router.post('/portal', authRequired, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    const user = findUserById(req.user.id);
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer on this account yet.' });
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl()}/app/profile`,
    });
    return res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing/portal]', err);
    return res.status(500).json({ error: err.message || 'Could not open billing portal.' });
  }
});

/** Dev-only fallback. Disabled unless BILLING_ALLOW_MOCK=1 */
router.post('/subscribe', authRequired, (req, res) => {
  if (process.env.BILLING_ALLOW_MOCK !== '1') {
    return res.status(410).json({
      error: 'Mock subscribe is disabled. Use Stripe Checkout or IAP.',
    });
  }
  const user = setUserPlan(req.user.id, 'premium', { billingSource: 'mock' });
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user, usage: canCreateInvoice(req.user.id) });
});

router.post('/iap/verify', authRequired, async (req, res) => {
  try {
    const verified = await verifyIapPayload(req.body);
    if (!verified.active) {
      setUserPlan(req.user.id, 'free', {
        billingSource: 'iap',
        iapOriginalTransactionId: verified.originalTransactionId,
        planExpiresAt: verified.expiresAt,
      });
      return res.status(402).json({
        error: 'Subscription is not active.',
        verified,
        usage: canCreateInvoice(req.user.id),
      });
    }

    const existing = findUserByIapOriginalId(verified.originalTransactionId);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'This purchase is already linked to another account.' });
    }

    const user = setUserPlan(req.user.id, 'premium', {
      billingSource: 'iap',
      iapPlatform: verified.platform,
      iapProductId: verified.productId,
      iapOriginalTransactionId: verified.originalTransactionId,
      iapTransactionId: verified.transactionId,
      planExpiresAt: verified.expiresAt,
    });

    return res.json({
      ok: true,
      verified,
      user,
      usage: canCreateInvoice(req.user.id),
    });
  } catch (err) {
    console.error('[billing/iap/verify]', err);
    const status = err.code === 'IAP_NOT_CONFIGURED' ? 503 : err.code === 'IAP_INVALID' ? 400 : 500;
    return res.status(status).json({ error: err.message || 'IAP verification failed.' });
  }
});

/** Mobile offline clients: validate receipt without an account; unlock is stored on-device. */
router.post('/iap/validate', async (req, res) => {
  try {
    const verified = await verifyIapPayload(req.body);
    return res.json({ ok: true, verified });
  } catch (err) {
    console.error('[billing/iap/validate]', err);
    const status = err.code === 'IAP_NOT_CONFIGURED' ? 503 : err.code === 'IAP_INVALID' ? 400 : 500;
    return res.status(status).json({ error: err.message || 'IAP validation failed.' });
  }
});

async function verifyIapPayload(body) {
  const platform = String(body?.platform || '').toLowerCase();
  const productId = body?.productId;
  if (productId && !isAllowedProduct(productId)) {
    const err = new Error('Unknown product id.');
    err.code = 'IAP_INVALID';
    throw err;
  }

  if (platform === 'ios' || platform === 'apple') {
    const receiptData = body?.receiptData || body?.purchaseToken;
    if (!receiptData) {
      const err = new Error('receiptData is required.');
      err.code = 'IAP_INVALID';
      throw err;
    }
    return verifyAppleReceipt({ receiptData, productId });
  }

  if (platform === 'android' || platform === 'google') {
    const purchaseToken = body?.purchaseToken;
    if (!purchaseToken) {
      const err = new Error('purchaseToken is required.');
      err.code = 'IAP_INVALID';
      throw err;
    }
    return verifyGooglePurchase({
      packageName: body?.packageName,
      productId,
      purchaseToken,
    });
  }

  const err = new Error('platform must be ios or android.');
  err.code = 'IAP_INVALID';
  throw err;
}

/**
 * Stripe webhook — mounted with express.raw in index.js
 */
async function handleStripeWebhook(req, res) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return res.status(503).json({ error: 'Stripe webhook is not configured.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('[billing/webhook] signature', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      if (userId && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        setUserPlan(userId, isPremiumSubscription(sub) ? 'premium' : 'free', {
          billingSource: 'stripe',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: sub.id,
          planExpiresAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object;
      const user =
        findUserById(sub.metadata?.userId) ||
        findUserByStripeCustomerId(sub.customer);
      if (user) {
        const premium = event.type !== 'customer.subscription.deleted' && isPremiumSubscription(sub);
        setUserPlan(user.id, premium ? 'premium' : 'free', {
          billingSource: 'stripe',
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          planExpiresAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[billing/webhook]', err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
}

module.exports = router;
module.exports.handleStripeWebhook = handleStripeWebhook;
