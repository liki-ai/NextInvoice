import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, FormField } from '../components/ui';

const FORGOT_URL = 'https://mynextinvoice.com/forgot';

const ERROR_KEYS = {
  UNKNOWN_EMAIL: 'auth.unknownEmail',
  WRONG_PASSWORD: 'auth.wrongPassword',
  EMAIL_TAKEN: 'auth.emailTaken',
};

// The app works without an account. Signing in (the same account as on the web) keeps the
// phone's invoices and the web's in step; whatever was made on the phone before joins the account.
export default function AuthScreen({ navigation, route }) {
  const { login, signup, settings, setLanguage, companyProfile } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState(route?.params?.mode === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const address = email.trim();
    if (!address || !password) {
      setError(t('auth.missing'));
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError(t('auth.passwordHint'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(address, password);
      else await signup(address, password, { industry: companyProfile?.industry });
      navigation?.goBack();
    } catch (err) {
      // No status means the request never reached the server.
      setError(ERROR_KEYS[err.code] ? t(ERROR_KEYS[err.code]) : err.status ? err.message : t('auth.offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {navigation ? (
          <Pressable onPress={() => navigation.goBack()} style={styles.close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        ) : null}
        <Text style={styles.brand}>Next Invoice</Text>
        <Text style={[typography.muted, { marginTop: spacing.xs }]}>{t('auth.subtitle')}</Text>

        <View style={styles.langLine}>
          {[
            { value: 'sq', label: t('profile.languageSq') },
            { value: 'en', label: t('profile.languageEn') },
            { value: 'it', label: t('profile.languageIt') },
          ].map((opt) => {
            const active = settings.language === opt.value;
            return (
              <Pressable key={opt.value} onPress={() => setLanguage(opt.value)} style={[styles.lang, active && styles.langActive]}>
                <Text style={active ? styles.langTextActive : styles.langText}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={typography.title}>{mode === 'login' ? t('auth.loginTitle') : t('auth.signupTitle')}</Text>
          <View style={{ marginTop: spacing.md }}>
            <FormField
              label={t('docs.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
            />
            <FormField
              label={t('docs.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              autoComplete={mode === 'login' ? 'password' : 'new-password'}
              onSubmitEditing={submit}
            />
            {mode === 'signup' ? <Text style={[typography.muted, { marginBottom: spacing.sm }]}>{t('auth.passwordHint')}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={mode === 'login' ? t('docs.login') : t('auth.signupCta')} onPress={submit} loading={busy} />
          </View>

          {mode === 'login' ? (
            <Pressable onPress={() => void Linking.openURL(FORGOT_URL)} style={styles.link}>
              <Text style={styles.linkText}>{t('auth.forgot')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
            }}
            style={styles.link}
          >
            <Text style={typography.muted}>
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
              <Text style={styles.linkText}>{mode === 'login' ? t('auth.signupCta') : t('docs.login')}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  close: { alignSelf: 'flex-end', padding: 4, marginBottom: spacing.sm },
  brand: { fontSize: 30, fontWeight: '800', color: colors.primaryDark },
  langLine: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  lang: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  langActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  langText: { fontSize: 14, fontWeight: '600', color: colors.text },
  langTextActive: { fontSize: 14, fontWeight: '700', color: '#fff' },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  link: { marginTop: spacing.md, alignItems: 'center' },
  linkText: { color: colors.primary, fontWeight: '700' },
});
