import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField } from './ui';
import SwipeDownModal from './SwipeDownModal';
import { clientDisplayName, clientMatchesQuery, composeClient } from '../utils/client';

export function ClientPickerSheet({ visible, onClose, clients, selectedId, onSelect, t }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(
    () => (clients || []).filter((item) => clientMatchesQuery(item, query)),
    [clients, query],
  );

  return (
    <SwipeDownModal visible={visible} onClose={onClose} title={t('docs.pickClient')}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('newInvoice.searchClients')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>{t('newInvoice.noMatchingClients')}</Text>}
        renderItem={({ item }) => {
          const active = selectedId === item.id;
          return (
            <Pressable
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, active && styles.nameActive]}>{clientDisplayName(item)}</Text>
                {item.phone ? <Text style={typography.muted}>{item.phone}</Text> : null}
              </View>
              {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
      />
    </SwipeDownModal>
  );
}

export function AddClientSheet({ visible, onClose, initialName, onSave, t }) {
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFullName(initialName || '');
    setAddress('');
    setPhone('');
    setEmail('');
    setBusinessId('');
  }, [visible, initialName]);

  const submit = async () => {
    const payload = composeClient({ fullName, address, phone, email, businessId });
    if (!payload.fullName) {
      Alert.alert(t('common.error'), t('clients.validationName'));
      return;
    }
    if (!payload.phone) {
      Alert.alert(t('common.error'), t('clients.validationPhone'));
      return;
    }
    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeDownModal visible={visible} onClose={onClose} title={t('docs.addClient')} tall={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <FormField label={t('newInvoice.fullName')} value={fullName} onChangeText={setFullName} placeholder={t('newInvoice.phFullName')} />
        <FormField label={t('newInvoice.address')} value={address} onChangeText={setAddress} placeholder={t('newInvoice.phAddress')} />
        <FormField
          label={t('newInvoice.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('newInvoice.phPhone')}
          keyboardType="phone-pad"
        />
        <FormField
          label={`${t('docs.email')} (${t('common.optional')})`}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label={`${t('docs.businessId')} (${t('common.optional')})`}
          value={businessId}
          onChangeText={setBusinessId}
        />
        <Button title={saving ? t('common.loading') : t('common.save')} onPress={() => void submit()} loading={saving} />
      </ScrollView>
    </SwipeDownModal>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowActive: {
    backgroundColor: '#EEF5F7',
    borderRadius: radius.sm,
    borderBottomWidth: 0,
  },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  nameActive: { color: colors.primary, fontWeight: '800' },
  form: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
