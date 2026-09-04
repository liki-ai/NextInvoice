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

export default function SubscribeScreen({ navigation }) {
  const { settings, plan, setPlanFromPurchase, clearPlan, invoices } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const handleValidated = useCallback(
    async (purchase) => {
      setBusy(true);
      setStatus(t('billing.validating'));
      try {
        const verified = await validatePurchaseOnServer(settings.apiBaseUrl, purchase);
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
    [settings.apiBaseUrl, setPlanFromPurchase, clearPlan, t],
  );

  const {
    connected,
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
      Alert.alert(t('common.error'), error?.message || t('billing.purchaseFailed'));
    },
  });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: IAP_PRODUCT_IDS, type: 'subs' }).catch(() => {});
  }, [connected, fetchProducts]);

  const subscription = subscriptions.find((s) => s.id === IAP_PRODUCT_ID) || subscriptions[0];
  const priceLabel = subscription?.displayPrice || t('billing.premiumPrice');
  const isPremium = plan?.plan === 'premium';

  const onBuy = async () => {
    if (!connected) {
      Alert.alert(t('common.error'), t('billing.storeUnavailable'));
      return;
    }
    setBusy(true);
    setStatus(t('billing.purchasing'));
    try {
      if (Platform.OS === 'ios') {
        await requestPurchase({
          request: { apple: { sku: IAP_PRODUCT_ID } },
          type: 'subs',
        });
      } else {
        const offer = subscription?.subscriptionOfferDetailsAndroid?.[0];
        if (!offer?.offerToken) {
          throw new Error(t('billing.noOffer'));
        }
        await requestPurchase({
          request: {
            google: {
              skus: [IAP_PRODUCT_ID],
              subscriptionOffers: [{ sku: IAP_PRODUCT_ID, offerToken: offer.offerToken }],
            },
          },
          type: 'subs',
        });
      }
    } catch (err) {
      if (err?.code !== ErrorCode.UserCancelled) {
        Alert.alert(t('common.error'), err.message || t('billing.purchaseFailed'));
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
            onPress={onBuy}
            disabled={busy || !connected}
            style={{ marginTop: spacing.md }}
          />
        )}
        <Button
          title={t('billing.restore')}
          variant="secondary"
          onPress={onRestore}
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
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
