import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { isImageProof, openProof, pickProof, proofSource } from '../utils/proof';

export default function ProofBlock({ item, t, onChange }) {
  const [viewing, setViewing] = useState(false);
  const attached = Boolean(item?.proofUri || item?.proofData || item?.proofName);
  const source = proofSource(item);
  const image = attached && isImageProof(item) && source;

  const onPick = async () => {
    const picked = await pickProof(t);
    if (picked) onChange?.(picked);
  };

  const onOpen = async () => {
    if (image) {
      setViewing(true);
      return;
    }
    await openProof(item, t);
  };

  return (
    <View style={styles.wrap}>
      {image ? (
        <Pressable onPress={onOpen}>
          <Image source={{ uri: source }} style={styles.preview} />
        </Pressable>
      ) : null}
      <View style={styles.row}>
        {attached ? (
          <Pressable style={styles.chip} onPress={onOpen}>
            <Ionicons name={image ? 'image-outline' : 'document-attach-outline'} size={16} color={colors.primary} />
            <Text style={styles.chipText}>{item.proofName || t('obligations.proofAttached')}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.chip} onPress={onPick}>
          <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
          <Text style={styles.chipText}>{attached ? t('obligations.proofReplace') : t('obligations.proofAdd')}</Text>
        </Pressable>
      </View>
      <Modal visible={viewing} animationType="fade" onRequestClose={() => setViewing(false)}>
        <View style={styles.viewer}>
          <Pressable style={styles.close} onPress={() => setViewing(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {source ? <Image source={{ uri: source }} style={styles.full} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  preview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: '#EEF2F3' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  viewer: { flex: 1, backgroundColor: '#111', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 8 },
  full: { width: '100%', height: '100%' },
});
