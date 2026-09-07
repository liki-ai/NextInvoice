import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField, Section } from '../components/ui';
import {
  MEASUREMENT_FIELDS,
  clientDisplayName,
  composeClient,
  isFashionIndustry,
} from '../utils/client';
import { pickImageFile, proofSource } from '../utils/proof';

export default function ClientFormScreen({ navigation, route }) {
  const clientId = route?.params?.clientId;
  const { clients, companyProfile, addClient, updateClient } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const existing = clientId ? clients.find((item) => item.id === clientId) : null;
  const fashion = isFashionIndustry(companyProfile);

  const [fullName, setFullName] = useState(clientDisplayName(existing || {}));
  const [phone, setPhone] = useState(existing?.phone || '');
  const [email, setEmail] = useState(existing?.email || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [businessId, setBusinessId] = useState(existing?.businessId || '');
  const [measurements, setMeasurements] = useState(existing?.measurements || {});
  const [photos, setPhotos] = useState(existing?.photos || []);
  const [viewPhoto, setViewPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const payload = useMemo(
    () =>
      composeClient({
        fullName,
        phone,
        email,
        address,
        businessId,
        notes: existing?.notes || '',
        measurements: fashion ? measurements : existing?.measurements || {},
        photos: fashion ? photos : existing?.photos || [],
      }),
    [fullName, phone, email, address, businessId, measurements, photos, fashion, existing?.notes, existing?.measurements, existing?.photos],
  );

  const persist = async (thenInvoice) => {
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
      const saved = existing ? await updateClient(existing.id, payload) : await addClient(payload);
      const id = existing?.id || saved?.id;
      if (thenInvoice) navigation.navigate('Invoices', { screen: 'NewInvoice', params: { clientId: id } });
      else navigation.goBack();
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
      <Section title={t('clients.bio')}>
        <FormField label={t('newInvoice.fullName')} value={fullName} onChangeText={setFullName} placeholder={t('newInvoice.phFullName')} />
        <FormField label={t('newInvoice.address')} value={address} onChangeText={setAddress} placeholder={t('newInvoice.phAddress')} />
        <FormField
          label={t('newInvoice.phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder={t('newInvoice.phPhone')}
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
        {fashion ? (
          <>
            <Text style={[typography.label, { marginTop: spacing.sm }]}>{t('clients.measurements')}</Text>
            {MEASUREMENT_FIELDS.map((key) => (
              <FormField
                key={key}
                label={t(`clients.measure.${key}`)}
                value={measurements[key] || ''}
                onChangeText={(value) => setMeasurements((prev) => ({ ...prev, [key]: value }))}
              />
            ))}
            <View style={styles.photoRow}>
              {photos.map((photo, idx) => (
                <Pressable key={photo.proofUri || idx} onPress={() => setViewPhoto(photo)}>
                  <Image source={{ uri: proofSource(photo) }} style={styles.thumb} />
                </Pressable>
              ))}
              <Pressable
                style={styles.addPhoto}
                onPress={async () => {
                  const picked = await pickImageFile(t);
                  if (picked) setPhotos((prev) => [...prev, picked]);
                }}
              >
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.addPhotoText}>{t('clients.addPhoto')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </Section>
      <Button title={saving ? t('common.loading') : t('common.save')} onPress={() => void persist(false)} />
      <Button
        title={t('clients.saveAndInvoice')}
        variant="secondary"
        onPress={() => void persist(true)}
        style={{ marginTop: spacing.sm }}
      />
      <Modal visible={Boolean(viewPhoto)} animationType="fade" onRequestClose={() => setViewPhoto(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.close} onPress={() => setViewPhoto(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {viewPhoto ? <Image source={{ uri: proofSource(viewPhoto) }} style={styles.full} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: '#EEF2F3' },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    gap: 2,
  },
  addPhotoText: { fontSize: 9, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: '#111', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 8 },
  full: { width: '100%', height: '100%' },
});
