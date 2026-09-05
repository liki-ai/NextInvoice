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
  const { invoices, companyProfile, usage, updateInvoice, deleteInvoice } = useApp();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const currency = companyProfile.currency || 'EUR';
  const limitReached = usage?.plan === 'free' && usage.limit != null && !usage.canCreate;
  const send = sendCopy(statusFilter, t);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    if (statusFilter === 'paid') return invoices.filter((inv) => inv.status === 'paid');
    return invoices.filter((inv) => inv.status !== 'paid');
  }, [invoices, statusFilter]);

  const unpaidInvoiceTotal = invoices
    .filter((inv) => inv.status !== 'paid')
    .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const paidInvoiceTotal = invoices
    .filter((inv) => inv.status === 'paid')
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
          const paid = item.status === 'paid';
          return (
            <SwipeableRow
              paid={paid}
              labels={{
                edit: t('common.edit'),
                delete: t('common.delete'),
                markPaid: t('invoiceDetail.statusPaid'),
                markUnpaid: t('invoiceDetail.statusUnpaid'),
              }}
              onEdit={() => navigation.navigate('EditInvoice', { invoiceId: item.id })}
              onDelete={() => {
                Alert.alert(t('invoiceList.deleteConfirmTitle'), t('invoiceList.deleteConfirmMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => deleteInvoice(item.id),
                  },
                ]);
              }}
              onTogglePaid={() => updateInvoice(item.id, { status: paid ? 'unpaid' : 'paid' })}
            >
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
              >
              <View style={styles.cardRow}>
                <Text style={styles.invoiceNumber}>{item.number}</Text>
                <Text style={styles.invoiceTotal}>{formatMoney(item.total, currency)}</Text>
              </View>
              <Text style={styles.clientName}>{item.client?.fullName}</Text>
              <View style={styles.cardRow}>
                <Text style={typography.muted}>{item.date}</Text>
                <Text style={typography.muted}>{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</Text>
              </View>
              <View style={styles.subRow}>
                <Text style={typography.muted}>{item.dueDate || t('pdf.onReceipt')}</Text>
                <Pressable
                  onPress={() => updateInvoice(item.id, { status: paid ? 'unpaid' : 'paid' })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityHint={paid ? undefined : t('invoiceList.tapToMarkPaid')}
                  style={[styles.statusChip, paid ? styles.statusPaid : styles.statusUnpaid]}
                >
                  <Ionicons
                    name={paid ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={paid ? colors.success : '#fff'}
                  />
                  <Text style={paid ? styles.statusPaidText : styles.statusUnpaidText}>
                    {paid ? t('invoiceDetail.statusPaid') : t('invoiceDetail.statusUnpaid')}
                  </Text>
                </Pressable>
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
