import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function SentButton({ sent, loading, onPress, sentLabel, notSentLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={sent ? sentLabel : notSentLabel}
      style={[styles.btn, sent ? styles.on : styles.off]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={sent ? '#fff' : colors.primary} />
      ) : (
        <>
          <Ionicons name={sent ? 'send' : 'send-outline'} size={13} color={sent ? '#fff' : colors.textMuted} />
          <Text style={sent ? styles.onText : styles.offText}>{sent ? sentLabel : notSentLabel}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 28,
  },
  on: { backgroundColor: colors.primary },
  off: {
    backgroundColor: '#F3F4F4',
    borderWidth: 1,
    borderColor: colors.border,
  },
  onText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  offText: { color: colors.textMuted, fontWeight: '800', fontSize: 11 },
});
