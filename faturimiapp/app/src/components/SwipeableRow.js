import React, { createContext, useContext, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

let openSwipeable = null;

const RowPressLock = createContext({ lock() {} });

export function useLockRowPress() {
  return useContext(RowPressLock);
}

export default function SwipeableRow({
  children,
  paid,
  labels,
  onPress,
  onEdit,
  onDelete,
  onTogglePaid,
  onPartialPay,
}) {
  const ref = useRef(null);
  const openedRef = useRef(false);
  const draggingRef = useRef(false);
  const ignorePressRef = useRef(false);
  const close = () => ref.current?.close();
  const leftKind = onPartialPay ? 'partial' : onTogglePaid ? 'toggle' : null;
  const lock = () => {
    ignorePressRef.current = true;
  };

  const markDragging = () => {
    draggingRef.current = true;
    if (openSwipeable && openSwipeable !== ref.current) openSwipeable.close();
    openSwipeable = ref.current;
  };

  return (
    <Swipeable
      ref={ref}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      leftThreshold={36}
      rightThreshold={36}
      activeOffsetX={[-12, 12]}
      failOffsetY={[-10, 10]}
      onSwipeableOpenStartDrag={markDragging}
      onSwipeableCloseStartDrag={markDragging}
      onSwipeableWillOpen={markDragging}
      onSwipeableOpen={() => {
        openedRef.current = true;
        draggingRef.current = false;
      }}
      onSwipeableClose={() => {
        openedRef.current = false;
        draggingRef.current = false;
        if (openSwipeable === ref.current) openSwipeable = null;
      }}
      renderLeftActions={
        leftKind
          ? () => (
              <View style={[styles.leftWrap, leftKind === 'partial' && styles.leftWide]}>
                {leftKind === 'partial' ? (
                  <Pressable
                    style={[styles.action, styles.partial]}
                    onPress={() => {
                      close();
                      onPartialPay();
                    }}
                  >
                    <Ionicons name="cash-outline" size={22} color="#fff" />
                    <Text style={styles.actionText}>{labels.payPartial}</Text>
                  </Pressable>
                ) : (
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
                )}
              </View>
            )
          : undefined
      }
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
      <RowPressLock.Provider value={{ lock }}>
        <Pressable
          style={styles.row}
          delayPressIn={80}
          onPress={() => {
            if (ignorePressRef.current) {
              ignorePressRef.current = false;
              return;
            }
            if (openedRef.current) {
              close();
              return;
            }
            if (draggingRef.current) {
              draggingRef.current = false;
              return;
            }
            onPress?.();
          }}
        >
          {children}
        </Pressable>
      </RowPressLock.Provider>
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
  leftWide: { width: 124 },
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
  partial: { backgroundColor: colors.accent },
  paid: { backgroundColor: colors.success },
  unpaid: { backgroundColor: colors.accent },
  edit: { backgroundColor: colors.primary },
  delete: { backgroundColor: colors.danger, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center' },
});
