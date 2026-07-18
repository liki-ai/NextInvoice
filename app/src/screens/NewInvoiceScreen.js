import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField, Section, SegmentedControl } from '../components/ui';
import { generateInvoiceNumber, formatDateForInvoice } from '../utils/invoiceNumber';
import { computeTotals } from '../pdf/invoiceTemplate';
import { formatMoney, toNumber } from '../utils/money';
import { generateId } from '../utils/id';
import { extractClientInfo } from '../api/extract';
import { shareInvoicePdf } from '../pdf/generateInvoicePdf';

function emptyItem() {
  return { id: generateId(), description: 'Fustan Solemn / Dress', quantity: '1', unitPrice: '80' };
}

function emptyClient() {
  return { fullName: '', address: '', phone: '' };
}

export default function NewInvoiceScreen({ navigation }) {
  const { invoices, companyProfile, settings, addInvoice } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState('manual');
  const [aiText, setAiText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [client, setClient] = useState(emptyClient());
  const [invoiceNumber, setInvoiceNumber] = useState(() => generateInvoiceNumber(invoices));
  const [date, setDate] = useState(() => formatDateForInvoice(new Date()));
  const [items, setItems] = useState([emptyItem()]);
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { subtotal, total } = computeTotals(items, discount);

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const removeItem = (id) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const resetForm = () => {
    setClient(emptyClient());
    setAiText('');
    setInvoiceNumber(generateInvoiceNumber(invoices));
    setDate(formatDateForInvoice(new Date()));
    setItems([emptyItem()]);
    setDiscount('0');
    setNotes('');
    setMode('manual');
  };

  const handleExtract = async () => {
    if (!aiText.trim()) return;
    setExtracting(true);
    try {
      const result = await extractClientInfo(settings.apiBaseUrl, aiText);
      setClient({
        fullName: result.fullName || '',
        address: result.address || '',
        phone: result.phone || '',
      });
    } catch (err) {
      Alert.alert(t('common.error'), t('newInvoice.aiExtractError'));
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!client.fullName.trim()) {
      Alert.alert(t('common.error'), t('newInvoice.validationClient'));
      return;
    }
    const validItems = items.filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0);
    if (validItems.length === 0) {
      Alert.alert(t('common.error'), t('newInvoice.validationItems'));
      return;
    }

    setSaving(true);
    try {
      const invoice = {
        number: invoiceNumber,
        date,
        client,
        items: validItems,
        discount,
        notes,
        subtotal,
        total,
      };
      await addInvoice(invoice);
      await shareInvoicePdf({ company: companyProfile, client, invoice, pdfLabels: t('pdf') });
      Alert.alert(t('common.success'), t('newInvoice.savedSuccess'));
      resetForm();
      navigation.navigate('Invoices');
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
        <Text style={typography.title}>{t('newInvoice.title')}</Text>

        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'manual', label: t('newInvoice.modeManual') },
            { value: 'ai', label: t('newInvoice.modeAi') },
          ]}
        />

        {mode === 'ai' && (
          <Section>
            <FormField
              label={t('newInvoice.aiInputLabel')}
              placeholder={t('newInvoice.aiInputPlaceholder')}
              value={aiText}
              onChangeText={setAiText}
              multiline
              numberOfLines={4}
              style={{ height: 90, textAlignVertical: 'top' }}
            />
            <Button
              title={extracting ? t('newInvoice.aiExtracting') : t('newInvoice.aiExtractButton')}
              onPress={handleExtract}
              loading={extracting}
              disabled={!aiText.trim()}
            />
          </Section>
        )}

        <Section title={t('newInvoice.clientSectionTitle')}>
          <FormField
            label={t('newInvoice.fullName')}
            value={client.fullName}
            onChangeText={(v) => setClient((c) => ({ ...c, fullName: v }))}
          />
          <FormField
            label={t('newInvoice.address')}
            value={client.address}
            onChangeText={(v) => setClient((c) => ({ ...c, address: v }))}
          />
          <FormField
            label={t('newInvoice.phone')}
            value={client.phone}
            onChangeText={(v) => setClient((c) => ({ ...c, phone: v }))}
            keyboardType="phone-pad"
          />
        </Section>

        <Section title={t('newInvoice.invoiceDetailsSectionTitle')}>
          <FormField label={t('newInvoice.invoiceNumber')} value={invoiceNumber} onChangeText={setInvoiceNumber} />
          <FormField label={t('newInvoice.date')} value={date} onChangeText={setDate} />
        </Section>

        <Section title={t('newInvoice.itemsSectionTitle')}>
          {items.map((item, idx) => (
            <View key={item.id} style={styles.itemBlock}>
              <View style={styles.itemHeaderRow}>
                <Text style={typography.label}>#{idx + 1}</Text>
                {items.length > 1 && (
                  <Pressable onPress={() => removeItem(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>
              <FormField
                label={t('newInvoice.itemDescription')}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, 'description', v)}
              />
              <View style={styles.row}>
                <FormField
                  label={t('newInvoice.itemQuantity')}
                  value={String(item.quantity)}
                  onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                  keyboardType="numeric"
                  containerStyle={{ flex: 1, marginRight: spacing.sm }}
                />
                <FormField
                  label={t('newInvoice.itemUnitPrice')}
                  value={String(item.unitPrice)}
                  onChangeText={(v) => updateItem(item.id, 'unitPrice', v)}
                  keyboardType="numeric"
                  containerStyle={{ flex: 1 }}
                />
              </View>
              <Text style={typography.muted}>
                {t('newInvoice.itemTotal')}: {formatMoney(toNumber(item.quantity) * toNumber(item.unitPrice), companyProfile.currency)}
              </Text>
            </View>
          ))}
          <Button title={t('newInvoice.addItem')} onPress={addItem} variant="secondary" />
        </Section>

        <Section>
          <FormField
            label={t('newInvoice.discount')}
            value={String(discount)}
            onChangeText={setDiscount}
            keyboardType="numeric"
          />
          <FormField
            label={t('newInvoice.notes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ height: 70, textAlignVertical: 'top' }}
          />
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.subtotal')}</Text>
            <Text style={typography.body}>{formatMoney(subtotal, companyProfile.currency)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
            <Text style={typography.subtitle}>{formatMoney(total, companyProfile.currency)}</Text>
          </View>
        </Section>

        <Button title={t('newInvoice.saveAndShare')} onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  itemBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: '#FAFBFB',
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  row: { flexDirection: 'row' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
});
