import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatMoney } from '../utils/money';
import { buildOverview, resolvePeriod } from '../utils/overview';

const TITLES = {
  invoiced: 'overview.drillInvoiced',
  received: 'overview.drillReceived',
  obligations: 'overview.drillObligations',
  paidOut: 'overview.drillPaidOut',
  receivables: 'overview.drillReceivables',
  payables: 'overview.drillPayables',
  net: 'overview.drillNet',
};

export default function OverviewDrillScreen({ route, navigation }) {
  const { invoices, obligations, companyProfile } = useApp();
  const { t } = useTranslation();
  const params = route?.params || {};
  const currency = params.currency || companyProfile.currency || 'EUR';
  const period = useMemo(
    () =>
      resolvePeriod({
        preset: params.preset,
        year: params.year,
        month: params.month,
        from: params.from,
        to: params.to,
      }),
    [params.preset, params.year, params.month, params.from, params.to],
  );
  const report = useMemo(
    () =>
      buildOverview({
        invoices,
        obligations,
        period,
        currency,
        fallbackCurrency: companyProfile.currency || 'EUR',
      }),
    [invoices, obligations, period, currency, companyProfile.currency],
  );
  const metric = params.metric || 'invoiced';
  const rows = useMemo(() => {
    const list = [];
    if (metric === 'invoiced' || metric === 'receivables') {
      const source = metric === 'invoiced' ? report.issuedInPeriod : report.receivableDocs;
      source.forEach((item) => {
        list.push({
          id: item.id,
          title: item.number,
          subtitle: item.clientSnapshot?.fullName || item.client?.fullName || item.date,
          amount: metric === 'receivables' ? item.amountDueAsOf : item.total,
          onPress: () => navigation.navigate('InvoiceDetail', { invoiceId: item.id }),
        });
      });
    } else if (metric === 'received') {
      report.received.forEach((item, index) => {
        list.push({
          id: item.id || `r-${index}`,
          title: item.invoice?.number,
          subtitle: t('overview.paymentOn', { date: item.date }),
          amount: item.amount,
          onPress: () => navigation.navigate('InvoiceDetail', { invoiceId: item.invoice?.id }),
        });
      });
    } else if (metric === 'obligations' || metric === 'payables') {
      const source = metric === 'obligations' ? report.obligationsInPeriod : report.payableDocs;
      source.forEach((item) => {
        list.push({
          id: item.id,
          title: item.vendor,
          subtitle: item.date,
          amount: metric === 'payables' ? item.amountDueAsOf : item.amount,
          onPress: () => navigation.navigate('ObligationForm', { obligationId: item.id }),
        });
      });
    } else if (metric === 'paidOut') {
      report.paidOut.forEach((item, index) => {
        list.push({
          id: item.id || `p-${index}`,
          title: item.obligation?.vendor,
          subtitle: t('overview.paymentOn', { date: item.date }),
          amount: item.amount,
          onPress: () => navigation.navigate('ObligationForm', { obligationId: item.obligation?.id }),
        });
      });
    } else if (metric === 'net') {
      report.received.forEach((item, index) => {
        list.push({
          id: `in-${item.id || index}`,
          title: item.invoice?.number,
          subtitle: t('overview.paymentOn', { date: item.date }),
          amount: item.amount,
          onPress: () => navigation.navigate('InvoiceDetail', { invoiceId: item.invoice?.id }),
        });
      });
      report.paidOut.forEach((item, index) => {
        list.push({
          id: `out-${item.id || index}`,
          title: item.obligation?.vendor,
          subtitle: t('overview.paymentOn', { date: item.date }),
          amount: -item.amount,
          onPress: () => navigation.navigate('ObligationForm', { obligationId: item.obligation?.id }),
        });
      });
    }
    return list;
  }, [metric, report, navigation, t]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={typography.title}>{t(TITLES[metric] || 'overview.title')}</Text>
      <Text style={styles.meta}>{`${report.period.startIso} – ${report.period.endIso} · ${currency}`}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('overview.noMatches')}</Text>
      ) : (
        rows.map((row) => (
          <Pressable key={row.id} style={styles.row} onPress={row.onPress}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.title}>{row.title}</Text>
              <Text style={typography.muted}>{row.subtitle}</Text>
            </View>
            <Text style={styles.amount}>{formatMoney(row.amount, currency)}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  meta: { ...typography.muted, marginTop: 4, marginBottom: spacing.md },
  empty: { ...typography.muted, marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.primary },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text },
});
