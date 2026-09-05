import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, Section } from '../components/ui';
import { formatMoney } from '../utils/money';
import { buildInvoiceHtml } from '../pdf/invoiceTemplate';
import { localizeCompanyProfile } from '../storage/companySamples';
import { shareInvoicePdf } from '../pdf/generateInvoicePdf';
import { daysOverdue, paymentStatus, pdfClient, pdfCompany, remainingOf, reminderText } from '../utils/document';
import PaymentModal from '../components/PaymentModal';

export default function InvoiceDetailScreen({ route, navigation }) {
  const { invoiceId } = route.params;
  const { invoices, companyProfile, deleteInvoice, issueInvoice, cancelInvoice, addInvoicePayment } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const invoice = useMemo(() => invoices.find((inv) => inv.id === invoiceId), [invoices, invoiceId]);
  const status = invoice ? paymentStatus(invoice) : 'unpaid';
  const company = invoice ? pdfCompany(invoice, localizeCompanyProfile(companyProfile, t)) : companyProfile;
  const client = invoice ? pdfClient(invoice) : null;
  const currency = invoice?.currency || company?.currency || 'EUR';
  const late = invoice ? daysOverdue(invoice) : 0;
  const due = invoice ? remainingOf(invoice) : 0;

  const previewHtml = useMemo(() => {
    if (!previewVisible || !invoice) return '';
    return buildInvoiceHtml({
      company,
      client,
      invoice,
      pdfLabels: t('pdf'),
    });
  }, [previewVisible, invoice, company, client, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('EditInvoice', { invoiceId })}
          hitSlop={12}
          style={styles.headerEdit}
        >
          <Ionicons name="create-outline" size={20} color={colors.primary} />
          <Text style={styles.headerEditText}>{t('invoiceDetail.editInvoice')}</Text>
        </Pressable>
      ),
    });
  }, [navigation, invoiceId, t]);

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
        company,
        client,
        invoice,
        pdfLabels: t('pdf'),
      });
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  const handleEdit = () => {
    navigation.navigate('EditInvoice', { invoiceId: invoice.id });
  };

  const handleDelete = () => {
    if (status !== 'draft') return;
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

  const handleCancel = () => {
    const run = async (reason) => {
      if (!reason?.trim()) return;
      await cancelInvoice(invoice.id, reason.trim());
    };
    if (Platform.OS === 'ios') {
      Alert.prompt(t('docs.cancelInvoice'), t('docs.cancelReason'), (reason) => void run(reason));
      return;
    }
    Alert.alert(t('docs.cancelInvoice'), t('docs.cancelReason'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: () => void run('Cancelled') },
    ]);
  };

  const reminder = invoice
    ? reminderText(
        invoice,
        {
          hello: t('docs.reminderHello'),
          body: t('docs.reminderBody'),
          thanks: t('docs.reminderThanks'),
          onReceipt: t('pdf.onReceipt'),
        },
        late,
      )
    : '';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Section title={`${t('newInvoice.invoiceNumber')}: ${invoice.number}`}>
          <Text style={typography.muted}>{t('newInvoice.date')}: {invoice.date}</Text>
          <Text style={typography.muted}>{t('pdf.dueDateLabel')}: {invoice.dueDate || t('pdf.onReceipt')}</Text>
          {late > 0 ? <Text style={[typography.muted, { color: colors.danger }]}>{t('docs.overdueDays', { days: late })}</Text> : null}
          <Text style={typography.muted}>{status === 'paid' ? t('invoiceDetail.statusPaid') : status === 'partial' ? t('docs.statusPartial') : status === 'draft' ? t('docs.statusDraft') : status === 'cancelled' ? t('docs.statusCancelled') : t('invoiceDetail.statusUnpaid')}</Text>
        </Section>

        <Section title={t('newInvoice.clientSectionTitle')}>
          <Text style={typography.body}>{client?.fullName}</Text>
          <Text style={typography.muted}>{client?.address}</Text>
          <Text style={typography.muted}>{client?.phone}</Text>
        </Section>

        <Section title={t('newInvoice.itemsSectionTitle')}>
          {(invoice.items || []).map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={[typography.body, { flex: 1 }]}>{item.description}</Text>
              <Text style={typography.muted}>{item.quantity} x {formatMoney(Number(item.unitPrice), currency)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.subtotal')}</Text>
            <Text style={typography.body}>{formatMoney(invoice.subtotal, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.discount')}</Text>
            <Text style={typography.body}>{formatMoney(Number(invoice.discount) || 0, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
            <Text style={typography.subtitle}>{formatMoney(invoice.total, currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('docs.amountDue')}</Text>
            <Text style={typography.body}>{formatMoney(due, currency)}</Text>
          </View>
        </Section>

        {late > 0 ? (
          <Section title={t('docs.reminder')}>
            <Text style={typography.body}>{reminder}</Text>
            <Button
              title={t('docs.share')}
              variant="secondary"
              onPress={() => Share.share({ message: reminder })}
              style={{ marginTop: spacing.sm }}
            />
          </Section>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.previewButton} onPress={handleEdit}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.previewButtonText}>{t('invoiceDetail.editInvoice')}</Text>
          </Pressable>
          <Pressable style={styles.previewButton} onPress={() => setPreviewVisible(true)}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
            <Text style={styles.previewButtonText}>{t('newInvoice.preview')}</Text>
          </Pressable>
        </View>
        <Button
          title={t('invoiceDetail.downloadPdf')}
          onPress={handleShare}
          loading={sharing}
          style={{ marginTop: spacing.sm }}
        />
        {status === 'draft' ? (
          <Button title={t('docs.issue')} onPress={() => issueInvoice(invoice.id)} style={{ marginTop: spacing.sm }} />
        ) : null}
        {status !== 'draft' && status !== 'cancelled' && due > 0 ? (
          <Button title={t('docs.recordPayment')} variant="secondary" onPress={() => setPayOpen(true)} style={{ marginTop: spacing.sm }} />
        ) : null}
        {status !== 'draft' && status !== 'cancelled' ? (
          <Button title={t('docs.cancelInvoice')} variant="secondary" onPress={handleCancel} style={{ marginTop: spacing.sm }} />
        ) : null}
        {status === 'draft' ? (
        <Pressable style={styles.deleteLink} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteLinkText}>{t('invoiceDetail.deleteInvoice')}</Text>
        </Pressable>
        ) : null}
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
      <PaymentModal
        visible={payOpen}
        doc={invoice}
        currency={currency}
        onClose={() => setPayOpen(false)}
        onSave={(payment) => addInvoicePayment(invoice.id, payment)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  headerEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headerEditText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
