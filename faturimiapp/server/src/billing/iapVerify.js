/**
 * Server-side IAP verification for Apple App Store and Google Play.
 * Configure env vars in .env — without them, verification returns a clear error.
 */

const IAP_PRODUCT_IDS = new Set(
  String(process.env.IAP_PRODUCT_IDS || 'nextinvoice_premium_monthly')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

async function verifyAppleReceipt({ receiptData, productId }) {
  const password = process.env.APPLE_SHARED_SECRET;
  if (!password) {
    const err = new Error('Apple IAP is not configured (APPLE_SHARED_SECRET).');
    err.code = 'IAP_NOT_CONFIGURED';
    throw err;
  }

  const payload = {
    'receipt-data': receiptData,
    password,
    'exclude-old-transactions': true,
  };

  async function post(url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  let data = await post('https://buy.itunes.apple.com/verifyReceipt');
  // 21007 = sandbox receipt sent to production
  if (data.status === 21007) {
    data = await post('https://sandbox.itunes.apple.com/verifyReceipt');
  }
  if (data.status !== 0) {
    const err = new Error(`Apple receipt invalid (status ${data.status}).`);
    err.code = 'IAP_INVALID';
    throw err;
  }

  const latest = [...(data.latest_receipt_info || []), ...(data.receipt?.in_app || [])]
    .filter((item) => !productId || item.product_id === productId || IAP_PRODUCT_IDS.has(item.product_id))
    .sort((a, b) => Number(b.expires_date_ms || b.purchase_date_ms || 0) - Number(a.expires_date_ms || a.purchase_date_ms || 0))[0];

  if (!latest) {
    const err = new Error('No matching Apple subscription found in receipt.');
    err.code = 'IAP_INVALID';
    throw err;
  }

  const expiresMs = Number(latest.expires_date_ms || 0);
  const active = !expiresMs || expiresMs > Date.now();
  return {
    platform: 'ios',
    productId: latest.product_id,
    originalTransactionId: latest.original_transaction_id || latest.transaction_id,
    transactionId: latest.transaction_id,
    expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
    active,
  };
}

async function verifyGooglePurchase({ packageName, productId, purchaseToken }) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const err = new Error('Google IAP is not configured (GOOGLE_SERVICE_ACCOUNT_JSON).');
    err.code = 'IAP_NOT_CONFIGURED';
    throw err;
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    const err = new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    err.code = 'IAP_NOT_CONFIGURED';
    throw err;
  }

  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const client = await auth.getClient();
  const pkg = packageName || process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.lirim123.nextinvoice';
  const sku = productId || [...IAP_PRODUCT_IDS][0];
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/subscriptions/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await client.request({ url });
  const data = res.data || {};
  const expiresMs = Number(data.expiryTimeMillis || 0);
  const active =
    (data.paymentState === 1 || data.paymentState === 2) && (!expiresMs || expiresMs > Date.now());

  return {
    platform: 'android',
    productId: sku,
    originalTransactionId: data.orderId || purchaseToken,
    transactionId: data.orderId || purchaseToken,
    expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
    active,
    purchaseToken,
  };
}

function isAllowedProduct(productId) {
  if (!productId) return true;
  return IAP_PRODUCT_IDS.has(productId);
}

module.exports = {
  IAP_PRODUCT_IDS,
  verifyAppleReceipt,
  verifyGooglePurchase,
  isAllowedProduct,
};
