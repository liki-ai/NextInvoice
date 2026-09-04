const Stripe = require('stripe');

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function appUrl() {
  return String(process.env.APP_URL || 'https://mynextinvoice.com').replace(/\/+$/, '');
}

function priceId() {
  return process.env.STRIPE_PRICE_ID || '';
}

function isPremiumSubscription(subscription) {
  if (!subscription) return false;
  return subscription.status === 'active' || subscription.status === 'trialing';
}

module.exports = {
  stripeClient,
  appUrl,
  priceId,
  isPremiumSubscription,
};
