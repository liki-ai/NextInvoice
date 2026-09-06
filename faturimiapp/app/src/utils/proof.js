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
  const proofMime = mime || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  let proofData = '';
  try {
    const b64 = await FileSystem.readAsStringAsync(dest, { encoding: FileSystem.EncodingType.Base64 });
    if (b64) proofData = `data:${proofMime};base64,${b64}`;
  } catch {
    proofData = '';
  }
  return {
    proofUri: dest,
    proofName: name || fileName,
    proofMime,
    proofData,
  };
}

export function isImageProof(item) {
  const mime = String(item?.proofMime || item?.mime || '').toLowerCase();
  const name = String(item?.proofName || item?.name || item?.proofUri || item?.uri || '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(name) || String(item?.proofData || item?.data || '').startsWith('data:image');
}

export function proofSource(item) {
  return item?.proofData || item?.data || item?.proofUri || item?.uri || '';
}

export async function pickImageFile(t) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(t('common.error'), t('obligations.proofPermission'));
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return copyLocalProof(asset.uri, asset.fileName || 'photo.jpg', asset.mimeType || 'image/jpeg');
}

export async function pickProof(t) {
  return new Promise((resolve) => {
    Alert.alert(t('obligations.proofTitle'), t('obligations.proofHint'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      {
        text: t('obligations.proofPhoto'),
        onPress: async () => resolve(await pickImageFile(t)),
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

export async function openProof(item, t) {
  const uri = item?.proofUri || item?.uri;
  if (!uri) return false;
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    Alert.alert(t('common.error'), t('obligations.proofMissing'));
    return false;
  }
  await Sharing.shareAsync(uri, {
    mimeType: item.proofMime || item.mime || undefined,
    dialogTitle: item.proofName || item.name || t('obligations.proofTitle'),
  });
  return true;
}

export const pickObligationProof = pickProof;
export const openObligationProof = openProof;
