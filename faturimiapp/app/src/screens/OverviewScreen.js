import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { colors, radius, spacing, typography } from '../theme';
import { Button, DatePickerModal, Section } from '../components/ui';
import { formatMoney } from '../utils/money';
import {
  MONTH_ABBR,
  availableYears,
  buildOverview,
  collectCurrencies,
  hasLimitation,
  isoDate,
  periodLabel,
  resolvePeriod,
} from '../utils/overview';
import { buildOverviewHtml, formatStatementFileDate } from '../pdf/invoiceTemplate';
import { shareOverviewPdf } from '../pdf/generateInvoicePdf';
import { localizeCompanyProfile } from '../storage/companySamples';
import PdfPreviewModal from '../components/PdfPreviewModal';
import SyncBanner from '../components/SyncBanner';

const PRESETS = ['this_month', 'this_year', 'month', 'year', 'custom'];

function limitationNotes(limitations, t) {
  const notes = [];
  if (limitations.legacyPaid) notes.push(t('overview.limitationLegacy'));
  if (limitations.undatedPayments) notes.push(t('overview.limitationUndated'));
  if (limitations.missingDates) notes.push(t('overview.limitationDates'));
  if (limitations.undatedCancellations) notes.push(t('overview.limitationCancel'));
  return notes;
}

function overviewPdfLabels(t) {
  return {
    ...t('pdf'),
    pdfTitle: t('overview.pdfTitle'),
    period: t('overview.title'),
    asOf: t('overview.asOf', { date: '' }).replace(/\s*\{date\}\s*/g, '').trim(),
    invoiced: t('overview.invoiced'),
    received: t('overview.received'),
    obligationsRecorded: t('overview.obligationsRecorded'),
    paidOut: t('overview.paidOut'),
    receivables: t('overview.receivables'),
    payables: t('overview.payables'),
    netPayments: t('overview.netPayments'),
    netHint: t('overview.netHint'),
    customers: t('overview.customers'),
    overdue: t('overview.overdue'),
    empty: t('overview.empty'),
    limitationTitle: t('overview.limitationTitle'),
    summary: t('overview.title'),
    vendor: t('obligations.vendor'),
  };
}

