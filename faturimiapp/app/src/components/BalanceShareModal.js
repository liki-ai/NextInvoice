import React from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './ui';

export default function BalanceShareModal({ visible, title, text, cancelLabel, sendLabel, onCancel }) {
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={typography.subtitle}>{title}</Text>
          <Text style={styles.body}>{text}</Text>
          <View style={styles.row}>
            <Button title={cancelLabel} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              title={sendLabel}
              onPress={async () => {
                await Share.share({ message: text });
                onCancel?.();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg || 16,
    borderTopRightRadius: radius.lg || 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  body: {
    ...typography.body,
    lineHeight: 22,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
});
