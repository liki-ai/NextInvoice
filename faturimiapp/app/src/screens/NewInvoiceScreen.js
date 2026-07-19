import React, { useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField, Section, SegmentedControl } from '../components/ui';
import { generateInvoiceNumber, formatDateForInvoice } from '../utils/invoiceNumber';
import { buildInvoiceHtml, computeTotals } from '../pdf/invoiceTemplate';
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
  const [showDiscount, setShowDiscount] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

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
    setShowDiscount(false);
    setShowNotes(false);
    setMode('manual');
    setPreviewVisible(false);
  };

  const buildDraftInvoice = () => {
    if (!client.fullName.trim()) {
      Alert.alert(t('common.error'), t('newInvoice.validationClient'));
      return null;
    }
    const validItems = items.filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0);
    if (validItems.length === 0) {
      Alert.alert(t('common.error'), t('newInvoice.validationItems'));
      return null;
    }
    const totals = computeTotals(validItems, discount);
    return {
      number: invoiceNumber,
      date,
      client,
      items: validItems,
      discount,
      notes,
      subtotal: totals.subtotal,
      total: totals.total,
    };
  };

  const previewHtml = useMemo(() => {
    if (!previewVisible) return '';
    const draft = {
      number: invoiceNumber,
      date,
      client,
      items: items.filter((it) => it.description.trim()),
      discount,
      notes,
      subtotal,
      total,
    };
    return buildInvoiceHtml({
      company: companyProfile,
      client,
      invoice: draft,
      pdfLabels: t('pdf'),
    });
  }, [previewVisible, invoiceNumber, date, client, items, discount, notes, subtotal, total, companyProfile, t]);

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

  const handlePreview = () => {
    const draft = buildDraftInvoice();
    if (!draft) return;
    setPreviewVisible(true);
  };

  const handleSave = async () => {
    const invoice = buildDraftInvoice();
    if (!invoice) return;

    setSaving(true);
    try {
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
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
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
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
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

          <View style={styles.optionLinks}>
            <Pressable style={styles.optionLink} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.optionLinkText}>{t('newInvoice.addItem')}</Text>
            </Pressable>
            {!showDiscount ? (
              <Pressable style={styles.optionLink} onPress={() => setShowDiscount(true)}>
                <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
                <Text style={styles.optionLinkText}>{t('newInvoice.showDiscount')}</Text>
              </Pressable>
            ) : null}
            {!showNotes ? (
              <Pressable style={styles.optionLink} onPress={() => setShowNotes(true)}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={styles.optionLinkText}>{t('newInvoice.showNotes')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>

        <Section>
          {showDiscount ? (
            <FormField
              label={t('newInvoice.discount')}
              value={String(discount)}
              onChangeText={setDiscount}
              keyboardType="numeric"
            />
          ) : null}
          {showNotes ? (
            <FormField
              label={t('newInvoice.notes')}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ height: 70, textAlignVertical: 'top' }}
            />
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={typography.muted}>{t('newInvoice.subtotal')}</Text>
            <Text style={typography.body}>{formatMoney(subtotal, companyProfile.currency)}</Text>
          </View>
          {showDiscount && toNumber(discount) > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={typography.muted}>{t('newInvoice.discount')}</Text>
              <Text style={typography.body}>{formatMoney(toNumber(discount), companyProfile.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
            <Text style={typography.subtitle}>{formatMoney(total, companyProfile.currency)}</Text>
          </View>
        </Section>

        <View style={styles.actions}>
          <Pressable style={styles.previewButton} onPress={handlePreview}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
            <Text style={styles.previewButtonText}>{t('newInvoice.preview')}</Text>
          </Pressable>
          <Button title={t('newInvoice.saveAndShare')} onPress={handleSave} loading={saving} style={{ flex: 1 }} />
        </View>
      </ScrollView>

      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={[styles.previewModal, { paddingTop: insets.top }]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{t('newInvoice.previewTitle')}</Text>
            <Pressable onPress={() => setPreviewVisible(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: previewHtml }}
            style={styles.previewWebView}
            scalesPageToFit
            startInLoadingState
          />
          <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Button
              title={t('newInvoice.closePreview')}
              onPress={() => setPreviewVisible(false)}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title={t('newInvoice.saveAndShare')}
              onPress={handleSave}
              loading={saving}
              style={{ flex: 1.4 }}
            />
          </View>
        </View>
      </Modal>
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
  optionLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#fff',
  },
  previewButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  previewModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  previewWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  previewFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
