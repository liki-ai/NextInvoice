import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { formatDateForInvoice } from '../utils/invoiceNumber';

export function Section({ title, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={typography.subtitle}>{title}</Text> : null}
      <View style={title ? { marginTop: spacing.sm } : null}>{children}</View>
    </View>
  );
}

export function FormField({ label, style, containerStyle, ...inputProps }) {
  return (
    <View style={[styles.fieldContainer, containerStyle]}>
      {label ? <Text style={typography.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.textMuted}
        {...inputProps}
      />
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, icon }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading ? { opacity: 0.85 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.primary} />
      ) : (
        <>
          {icon}
          <Text style={isPrimary ? styles.buttonPrimaryText : styles.buttonSecondaryText}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parsePickedDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function DatePickerModal({ visible, value, title, cancelLabel, doneLabel, onClose, onSelect }) {
  const initial = parsePickedDate(value);
  const [view, setView] = useState(initial);
  const [picked, setPicked] = useState(initial);

  useEffect(() => {
    if (!visible) return;
    const next = parsePickedDate(value);
    setView(next);
    setPicked(next);
  }, [visible, value]);

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const startPad = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items = [];
    for (let i = 0; i < startPad; i += 1) items.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) items.push(new Date(year, month, day));
    return items;
  }, [view]);

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dateOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dateSheet}>
          {title ? <Text style={styles.dateTitle}>{title}</Text> : null}
          <View style={styles.dateNav}>
            <Pressable
              hitSlop={12}
              onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            >
              <Text style={styles.dateNavBtn}>‹</Text>
            </Pressable>
            <Text style={styles.dateMonth}>{monthLabel}</Text>
            <Pressable
              hitSlop={12}
              onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            >
              <Text style={styles.dateNavBtn}>›</Text>
            </Pressable>
          </View>
          <View style={styles.dateWeekRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.dateWeekday}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.dateGrid}>
            {cells.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.dateCell} />;
              const selected =
                day.getFullYear() === picked.getFullYear() &&
                day.getMonth() === picked.getMonth() &&
                day.getDate() === picked.getDate();
              return (
                <Pressable
                  key={day.toISOString()}
                  style={[styles.dateCell, selected && styles.dateCellSelected]}
                  onPress={() => setPicked(day)}
                >
                  <Text style={[styles.dateCellText, selected && styles.dateCellTextSelected]}>{day.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.dateActions}>
            <Pressable onPress={onClose} style={styles.dateAction}>
              <Text style={styles.dateCancel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onSelect(formatDateForInvoice(picked));
                onClose();
              }}
              style={styles.dateAction}
            >
              <Text style={styles.dateDone}>{doneLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SegmentedControl({ options, value, onChange }) {
  return (
    <View style={styles.segmentContainer}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={active ? styles.segmentTextActive : styles.segmentText}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldContainer: {
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    marginTop: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: radius.sm,
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  buttonSecondaryText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    padding: 4,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  dateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(29,43,46,0.35)',
    justifyContent: 'flex-end',
  },
  dateSheet: {
    zIndex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dateNavBtn: {
    fontSize: 28,
    color: colors.primary,
    paddingHorizontal: 8,
    lineHeight: 32,
  },
  dateMonth: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  dateWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dateWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dateCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCellSelected: {
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  dateCellText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  dateCellTextSelected: {
    color: '#fff',
  },
  dateActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dateAction: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dateCancel: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  dateDone: {
    color: colors.primary,
    fontWeight: '800',
  },
});
