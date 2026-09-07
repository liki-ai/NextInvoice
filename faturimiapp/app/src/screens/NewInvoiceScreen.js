import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AddClientSheet, ClientPickerSheet } from '../components/ClientSheets';
import { generateInvoiceNumber, formatDateForInvoice } from '../utils/invoiceNumber';
import { buildInvoiceHtml, computeTotals } from '../pdf/invoiceTemplate';
import { formatMoney, toNumber } from '../utils/money';
import { generateId } from '../utils/id';
import { extractInvoiceInfo } from '../api/extract';
import { shareInvoicePdf } from '../pdf/generateInvoicePdf';
import { localizeCompanyProfile } from '../storage/companySamples';
import {
  clientDisplayName,
  clientMatchesQuery,
  findMatchingClient,
  frequentClients,
  invoiceClientFields,
} from '../utils/client';
import { invoiceLineFromCatalog, invoiceLinesFromExtract } from '../utils/catalog';
import { pickImageFile, takePhotoFile } from '../utils/proof';

function emptyItem() {
  return { id: generateId(), description: '', quantity: '1', unitPrice: '' };
}

function emptyClient() {
  return { fullName: '', address: '', phone: '', email: '', businessId: '' };
}

function clientFromInvoice(invoice) {
  return {
    fullName: invoice?.client?.fullName || '',
    address: invoice?.client?.address || '',
    phone: invoice?.client?.phone || '',
    email: invoice?.client?.email || '',
    businessId: invoice?.client?.businessId || '',
  };
}

function itemsFromInvoice(invoice) {
  if (!invoice?.items?.length) return [emptyItem()];
  return invoice.items.map((it) => ({
    id: it.id || generateId(),
    description: it.description || '',
    quantity: String(it.quantity ?? '1'),
    unitPrice: String(it.unitPrice ?? ''),
  }));
}

function catalogSuggestions(catalogItems, query) {
  const q = String(query || '').trim().toLowerCase();
  const list = q
    ? catalogItems.filter((item) => String(item.description || '').toLowerCase().includes(q))
    : catalogItems;
  return list.slice(0, 8);
}

