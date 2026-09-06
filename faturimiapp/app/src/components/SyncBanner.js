import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, spacing } from '../theme';

export default function SyncBanner() {
  const { syncState, flushQueue, token } = useApp();
  const { t } = useTranslation();
  if (!token || syncState?.status !== 'pending') return null;
  return (
    <Pressable onPress={() => void flushQueue()} style={styles.banner}>
      <Text style={styles.text}>{t('docs.pending')}</Text>
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
  text: { fontSize: 11, fontWeight: '700', color: colors.text },
});
