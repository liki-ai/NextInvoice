import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, FormField } from './ui';
import { remainingOf, todayInputValue } from '../utils/document';
import { formatMoney } from '../utils/money';
import { colors, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

export default function PaymentModal({ visible, doc, currency, onClose, onSave }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const remaining = remainingOf(doc || {}) || (doc?.lifecycle === 'draft' ? Number(doc?.total) || 0 : 0);
  const [amount, setAmount] = useState(remaining ? String(remaining) : '');
  const [date, setDate] = useState(todayInputValue());
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const due = remainingOf(doc || {}) || (doc?.lifecycle === 'draft' ? Number(doc?.total) || 0 : 0);
    setAmount(due ? String(due) : '');
    setDate(todayInputValue());
    setMethod('');
    setNote('');
  }, [visible, doc?.id]);

  const submit = async () => {
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > remaining + 0.001 || !date) return;
    setSaving(true);
    try {
      await onSave({ amount: value, date, method, note });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const topPad = Platform.OS === 'ios' ? spacing.md : insets.top + spacing.md;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.wrap, { paddingTop: topPad, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <Text style={typography.title}>{t('docs.recordPayment')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={typography.muted}>
              {t('docs.remaining')}: {formatMoney(remaining, currency)}
            </Text>
            <FormField label={t('docs.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <FormField label={t('docs.date')} value={date} onChangeText={setDate} />
            <FormField label={t('docs.method')} value={method} onChangeText={setMethod} />
            <FormField label={t('docs.note')} value={note} onChangeText={setNote} />
            <Button title={saving ? t('common.loading') : t('docs.recordPayment')} onPress={submit} loading={saving} />
            <Pressable onPress={onClose} style={{ marginTop: spacing.md }}>
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  body: { paddingBottom: spacing.lg },
  cancel: { textAlign: 'center', color: colors.primary, fontWeight: '700' },
});
