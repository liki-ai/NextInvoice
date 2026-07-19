import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  COMPANY_PROFILE: '@nextinvoice/companyProfile',
  SETTINGS: '@nextinvoice/settings',
  INVOICES: '@nextinvoice/invoices',
};

async function getJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] failed to read ${key}`, err);
    return fallback;
  }
}

async function setJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] failed to write ${key}`, err);
  }
}

export { KEYS, getJson, setJson };
