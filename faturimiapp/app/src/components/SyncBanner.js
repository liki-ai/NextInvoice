import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing } from '../theme';

export default function SyncBanner() {
  const { syncState, flushQueue, token } = useApp();
  const { t } = useTranslation();
  if (!token && syncState?.status !== 'error') return null;
  const label =
    syncState?.status === 'synced'
      ? t('docs.synced')
      : syncState?.status === 'error'
        ? t('docs.error')
        : t('docs.pending');
  return (
    <Pressable onPress={() => void flushQueue()} style={[styles.banner, syncState?.status === 'error' && styles.error]}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#EEF5F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  error: { backgroundColor: '#F8E8E4' },
  text: { fontSize: 11, fontWeight: '700', color: colors.text },
});
