import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';
import { buildInvoiceListHtml, formatStatementFileDate } from '../pdf/invoiceTemplate';
import { shareInvoiceListPdf } from '../pdf/generateInvoicePdf';
import { localizeCompanyProfile } from '../storage/companySamples';
import SwipeableRow from '../components/SwipeableRow';
import PdfPreviewModal from '../components/PdfPreviewModal';
import SyncBanner from '../components/SyncBanner';
import PaymentModal from '../components/PaymentModal';
import { daysOverdue, isOverdue, paymentStatus, remainingOf } from '../utils/document';

function sendCopy(filter, t) {
  if (filter === 'paid') {
    return { kind: 'paid', cta: t('invoiceList.sendPaid'), title: t('invoiceList.sendPaidTitle') };
  }
  if (filter === 'unpaid') {
    return { kind: 'unpaid', cta: t('invoiceList.sendUnpaid'), title: t('invoiceList.sendUnpaidTitle') };
  }
  return { kind: 'all', cta: t('invoiceList.sendList'), title: t('invoiceList.sendAllTitle') };
}

export default function InvoiceListScreen({ navigation }) {
  const { invoices, companyProfile, usage, deleteInvoice, addInvoicePayment } = useApp();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [payId, setPayId] = useState(null);
  const currency = companyProfile.currency || 'EUR';
  const limitReached = usage?.plan === 'free' && usage.limit != null && !usage.canCreate;
  const send = sendCopy(statusFilter, t);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    if (statusFilter === 'paid') return invoices.filter((inv) => paymentStatus(inv) === 'paid');
    if (statusFilter === 'overdue') return invoices.filter((inv) => isOverdue(inv));
    return invoices.filter((inv) => {
      const status = paymentStatus(inv);
      return status === 'unpaid' || status === 'partial';
    });
  }, [invoices, statusFilter]);

  const unpaidInvoiceTotal = invoices
    .filter((inv) => paymentStatus(inv) !== 'paid' && paymentStatus(inv) !== 'cancelled' && paymentStatus(inv) !== 'draft')
    .reduce((sum, inv) => sum + remainingOf(inv), 0);
  const paidInvoiceTotal = invoices
    .filter((inv) => paymentStatus(inv) === 'paid')
    .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

  const previewHtml = useMemo(() => {
    if (!previewVisible || !filtered.length) return '';
    return buildInvoiceListHtml({
      company: localizeCompanyProfile(companyProfile, t),
      invoices: filtered,
      issuedDate: formatStatementFileDate(new Date()),
      pdfLabels: {
        ...t('pdf'),
        listTitle: send.title,
        statusPaid: t('invoiceDetail.statusPaid'),
        statusUnpaid: t('invoiceDetail.statusUnpaid'),
        statusLabel: t('obligations.status'),
      },
    });
  }, [previewVisible, filtered, companyProfile, t, send.title]);

  const onShareList = async () => {
    if (!filtered.length) return;
    setSharing(true);
    try {
      await shareInvoiceListPdf({
        company: localizeCompanyProfile(companyProfile, t),
        invoices: filtered,
        issuedDate: formatStatementFileDate(new Date()),
        kind: send.kind,
        pdfLabels: {
          ...t('pdf'),
          listTitle: send.title,
          statusPaid: t('invoiceDetail.statusPaid'),
          statusUnpaid: t('invoiceDetail.statusUnpaid'),
          statusLabel: t('obligations.status'),
        },
      });
      setPreviewVisible(false);
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>{t('invoiceList.title')}</Text>
        {filtered.length > 0 ? (
          <Pressable style={styles.headerCta} onPress={() => setPreviewVisible(true)}>
            <Ionicons name="send-outline" size={16} color={colors.primary} />
            <Text style={styles.headerCtaText}>{send.cta}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: spacing.md }}>
        <SyncBanner />
      </View>

      {limitReached ? (
        <Pressable style={styles.limitBanner} onPress={() => navigation.navigate('Subscribe')}>
          <View style={styles.limitCopy}>
            <Text style={styles.limitTitle}>{t('billing.limitTitle')}</Text>
            <Text style={styles.limitText}>{t('newInvoice.limitReached')}</Text>
          </View>
          <Text style={styles.limitCta}>{t('billing.upgrade')}</Text>
        </Pressable>
      ) : null}

      {invoices.length > 0 ? (
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('invoiceList.unpaidTotal')}</Text>
            <Text style={styles.totalValue}>{formatMoney(unpaidInvoiceTotal, currency)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('invoiceList.paidTotal')}</Text>
            <Text style={styles.totalValue}>{formatMoney(paidInvoiceTotal, currency)}</Text>
          </View>
        </View>
      ) : null}

      {invoices.length > 0 ? (
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterItem, statusFilter === 'all' && styles.filterItemActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.filterText, statusFilter === 'all' && styles.filterTextActive]}>
              {t('invoiceList.filterAll')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterItem, statusFilter === 'unpaid' && styles.filterItemActive]}
            onPress={() => setStatusFilter('unpaid')}
          >
            <Text style={[styles.filterText, statusFilter === 'unpaid' && styles.filterTextActive]}>
              {t('invoiceDetail.statusUnpaid')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterItem, statusFilter === 'paid' && styles.filterItemActive]}
            onPress={() => setStatusFilter('paid')}
          >
            <Text style={[styles.filterText, statusFilter === 'paid' && styles.filterTextActive]}>
              {t('invoiceDetail.statusPaid')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterItem, statusFilter === 'overdue' && styles.filterItemActive]}
            onPress={() => setStatusFilter('overdue')}
          >
            <Text style={[styles.filterText, statusFilter === 'overdue' && styles.filterTextActive]}>
              {t('docs.overdue')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('invoiceList.empty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = paymentStatus(item);
          const paid = status === 'paid';
          const late = daysOverdue(item);
          const due = remainingOf(item);
          return (
            <SwipeableRow
              paid={paid}
              labels={{
                edit: t('common.edit'),
                delete: t('common.delete'),
                markPaid: t('docs.recordPayment'),
                markUnpaid: t('invoiceDetail.statusUnpaid'),
              }}
              onEdit={() => navigation.navigate(status === 'draft' ? 'EditInvoice' : 'InvoiceDetail', { invoiceId: item.id })}
              onDelete={() => {
                if (status !== 'draft') return;
                Alert.alert(t('invoiceList.deleteConfirmTitle'), t('invoiceList.deleteConfirmMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => deleteInvoice(item.id),
                  },
                ]);
              }}
              onTogglePaid={() => (due > 0 && status !== 'cancelled' && status !== 'draft' ? setPayId(item.id) : null)}
            >
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
              >
              <View style={styles.cardRow}>
                <Text style={styles.invoiceNumber}>{item.number}</Text>
                <Text style={styles.invoiceTotal}>{formatMoney(status === 'cancelled' || status === 'draft' ? Number(item.total) || 0 : due, item.currency || currency)}</Text>
              </View>
              <Text style={styles.clientName}>{item.client?.fullName}</Text>
              <View style={styles.cardRow}>
                <Text style={typography.muted}>{item.date}</Text>
                <Text style={typography.muted}>{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={typography.muted}>{item.dueDate || t('pdf.onReceipt')}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[styles.statusChip, paid ? styles.statusPaid : status === 'partial' ? styles.statusPartial : styles.statusUnpaid]}>
                    <Text style={paid || status === 'partial' ? styles.statusPaidText : styles.statusUnpaidText}>
                      {paid ? t('invoiceDetail.statusPaid') : status === 'partial' ? t('docs.statusPartial') : status === 'draft' ? t('docs.statusDraft') : status === 'cancelled' ? t('docs.statusCancelled') : t('invoiceDetail.statusUnpaid')}
                    </Text>
                  </View>
                  {late > 0 ? <Text style={styles.overdue}>{t('docs.overdueDays', { days: late })}</Text> : null}
                </View>
              </View>
              </Pressable>
            </SwipeableRow>
          );
        }}
      />
      <Pressable
        style={styles.fab}
        onPress={() => {
          if (limitReached) {
            navigation.navigate('Subscribe');
            return;
          }
          navigation.navigate('NewInvoice');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.newInvoice')}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
      <PdfPreviewModal
        visible={previewVisible}
        title={send.title}
        html={previewHtml}
        sharing={sharing}
        cancelLabel={t('common.cancel')}
        sendLabel={t('common.send')}
        onCancel={() => setPreviewVisible(false)}
        onSend={onShareList}
      />
      <PaymentModal
        visible={Boolean(payId)}
        doc={invoices.find((item) => item.id === payId)}
        currency={invoices.find((item) => item.id === payId)?.currency || currency}
        onClose={() => setPayId(null)}
        onSave={(payment) => addInvoicePayment(payId, payment)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#EEF5F7',
  },
  headerCtaText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  limitBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#F8E8E4',
    borderWidth: 1,
    borderColor: colors.danger,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  limitCopy: { flex: 1 },
  limitTitle: { fontSize: 13, fontWeight: '800', color: colors.danger, textTransform: 'uppercase' },
  limitText: { marginTop: 4, color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  limitCta: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  totals: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  totalCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  totalLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  totalValue: { marginTop: 4, fontSize: 18, fontWeight: '700', color: colors.text },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 96 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterItem: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  filterItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceNumber: { fontSize: 15, fontWeight: '700', color: colors.primary },
  invoiceTotal: { fontSize: 16, fontWeight: '700', color: colors.text },
  clientName: { fontSize: 15, color: colors.text, marginTop: 4, marginBottom: 4 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusUnpaid: { backgroundColor: colors.danger },
  statusPaid: { backgroundColor: '#E7F4EA' },
  statusPartial: { backgroundColor: '#FFF4D6' },
  overdue: { marginTop: 4, color: colors.danger, fontSize: 11, fontWeight: '700' },
  statusUnpaidText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  statusPaidText: { color: colors.success, fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
});
