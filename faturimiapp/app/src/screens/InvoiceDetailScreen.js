import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, spacing, typography } from '../theme';
import { Button, Section } from '../components/ui';
import { formatMoney } from '../utils/money';
import { shareInvoicePdf } from '../pdf/generateInvoicePdf';

export default function InvoiceDetailScreen({ route, navigation }) {
  const { invoiceId } = route.params;
  const { invoices, companyProfile, deleteInvoice } = useApp();
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);

  const invoice = useMemo(() => invoices.find((inv) => inv.id === invoiceId), [invoices, invoiceId]);

  if (!invoice) {
    return (
      <View style={styles.container}>
        <Text style={typography.body}>Invoice not found.</Text>
      </View>
    );
  }

  const handleShare = async () => {
    setSharing(true);
    try {
      await shareInvoicePdf({
        company: companyProfile,
        client: invoice.client,
        invoice,
        pdfLabels: t('pdf'),
      });
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('invoiceList.deleteConfirmTitle'), t('invoiceList.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteInvoice(invoice.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Section title={`${t('newInvoice.invoiceNumber')}: ${invoice.number}`}>
        <Text style={typography.muted}>{t('newInvoice.date')}: {invoice.date}</Text>
      </Section>

      <Section title={t('newInvoice.clientSectionTitle')}>
        <Text style={typography.body}>{invoice.client?.fullName}</Text>
        <Text style={typography.muted}>{invoice.client?.address}</Text>
        <Text style={typography.muted}>{invoice.client?.phone}</Text>
      </Section>

      <Section title={t('newInvoice.itemsSectionTitle')}>
        {(invoice.items || []).map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={[typography.body, { flex: 1 }]}>{item.description}</Text>
            <Text style={typography.muted}>{item.quantity} x {formatMoney(Number(item.unitPrice), companyProfile.currency)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalsRow}>
          <Text style={typography.muted}>{t('newInvoice.subtotal')}</Text>
          <Text style={typography.body}>{formatMoney(invoice.subtotal, companyProfile.currency)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={typography.muted}>{t('newInvoice.discount')}</Text>
          <Text style={typography.body}>{formatMoney(Number(invoice.discount) || 0, companyProfile.currency)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={typography.subtitle}>{t('newInvoice.total')}</Text>
          <Text style={typography.subtitle}>{formatMoney(invoice.total, companyProfile.currency)}</Text>
        </View>
      </Section>

      <Button title={t('invoiceDetail.downloadPdf')} onPress={handleShare} loading={sharing} style={{ marginBottom: spacing.sm }} />
      <Button title={t('invoiceDetail.deleteInvoice')} onPress={handleDelete} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
});
