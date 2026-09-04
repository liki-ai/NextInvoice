import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { KEYS, getJson, setJson } from '../storage/storage';
import { DEFAULT_COMPANY_PROFILE, DEFAULT_SETTINGS, DEFAULT_PLAN } from '../storage/defaults';
import { generateId } from '../utils/id';
import { I18nProvider } from '../i18n/I18nContext';
import { planUsage } from '../storage/plan';

const AppContext = createContext(null);

function normalizePlan(raw) {
  const next = { ...DEFAULT_PLAN, ...(raw || {}) };
  if (next.plan === 'premium' && next.expiresAt) {
    const expires = new Date(next.expiresAt).getTime();
    if (Number.isFinite(expires) && expires <= Date.now()) {
      return { ...DEFAULT_PLAN };
    }
  }
  return next;
}

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [companyProfile, setCompanyProfile] = useState(DEFAULT_COMPANY_PROFILE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [invoices, setInvoices] = useState([]);
  const [plan, setPlan] = useState(DEFAULT_PLAN);

  useEffect(() => {
    (async () => {
      const [profile, storedSettings, storedInvoices, storedPlan] = await Promise.all([
        getJson(KEYS.COMPANY_PROFILE, DEFAULT_COMPANY_PROFILE),
        getJson(KEYS.SETTINGS, DEFAULT_SETTINGS),
        getJson(KEYS.INVOICES, []),
        getJson(KEYS.PLAN, DEFAULT_PLAN),
      ]);
      setCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, ...profile });
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      setInvoices(storedInvoices);
      setPlan(normalizePlan(storedPlan));
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

  const persistPlan = useCallback(async (next) => {
    const normalized = normalizePlan(next);
    setPlan(normalized);
    await setJson(KEYS.PLAN, normalized);
    return normalized;
  }, []);

  const setPlanFromPurchase = useCallback(
    async (payload) =>
      persistPlan({
        plan: 'premium',
        productId: payload.productId || null,
        originalTransactionId: payload.originalTransactionId || null,
        expiresAt: payload.expiresAt || null,
        platform: payload.platform || null,
        updatedAt: new Date().toISOString(),
      }),
    [persistPlan],
  );

  const clearPlan = useCallback(async () => persistPlan(DEFAULT_PLAN), [persistPlan]);

  const usage = useMemo(() => planUsage(plan?.plan, invoices), [plan, invoices]);

  const addInvoice = useCallback(
    async (invoice) => {
      const currentUsage = planUsage(plan?.plan, invoices);
      if (!currentUsage.canCreate) {
        const err = new Error('PLAN_LIMIT');
        err.code = 'PLAN_LIMIT';
        throw err;
      }
      const withId = { ...invoice, id: invoice.id || generateId(), createdAt: new Date().toISOString() };
      setInvoices((prev) => {
        const next = [withId, ...prev];
        setJson(KEYS.INVOICES, next);
        return next;
      });
      return withId;
    },
    [plan, invoices],
  );

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
      plan,
      usage,
      setPlanFromPurchase,
      clearPlan,
    }),
    [
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
      plan,
      usage,
      setPlanFromPurchase,
      clearPlan,
    ],
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
