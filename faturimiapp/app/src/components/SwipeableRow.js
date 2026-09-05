import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export default function SwipeableRow({
  children,
  paid,
  labels,
  onEdit,
  onDelete,
  onTogglePaid,
}) {
  const ref = useRef(null);
  const close = () => ref.current?.close();

  return (
    <Swipeable
      ref={ref}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      renderLeftActions={() => (
        <View style={styles.leftWrap}>
          <Pressable
            style={[styles.action, paid ? styles.unpaid : styles.paid]}
            onPress={() => {
              close();
              onTogglePaid();
            }}
          >
            <Ionicons name={paid ? 'refresh' : 'checkmark-circle'} size={22} color="#fff" />
            <Text style={styles.actionText}>{paid ? labels.markUnpaid : labels.markPaid}</Text>
          </Pressable>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.rightWrap}>
          <Pressable
            style={[styles.action, styles.edit]}
            onPress={() => {
              close();
              onEdit();
            }}
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>{labels.edit}</Text>
          </Pressable>
          <Pressable
            style={[styles.action, styles.delete]}
            onPress={() => {
              close();
              onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>{labels.delete}</Text>
          </Pressable>
        </View>
      )}
    >
      <View style={styles.row}>{children}</View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 8 },
  leftWrap: {
    width: 96,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    overflow: 'hidden',
  },
  rightWrap: {
    flexDirection: 'row',
    width: 168,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  paid: { backgroundColor: colors.success },
  unpaid: { backgroundColor: colors.accent },
  edit: { backgroundColor: colors.primary },
  delete: { backgroundColor: colors.danger, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
