import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, Section } from '../components/ui';
import { formatMoney } from '../utils/money';
import {
  buildStatementHtml,
  clientKey,
  clientUnpaidSummaries,
  formatStatementFileDate,
} from '../pdf/invoiceTemplate';
import { localizeCompanyProfile, isSampleCompanyValue } from '../storage/companySamples';
import { shareStatementPdf } from '../pdf/generateInvoicePdf';

function companyForStatement(profile, t) {
  const company = localizeCompanyProfile(profile, t);
  return {
    ...company,
    email: isSampleCompanyValue('email', profile?.email) ? '' : company.email,
    phone: isSampleCompanyValue('phone', profile?.phone) ? '' : company.phone,
  };
}

export default function StatementScreen({ route, navigation }) {
  const { invoices, companyProfile } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const summaries = useMemo(() => clientUnpaidSummaries(invoices), [invoices]);
  const selectedKey = clientKey(route?.params?.clientName || summaries[0]?.client?.fullName);
  const selected = summaries.find((item) => clientKey(item.client.fullName) === selectedKey) || summaries[0];
  const issuedDate = formatStatementFileDate(new Date());
  const pdfLabels = t('pdf');

  const previewHtml = useMemo(() => {
    if (!previewVisible || !selected) return '';
    return buildStatementHtml({
      company: companyForStatement(companyProfile, t),
      client: selected.client,
      invoices: selected.unpaid,
      paidTotal: selected.paidTotal,
      issuedDate,
      pdfLabels,
      showPayments: false,
    });
  }, [previewVisible, selected, companyProfile, issuedDate, pdfLabels, t]);

  const handleShare = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      await shareStatementPdf({
        company: companyForStatement(companyProfile, t),
        client: selected.client,
        invoices: selected.unpaid,
        paidTotal: selected.paidTotal,
        issuedDate,
        pdfLabels,
      });
      setPreviewVisible(false);
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  if (summaries.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="send-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('statement.empty')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t('statement.selectClient')}</Text>
        {summaries.map((item) => {
          const active = clientKey(item.client.fullName) === clientKey(selected?.client.fullName);
          return (
            <Pressable
              key={item.client.fullName}
              style={[styles.clientCard, active && styles.clientCardActive]}
              onPress={() => navigation.setParams({ clientName: item.client.fullName })}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.clientName, active && styles.clientNameActive]}>{item.client.fullName}</Text>
                <Text style={[styles.amount, active && styles.amountActive]}>
                  {formatMoney(item.unpaidTotal, companyProfile.currency)}
                </Text>
              </View>
              <Text style={[styles.meta, active && styles.metaActive]}>
                {t('statement.unpaidCount', { count: item.unpaidCount })}
              </Text>
            </Pressable>
          );
        })}

        {selected ? (
          <>
            <Section title={pdfLabels.billedTo}>
              <Text style={typography.body}>{selected.client.fullName}</Text>
              {selected.client.address ? <Text style={typography.muted}>{selected.client.address}</Text> : null}
              {selected.client.phone ? <Text style={typography.muted}>{selected.client.phone}</Text> : null}
            </Section>

            <Section title={t('statement.title')}>
              <View style={styles.totalsRow}>
                <Text style={typography.muted}>{pdfLabels.ordersTotal}</Text>
                <Text style={typography.body}>{formatMoney(selected.unpaidTotal, companyProfile.currency)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={typography.muted}>{pdfLabels.paymentsTotal}</Text>
                <Text style={typography.body}>{formatMoney(selected.paidTotal, companyProfile.currency)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={typography.muted}>{pdfLabels.balanceDue}</Text>
                <Text style={styles.balance}>{formatMoney(selected.unpaidTotal, companyProfile.currency)}</Text>
              </View>
            </Section>

            {selected.unpaid.map((item) => (
              <Pressable
                key={item.id}
                style={styles.invoiceRow}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.invoiceNumber}>{item.number}</Text>
                  <Text style={styles.amount}>{formatMoney(item.total, companyProfile.currency)}</Text>
                </View>
                <Text style={typography.muted}>{item.date}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {selected ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button title={t('statement.sendPdf')} onPress={() => setPreviewVisible(true)} />
        </View>
      ) : null}

      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={[styles.previewWrap, { paddingTop: insets.top }]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{t('statement.previewTitle')}</Text>
            <Pressable onPress={() => setPreviewVisible(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          {previewHtml ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: previewHtml }}
              style={styles.previewWebView}
              scalesPageToFit
              startInLoadingState
            />
          ) : null}
          <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Button title={t('common.cancel')} variant="secondary" onPress={() => setPreviewVisible(false)} style={{ flex: 1 }} />
            <Button title={t('common.send')} loading={sharing} onPress={handleShare} style={{ flex: 1.4 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
  clientCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  clientCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm },
  clientNameActive: { color: '#fff' },
  meta: { marginTop: 4, color: colors.textMuted, fontSize: 13 },
  metaActive: { color: 'rgba(255,255,255,0.85)' },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  amountActive: { color: '#fff' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  balance: { fontSize: 18, fontWeight: '800', color: colors.primary },
  invoiceRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  invoiceNumber: { fontSize: 15, fontWeight: '700', color: colors.primary },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewWrap: { flex: 1, backgroundColor: colors.background },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  previewWebView: { flex: 1, backgroundColor: '#fff' },
  previewFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
