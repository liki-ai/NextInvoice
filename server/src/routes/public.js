const express = require('express');
const { sharedInvoice, sharedInvoiceOwner, getRecurring } = require('../store');
const companyStripe = require('../automation/companyStripe');

// Pages a recipient opens from a link, without an account.
const router = express.Router();

router.get('/invoices/:token', (req, res) => {
  const shared = sharedInvoice(req.params.token);
  if (!shared) return res.status(404).json({ error: 'This invoice link is not valid.', code: 'NOT_FOUND' });
  // The link is the key; keep it out of shared caches and search engines.
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex');
  const found = sharedInvoiceOwner(req.params.token);
  const plan = found && found.invoice.recurring ? getRecurring(found.ownerId).plans.find((item) => item.id === found.invoice.recurring.planId) : null;
  res.json({
    ...shared,
    // How the recipient can pay: by card through the company's Stripe, or at the company's own link.
    payment: {
      card: Boolean(found && companyStripe.stripeReady(found.ownerId) && found.invoice.lifecycle === 'issued' && Number(found.invoice.amountDue) > 0),
      url: (plan && plan.paymentUrl) || '',
    },
  });
});

/** "Pay by card": a Stripe Checkout page for what is still owed. */
router.post('/invoices/:token/pay', async (req, res) => {
  const found = sharedInvoiceOwner(req.params.token);
  if (!found) return res.status(404).json({ error: 'This invoice link is not valid.', code: 'NOT_FOUND' });
  try {
    const url = await companyStripe.createCheckout(found.ownerId, found.invoice, req.params.token);
    res.json({ url });
  } catch (err) {
    const code = err.stripeCode || 'STRIPE_FAILED';
    if (code === 'STRIPE_FAILED') console.error('[stripe/checkout]', err);
    res.status(code === 'NOTHING_DUE' ? 409 : code === 'STRIPE_NOT_CONFIGURED' ? 404 : 502).json({ error: 'Card payment is not available right now.', code });
  }
});

module.exports = router;
