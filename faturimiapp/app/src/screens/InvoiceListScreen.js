import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';

export default function InvoiceListScreen({ navigation }) {
  const { invoices, companyProfile, usage } = useApp();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    if (statusFilter === 'paid') return invoices.filter((inv) => inv.status === 'paid');
    return invoices.filter((inv) => inv.status !== 'paid');
  }, [invoices, statusFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>{t('invoiceList.title')}</Text>
      </View>
      {usage?.plan === 'free' && usage.limit != null ? (
        <Pressable style={styles.usageBanner} onPress={() => navigation.navigate('Subscribe')}>
          <Text style={styles.usageText}>
            {!usage.canCreate
              ? t('newInvoice.limitReached')
              : t('billing.usageBanner', { used: usage.used, limit: usage.limit })}
          </Text>
          <Text style={styles.usageCta}>{t('billing.upgrade')}</Text>
        </Pressable>
      ) : null}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterItem, statusFilter === 'all' && styles.filterItemActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={[styles.filterText, statusFilter === 'all' && styles.filterTextActive]}>All</Text>
        </Pressable>
        <Pressable
          style={[styles.filterItem, statusFilter === 'unpaid' && styles.filterItemActive]}
          onPress={() => setStatusFilter('unpaid')}
        >
          <Text style={[styles.filterText, statusFilter === 'unpaid' && styles.filterTextActive]}>{t('invoiceDetail.statusUnpaid')}</Text>
        </Pressable>
        <Pressable
          style={[styles.filterItem, statusFilter === 'paid' && styles.filterItemActive]}
          onPress={() => setStatusFilter('paid')}
        >
          <Text style={[styles.filterText, statusFilter === 'paid' && styles.filterTextActive]}>{t('invoiceDetail.statusPaid')}</Text>
        </Pressable>
      </View>
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
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
          >
            <View style={styles.cardRow}>
              <Text style={styles.invoiceNumber}>{item.number}</Text>
              <Text style={styles.invoiceTotal}>{formatMoney(item.total, companyProfile.currency)}</Text>
            </View>
            <Text style={styles.clientName}>{item.client?.fullName}</Text>
            <View style={styles.cardRow}>
              <Text style={typography.muted}>{item.date}</Text>
              <Text style={typography.muted}>{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</Text>
            </View>
            <View style={styles.subRow}>
              <Text style={typography.muted}>{item.dueDate || t('pdf.onReceipt')}</Text>
              <Text style={{ color: item.status === 'paid' ? '#2E7D32' : '#C0503A', fontWeight: '600' }}>
                {item.status === 'paid' ? t('invoiceDetail.statusPaid') : t('invoiceDetail.statusUnpaid')}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  usageBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#EEF5F7',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  usageText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  usageCta: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
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
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceNumber: { fontSize: 15, fontWeight: '700', color: colors.primary },
  invoiceTotal: { fontSize: 16, fontWeight: '700', color: colors.text },
  clientName: { fontSize: 15, color: colors.text, marginTop: 4, marginBottom: 4 },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
});
