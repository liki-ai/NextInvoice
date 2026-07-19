import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { spacing, typography, colors } from '../theme';
import { Button, FormField, Section, SegmentedControl } from '../components/ui';
import { extractCompanyInfo } from '../api/extract';
import { LEGAL_URLS } from '../constants/legal';

const COMPANY_FIELDS = ['companyName', 'contactPerson', 'streetAddress', 'state', 'zipCode', 'email', 'phone'];

export default function ProfileScreen() {
  const { companyProfile, updateCompanyProfile, settings, setLanguage } = useApp();
  const { t } = useTranslation();

  const [form, setForm] = useState(companyProfile);
  const [importing, setImporting] = useState(false);
  const [justImported, setJustImported] = useState(false);
  const importedAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setForm(companyProfile);
  }, [companyProfile]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const openUrl = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(t('common.error'), t('profile.linkOpenError'));
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert(t('common.error'), t('profile.linkOpenError'));
    }
  };

  const showImportedEffect = () => {
    setJustImported(true);
    importedAnim.setValue(0);
    Animated.sequence([
      Animated.timing(importedAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(importedAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setJustImported(false));
  };

  const runExtract = async (file) => {
    try {
      setImporting(true);
      const data = await extractCompanyInfo(settings.apiBaseUrl, file);
      setForm((prev) => {
        const next = { ...prev };
        COMPANY_FIELDS.forEach((field) => {
          if (data[field]) next[field] = data[field];
        });
        return next;
      });
      showImportedEffect();
    } catch (err) {
      Alert.alert(t('common.error'), err?.message || t('profile.importError'));
    } finally {
      setImporting(false);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.cameraPermissionError'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await runExtract({ uri: asset.uri, name: asset.fileName || 'photo.jpg', mimeType: asset.mimeType || 'image/jpeg' });
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('profile.photoPermissionError'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await runExtract({ uri: asset.uri, name: asset.fileName || 'photo.jpg', mimeType: asset.mimeType || 'image/jpeg' });
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const file = result.assets ? result.assets[0] : result;
    if (!file || !file.uri) return;
    await runExtract(file);
  };

  const handleImportPress = () => {
    Alert.alert(t('profile.importChooseTitle'), undefined, [
      { text: t('profile.importTakePhoto'), onPress: handleTakePhoto },
      { text: t('profile.importPickPhoto'), onPress: handlePickPhoto },
      { text: t('profile.importPickFile'), onPress: handlePickFile },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    await updateCompanyProfile(form);
    Alert.alert(t('common.success'), t('profile.saveSuccess'));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Section title={t('profile.languageSectionTitle')}>
        <SegmentedControl
          value={settings.language}
          onChange={setLanguage}
          options={[
            { value: 'sq', label: t('profile.languageSq') },
            { value: 'en', label: t('profile.languageEn') },
          ]}
        />
      </Section>

      <Section title={t('profile.importSectionTitle')}>
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.importAiDescription')}</Text>
        <Button
          title={importing ? t('profile.importing') : t('profile.importButton')}
          onPress={handleImportPress}
          loading={importing}
          variant="secondary"
        />
      </Section>

      {justImported ? (
        <Animated.View
          style={[
            styles.importedBanner,
            {
              opacity: importedAnim,
              transform: [{ translateY: importedAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
          <Text style={styles.importedBannerText}>{t('profile.importAiSuccessBanner')}</Text>
        </Animated.View>
      ) : null}

      <Section title={t('profile.companySectionTitle')}>
        <FormField label={t('profile.companyName')} value={form.companyName} onChangeText={(v) => setField('companyName', v)} />
        <FormField label={t('profile.contactPerson')} value={form.contactPerson} onChangeText={(v) => setField('contactPerson', v)} />
        <FormField label={t('profile.streetAddress')} value={form.streetAddress} onChangeText={(v) => setField('streetAddress', v)} />
        <FormField label={t('profile.state')} value={form.state} onChangeText={(v) => setField('state', v)} />
        <FormField label={t('profile.zipCode')} value={form.zipCode} onChangeText={(v) => setField('zipCode', v)} />
        <FormField label={t('profile.email')} value={form.email} onChangeText={(v) => setField('email', v)} keyboardType="email-address" />
        <FormField label={t('profile.phone')} value={form.phone} onChangeText={(v) => setField('phone', v)} keyboardType="phone-pad" />
        <FormField label={t('profile.currency')} value={form.currency} onChangeText={(v) => setField('currency', v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
      </Section>

      <Section title={t('profile.legalSectionTitle')}>
        <Pressable onPress={() => openUrl(LEGAL_URLS.privacyPolicy)} style={styles.linkRow}>
          <Text style={styles.linkText}>{t('profile.privacyPolicy')}</Text>
        </Pressable>
        <Pressable onPress={() => openUrl(LEGAL_URLS.termsOfUse)} style={styles.linkRow}>
          <Text style={styles.linkText}>{t('profile.termsOfUse')}</Text>
        </Pressable>
        <Pressable onPress={() => openUrl(LEGAL_URLS.supportMailto)} style={styles.linkRow}>
          <Text style={styles.linkText}>{t('profile.support')}</Text>
        </Pressable>
      </Section>

      <Button title={t('common.save')} onPress={handleSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  linkRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  importedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF5F1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  importedBannerText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
});
