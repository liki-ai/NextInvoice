import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField, Section } from '../components/ui';
import { ITEM_UNITS, emptyCatalogItem } from '../utils/catalog';

export default function ItemFormScreen({ navigation, route }) {
  const itemId = route?.params?.itemId;
  const { catalogItems, addCatalogItem, updateCatalogItem } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const existing = itemId ? catalogItems.find((item) => item.id === itemId) : null;
  const [form, setForm] = useState(() => ({ ...emptyCatalogItem(), ...(existing || {}) }));
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSave = async () => {
    if (!String(form.description || '').trim()) {
      Alert.alert(t('common.error'), t('items.validationDescription'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: String(form.description).trim(),
        unitCost: Number(String(form.unitCost).replace(',', '.')) || 0,
        unit: form.unit || 'pcs',
        taxable: Boolean(form.taxable),
        additionalDetails: String(form.additionalDetails || '').trim(),
      };
      if (existing) await updateCatalogItem(existing.id, payload);
      else await addCatalogItem(payload);
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Section>
        <FormField
          label={t('items.description')}
          value={form.description}
          placeholder={t('items.phDescription')}
          onChangeText={(v) => setField('description', v)}
        />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('items.unitCost')}</Text>
          <FormField
            containerStyle={{ flex: 1, marginBottom: 0 }}
            value={String(form.unitCost ?? '')}
            placeholder="0.00"
            keyboardType="decimal-pad"
            onChangeText={(v) => setField('unitCost', v)}
            style={styles.rightInput}
          />
        </View>
        <Text style={typography.label}>{t('items.unitLabel')}</Text>
        <View style={styles.chipRow}>
          {ITEM_UNITS.map((unit) => (
            <Pressable
              key={unit}
              style={[styles.chip, form.unit === unit && styles.chipActive]}
              onPress={() => setField('unit', unit)}
            >
              <Text style={form.unit === unit ? styles.chipTextActive : styles.chipText}>{t(`items.unit.${unit}`)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('items.taxable')}</Text>
          <Switch value={Boolean(form.taxable)} onValueChange={(v) => setField('taxable', v)} />
        </View>
      </Section>
      <Section title={t('items.additionalDetails')}>
        <FormField
          value={form.additionalDetails}
          placeholder={t('items.phAdditional')}
          onChangeText={(v) => setField('additionalDetails', v)}
          multiline
          numberOfLines={4}
        />
      </Section>
      <Button title={saving ? t('common.loading') : t('common.save')} onPress={() => void onSave()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: spacing.md,
  },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  rightInput: { textAlign: 'right' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
