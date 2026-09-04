import { Platform } from 'react-native';
import { IAP_PRODUCT_ID } from './products';

export async function validatePurchaseOnServer(apiBaseUrl, purchase) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const body = {
    platform,
    productId: purchase.productId || IAP_PRODUCT_ID,
    purchaseToken: purchase.purchaseToken || purchase.purchaseTokenAndroid,
    receiptData: purchase.transactionReceipt || purchase.purchaseToken,
    packageName: purchase.packageNameAndroid || 'com.lirim123.nextinvoice',
  };

  const res = await fetch(`${base}/api/billing/iap/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Validation failed (${res.status})`);
  }
  return data.verified;
}