export default function OverviewScreen({ navigation }) {
  const { invoices, obligations, companyProfile } = useApp();
  const { t } = useTranslation();
  const fallbackCurrency = companyProfile.currency || 'EUR';
  const currencies = useMemo(
    () => collectCurrencies(invoices, obligations, fallbackCurrency),
    [invoices, obligations, fallbackCurrency],
  );
  const [preset, setPreset] = useState('this_month');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [from, setFrom] = useState(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [currency, setCurrency] = useState(currencies[0] || fallbackCurrency);
  const [dateField, setDateField] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const years = useMemo(() => availableYears(invoices, obligations), [invoices, obligations]);
  useEffect(() => {
    if (!currencies.includes(currency)) setCurrency(currencies[0] || fallbackCurrency);
  }, [currencies, currency, fallbackCurrency]);
  const period = useMemo(
    () => resolvePeriod({ preset, year, month, from, to }),
    [preset, year, month, from, to],
  );
  const report = useMemo(
    () => buildOverview({ invoices, obligations, period, currency, fallbackCurrency }),
    [invoices, obligations, period, currency, fallbackCurrency],
  );
  const label = periodLabel(report.period);
  const notes = limitationNotes(report.limitations, t);
  const empty =
    report.invoiced === 0 &&
    report.paymentsReceived === 0 &&
    report.obligationsRecorded === 0 &&
    report.paymentsMade === 0 &&
    report.receivables === 0 &&
    report.payables === 0;
  const periodParams = { preset, year, month, from, to, currency };
  const issuedDate = formatStatementFileDate(new Date());
  const pdfLabels = overviewPdfLabels(t);
  const previewHtml = useMemo(() => {
    if (!previewVisible) return '';
    return buildOverviewHtml({
      company: localizeCompanyProfile(companyProfile, t),
      report,
      periodText: label,
      issuedDate,
      pdfLabels,
      notes,
    });
  }, [previewVisible, companyProfile, report, label, issuedDate, notes, t]);

  const onShare = async () => {
    setSharing(true);
    try {
      await shareOverviewPdf({
        company: localizeCompanyProfile(companyProfile, t),
        report,
        periodText: label,
        issuedDate,
        pdfLabels,
        notes,
      });
      setPreviewVisible(false);
    } finally {
      setSharing(false);
    }
  };

  const cards = [
    { key: 'invoiced', label: t('overview.invoiced'), value: report.invoiced, metric: 'invoiced' },
    { key: 'received', label: t('overview.received'), value: report.paymentsReceived, metric: 'received' },
    { key: 'obligations', label: t('overview.obligationsRecorded'), value: report.obligationsRecorded, metric: 'obligations' },
    { key: 'paidOut', label: t('overview.paidOut'), value: report.paymentsMade, metric: 'paidOut' },
    { key: 'receivables', label: t('overview.receivables'), value: report.receivables, metric: 'receivables' },
    { key: 'payables', label: t('overview.payables'), value: report.payables, metric: 'payables' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={typography.title}>{t('overview.title')}</Text>
            <Text style={styles.meta}>
              {label} · {t('overview.asOf', { date: report.period.endIso })}
            </Text>
          </View>
          <Pressable
            style={styles.exportBtn}
            onPress={() => setPreviewVisible(true)}
            disabled={empty && !hasLimitation(report.limitations)}
          >
            <Ionicons name="share-outline" size={16} color={colors.primary} />
            <Text style={styles.exportText}>{t('overview.exportPdf')}</Text>
          </Pressable>
        </View>
        <SyncBanner />

        <View style={styles.chipRow}>
          {PRESETS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setPreset(item)}
              style={[styles.chip, preset === item && styles.chipActive]}
            >
              <Text style={preset === item ? styles.chipTextActive : styles.chipText}>
                {item === 'this_month'
                  ? t('overview.thisMonth')
                  : item === 'this_year'
                    ? t('overview.thisYear')
                    : item === 'month'
                      ? t('overview.month')
                      : item === 'year'
                        ? t('overview.year')
                        : t('overview.custom')}
              </Text>
            </Pressable>
          ))}
        </View>

        {preset === 'month' || preset === 'year' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {years.map((item) => (
              <Pressable
                key={item}
                onPress={() => setYear(item)}
                style={[styles.chip, year === item && styles.chipActive]}
              >
                <Text style={year === item ? styles.chipTextActive : styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {preset === 'month' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {MONTH_ABBR.map((name, index) => (
              <Pressable
                key={name}
                onPress={() => setMonth(index)}
                style={[styles.chip, month === index && styles.chipActive]}
              >
                <Text style={month === index ? styles.chipTextActive : styles.chipText}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {preset === 'custom' ? (
          <View style={styles.rangeRow}>
            <Pressable style={styles.rangeBtn} onPress={() => setDateField('from')}>
              <Text style={styles.rangeLabel}>{t('overview.from')}</Text>
              <Text style={styles.rangeValue}>{from}</Text>
            </Pressable>
            <Pressable style={styles.rangeBtn} onPress={() => setDateField('to')}>
              <Text style={styles.rangeLabel}>{t('overview.to')}</Text>
              <Text style={styles.rangeValue}>{to}</Text>
            </Pressable>
          </View>
        ) : null}
        {currencies.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {currencies.map((item) => (
              <Pressable
                key={item}
                onPress={() => setCurrency(item)}
                style={[styles.chip, currency === item && styles.chipActive]}
              >
                <Text style={currency === item ? styles.chipTextActive : styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {notes.length > 0 ? (
          <Section title={t('overview.limitationTitle')}>
            {notes.map((note) => (
              <Text key={note} style={styles.note}>
                {note}
              </Text>
            ))}
          </Section>
        ) : null}

        {empty ? <Text style={styles.empty}>{t('overview.empty')}</Text> : null}

        <Text style={styles.hint}>{t('overview.tapHint')}</Text>
        <View style={styles.cardGrid}>
          {cards.map((card) => (
            <Pressable
              key={card.key}
              style={styles.metricCard}
              onPress={() => navigation.navigate('OverviewDrill', { metric: card.metric, ...periodParams })}
            >
              <Text style={styles.metricLabel}>{card.label}</Text>
              <Text style={styles.metricValue}>{formatMoney(card.value, currency)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.netCard}
          onPress={() => navigation.navigate('OverviewDrill', { metric: 'net', ...periodParams })}
        >
          <Text style={styles.metricLabel}>{t('overview.netPayments')}</Text>
          <Text style={styles.metricValue}>{formatMoney(report.netPayments, currency)}</Text>
          <Text style={styles.hint}>{t('overview.netHint')}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('overview.customers')}</Text>
        {report.customers.length === 0 ? (
          <Text style={styles.empty}>{t('overview.empty')}</Text>
        ) : (
          report.customers.map((item) => (
            <Pressable
              key={`${item.clientId}-${item.client?.fullName}`}
              style={styles.row}
              onPress={() =>
                navigation.navigate('Statement', {
                  clientName: item.client?.fullName,
                  clientId: item.clientId,
                  asOf: report.period.endIso,
                  currency,
                  fromOverview: true,
                })
              }
            >
              <Text style={styles.rowTitle}>{item.client?.fullName}</Text>
              <Text style={styles.rowAmount}>{formatMoney(item.amount, currency)}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>{t('overview.overdue')}</Text>
        {report.overduePayables.length === 0 ? (
          <Text style={styles.empty}>{t('overview.empty')}</Text>
        ) : (
          report.overduePayables.map((item) => (
            <Pressable
              key={item.id}
              style={styles.row}
              onPress={() => navigation.navigate('ObligationForm', { obligationId: item.id })}
            >
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.rowTitle}>{item.vendor}</Text>
                <Text style={styles.overdue}>{t('overview.daysOverdue', { days: item.daysOverdueAsOf })}</Text>
              </View>
              <Text style={[styles.rowAmount, { color: colors.danger }]}>{formatMoney(item.amountDueAsOf, currency)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
      <DatePickerModal
        visible={Boolean(dateField)}
        value={dateField === 'to' ? to : from}
        title={dateField === 'to' ? t('overview.to') : t('overview.from')}
        cancelLabel={t('common.cancel')}
        doneLabel={t('common.ok')}
        onClose={() => setDateField(null)}
        onSelect={(value) => {
          if (dateField === 'to') setTo(value);
          else setFrom(value);
        }}
      />
      <PdfPreviewModal
        visible={previewVisible}
        title={t('overview.exportPdf')}
        html={previewHtml}
        sharing={sharing}
        cancelLabel={t('common.cancel')}
        sendLabel={t('common.send')}
        onCancel={() => setPreviewVisible(false)}
        onSend={onShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  meta: { ...typography.muted, marginTop: 4 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exportText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { fontSize: 13, fontWeight: '700', color: '#fff' },
  rangeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  rangeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  rangeLabel: { ...typography.label, marginBottom: 4 },
  rangeValue: { ...typography.body, fontWeight: '700' },
  note: { ...typography.muted, marginBottom: 6 },
  empty: { ...typography.muted, marginBottom: spacing.md },
  hint: { ...typography.muted, fontSize: 12, marginBottom: spacing.sm },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    minHeight: 88,
  },
  netCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metricLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
  metricValue: { marginTop: 8, fontSize: 18, fontWeight: '800', color: colors.text },
  sectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
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
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm },
  rowAmount: { fontSize: 15, fontWeight: '700', color: colors.primary },
  overdue: { marginTop: 4, color: colors.danger, fontSize: 12, fontWeight: '700' },
});
