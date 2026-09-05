import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { spacing, typography, colors } from '../theme';
import { Button, FormField, Section } from '../components/ui';
import { extractCompanyInfo } from '../api/extract';
import { stripSampleCompanyFields } from '../storage/companySamples';

export default function ProfileScreen({ navigation }) {
  const { companyProfile, updateCompanyProfile, settings, setLanguage, setApiBaseUrl, plan } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState(() => stripSampleCompanyFields(companyProfile));
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setForm(stripSampleCompanyFields(companyProfile));
  }, [companyProfile]);

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
        nui: data.nui || prev.nui,
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
    await updateCompanyProfile(stripSampleCompanyFields(form));
    await setApiBaseUrl(apiBaseUrlInput);
    Alert.alert(t('common.success'), t('profile.saveSuccess'));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xl }}
    >
      <Text style={typography.title}>{t('profile.title')}</Text>

      <Section title={t('billing.title')} style={{ marginTop: spacing.md }}>
        <Text style={typography.body}>
          {t('billing.current')}: {plan?.plan === 'premium' ? t('billing.premiumName') : t('billing.freeName')}
        </Text>
        {plan?.plan === 'premium' ? (
          <Text style={[typography.muted, { marginTop: 6 }]}>{t('billing.alreadyPremium')}</Text>
        ) : (
          <Text style={[typography.muted, { marginTop: 6, lineHeight: 20 }]}>{t('billing.settingsHint')}</Text>
        )}
        <Button
          title={plan?.plan === 'premium' ? t('billing.manageStore') : t('billing.ctaIap')}
          onPress={() => navigation.navigate('Subscribe')}
          style={{ marginTop: spacing.sm }}
        />
      </Section>

      <Section title={t('profile.languageSectionTitle')} style={{ marginTop: spacing.md }}>
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.languageHint')}</Text>
        {[
          { value: 'sq', label: t('profile.languageSq') },
          { value: 'en', label: t('profile.languageEn') },
          { value: 'it', label: t('profile.languageIt') },
        ].map((opt) => {
          const active = settings.language === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setLanguage(opt.value)}
              style={[styles.langRow, active && styles.langRowActive]}
            >
              <Text style={active ? styles.langTextActive : styles.langText}>{opt.label}</Text>
            </Pressable>
          );
        })}
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
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.companyHint')}</Text>
        <FormField
          label={t('profile.companyName')}
          value={form.companyName}
          placeholder={t('profile.phCompanyName')}
          onChangeText={(v) => setField('companyName', v)}
        />
        <FormField
          label={t('profile.contactPerson')}
          value={form.contactPerson}
          placeholder={t('profile.phContactPerson')}
          onChangeText={(v) => setField('contactPerson', v)}
        />
        <FormField
          label={t('profile.nui')}
          value={form.nui}
          placeholder={t('profile.phNui')}
          onChangeText={(v) => setField('nui', v)}
          autoCapitalize="characters"
        />
        <FormField
          label={t('profile.streetAddress')}
          value={form.streetAddress}
          placeholder={t('profile.phStreetAddress')}
          onChangeText={(v) => setField('streetAddress', v)}
        />
        <FormField
          label={t('profile.state')}
          value={form.state}
          placeholder={t('profile.phState')}
          onChangeText={(v) => setField('state', v)}
        />
        <FormField
          label={t('profile.zipCode')}
          value={form.zipCode}
          placeholder={t('profile.phZipCode')}
          onChangeText={(v) => setField('zipCode', v)}
        />
        <FormField
          label={t('profile.email')}
          value={form.email}
          placeholder={t('profile.phEmail')}
          onChangeText={(v) => setField('email', v)}
          keyboardType="email-address"
        />
        <FormField
          label={t('profile.phone')}
          value={form.phone}
          placeholder={t('profile.phPhone')}
          onChangeText={(v) => setField('phone', v)}
          keyboardType="phone-pad"
        />
        <FormField
          label={t('profile.currency')}
          value={form.currency}
          placeholder={t('profile.phCurrency')}
          onChangeText={(v) => setField('currency', v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={3}
        />
        <FormField
          label={t('profile.bankName')}
          value={form.bankName || ''}
          placeholder={t('profile.phBankName')}
          onChangeText={(v) => setField('bankName', v)}
        />
        <FormField
          label={t('profile.iban')}
          value={form.iban || ''}
          placeholder={t('profile.phIban')}
          onChangeText={(v) => setField('iban', v)}
          autoCapitalize="characters"
        />
        <FormField
          label={t('profile.exportNote')}
          value={form.exportNote ?? 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)'}
          placeholder={t('profile.phExportNote')}
          onChangeText={(v) => setField('exportNote', v)}
          multiline
          numberOfLines={2}
        />
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.exportNoteHint')}</Text>
      </Section>

      {__DEV__ ? (
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
      ) : null}

      <Button title={t('common.save')} onPress={handleSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  langRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  langRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  langText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  langTextActive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
