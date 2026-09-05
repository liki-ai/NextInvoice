import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, FormField } from './ui';
import { remainingOf, todayInputValue } from '../utils/document';
import { formatMoney } from '../utils/money';
import { colors, spacing, typography } from '../theme';
import { useTranslation } from '../i18n/I18nContext';

export default function PaymentModal({ visible, doc, currency, onClose, onSave }) {
  const { t } = useTranslation();
  const remaining = remainingOf(doc || {});
  const [amount, setAmount] = useState(remaining ? String(remaining) : '');
  const [date, setDate] = useState(todayInputValue());
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Text style={typography.title}>{t('docs.recordPayment')}</Text>
        <Text style={[typography.muted, { marginTop: 8 }]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  cancel: { textAlign: 'center', color: colors.primary, fontWeight: '700' },
});
