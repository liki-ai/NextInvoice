import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { buildInvoiceHtml } from '../pdf/invoiceTemplate';
import { colors, spacing, typography } from '../theme';

export default function InvoicePreviewModal({ visible, onClose, company, client, invoice, pdfLabels, title }) {
  const insets = useSafeAreaInsets();
  const html = visible
    ? buildInvoiceHtml({ company, client, invoice, pdfLabels })
    : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top || spacing.sm }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {visible ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webview}
            scalesPageToFit
            setSupportMultipleWindows={false}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.subtitle,
    flex: 1,
    marginRight: spacing.sm,
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
