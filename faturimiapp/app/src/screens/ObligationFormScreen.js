import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, DatePickerModal, FormField, Section, SegmentedControl } from '../components/ui';
import { formatDateForInvoice } from '../utils/invoiceNumber';
import { formatMoney, toNumber } from '../utils/money';

const CATEGORIES = ['shipping', 'supplies', 'rent', 'tax', 'other'];
const CATEGORY_KEYS = {
  shipping: 'obligations.categoryShipping',
  supplies: 'obligations.categorySupplies',
  rent: 'obligations.categoryRent',
  tax: 'obligations.categoryTax',
  other: 'obligations.categoryOther',
};

export default function ObligationFormScreen({ navigation, route }) {
  const obligationId = route?.params?.obligationId;
  const { obligations, invoices, companyProfile, addObligation, updateObligation, deleteObligation } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const existing = obligationId ? obligations.find((item) => item.id === obligationId) : null;
  const isEditing = Boolean(existing);
  const currency = companyProfile.currency || 'EUR';

  const [vendor, setVendor] = useState(existing?.vendor || '');
  const [amount, setAmount] = useState(existing ? String(existing.amount ?? '') : '');
  const [date, setDate] = useState(existing?.date || formatDateForInvoice(new Date()));
  const [dueDate, setDueDate] = useState(existing?.dueDate || '');
  const [status, setStatus] = useState(existing?.status || 'unpaid');
  const [category, setCategory] = useState(existing?.category || 'shipping');
  const [notes, setNotes] = useState(existing?.notes || existing?.description || '');
  const [relatedInvoiceId, setRelatedInvoiceId] = useState(existing?.relatedInvoiceId || '');
  const [showNotes, setShowNotes] = useState(Boolean(existing?.notes || existing?.description));
  const [showInvoices, setShowInvoices] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const vendors = useMemo(() => {
    const seen = new Set();
    const names = [];
    for (const item of obligations) {
      const name = item.vendor?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }, [obligations]);

  const relatedInvoice = invoices.find((inv) => inv.id === relatedInvoiceId);
  const parsedAmount = Math.max(toNumber(amount), 0);

  const onSave = async () => {
    if (!vendor.trim()) {
      Alert.alert(t('common.error'), t('obligations.validationVendor'));
      return;
    }
    if (!(parsedAmount > 0)) {
      Alert.alert(t('common.error'), t('obligations.validationAmount'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vendor: vendor.trim(),
        description: notes.trim(),
        amount: parsedAmount,
        date,
        dueDate,
        status,
        category,
        notes: notes.trim(),
        relatedInvoiceId,
      };
      if (isEditing) await updateObligation(existing.id, payload);
      else await addObligation(payload);
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert(t('obligations.deleteConfirmTitle'), t('obligations.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteObligation(existing.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Section>
          <FormField
            label={t('obligations.vendor')}
            value={vendor}
            placeholder={t('obligations.phVendor')}
            onChangeText={setVendor}
          />
          {vendors.length > 0 ? (
            <View style={styles.chipRow}>
              {vendors.map((name) => (
                <Pressable key={name} style={styles.chip} onPress={() => setVendor(name)}>
                  <Text style={styles.chipText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FormField
            label={t('obligations.amount')}
            value={amount}
            placeholder={t('obligations.phAmount')}
            keyboardType="decimal-pad"
            onChangeText={setAmount}
          />
          <Text style={typography.label}>{t('obligations.category')}</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((value) => (
              <Pressable
                key={value}
                style={[styles.chip, category === value && styles.chipActive]}
                onPress={() => setCategory(value)}
              >
                <Text style={[styles.chipText, category === value && styles.chipTextActive]}>{t(CATEGORY_KEYS[value])}</Text>
              </Pressable>
            ))}
          </View>
          <FormField label={t('newInvoice.date')} value={date} onChangeText={setDate} />
          <Text style={[typography.label, styles.statusLabel]}>{t('obligations.status')}</Text>
          <SegmentedControl
            value={status}
            onChange={setStatus}
            options={[
              { value: 'unpaid', label: t('invoiceDetail.statusUnpaid') },
              { value: 'paid', label: t('invoiceDetail.statusPaid') },
            ]}
          />

          <View style={styles.optionLinks}>
            <Pressable style={styles.optionLink} onPress={() => setShowDuePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.optionLinkText}>
                {dueDate ? `${t('obligations.dueDate')} · ${dueDate}` : t('obligations.addDueDate')}
              </Text>
            </Pressable>
            {dueDate ? (
              <Pressable style={styles.optionLink} onPress={() => setDueDate('')}>
                <Text style={styles.optionLinkText}>{t('obligations.clearDueDate')}</Text>
              </Pressable>
            ) : null}
            {!showNotes ? (
              <Pressable style={styles.optionLink} onPress={() => setShowNotes(true)}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={styles.optionLinkText}>{t('obligations.optionalNotes')}</Text>
              </Pressable>
            ) : null}
            {!showInvoices ? (
              <Pressable style={styles.optionLink} onPress={() => setShowInvoices(true)}>
                <Ionicons name="link-outline" size={18} color={colors.primary} />
                <Text style={styles.optionLinkText}>
                  {relatedInvoice
                    ? `${relatedInvoice.number} · ${relatedInvoice.client?.fullName || ''}`
                    : t('obligations.noRelatedInvoice')}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {showNotes ? (
            <FormField
              label={t('obligations.optionalNotes')}
              value={notes}
              placeholder={t('obligations.phNotes')}
              onChangeText={setNotes}
              multiline
              style={styles.notes}
            />
          ) : null}

          {showInvoices ? (
            <View style={styles.invoiceBlock}>
              <Text style={typography.label}>{t('obligations.relatedInvoice')}</Text>
              <Pressable
                style={[styles.invoiceOption, !relatedInvoiceId && styles.invoiceOptionActive]}
                onPress={() => setRelatedInvoiceId('')}
              >
                <Text style={styles.invoiceOptionText}>{t('obligations.noRelatedInvoice')}</Text>
              </Pressable>
              {invoices.map((inv) => (
                <Pressable
                  key={inv.id}
                  style={[styles.invoiceOption, relatedInvoiceId === inv.id && styles.invoiceOptionActive]}
                  onPress={() => setRelatedInvoiceId(inv.id)}
                >
                  <Text style={styles.invoiceOptionText}>
                    {inv.number} · {inv.client?.fullName || ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Section>

        <Section>
          <View style={styles.totalRow}>
            <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
            <Text style={typography.subtitle}>{formatMoney(parsedAmount, currency)}</Text>
          </View>
          <Button title={saving ? t('common.loading') : t('common.save')} onPress={onSave} loading={saving} />
          {isEditing ? (
            <Button title={t('common.delete')} onPress={onDelete} variant="secondary" style={styles.deleteBtn} />
          ) : null}
        </Section>
      </ScrollView>

      <DatePickerModal
        visible={showDuePicker}
        value={dueDate}
        title={t('obligations.dueDate')}
        cancelLabel={t('common.cancel')}
        doneLabel={t('common.ok')}
        onClose={() => setShowDuePicker(false)}
        onSelect={setDueDate}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextActive: { color: '#fff' },
  statusLabel: { marginBottom: 8 },
  optionLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  optionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: '#EEF5F7',
  },
  optionLinkText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  invoiceBlock: { marginTop: spacing.xs },
  invoiceOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  invoiceOptionActive: { borderColor: colors.primary, backgroundColor: '#EEF5F7' },
  invoiceOptionText: { fontSize: 14, color: colors.text },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  deleteBtn: { marginTop: spacing.sm, borderColor: colors.danger },
});
