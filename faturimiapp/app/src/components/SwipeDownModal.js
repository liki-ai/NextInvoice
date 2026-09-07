import React, { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

export default function SwipeDownModal({ visible, onClose, title, children, tall = true }) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 1.1) {
          Animated.timing(translateY, { toValue: 640, duration: 160, useNativeDriver: true }).start(() =>
            onCloseRef.current?.(),
          );
          return;
        }
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={tall ? styles.sheetWrapTall : styles.sheetWrap}
        >
          <Animated.View
            style={[
              tall ? styles.sheetTall : styles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md), transform: [{ translateY }] },
            ]}
          >
            <View {...pan.panHandlers} style={styles.handleHit}>
              <View style={styles.handle} />
              {title ? (
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{title}</Text>
                  <Pressable onPress={onClose} hitSlop={12}>
                    <Ionicons name="close" size={22} color={colors.text} />
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={tall ? styles.body : null}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(29,43,46,0.4)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    maxHeight: '88%',
  },
  sheetWrapTall: {
    height: '88%',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  sheetTall: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  handleHit: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    flex: 1,
  },
});
