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
import { buildInvoiceHtml } from '../pdf/invoiceTemplate';
import { shareInvoicePdf } from '../pdf/generateInvoicePdf';

export default function InvoiceDetailScreen({ route, navigation }) {
  const { invoiceId } = route.params;
  const { invoices, companyProfile, deleteInvoice } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const invoice = useMemo(() => invoices.find((inv) => inv.id === invoiceId), [invoices, invoiceId]);

  const previewHtml = useMemo(() => {
    if (!previewVisible || !invoice) return '';
    return buildInvoiceHtml({
      company: companyProfile,
      client: invoice.client,
      invoice,
      pdfLabels: t('pdf'),
    });
  }, [previewVisible, invoice, companyProfile, t]);

  if (!invoice) {
    return (
      <View style={styles.container}>
        <Text style={typography.body}>Invoice not found.</Text>
      </View>
    );
  }

  const handleShare = async () => {
    setSharing(true);
    try {
      await shareInvoicePdf({
        company: companyProfile,
        client: invoice.client,
        invoice,
        pdfLabels: t('pdf'),
      });
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('invoiceList.deleteConfirmTitle'), t('invoiceList.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteInvoice(invoice.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Section title={`${t('newInvoice.invoiceNumber')}: ${invoice.number}`}>
          <Text style={typography.muted}>{t('newInvoice.date')}: {invoice.date}</Text>
        </Section>

        <Section title={t('newInvoice.clientSectionTitle')}>
          <Text style={typography.body}>{invoice.client?.fullName}</Text>
          <Text style={typography.muted}>{invoice.client?.address}</Text>
          <Text style={typography.muted}>{invoice.client?.phone}</Text>
        </Section>

        <Section title={t('newInvoice.itemsSectionTitle')}>
          {(invoice.items || []).map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={[typography.body, { flex: 1 }]}>{item.description}</Text>
              <Text style={typography.muted}>{item.quantity} x {formatMoney(Number(item.unitPrice), companyProfile.currency)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.subtotal')}</Text>
            <Text style={typography.body}>{formatMoney(invoice.subtotal, companyProfile.currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.discount')}</Text>
            <Text style={typography.body}>{formatMoney(Number(invoice.discount) || 0, companyProfile.currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
            <Text style={typography.subtitle}>{formatMoney(invoice.total, companyProfile.currency)}</Text>
          </View>
        </Section>

        <View style={styles.actions}>
          <Pressable style={styles.previewButton} onPress={() => setPreviewVisible(true)}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
            <Text style={styles.previewButtonText}>{t('newInvoice.preview')}</Text>
          </Pressable>
          <Button
            title={t('invoiceDetail.downloadPdf')}
            onPress={handleShare}
            loading={sharing}
            style={{ flex: 1 }}
          />
        </View>
        <Pressable style={styles.deleteLink} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteLinkText}>{t('invoiceDetail.deleteInvoice')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={[styles.previewModal, { paddingTop: insets.top }]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{t('newInvoice.previewTitle')}</Text>
            <Pressable onPress={() => setPreviewVisible(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHtml }}
            style={styles.previewWebView}
            scalesPageToFit
            startInLoadingState
          />
          <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Button
              title={t('newInvoice.closePreview')}
              onPress={() => setPreviewVisible(false)}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title={t('invoiceDetail.downloadPdf')}
              onPress={handleShare}
              loading={sharing}
              style={{ flex: 1.4 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  deleteLinkText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#fff',
  },
  previewButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  previewModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  previewWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  previewFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
