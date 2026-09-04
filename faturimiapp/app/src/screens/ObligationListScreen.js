import React, { useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';

const CATEGORY_KEYS = {
  shipping: 'obligations.categoryShipping',
  supplies: 'obligations.categorySupplies',
  rent: 'obligations.categoryRent',
  tax: 'obligations.categoryTax',
  other: 'obligations.categoryOther',
};

export default function ObligationListScreen({ navigation }) {
  const { obligations, invoices, companyProfile, updateObligation } = useApp();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const currency = companyProfile.currency || 'EUR';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('ObligationForm')} hitSlop={12} style={styles.headerAdd}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return obligations;
    if (statusFilter === 'paid') return obligations.filter((item) => item.status === 'paid');
    return obligations.filter((item) => item.status !== 'paid');
  }, [obligations, statusFilter]);

  const unpaid = obligations
    .filter((item) => item.status !== 'paid')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const paid = obligations
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>{t('obligations.title')}</Text>
        <Text style={styles.subtitle}>{t('obligations.subtitle')}</Text>
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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('obligations.empty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const related = invoices.find((inv) => inv.id === item.relatedInvoiceId);
          const paidItem = item.status === 'paid';
          return (
            <Pressable
              style={styles.card}
              onPress={() => navigation.navigate('ObligationForm', { obligationId: item.id })}
            >
              <View style={styles.cardRow}>
                <Text style={styles.vendor}>{item.vendor}</Text>
                <Text style={styles.amount}>{formatMoney(Number(item.amount) || 0, currency)}</Text>
              </View>
              {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
              <Text style={styles.category}>{t(CATEGORY_KEYS[item.category] || CATEGORY_KEYS.other)}</Text>
              <View style={styles.cardRow}>
                <Text style={typography.muted}>{item.date}</Text>
                <Pressable
                  onPress={() => updateObligation(item.id, { status: paidItem ? 'unpaid' : 'paid' })}
                  hitSlop={8}
                >
                  <Text style={{ color: paidItem ? colors.success : colors.danger, fontWeight: '700' }}>
                    {paidItem ? t('invoiceDetail.statusPaid') : t('invoiceDetail.statusUnpaid')}
                  </Text>
                </Pressable>
              </View>
              {related ? <Text style={styles.related}>{related.number}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  subtitle: { marginTop: 6, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  headerAdd: { paddingHorizontal: 8 },
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
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vendor: { fontSize: 16, fontWeight: '700', color: colors.primary },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  description: { marginTop: 4, fontSize: 14, color: colors.text },
  category: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  related: { marginTop: 6, fontSize: 13, fontWeight: '600', color: colors.primary },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
});
