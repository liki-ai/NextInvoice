import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function extFromName(name, fallback = 'bin') {
  const match = String(name || '').match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

async function copyLocalProof(uri, name, mime) {
  const dir = `${FileSystem.documentDirectory}proofs/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const fileName = `${Date.now()}.${extFromName(name || uri, mime?.includes('pdf') ? 'pdf' : 'jpg')}`;
  const dest = `${dir}${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return {
    proofUri: dest,
    proofName: name || fileName,
    proofMime: mime || '',
  };
}

export async function pickObligationProof(t) {
  return new Promise((resolve) => {
    Alert.alert(t('obligations.proofTitle'), t('obligations.proofHint'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      {
        text: t('obligations.proofPhoto'),
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(t('common.error'), t('obligations.proofPermission'));
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          });
          if (result.canceled || !result.assets?.[0]) {
            resolve(null);
            return;
          }
          const asset = result.assets[0];
          resolve(await copyLocalProof(asset.uri, asset.fileName || 'proof.jpg', asset.mimeType || 'image/jpeg'));
        },
      },
      {
        text: t('obligations.proofFile'),
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'image/*'],
            copyToCacheDirectory: true,
            multiple: false,
          });
          if (result.canceled) {
            resolve(null);
            return;
          }
          const file = result.assets ? result.assets[0] : result;
          if (!file?.uri) {
            resolve(null);
            return;
          }
          resolve(await copyLocalProof(file.uri, file.name || 'proof', file.mimeType || ''));
        },
      },
    ]);
  });
}

export async function openObligationProof(item, t) {
  const uri = item?.proofUri;
  if (!uri) return;
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert(t('common.error'), t('obligations.proofMissing'));
    return;
  }
  await Sharing.shareAsync(uri, {
    mimeType: item.proofMime || undefined,
    dialogTitle: item.proofName || t('obligations.proofTitle'),
  });
}
