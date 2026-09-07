import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIAP, ErrorCode, deepLinkToSubscriptions, getAvailablePurchases } from 'expo-iap';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, Section } from '../components/ui';
import { IAP_PRODUCT_ID, IAP_PRODUCT_IDS } from '../billing/products';
import { validatePurchaseOnServer } from '../billing/validatePurchase';
import { FREE_MONTHLY_LIMIT } from '../storage/plan';

function isSkuMissingError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  return (
    code === ErrorCode.SkuNotFound ||
    code === ErrorCode.ItemUnavailable ||
    code === ErrorCode.QueryProduct ||
    code === ErrorCode.EmptySkuList ||
    /sku not found/i.test(msg)
  );
}

export default function SubscribeScreen({ navigation }) {
  const { settings, plan, setPlanFromPurchase, clearPlan, invoices, token, refreshAccountPlan } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const skuMissingMessage = t('billing.skuMissing', { sku: IAP_PRODUCT_ID });

  const handleValidated = useCallback(
    async (purchase) => {
      setBusy(true);
      setStatus(t('billing.validating'));
      try {
        const verified = await validatePurchaseOnServer(settings.apiBaseUrl, purchase, token);
        if (!verified?.active) {
          await clearPlan();
          throw new Error(t('billing.inactive'));
        }
        await setPlanFromPurchase({
          plan: 'premium',
          productId: verified.productId || purchase.productId,
          originalTransactionId: verified.originalTransactionId,
          expiresAt: verified.expiresAt,
          platform: verified.platform,
        });
        if (token) await refreshAccountPlan().catch(() => {});
        setStatus(t('billing.success'));
        Alert.alert(t('common.success'), t('billing.success'));
      } catch (err) {
        setStatus('');
        Alert.alert(t('common.error'), err.message || t('common.error'));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [settings.apiBaseUrl, setPlanFromPurchase, clearPlan, t, token, refreshAccountPlan],
  );

  const {
    connected,
    products,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
  } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      try {
        await handleValidated(purchase);
        await finishTransaction({ purchase, isConsumable: false });
      } catch {
        // keep unfinished so restore can retry
      }
    },
    onPurchaseError: (error) => {
      if (error?.code === ErrorCode.UserCancelled) return;
      if (isSkuMissingError(error)) return;
      Alert.alert(t('common.error'), error?.message || t('billing.purchaseFailed'));
    },
  });

  useEffect(() => {
    if (!token) return;
    void refreshAccountPlan().catch(() => {});
  }, [token, refreshAccountPlan]);

  useEffect(() => {
    if (!connected) {
      setCatalogLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCatalogLoaded(false);
      setCatalogError('');
      try {
        await fetchProducts({ skus: IAP_PRODUCT_IDS, type: 'subs' });
      } catch (err) {
        if (!cancelled && isSkuMissingError(err) === false) {
          setCatalogError(err?.message || skuMissingMessage);
        }
      }
      try {
        await fetchProducts({ skus: IAP_PRODUCT_IDS, type: 'in-app' });
      } catch {
        // in-app is only a fallback if the Apple product was created as a one-time IAP
      }
      if (!cancelled) setCatalogLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, fetchProducts, skuMissingMessage]);

  const subscription =
    subscriptions.find((s) => IAP_PRODUCT_IDS.includes(s.id)) ||
    products.find((p) => IAP_PRODUCT_IDS.includes(p.id));
  const priceLabel = subscription?.displayPrice || t('billing.premiumPrice');
  const isPremium = plan?.plan === 'premium';
  const skuError = subscription ? '' : catalogError || (catalogLoaded ? skuMissingMessage : '');
  const canBuy = connected && catalogLoaded && Boolean(subscription);

  const onBuy = async () => {
    if (!connected) {
      Alert.alert(t('common.error'), t('billing.storeUnavailable'));
      return;
    }
    if (!subscription) {
      Alert.alert(t('common.error'), skuError || skuMissingMessage);
      return;
    }
    setBusy(true);
    setStatus(t('billing.purchasing'));
    try {
      const sku = subscription.id || IAP_PRODUCT_ID;
      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: { apple: { sku } },
          type: subscription.type === 'in-app' ? 'in-app' : 'subs',
        });
      } else {
        const offer = subscription?.subscriptionOfferDetailsAndroid?.[0];
        if (!offer?.offerToken) {
          throw new Error(t('billing.noOffer'));
        }
        await requestPurchase({
          request: {
            google: {
              skus: [sku],
              subscriptionOffers: [{ sku, offerToken: offer.offerToken }],
            },
          },
          type: 'subs',
        });
      }
    } catch (err) {
      if (err?.code !== ErrorCode.UserCancelled) {
        Alert.alert(
          t('common.error'),
          isSkuMissingError(err) ? skuMissingMessage : err.message || t('billing.purchaseFailed'),
        );
      }
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const onRestore = async () => {
    setBusy(true);
    setStatus(t('billing.restoring'));
    try {
      if (token) {
        const account = await refreshAccountPlan();
        if (account?.plan === 'premium') {
          Alert.alert(t('billing.restoreTitle'), t('billing.success'));
          return;
        }
      }
      const purchases = await getAvailablePurchases();
      const owned = (purchases || []).filter((p) => IAP_PRODUCT_IDS.includes(p.productId));
      if (!owned.length) {
        Alert.alert(t('billing.restoreTitle'), t('billing.restoreEmpty'));
        return;
      }
      for (const purchase of owned) {
        await handleValidated(purchase);
        await finishTransaction({ purchase, isConsumable: false });
      }
    } catch (err) {
      Alert.alert(t('common.error'), err.message || t('common.error'));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl }}
    >
      <Text style={typography.title}>{t('billing.title')}</Text>
      <Text style={[typography.muted, { marginTop: spacing.sm }]}>{t('billing.subtitle')}</Text>

      <Section title={t('billing.freeName')} style={{ marginTop: spacing.lg }}>
        <Text style={typography.body}>{t('billing.freeLimit')}</Text>
        <Text style={[typography.muted, { marginTop: 6 }]}>
          {t('billing.usageLocal', { limit: FREE_MONTHLY_LIMIT, count: invoices.length })}
        </Text>
      </Section>

      <Section title={t('billing.premiumName')}>
        <Text style={styles.price}>{priceLabel}</Text>
        <Text style={[typography.muted, { marginTop: 6 }]}>{t('billing.premiumHint')}</Text>
        {isPremium ? (
          <Text style={[styles.badge, { marginTop: spacing.md }]}>{t('billing.alreadyPremium')}</Text>
        ) : (
          <Button
            title={busy ? t('common.loading') : t('billing.ctaIap')}
            onPress={() => void onBuy()}
            disabled={busy || !canBuy}
            style={{ marginTop: spacing.md }}
          />
        )}
        <Button
          title={t('billing.restore')}
          variant="secondary"
          onPress={() => void onRestore()}
          disabled={busy}
          style={{ marginTop: spacing.sm }}
        />
        {isPremium ? (
          <Pressable
            onPress={() => deepLinkToSubscriptions({ skuAndroid: IAP_PRODUCT_ID })}
            style={{ marginTop: spacing.md }}
          >
            <Text style={styles.link}>{t('billing.manageStore')}</Text>
          </Pressable>
        ) : null}
        {status ? <Text style={[typography.muted, { marginTop: spacing.sm }]}>{status}</Text> : null}
        {skuError && !isPremium ? (
          <Text style={[styles.warn, { marginTop: spacing.md }]}>{skuError}</Text>
        ) : null}
        <Text style={[typography.muted, { marginTop: spacing.md, fontSize: 12 }]}>{t('billing.iapNote')}</Text>
      </Section>

      <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
        <Text style={styles.link}>{t('common.close')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  price: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 4 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF5F7',
    color: colors.primary,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  warn: { color: '#C0503A', fontSize: 13, lineHeight: 18 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
