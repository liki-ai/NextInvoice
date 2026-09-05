import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '../theme';
import { Button } from './ui';

export default function PdfPreviewModal({
  visible,
  title,
  html,
  sharing,
  cancelLabel,
  sendLabel,
  onCancel,
  onSend,
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel={cancelLabel}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {html ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webView}
            scalesPageToFit
            startInLoadingState
          />
        ) : null}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button title={cancelLabel} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
          <Button title={sendLabel} loading={sharing} onPress={onSend} style={{ flex: 1.4 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, marginRight: spacing.sm, fontSize: 16, fontWeight: '700', color: colors.text },
  webView: { flex: 1, backgroundColor: '#fff' },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
