import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { KEYS, getJson, setJson } from '../storage/storage';
import { DEFAULT_COMPANY_PROFILE, DEFAULT_SETTINGS, DEFAULT_PLAN } from '../storage/defaults';
import { generateId } from '../utils/id';
import { I18nProvider } from '../i18n/I18nContext';
import { planUsage } from '../storage/plan';
import { apiRequest } from '../api/client';

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
  const [obligations, setObligations] = useState([]);
  const [clients, setClients] = useState([]);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [syncQueue, setSyncQueue] = useState([]);
  const [syncState, setSyncState] = useState({ status: 'pending', lastSyncedAt: null, error: null });
  const [migratedUserId, setMigratedUserId] = useState(null);
  const flushing = useRef(false);

  useEffect(() => {
    (async () => {
      const [
        profile,
        storedSettings,
        storedInvoices,
        storedObligations,
        storedPlan,
        storedClients,
        storedToken,
        storedUser,
        storedQueue,
        storedSync,
        storedMigrated,
      ] = await Promise.all([
        getJson(KEYS.COMPANY_PROFILE, DEFAULT_COMPANY_PROFILE),
        getJson(KEYS.SETTINGS, DEFAULT_SETTINGS),
        getJson(KEYS.INVOICES, []),
        getJson(KEYS.OBLIGATIONS, []),
        getJson(KEYS.PLAN, DEFAULT_PLAN),
        getJson(KEYS.CLIENTS, []),
        getJson(KEYS.AUTH_TOKEN, null),
        getJson(KEYS.AUTH_USER, null),
        getJson(KEYS.SYNC_QUEUE, []),
        getJson(KEYS.SYNC_STATE, { status: 'pending', lastSyncedAt: null, error: null }),
        getJson(KEYS.MIGRATED_USER_ID, null),
      ]);
      setCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, ...profile });
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      setInvoices(storedInvoices);
      setObligations(Array.isArray(storedObligations) ? storedObligations : []);
      setClients(Array.isArray(storedClients) ? storedClients : []);
      setPlan(normalizePlan(storedPlan));
      setToken(storedToken);
      setUser(storedUser);
      setSyncQueue(Array.isArray(storedQueue) ? storedQueue : []);
      setSyncState(storedSync || { status: 'pending', lastSyncedAt: null, error: null });
      setMigratedUserId(storedMigrated);
      setLoading(false);
    })();
  }, []);

  const persistSync = useCallback(async (next) => {
    setSyncState(next);
    await setJson(KEYS.SYNC_STATE, next);
  }, []);

  const enqueue = useCallback(async (change) => {
    const item = { opId: generateId(), ...change };
    const next = [...syncQueue, item];
    setSyncQueue(next);
    await setJson(KEYS.SYNC_QUEUE, next);
    await persistSync({ ...syncState, status: 'pending', error: null });
    return item;
  }, [syncQueue, syncState, persistSync]);

  const applySnapshot = useCallback(async (snap) => {
    if (!snap) return;
    if (Array.isArray(snap.invoices)) {
      setInvoices(snap.invoices);
      await setJson(KEYS.INVOICES, snap.invoices);
    }
    if (Array.isArray(snap.obligations)) {
      setObligations(snap.obligations);
      await setJson(KEYS.OBLIGATIONS, snap.obligations);
    }
    if (Array.isArray(snap.clients)) {
      setClients(snap.clients);
      await setJson(KEYS.CLIENTS, snap.clients);
    }
    if (snap.profile) {
      const next = { ...DEFAULT_COMPANY_PROFILE, ...snap.profile };
      setCompanyProfile(next);
      await setJson(KEYS.COMPANY_PROFILE, next);
      if (snap.profile.language) {
        setSettings((prev) => {
          const merged = { ...prev, language: snap.profile.language };
          setJson(KEYS.SETTINGS, merged);
          return merged;
        });
      }
    }
  }, []);

  const flushQueue = useCallback(async () => {
    if (!token || flushing.current) return;
    flushing.current = true;
    try {
      let queue = [...syncQueue];
      while (queue.length) {
        const item = queue[0];
        const res = await apiRequest(settings.apiBaseUrl, token, '/api/sync', {
          method: 'POST',
          body: { opId: item.opId, changes: [item] },
        });
        queue = queue.slice(1);
        setSyncQueue(queue);
        await setJson(KEYS.SYNC_QUEUE, queue);
        if (res?.snapshot) await applySnapshot(res.snapshot);
      }
      const snap = await apiRequest(settings.apiBaseUrl, token, '/api/sync');
      await applySnapshot(snap);
      await persistSync({ status: 'synced', lastSyncedAt: new Date().toISOString(), error: null });
    } catch (err) {
      await persistSync({ status: 'error', lastSyncedAt: syncState.lastSyncedAt, error: err.message });
    } finally {
      flushing.current = false;
    }
  }, [token, syncQueue, settings.apiBaseUrl, applySnapshot, persistSync, syncState.lastSyncedAt]);

  useEffect(() => {
    if (!loading && token) void flushQueue();
  }, [loading, token, syncQueue.length]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && token) void flushQueue();
    });
    return () => sub.remove();
  }, [token, flushQueue]);

  const migrateLocalIfNeeded = useCallback(async (nextUser, nextToken) => {
    if (migratedUserId && migratedUserId !== nextUser.id) {
      await persistSync({ status: 'pending', lastSyncedAt: null, error: 'wrong-account' });
      const snap = await apiRequest(settings.apiBaseUrl, nextToken, '/api/sync');
      await applySnapshot(snap);
      return;
    }
    if (migratedUserId === nextUser.id) return;
    const changes = [];
    if (companyProfile) changes.push({ collection: 'profile', op: 'upsert', id: 'profile', body: companyProfile });
    for (const client of clients) changes.push({ collection: 'clients', op: 'upsert', id: client.id, body: client });
    for (const inv of invoices) changes.push({ collection: 'invoices', op: 'upsert', id: inv.id, body: inv });
    for (const item of obligations) changes.push({ collection: 'obligations', op: 'upsert', id: item.id, body: item });
    for (const change of changes) {
      await apiRequest(settings.apiBaseUrl, nextToken, '/api/sync', {
        method: 'POST',
        body: { opId: generateId(), changes: [change] },
      });
    }
    await setJson(KEYS.MIGRATED_USER_ID, nextUser.id);
    setMigratedUserId(nextUser.id);
    const snap = await apiRequest(settings.apiBaseUrl, nextToken, '/api/sync');
    await applySnapshot(snap);
  }, [migratedUserId, companyProfile, clients, invoices, obligations, settings.apiBaseUrl, applySnapshot, persistSync]);

  const login = useCallback(async (email, password) => {
    const res = await apiRequest(settings.apiBaseUrl, null, '/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    setUser(res.user);
    await setJson(KEYS.AUTH_TOKEN, res.token);
    await setJson(KEYS.AUTH_USER, res.user);
    await migrateLocalIfNeeded(res.user, res.token);
    await persistSync({ status: 'synced', lastSyncedAt: new Date().toISOString(), error: null });
  }, [settings.apiBaseUrl, migrateLocalIfNeeded, persistSync]);

  const signup = useCallback(async (email, password) => {
    const res = await apiRequest(settings.apiBaseUrl, null, '/api/auth/signup', {
      method: 'POST',
      body: { email, password, language: settings.language },
    });
    setToken(res.token);
    setUser(res.user);
    await setJson(KEYS.AUTH_TOKEN, res.token);
    await setJson(KEYS.AUTH_USER, res.user);
    await migrateLocalIfNeeded(res.user, res.token);
    await persistSync({ status: 'synced', lastSyncedAt: new Date().toISOString(), error: null });
  }, [settings.apiBaseUrl, settings.language, migrateLocalIfNeeded, persistSync]);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    await setJson(KEYS.AUTH_TOKEN, null);
    await setJson(KEYS.AUTH_USER, null);
  }, []);

  const updateCompanyProfile = useCallback(async (partial) => {
    let next = null;
    setCompanyProfile((prev) => {
      next = { ...prev, ...partial };
      setJson(KEYS.COMPANY_PROFILE, next);
      return next;
    });
    if (token) await enqueue({ collection: 'profile', op: 'upsert', id: 'profile', body: next });
  }, [token, enqueue]);

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
      const withId = {
        ...invoice,
        id: invoice.id || generateId(),
        createdAt: invoice.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setInvoices((prev) => {
        const next = [withId, ...prev.filter((item) => item.id !== withId.id)];
        setJson(KEYS.INVOICES, next);
        return next;
      });
      if (token) await enqueue({ collection: 'invoices', op: 'upsert', id: withId.id, body: withId });
      return withId;
    },
    [plan, invoices, token, enqueue],
  );

  const updateInvoice = useCallback(async (id, partial) => {
    let saved = null;
    setInvoices((prev) => {
      const next = prev.map((inv) => (inv.id === id ? { ...inv, ...partial, updatedAt: new Date().toISOString() } : inv));
      saved = next.find((item) => item.id === id);
      setJson(KEYS.INVOICES, next);
      return next;
    });
    if (token && saved) await enqueue({ collection: 'invoices', op: 'upsert', id, body: partial, baseUpdatedAt: saved.updatedAt });
  }, [token, enqueue]);

  const deleteInvoice = useCallback(async (id) => {
    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.id !== id);
      setJson(KEYS.INVOICES, next);
      return next;
    });
    setObligations((prev) => {
      const next = prev.map((item) => (item.relatedInvoiceId === id ? { ...item, relatedInvoiceId: '' } : item));
      setJson(KEYS.OBLIGATIONS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'invoices', op: 'delete', id });
  }, [token, enqueue]);

  const issueInvoice = useCallback(async (id) => {
    if (token) await enqueue({ collection: 'invoices', op: 'issue', id, body: {} });
    else {
      setInvoices((prev) => {
        const next = prev.map((inv) => (inv.id === id ? { ...inv, lifecycle: 'issued', issuedAt: new Date().toISOString() } : inv));
        setJson(KEYS.INVOICES, next);
        return next;
      });
    }
  }, [token, enqueue]);

  const cancelInvoice = useCallback(async (id, reason) => {
    setInvoices((prev) => {
      const next = prev.map((inv) =>
        inv.id === id
          ? { ...inv, lifecycle: 'cancelled', status: 'cancelled', cancelReason: reason, cancelledAt: new Date().toISOString() }
          : inv,
      );
      setJson(KEYS.INVOICES, next);
      return next;
    });
    if (token) await enqueue({ collection: 'invoices', op: 'cancel', id, body: { reason } });
  }, [token, enqueue]);

  const addInvoicePayment = useCallback(async (id, payment) => {
    const saved = { ...payment, id: payment.id || generateId(), opId: payment.opId || generateId() };
    setInvoices((prev) => {
      const next = prev.map((inv) => (inv.id === id ? { ...inv, payments: [...(inv.payments || []), saved] } : inv));
      setJson(KEYS.INVOICES, next);
      return next;
    });
    if (token) await enqueue({ collection: 'invoices', op: 'payment', id, body: saved, opId: saved.opId });
  }, [token, enqueue]);

  const voidInvoicePayment = useCallback(async (id, paymentId, reason) => {
    setInvoices((prev) => {
      const next = prev.map((inv) =>
        inv.id === id
          ? {
              ...inv,
              payments: (inv.payments || []).map((item) =>
                item.id === paymentId ? { ...item, voidedAt: new Date().toISOString(), voidReason: reason } : item,
              ),
            }
          : inv,
      );
      setJson(KEYS.INVOICES, next);
      return next;
    });
    if (token) await enqueue({ collection: 'invoices', op: 'voidPayment', id, body: { paymentId, reason } });
  }, [token, enqueue]);

  const addObligation = useCallback(async (obligation) => {
    const withId = { ...obligation, id: obligation.id || generateId(), createdAt: new Date().toISOString() };
    setObligations((prev) => {
      const next = [withId, ...prev];
      setJson(KEYS.OBLIGATIONS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'obligations', op: 'upsert', id: withId.id, body: withId });
    return withId;
  }, [token, enqueue]);

  const updateObligation = useCallback(async (id, partial) => {
    setObligations((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...partial, updatedAt: new Date().toISOString() } : item));
      setJson(KEYS.OBLIGATIONS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'obligations', op: 'upsert', id, body: partial });
  }, [token, enqueue]);

  const deleteObligation = useCallback(async (id) => {
    setObligations((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setJson(KEYS.OBLIGATIONS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'obligations', op: 'delete', id });
  }, [token, enqueue]);

  const addObligationPayment = useCallback(async (id, payment) => {
    const saved = { ...payment, id: payment.id || generateId(), opId: payment.opId || generateId() };
    setObligations((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, payments: [...(item.payments || []), saved] } : item));
      setJson(KEYS.OBLIGATIONS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'obligations', op: 'payment', id, body: saved, opId: saved.opId });
  }, [token, enqueue]);

  const addClient = useCallback(async (client) => {
    const saved = { ...client, id: client.id || generateId(), createdAt: new Date().toISOString() };
    setClients((prev) => {
      const next = [saved, ...prev.filter((item) => item.id !== saved.id)];
      setJson(KEYS.CLIENTS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'clients', op: 'upsert', id: saved.id, body: saved });
    return saved;
  }, [token, enqueue]);

  const updateClient = useCallback(async (id, partial) => {
    setClients((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...partial } : item));
      setJson(KEYS.CLIENTS, next);
      return next;
    });
    if (token) await enqueue({ collection: 'clients', op: 'upsert', id, body: partial });
  }, [token, enqueue]);

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
      issueInvoice,
      cancelInvoice,
      addInvoicePayment,
      voidInvoicePayment,
      obligations,
      addObligation,
      updateObligation,
      deleteObligation,
      addObligationPayment,
      clients,
      addClient,
      updateClient,
      plan,
      usage,
      setPlanFromPurchase,
      clearPlan,
      token,
      user,
      login,
      signup,
      logout,
      syncState,
      flushQueue,
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
      issueInvoice,
      cancelInvoice,
      addInvoicePayment,
      voidInvoicePayment,
      obligations,
      addObligation,
      updateObligation,
      deleteObligation,
      addObligationPayment,
      clients,
      addClient,
      updateClient,
      plan,
      usage,
      setPlanFromPurchase,
      clearPlan,
      token,
      user,
      login,
      signup,
      logout,
      syncState,
      flushQueue,
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
