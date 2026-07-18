import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { spacing, typography, colors } from '../theme';
import { Button, FormField, Section, SegmentedControl } from '../components/ui';
import { extractCompanyInfo } from '../api/extract';
import { LEGAL_URLS, SAMPLE_COMPANY_PROFILE } from '../constants/legal';

export default function ProfileScreen() {
  const { companyProfile, updateCompanyProfile, settings, setLanguage, setApiBaseUrl } = useApp();
  const { t } = useTranslation();

  const [form, setForm] = useState(companyProfile);
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setForm(companyProfile);
  }, [companyProfile]);

  useEffect(() => {
    setApiBaseUrlInput(settings.apiBaseUrl);
  }, [settings.apiBaseUrl]);

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

  const handleLoadSample = async () => {
    setForm({ ...SAMPLE_COMPANY_PROFILE });
    await updateCompanyProfile(SAMPLE_COMPANY_PROFILE);
    Alert.alert(t('common.success'), t('profile.sampleLoaded'));
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const file = result.assets ? result.assets[0] : result;
      if (!file || !file.uri) return;

      setImporting(true);
      const data = await extractCompanyInfo(apiBaseUrlInput, file);
      setForm((prev) => ({
        ...prev,
        companyName: data.companyName || prev.companyName,
        contactPerson: data.contactPerson || prev.contactPerson,
        streetAddress: data.streetAddress || prev.streetAddress,
        state: data.state || prev.state,
        zipCode: data.zipCode || prev.zipCode,
        email: data.email || prev.email,
        phone: data.phone || prev.phone,
      }));
      Alert.alert(t('common.success'), t('profile.importSuccess'));
    } catch (err) {
      Alert.alert(t('common.error'), err?.message || t('profile.importError'));
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    await updateCompanyProfile(form);
    await setApiBaseUrl(apiBaseUrlInput);
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
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.importDescription')}</Text>
        <Button
          title={t('profile.loadSampleButton')}
          onPress={handleLoadSample}
          variant="secondary"
          style={{ marginBottom: spacing.sm }}
        />
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.importAiDescription')}</Text>
        <Button
          title={importing ? t('profile.importing') : t('profile.importButton')}
          onPress={handleImport}
          loading={importing}
          variant="secondary"
        />
      </Section>

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

      <Section title={t('profile.serverSectionTitle')}>
        <FormField
          label={t('profile.apiBaseUrl')}
          value={apiBaseUrlInput}
          onChangeText={setApiBaseUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[typography.muted, { marginTop: 4 }]}>{t('profile.apiBaseUrlHint')}</Text>
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
});
