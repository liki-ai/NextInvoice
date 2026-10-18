import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { spacing, typography, colors, radius } from '../theme';
import { Button, FormField, Section } from '../components/ui';
import { extractCompanyInfo } from '../api/extract';
import { stripSampleCompanyFields } from '../storage/companySamples';
import { INDUSTRIES, normalizeIndustry } from '../utils/client';
import { pickImageFile, proofSource } from '../utils/proof';
import { DEFAULT_EXPORT_NOTE, usesExportNote } from '../utils/company';

// Kept minimal on the phone: the invoice template, VAT number and SWIFT are set on the web and
// still printed on the phone's invoices.
export default function ProfileScreen({ navigation }) {
  const { companyProfile, updateCompanyProfile, settings, setLanguage, setApiBaseUrl, plan, user, token, accountLinked, logout } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState(() => stripSampleCompanyFields(companyProfile));
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [importing, setImporting] = useState(false);
  // A company already set up shows as a short summary; one still to fill in opens as the form.
  const [expanded, setExpanded] = useState(() => !stripSampleCompanyFields(companyProfile).companyName);

  useEffect(() => {
    setForm(stripSampleCompanyFields(companyProfile));
  }, [companyProfile]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const logo = form.logoUri || form.logoData || companyProfile.logoUri || companyProfile.logoData;
  const address = [form.streetAddress, [form.zipCode, form.state].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const summaryLines = [
    { label: 'NUI', value: form.nui },
    { label: t('profile.streetAddress'), value: address },
    { label: 'Email', value: form.email },
    { label: t('profile.phone'), value: form.phone },
    { label: 'IBAN', value: [form.iban, form.bankName].filter(Boolean).join(' · ') },
  ].filter((line) => String(line.value || '').trim());

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 120 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      {token && user ? (
        <View style={styles.accountRow}>
          <Ionicons name="cloud-done-outline" size={18} color={colors.primary} />
          <Text style={[typography.muted, { flex: 1 }]} numberOfLines={1}>
            {t('account.signedIn', { email: user.email || '' })}
          </Text>
        </View>
      ) : (
        <View style={styles.accountCard}>
          <Text style={typography.body}>{accountLinked ? t('account.expired') : t('account.pitch')}</Text>
          <View style={styles.accountButtons}>
            <Button title={t('docs.login')} onPress={() => navigation.navigate('Account', { mode: 'login' })} style={{ flex: 1 }} />
            <Button
              title={t('docs.signup')}
              variant="secondary"
              onPress={() => navigation.navigate('Account', { mode: 'signup' })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      <View style={styles.shortcutRow}>
        <Pressable style={styles.shortcut} onPress={() => navigation.navigate('ClientList')}>
          <Ionicons name="people-outline" size={22} color={colors.primary} />
          <Text style={styles.shortcutText}>{t('more.clients')}</Text>
        </Pressable>
        <Pressable style={styles.shortcut} onPress={() => navigation.navigate('ItemList')}>
          <Ionicons name="pricetag-outline" size={22} color={colors.primary} />
          <Text style={styles.shortcutText}>{t('more.items')}</Text>
        </Pressable>
      </View>

      <View style={styles.profileCard}>
        <Pressable
          style={styles.logoWrap}
          onPress={async () => {
            const picked = await pickImageFile(t);
            if (!picked) return;
            setExpanded(true);
            setForm((prev) => ({
              ...prev,
              logoUri: picked.proofUri,
              logoName: picked.proofName,
              logoMime: picked.proofMime,
              logoData: picked.proofData || prev.logoData,
            }));
          }}
        >
          {logo ? (
            <Image source={{ uri: proofSource({ proofUri: form.logoUri, proofData: form.logoData }) || logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Ionicons name="camera-outline" size={28} color={colors.primary} />
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.company}>{form.companyName || t('profile.companyName')}</Text>
          <Text style={styles.industry}>{t(`industry.${normalizeIndustry(form.industry)}`)}</Text>
        </View>
      </View>
      <View style={styles.summary}>
        {summaryLines.map((line) => (
          <View key={line.label} style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>{line.label}</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>{line.value}</Text>
          </View>
        ))}
        <Pressable style={styles.expand} onPress={() => setExpanded((open) => !open)} hitSlop={8}>
          <Text style={styles.expandText}>{expanded ? t('profile.showLess') : t('profile.showAll')}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable>
      </View>

      {expanded ? (
      <>
      <Section title={t('profile.importSectionTitle')} style={{ marginTop: spacing.md }}>
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('profile.importDescription')}</Text>
        <Button
          title={importing ? t('profile.importing') : t('profile.importButton')}
          onPress={handleImport}
          loading={importing}
          variant="secondary"
        />
      </Section>

      <Section title={t('profile.companySectionTitle')}>
        <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('industry.label')}</Text>
        <View style={styles.chipRow}>
          {INDUSTRIES.map((value) => (
            <Pressable
              key={value}
              style={[styles.chip, normalizeIndustry(form.industry) === value && styles.chipActive]}
              onPress={() => setField('industry', value)}
            >
              <Text style={normalizeIndustry(form.industry) === value ? styles.chipTextActive : styles.chipText}>
                {t(`industry.${value}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <FormField label={t('profile.companyName')} value={form.companyName} placeholder={t('profile.phCompanyName')} onChangeText={(v) => setField('companyName', v)} />
        <FormField label={t('profile.contactPerson')} value={form.contactPerson} placeholder={t('profile.phContactPerson')} onChangeText={(v) => setField('contactPerson', v)} />
        <FormField label={t('profile.nui')} value={form.nui} placeholder={t('profile.phNui')} onChangeText={(v) => setField('nui', v)} autoCapitalize="characters" />
        <FormField label={t('profile.streetAddress')} value={form.streetAddress} placeholder={t('profile.phStreetAddress')} onChangeText={(v) => setField('streetAddress', v)} />
        <FormField label={t('profile.state')} value={form.state} placeholder={t('profile.phState')} onChangeText={(v) => setField('state', v)} />
        <FormField label={t('profile.zipCode')} value={form.zipCode} placeholder={t('profile.phZipCode')} onChangeText={(v) => setField('zipCode', v)} />
        <FormField label={t('profile.email')} value={form.email} placeholder={t('profile.phEmail')} onChangeText={(v) => setField('email', v)} keyboardType="email-address" />
        <FormField label={t('profile.phone')} value={form.phone} placeholder={t('profile.phPhone')} onChangeText={(v) => setField('phone', v)} keyboardType="phone-pad" />
        <FormField label={t('profile.currency')} value={form.currency} placeholder={t('profile.phCurrency')} onChangeText={(v) => setField('currency', v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
        <FormField label={t('profile.bankName')} value={form.bankName || ''} placeholder={t('profile.phBankName')} onChangeText={(v) => setField('bankName', v)} />
        <FormField label={t('profile.iban')} value={form.iban || ''} placeholder={t('profile.phIban')} onChangeText={(v) => setField('iban', v)} autoCapitalize="characters" />
        {usesExportNote(form) ? (
          <FormField
            label={t('profile.exportNote')}
            value={form.exportNote ?? DEFAULT_EXPORT_NOTE}
            placeholder={t('profile.phExportNote')}
            onChangeText={(v) => setField('exportNote', v)}
            multiline
            numberOfLines={2}
          />
        ) : null}
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
        </Section>
      ) : null}

      <Button title={t('common.save')} onPress={handleSave} />
      </>
      ) : null}

      <Section title={t('profile.languageSectionTitle')} style={{ marginTop: spacing.lg }}>
        <View style={styles.langLine}>
          {[
            { value: 'sq', label: t('profile.languageSq') },
            { value: 'en', label: t('profile.languageEn') },
            { value: 'it', label: t('profile.languageIt') },
          ].map((opt) => {
            const active = settings.language === opt.value;
            return (
              <Pressable key={opt.value} onPress={() => setLanguage(opt.value)} style={[styles.langRow, active && styles.langRowActive]}>
                <Text style={active ? styles.langTextActive : styles.langText}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t('billing.title')} style={{ marginTop: spacing.md }}>
        <Text style={typography.body}>
          {t('billing.current')}: {plan?.plan === 'premium' ? t('billing.premiumName') : t('billing.freeName')}
        </Text>
        <Button
          title={plan?.plan === 'premium' ? t('billing.manageStore') : t('billing.ctaIap')}
          onPress={() => navigation.navigate('Subscribe')}
          style={{ marginTop: spacing.sm }}
        />
      </Section>

      {token && user ? (
        <Section title={t('docs.logout')} style={{ marginTop: spacing.lg }}>
          <Button title={t('docs.logout')} variant="secondary" onPress={() => void logout()} />
        </Section>
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  accountCard: {
    marginTop: spacing.md,
    backgroundColor: '#EEF5F7',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  accountButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  shortcutRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  shortcut: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  shortcutText: { fontWeight: '800', color: colors.text },
  profileCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF5F7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 72, height: 72 },
  summary: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryLine: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 4 },
  summaryLabel: { width: 72, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  summaryValue: { flex: 1, fontSize: 13, color: colors.text },
  expand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: spacing.sm },
  expandText: { fontWeight: '700', color: colors.primary },
  company: { fontSize: 18, fontWeight: '800', color: colors.text },
  industry: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#fff' },
  langLine: { flexDirection: 'row', gap: 8 },
  langRow: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  langRowActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  langText: { fontSize: 16, fontWeight: '600', color: colors.text },
  langTextActive: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
