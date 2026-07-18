import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';

export default function InvoiceListScreen({ navigation }) {
  const { invoices, companyProfile } = useApp();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={typography.title}>{t('invoiceList.title')}</Text>
      </View>
      <FlatList
        data={invoices}
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
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
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