export default function NewInvoiceScreen({ navigation, route }) {
  const invoiceId = route?.params?.invoiceId;
  const {
    invoices,
    clients,
    catalogItems,
    companyProfile,
    settings,
    addInvoice,
    updateInvoice,
    issueInvoice,
    correctInvoice,
    addClient,
  } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const existing = invoiceId ? invoices.find((inv) => inv.id === invoiceId) : null;
  const isEditing = Boolean(invoiceId);
  const canAutosaveDraft = !isEditing || existing?.lifecycle === 'draft';

  const [mode, setMode] = useState('manual');
  const [aiText, setAiText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [client, setClient] = useState(() => (existing ? clientFromInvoice(existing) : emptyClient()));
  const [invoiceNumber, setInvoiceNumber] = useState(() => existing?.number || generateInvoiceNumber(invoices));
  const [date, setDate] = useState(() => existing?.date || formatDateForInvoice(new Date()));
  const [dueDate, setDueDate] = useState(() => existing?.dueDate || '');
  const [clientId, setClientId] = useState(() => existing?.clientId || '');
  const [savingDraft, setSavingDraft] = useState(false);
  const [items, setItems] = useState(() => (existing ? itemsFromInvoice(existing) : [emptyItem()]));
  const [discount, setDiscount] = useState(() => String(existing?.discount ?? '0'));
  const [notes, setNotes] = useState(() => existing?.notes || '');
  const [showDiscount, setShowDiscount] = useState(() => Number(existing?.discount) > 0);
  const [showNotes, setShowNotes] = useState(() => Boolean(existing?.notes));
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activeItemId, setActiveItemId] = useState(() => (existing?.items?.[0]?.id ? existing.items[0].id : null));

  const persistedIdRef = useRef(existing?.id || invoiceId || null);
  const skipLeaveGuard = useRef(false);
  const formRef = useRef({});
  const persistLock = useRef(false);

  useEffect(() => {
    const id = route?.params?.clientId;
    if (!id) return;
    const found = clients.find((item) => item.id === id);
    if (!found) return;
    setClientId(found.id);
    setClient(invoiceClientFields(found));
  }, [route?.params?.clientId, clients]);

  const { subtotal, total } = computeTotals(items, discount);

  const applyClient = (item) => {
    setClientId(item.id);
    setClient(invoiceClientFields(item));
  };

  const suggestedClients = useMemo(() => {
    const query = client.fullName;
    if (query.trim()) return clients.filter((item) => clientMatchesQuery(item, query)).slice(0, 8);
    return frequentClients(clients, invoices, 8);
  }, [clients, invoices, client.fullName]);

  const selectedClient = clientId ? clients.find((item) => item.id === clientId) : null;
  const showClientCard = Boolean(client.address || client.phone || client.email || client.businessId);

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const removeItem = (id) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  };

  const addItem = () => {
    const next = emptyItem();
    setItems((prev) => [...prev, next]);
    setActiveItemId(next.id);
  };

  const applyCatalogItem = (catalogItem, targetId) => {
    setItems((prev) => {
      const line = invoiceLineFromCatalog(catalogItem, generateId);
      const target =
        prev.find((it) => it.id === targetId) ||
        prev.find((it) => it.id === activeItemId) ||
        prev.find((it) => !String(it.description || '').trim()) ||
        null;
      if (!target) return prev;
      return prev.map((it) => (it.id === target.id ? { ...line, id: target.id } : it));
    });
  };

  const resetForm = () => {
    setClient(emptyClient());
    setAiText('');
    setInvoiceNumber(generateInvoiceNumber(invoices));
    setDate(formatDateForInvoice(new Date()));
    setDueDate('');
    setClientId('');
    setAiCollapsed(false);
    setItems([emptyItem()]);
    setDiscount('0');
    setNotes('');
    setShowDiscount(false);
    setShowNotes(false);
    setMode('manual');
    setPreviewVisible(false);
    persistedIdRef.current = null;
  };

  const buildPayload = (requireItems) => {
    if (!client.fullName.trim()) {
      if (requireItems) Alert.alert(t('common.error'), t('newInvoice.validationClient'));
      return null;
    }
    const validItems = items.filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0);
    if (requireItems && validItems.length === 0) {
      Alert.alert(t('common.error'), t('newInvoice.validationItems'));
      return null;
    }
    const totals = computeTotals(validItems, discount);
    return {
      number: invoiceNumber,
      date,
      dueDate,
      client: { ...client, id: clientId },
      clientId,
      items: validItems,
      discount,
      notes,
      subtotal: totals.subtotal,
      total: totals.total,
    };
  };

  formRef.current = {
    client,
    clientId,
    invoiceNumber,
    date,
    dueDate,
    items,
    discount,
    notes,
    canAutosaveDraft,
  };

  const persistDraft = useCallback(
    async ({ silent = true } = {}) => {
      if (skipLeaveGuard.current) return null;
      if (persistLock.current) await persistLock.current;
      if (skipLeaveGuard.current) return null;
      const snap = formRef.current;
      if (!snap.canAutosaveDraft) return null;
      if (!snap.client?.fullName?.trim() && !snap.clientId) return null;
      let release;
      persistLock.current = new Promise((resolve) => {
        release = resolve;
      });
      try {
        const validItems = (snap.items || []).filter((it) => it.description.trim() && toNumber(it.unitPrice) >= 0);
        const totals = computeTotals(validItems, snap.discount);
        const payload = {
          number: snap.invoiceNumber,
          date: snap.date,
          dueDate: snap.dueDate,
          client: { ...snap.client, id: snap.clientId },
          clientId: snap.clientId,
          items: validItems,
          discount: snap.discount,
          notes: snap.notes,
          subtotal: totals.subtotal,
          total: totals.total,
          lifecycle: 'draft',
          sent: false,
        };
        if (persistedIdRef.current) {
          await updateInvoice(persistedIdRef.current, payload);
          return persistedIdRef.current;
        }
        const saved = await addInvoice(payload);
        persistedIdRef.current = saved.id;
        return saved.id;
      } catch (err) {
        if (!silent) {
          if (err?.code === 'PLAN_LIMIT' || err?.message === 'PLAN_LIMIT') {
            Alert.alert(t('billing.limitTitle'), t('newInvoice.limitReached'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('billing.ctaIap'), onPress: () => navigation.navigate('Subscribe') },
            ]);
          } else {
            Alert.alert(t('common.error'), err.message);
          }
        }
        return null;
      } finally {
        persistLock.current = null;
        release?.();
      }
    },
    [addInvoice, updateInvoice, navigation, t],
  );

  useEffect(() => {
    if (!canAutosaveDraft || !clientId) return;
    const timer = setTimeout(() => {
      void persistDraft({ silent: true });
    }, 700);
    return () => clearTimeout(timer);
  }, [canAutosaveDraft, clientId, client, items, discount, notes, invoiceNumber, date, dueDate, persistDraft]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (skipLeaveGuard.current) return;
      if (!canAutosaveDraft || !formRef.current.clientId) return;
      e.preventDefault();
      skipLeaveGuard.current = true;
      void persistDraft({ silent: true }).finally(() => navigation.dispatch(e.data.action));
    });
    return unsub;
  }, [navigation, canAutosaveDraft, persistDraft]);

  const previewHtml = useMemo(() => {
    if (!previewVisible) return '';
    const draft = {
      number: invoiceNumber,
      date,
      dueDate,
      client,
      items: items.filter((it) => it.description.trim()),
      discount,
      notes,
      subtotal,
      total,
    };
    return buildInvoiceHtml({
      company: localizeCompanyProfile(companyProfile, t),
      client,
      invoice: draft,
      pdfLabels: t('pdf'),
    });
  }, [previewVisible, invoiceNumber, date, client, items, discount, notes, subtotal, total, companyProfile, t]);

  const handleExtract = async (file) => {
    const photo = file?.uri ? file : null;
    if (!photo && !aiText.trim()) return;
    setExtracting(true);
    try {
      const result = await extractInvoiceInfo(settings.apiBaseUrl, {
        text: aiText.trim(),
        file: photo
          ? {
              uri: photo.uri,
              name: photo.name || 'photo.jpg',
              mimeType: photo.mimeType || 'image/jpeg',
              data: photo.data,
            }
          : null,
      });
      const extractedClient = {
        fullName: result.fullName || '',
        address: result.address || '',
        phone: result.phone || '',
        email: result.email || '',
        businessId: result.businessId || '',
      };
      const match = findMatchingClient(clients, extractedClient);
      if (match) {
        setClientId(match.id);
        setClient({
          fullName: clientDisplayName(match) || extractedClient.fullName,
          address: extractedClient.address || match.address || '',
          phone: extractedClient.phone || match.phone || '',
          email: extractedClient.email || match.email || '',
          businessId: extractedClient.businessId || match.businessId || '',
        });
      } else if (extractedClient.fullName.trim() || extractedClient.address || extractedClient.phone) {
        setClientId('');
        setClient(extractedClient);
      }
      const lines = invoiceLinesFromExtract(result.items, catalogItems, generateId);
      if (lines.length) {
        setItems(lines);
        setActiveItemId(lines[0].id);
      }
      setAiCollapsed(true);
      Alert.alert(t('common.success'), t('newInvoice.aiExtractSuccess'));
    } catch (err) {
      const detail = String(err?.message || '').trim();
      Alert.alert(
        t('common.error'),
        detail && !detail.startsWith('Request failed')
          ? `${t('newInvoice.aiExtractError')}\n${detail}`
          : t('newInvoice.aiExtractError'),
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractPhoto = async () => {
    const picked = await takePhotoFile(t);
    if (!picked?.proofUri && !picked?.proofData) return;
    await handleExtract({
      uri: picked.proofUri,
      name: picked.proofName || 'photo.jpg',
      mimeType: picked.proofMime || 'image/jpeg',
      data: picked.proofData,
    });
  };

  const handleExtractGallery = async () => {
    const picked = await pickImageFile(t);
    if (!picked?.proofUri && !picked?.proofData) return;
    await handleExtract({
      uri: picked.proofUri,
      name: picked.proofName || 'photo.jpg',
      mimeType: picked.proofMime || 'image/jpeg',
      data: picked.proofData,
    });
  };

  const handlePreview = () => {
    const draft = buildPayload(true);
    if (!draft) return;
    setPreviewVisible(true);
  };

  const leaveAfterSave = (highlightId) => {
    skipLeaveGuard.current = true;
    navigation.navigate('InvoicesList', highlightId ? { highlightId } : undefined);
  };

  const handleSave = async (asDraft = false) => {
    const invoice = buildPayload(true);
    if (!invoice) {
      setSavingDraft(false);
      return;
    }

    skipLeaveGuard.current = true;
    if (persistLock.current) await persistLock.current;
    setSaving(true);
    try {
      let savedClientId = clientId;
      if (!savedClientId && client.fullName.trim()) {
        const savedClient = await addClient({
          fullName: client.fullName.trim(),
          address: client.address || '',
          phone: client.phone || '',
          email: client.email || '',
          businessId: client.businessId || '',
        });
        savedClientId = savedClient.id;
        setClientId(savedClientId);
      }
      const sharing = !asDraft && canAutosaveDraft;
      const payload = {
        ...invoice,
        clientId: savedClientId,
        lifecycle: 'issued',
        sent: sharing ? true : asDraft ? false : existing?.sent !== false,
        sentAt: sharing ? new Date().toISOString() : asDraft ? null : existing?.sentAt || null,
      };
      const existingId = persistedIdRef.current || invoiceId;
      const isIssuedEdit = Boolean(existing?.lifecycle && existing.lifecycle !== 'draft');
      let savedId = existingId;
      if (existingId && isIssuedEdit) {
        await correctInvoice(existingId, {
          items: payload.items,
          discount: payload.discount,
          notes: payload.notes,
          reason: t('newInvoice.saveChanges'),
        });
      } else if (existingId) {
        await updateInvoice(existingId, payload);
        if (canAutosaveDraft) await issueInvoice(existingId);
      } else {
        const saved = await addInvoice(payload);
        persistedIdRef.current = saved.id;
        savedId = saved.id;
      }
      if (sharing) {
        await shareInvoicePdf({
          company: localizeCompanyProfile(companyProfile, t),
          client,
          invoice: payload,
          pdfLabels: t('pdf'),
        });
      }
      Alert.alert(t('common.success'), isEditing ? t('newInvoice.updatedSuccess') : t('newInvoice.savedSuccess'));
      if (!isEditing) resetForm();
      leaveAfterSave(savedId);
    } catch (err) {
      skipLeaveGuard.current = false;
      if (err?.code === 'PLAN_LIMIT' || err?.message === 'PLAN_LIMIT') {
        Alert.alert(t('billing.limitTitle'), t('newInvoice.limitReached'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('billing.ctaIap'),
            onPress: () => navigation.navigate('Subscribe'),
          },
        ]);
      } else {
        Alert.alert(t('common.error'), err.message);
      }
    } finally {
      setSaving(false);
      setSavingDraft(false);
    }
  };

  const issuedEdit = isEditing && existing?.lifecycle && existing.lifecycle !== 'draft';
  const saveLabel = issuedEdit ? t('newInvoice.saveChanges') : t('newInvoice.saveAndShare');

  if (isEditing && !existing) {
    return (
      <View style={styles.container}>
        <Text style={typography.body}>Invoice not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'manual', label: t('newInvoice.modeManual') },
            { value: 'ai', label: t('newInvoice.modeAi') },
          ]}
        />

        {mode === 'ai' && (
          aiCollapsed ? (
            <Pressable
              onPress={() => setAiCollapsed(false)}
              style={styles.aiCollapsed}
              accessibilityRole="button"
              accessibilityLabel={t('newInvoice.aiFilledCollapsed')}
            >
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
              <Text style={styles.aiCollapsedText}>{t('newInvoice.aiFilledCollapsed')}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.primary} />
            </Pressable>
          ) : (
          <Section>
            <FormField
              label={t('newInvoice.aiInputLabel')}
              placeholder={t('newInvoice.aiInputPlaceholder')}
              value={aiText}
              onChangeText={setAiText}
              multiline
              numberOfLines={3}
              style={{ height: 72, textAlignVertical: 'top' }}
            />
            <View style={styles.aiActions}>
              <Button
                title={extracting ? t('newInvoice.aiExtracting') : t('newInvoice.aiExtractButton')}
                onPress={() => void handleExtract()}
                loading={extracting}
                disabled={!aiText.trim() || extracting}
                style={{ flex: 1, paddingHorizontal: 8 }}
              />
              <Button
                title={t('newInvoice.aiTakePhoto')}
                onPress={() => void handleExtractPhoto()}
                loading={extracting}
                disabled={extracting}
                variant="secondary"
                style={{ flex: 1, paddingHorizontal: 8 }}
                icon={<Ionicons name="camera-outline" size={18} color={colors.primary} />}
              />
              <Pressable
                onPress={() => void handleExtractGallery()}
                disabled={extracting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('newInvoice.aiChoosePhoto')}
                style={[styles.galleryIconBtn, extracting && { opacity: 0.5 }]}
              >
                <Ionicons name="images-outline" size={22} color={colors.primary} />
              </Pressable>
            </View>
          </Section>
          )
        )}

        <Section title={t('newInvoice.clientSectionTitle')}>
          <View style={styles.clientActions}>
            <Pressable style={styles.optionLink} onPress={() => setPickerOpen(true)}>
              <Ionicons name="people-outline" size={18} color={colors.primary} />
              <Text style={styles.optionLinkText}>{t('newInvoice.selectClient')}</Text>
            </Pressable>
            <Pressable style={styles.optionLink} onPress={() => setAddOpen(true)}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.optionLinkText}>{t('docs.addClient')}</Text>
            </Pressable>
          </View>
          <FormField
            label={t('newInvoice.fullName')}
            value={client.fullName}
            placeholder={t('newInvoice.phFullName')}
            onChangeText={(v) => {
              if (selectedClient && clientDisplayName(selectedClient) !== v) {
                setClientId('');
                setClient({ fullName: v, address: '', phone: '', email: '', businessId: '' });
                return;
              }
              setClient((c) => ({ ...c, fullName: v }));
            }}
          />
          {suggestedClients.length > 0 && !clientId ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              style={styles.chipScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              {suggestedClients.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.optionLink, clientId === item.id && styles.optionLinkActive]}
                  onPress={() => applyClient(item)}
                >
                  <Text style={[styles.optionLinkText, clientId === item.id && styles.optionLinkTextActive]}>
                    {clientDisplayName(item)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {showClientCard ? (
            <View style={styles.infoCard}>
              {client.address ? (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.infoText}>{client.address}</Text>
                </View>
              ) : null}
              {client.phone ? (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.infoText}>{client.phone}</Text>
                </View>
              ) : null}
              {client.email ? (
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.infoText}>{client.email}</Text>
                </View>
              ) : null}
              {client.businessId ? (
                <View style={styles.infoRow}>
                  <Ionicons name="briefcase-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.infoText}>{client.businessId}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Section>

        <Section title={t('newInvoice.invoiceDetailsSectionTitle')}>
          <FormField label={t('newInvoice.invoiceNumber')} value={invoiceNumber} onChangeText={setInvoiceNumber} />
          <FormField label={t('newInvoice.date')} value={date} onChangeText={setDate} />
          <FormField label={t('pdf.dueDateLabel')} value={dueDate} placeholder={t('pdf.onReceipt')} onChangeText={setDueDate} />
        </Section>

        <Section title={t('newInvoice.itemsSectionTitle')}>
          {items.map((item, idx) => {
            const typing = Boolean(item.description.trim());
            const suggestions =
              typing || item.id === activeItemId || items.length === 1
                ? catalogSuggestions(catalogItems, item.description)
                : [];
            return (
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
                  placeholder={t('newInvoice.phItemDescription')}
                  onChangeText={(v) => updateItem(item.id, 'description', v)}
                  onFocus={() => setActiveItemId(item.id)}
                />
                {suggestions.length > 0 ? (
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    style={styles.chipScroll}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {suggestions.map((catalogItem) => (
                      <Pressable
                        key={catalogItem.id}
                        style={styles.optionLink}
                        onPress={() => applyCatalogItem(catalogItem, item.id)}
                      >
                        <Text style={styles.optionLinkText}>{catalogItem.description}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
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
            );
          })}

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
          <Pressable style={styles.sideButton} onPress={handlePreview}>
            <Ionicons name="eye-outline" size={18} color={colors.primary} />
            <Text style={styles.sideButtonText}>{t('newInvoice.preview')}</Text>
          </Pressable>
          {canAutosaveDraft ? (
            <Pressable
              style={styles.sideButton}
              onPress={() => {
                setSavingDraft(true);
                void handleSave(true);
              }}
            >
              <Ionicons name="document-outline" size={18} color={colors.primary} />
              <Text style={styles.sideButtonText}>{savingDraft ? t('common.loading') : t('common.save')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Button
          title={saveLabel}
          onPress={() => void handleSave(false)}
          loading={saving}
          icon={!issuedEdit ? <Ionicons name="send-outline" size={18} color="#fff" /> : null}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>

      <ClientPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        clients={clients}
        selectedId={clientId}
        onSelect={applyClient}
        t={t}
      />
      <AddClientSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        initialName={client.fullName}
        t={t}
        onSave={async (payload) => {
          const saved = await addClient(payload);
          applyClient(saved);
        }}
      />

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
              title={saveLabel}
              onPress={() => void handleSave(false)}
              loading={saving}
              icon={!issuedEdit ? <Ionicons name="send-outline" size={18} color="#fff" /> : null}
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
  clientActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  galleryIconBtn: {
    width: 48,
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aiCollapsedText: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: spacing.sm,
  },
  chipScroll: { flexGrow: 0, minHeight: 36 },
  infoCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F7FAFB',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 6,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
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
  optionLinkActive: {
    backgroundColor: colors.primary,
  },
  optionLinkText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  optionLinkTextActive: {
    color: '#fff',
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sideButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#fff',
  },
  sideButtonText: {
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
