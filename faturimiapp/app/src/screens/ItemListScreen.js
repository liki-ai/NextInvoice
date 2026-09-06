import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';

export default function ItemListScreen({ navigation }) {
  const { catalogItems, deleteCatalogItem, companyProfile } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const currency = companyProfile.currency || 'EUR';

  return (
    <View style={styles.container}>
      <FlatList
        data={catalogItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 96 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('items.empty')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('ItemForm', { itemId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.description || t('items.untitled')}</Text>
              <Text style={typography.muted}>
                {formatMoney(Number(item.unitCost) || 0, currency)} · {t(`items.unit.${item.unit || 'pcs'}`)}
              </Text>
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => {
                Alert.alert(t('items.deleteTitle'), t('items.deleteMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: () => deleteCatalogItem(item.id) },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => navigation.navigate('ItemForm')} accessibilityLabel={t('items.add')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: spacing.lg },
  emptyText: { marginTop: spacing.sm, textAlign: 'center', color: colors.textMuted, fontSize: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 8,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
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
  },
});
