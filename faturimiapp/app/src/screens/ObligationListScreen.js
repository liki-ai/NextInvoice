import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';
import SwipeableRow from '../components/SwipeableRow';
import { pickObligationProof, openObligationProof } from '../utils/obligationProof';
import { sharePaidObligationsPdf } from '../pdf/generateInvoicePdf';
import { formatStatementFileDate } from '../pdf/invoiceTemplate';
import { localizeCompanyProfile } from '../storage/companySamples';

const CATEGORY_KEYS = {
  shipping: 'obligations.categoryShipping',
  supplies: 'obligations.categorySupplies',
  rent: 'obligations.categoryRent',
  tax: 'obligations.categoryTax',
  other: 'obligations.categoryOther',
};

export default function ObligationListScreen({ navigation }) {
  const { obligations, invoices, companyProfile, updateObligation, deleteObligation } = useApp();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sharing, setSharing] = useState(false);
  const currency = companyProfile.currency || 'EUR';

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return obligations;
    if (statusFilter === 'paid') return obligations.filter((item) => item.status === 'paid');
    return obligations.filter((item) => item.status !== 'paid');
  }, [obligations, statusFilter]);

  const unpaid = obligations
    .filter((item) => item.status !== 'paid')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const paidItems = obligations.filter((item) => item.status === 'paid');
  const paid = paidItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const onAttachProof = async (item) => {
    try {
      const proof = await pickObligationProof(t);
      if (!proof) return;
      await updateObligation(item.id, proof);
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    }
  };

  const onSendPaid = async () => {
    if (!paidItems.length) return;
    setSharing(true);
    try {
      await sharePaidObligationsPdf({
        company: localizeCompanyProfile(companyProfile, t),
        obligations: paidItems,
        issuedDate: formatStatementFileDate(new Date()),
        pdfLabels: {
          ...t('pdf'),
          paidObligationsTitle: t('obligations.sendPaidTitle'),
          vendor: t('obligations.vendor'),
          proofLabel: t('obligations.proofTitle'),
          proofYes: t('obligations.proofAttached'),
          proofNo: t('obligations.proofMissing'),
        },
      });
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={typography.title}>{t('obligations.title')}</Text>
          <Text style={styles.subtitle}>{t('obligations.subtitle')}</Text>
        </View>
        {paidItems.length > 0 ? (
          <Pressable style={styles.headerCta} onPress={onSendPaid} disabled={sharing}>
            <Ionicons name="send-outline" size={16} color={colors.primary} />
            <Text style={styles.headerCtaText}>{sharing ? t('common.loading') : t('obligations.sendPaid')}</Text>
          </Pressable>
        ) : null}
      </View>

      {obligations.length > 0 ? (
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('obligations.unpaidTotal')}</Text>
            <Text style={styles.totalValue}>{formatMoney(unpaid, currency)}</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{t('obligations.paidTotal')}</Text>
            <Text style={styles.totalValue}>{formatMoney(paid, currency)}</Text>
          </View>
        </View>
      ) : null}

      {obligations.length > 0 ? (
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
            <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('obligations.empty')}</Text>
            {obligations.length === 0 ? (
              <Pressable style={styles.emptyCta} onPress={() => navigation.navigate('ObligationForm')}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>{t('obligations.addCta')}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const related = invoices.find((inv) => inv.id === item.relatedInvoiceId);
          const paidItem = item.status === 'paid';
          return (
            <SwipeableRow
              paid={paidItem}
              labels={{
                edit: t('common.edit'),
                delete: t('common.delete'),
                markPaid: t('invoiceDetail.statusPaid'),
                markUnpaid: t('invoiceDetail.statusUnpaid'),
              }}
              onEdit={() => navigation.navigate('ObligationForm', { obligationId: item.id })}
              onDelete={() => {
                Alert.alert(t('obligations.deleteConfirmTitle'), t('obligations.deleteConfirmMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => deleteObligation(item.id),
                  },
                ]);
              }}
              onTogglePaid={() => updateObligation(item.id, { status: paidItem ? 'unpaid' : 'paid' })}
            >
              <Pressable
                style={styles.card}
                onPress={() => navigation.navigate('ObligationForm', { obligationId: item.id })}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.vendor}>{item.vendor}</Text>
                  <Text style={styles.amount}>{formatMoney(Number(item.amount) || 0, currency)}</Text>
                </View>
                {item.notes || item.description ? (
                  <Text style={styles.description}>{item.notes || item.description}</Text>
                ) : null}
                <Text style={styles.category}>{t(CATEGORY_KEYS[item.category] || CATEGORY_KEYS.other)}</Text>
                <View style={styles.cardRow}>
                  <Text style={typography.muted}>{item.date}</Text>
                  <Pressable
                    onPress={() => updateObligation(item.id, { status: paidItem ? 'unpaid' : 'paid' })}
                    hitSlop={8}
                    accessibilityHint={paidItem ? undefined : t('invoiceList.tapToMarkPaid')}
                    style={[styles.statusChip, paidItem ? styles.statusPaid : styles.statusUnpaid]}
                  >
                    <Ionicons
                      name={paidItem ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={paidItem ? colors.success : '#fff'}
                    />
                    <Text style={paidItem ? styles.statusPaidText : styles.statusUnpaidText}>
                      {paidItem ? t('invoiceDetail.statusPaid') : t('invoiceDetail.statusUnpaid')}
                    </Text>
                  </Pressable>
                </View>
                {related ? <Text style={styles.related}>{related.number}</Text> : null}
                <View style={styles.proofRow}>
                  {item.proofUri || item.proofName ? (
                    <Pressable style={styles.proofChip} onPress={() => openObligationProof(item, t)}>
                      <Ionicons name="document-attach-outline" size={14} color={colors.primary} />
                      <Text style={styles.proofChipText}>{item.proofName || t('obligations.proofAttached')}</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.proofChip} onPress={() => onAttachProof(item)}>
                      <Ionicons name="cloud-upload-outline" size={14} color={colors.primary} />
                      <Text style={styles.proofChipText}>{t('obligations.proofAdd')}</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            </SwipeableRow>
          );
        }}
      />
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('ObligationForm')}
        accessibilityRole="button"
        accessibilityLabel={t('obligations.addCta')}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  subtitle: { marginTop: 6, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
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
    backgroundColor: colors.surface,
  },
  filterItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 96 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vendor: { fontSize: 16, fontWeight: '700', color: colors.primary },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  description: { marginTop: 4, fontSize: 14, color: colors.text },
  category: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  related: { marginTop: 6, fontSize: 13, fontWeight: '600', color: colors.primary },
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
  proofRow: { marginTop: 8 },
  proofChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF5F7',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  proofChipText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
  emptyCta: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
