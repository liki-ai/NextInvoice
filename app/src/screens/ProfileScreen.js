import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { spacing, typography, colors } from '../theme';
import { Button, FormField, Section, SegmentedControl } from '../components/ui';
import { extractCompanyInfo } from '../api/extract';

export default function ProfileScreen() {
  const { companyProfile, updateCompanyProfile, settings, setLanguage, setApiBaseUrl } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState(companyProfile);
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [importing, setImporting] = useState(false);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

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
      Alert.alert(t('common.error'), t('profile.importError'));
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
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl }}
    >
      <Text style={typography.title}>{t('profile.title')}</Text>

      <Section title={t('profile.languageSectionTitle')} style={{ marginTop: spacing.md }}>
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

      {__DEV__ && (
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
      )}

      <Button title={t('common.save')} onPress={handleSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
