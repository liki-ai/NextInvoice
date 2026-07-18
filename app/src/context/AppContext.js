import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KEYS, getJson, setJson } from '../storage/storage';
import { DEFAULT_COMPANY_PROFILE, DEFAULT_SETTINGS } from '../storage/defaults';
import { generateId } from '../utils/id';
import { I18nProvider } from '../i18n/I18nContext';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [companyProfile, setCompanyProfile] = useState(DEFAULT_COMPANY_PROFILE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    (async () => {
      const [profile, storedSettings, storedInvoices] = await Promise.all([
        getJson(KEYS.COMPANY_PROFILE, DEFAULT_COMPANY_PROFILE),
        getJson(KEYS.SETTINGS, DEFAULT_SETTINGS),
        getJson(KEYS.INVOICES, []),
      ]);
      setCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, ...profile });
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      setInvoices(storedInvoices);
      setLoading(false);
    })();
  }, []);

  const updateCompanyProfile = useCallback(async (partial) => {
    setCompanyProfile((prev) => {
      const next = { ...prev, ...partial };
      setJson(KEYS.COMPANY_PROFILE, next);
      return next;
    });
  }, []);

  const updateSettings = useCallback(async (partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      setJson(KEYS.SETTINGS, next);
      return next;
    });
  }, []);

  const setLanguage = useCallback((language) => updateSettings({ language }), [updateSettings]);
  const setApiBaseUrl = useCallback((apiBaseUrl) => updateSettings({ apiBaseUrl }), [updateSettings]);

  const addInvoice = useCallback(async (invoice) => {
    const withId = { ...invoice, id: invoice.id || generateId(), createdAt: new Date().toISOString() };
    setInvoices((prev) => {
      const next = [withId, ...prev];
      setJson(KEYS.INVOICES, next);
      return next;
    });
    return withId;
  }, []);

  const updateInvoice = useCallback(async (id, partial) => {
    setInvoices((prev) => {
      const next = prev.map((inv) => (inv.id === id ? { ...inv, ...partial } : inv));
      setJson(KEYS.INVOICES, next);
      return next;
    });
  }, []);

  const deleteInvoice = useCallback(async (id) => {
    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.id !== id);
      setJson(KEYS.INVOICES, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      loading,
      companyProfile,
      updateCompanyProfile,
      settings,
      updateSettings,
      setLanguage,
      setApiBaseUrl,
      invoices,
      addInvoice,
      updateInvoice,
      deleteInvoice,
    }),
    [loading, companyProfile, updateCompanyProfile, settings, updateSettings, setLanguage, setApiBaseUrl, invoices, addInvoice, updateInvoice, deleteInvoice]
  );

  return (
    <AppContext.Provider value={value}>
      <I18nProvider language={settings.language}>{children}</I18nProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
