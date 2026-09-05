import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'
import type { CompanyProfile, Invoice } from '../lib/invoice'
import type { Obligation } from '../lib/obligation'
import type { ClientRecord, Payment } from '../lib/document'
import { useI18n, isLang } from '../i18n'

type PaymentInput = { amount: number; date: string; method?: string; note?: string; opId?: string }

type DataValue = {
  invoices: Invoice[]
  obligations: Obligation[]
  clients: ClientRecord[]
  profile: CompanyProfile | null
  loading: boolean
  refresh: () => Promise<void>
  createInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<Invoice>
  removeInvoice: (id: string) => Promise<void>
  issueInvoice: (id: string) => Promise<Invoice>
  cancelInvoice: (id: string, reason: string) => Promise<Invoice>
  correctInvoice: (id: string, body: { items?: Invoice['items']; discount?: Invoice['discount']; notes?: string; reason: string }) => Promise<Invoice>
  addInvoicePayment: (id: string, payment: PaymentInput) => Promise<Invoice>
  voidInvoicePayment: (id: string, paymentId: string, reason: string) => Promise<Invoice>
  createObligation: (obligation: Omit<Obligation, 'id' | 'createdAt'>) => Promise<Obligation>
  updateObligation: (id: string, obligation: Partial<Obligation>) => Promise<Obligation>
  removeObligation: (id: string) => Promise<void>
  addObligationPayment: (id: string, payment: PaymentInput) => Promise<Obligation>
  voidObligationPayment: (id: string, paymentId: string, reason: string) => Promise<Obligation>
  createClient: (client: Omit<ClientRecord, 'id' | 'createdAt'>) => Promise<ClientRecord>
  updateClient: (id: string, client: Partial<ClientRecord>) => Promise<ClientRecord>
  removeClient: (id: string) => Promise<void>
  saveProfile: (profile: CompanyProfile) => Promise<CompanyProfile>
  downloadBackup: () => Promise<void>
  restoreBackup: (backup: unknown) => Promise<void>
}

const DataContext = createContext<DataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const { setLang } = useI18n()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setInvoices([])
      setObligations([])
      setClients([])
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const snap = await api<{ invoices: Invoice[]; obligations: Obligation[]; clients: ClientRecord[]; profile: CompanyProfile }>('/api/sync').catch(async () => {
        const [invRes, profRes, oblRes, clientRes] = await Promise.all([
          api<{ invoices: Invoice[] }>('/api/invoices'),
          api<{ profile: CompanyProfile }>('/api/profile'),
          api<{ obligations: Obligation[] }>('/api/obligations').catch(() => ({ obligations: [] as Obligation[] })),
          api<{ clients: ClientRecord[] }>('/api/clients').catch(() => ({ clients: [] as ClientRecord[] })),
        ])
        return { invoices: invRes.invoices, obligations: oblRes.obligations, clients: clientRes.clients, profile: profRes.profile }
      })
      setInvoices(snap.invoices || [])
      setObligations(snap.obligations || [])
      setClients(snap.clients || [])
      setProfile(snap.profile)
      if (isLang(snap.profile?.language)) setLang(snap.profile.language)
    } finally {
      setLoading(false)
    }
  }, [token, setLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createInvoice = useCallback(async (invoice: Omit<Invoice, 'id' | 'createdAt'>) => {
    const res = await api<{ invoice: Invoice }>('/api/invoices', { method: 'POST', body: invoice })
    setInvoices((prev) => [res.invoice, ...prev.filter((item) => item.id !== res.invoice.id)])
    return res.invoice
  }, [])

  const updateInvoice = useCallback(async (id: string, invoice: Partial<Invoice>) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}`, { method: 'PUT', body: invoice })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const removeInvoice = useCallback(async (id: string) => {
    await api(`/api/invoices/${id}`, { method: 'DELETE' })
    setInvoices((prev) => prev.filter((item) => item.id !== id))
    setObligations((prev) =>
      prev.map((item) => (item.relatedInvoiceId === id ? { ...item, relatedInvoiceId: '' } : item)),
    )
  }, [])

  const issueInvoice = useCallback(async (id: string) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/issue`, { method: 'POST', body: {} })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const cancelInvoice = useCallback(async (id: string, reason: string) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/cancel`, { method: 'POST', body: { reason } })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const correctInvoice = useCallback(async (id: string, body: { items?: Invoice['items']; discount?: Invoice['discount']; notes?: string; reason: string }) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/correct`, { method: 'POST', body })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const addInvoicePayment = useCallback(async (id: string, payment: PaymentInput) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/payments`, { method: 'POST', body: payment })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const voidInvoicePayment = useCallback(async (id: string, paymentId: string, reason: string) => {
    const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/payments/${paymentId}/void`, { method: 'POST', body: { reason } })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res.invoice
  }, [])

  const createObligation = useCallback(async (obligation: Omit<Obligation, 'id' | 'createdAt'>) => {
    const res = await api<{ obligation: Obligation }>('/api/obligations', { method: 'POST', body: obligation })
    setObligations((prev) => [res.obligation, ...prev])
    return res.obligation
  }, [])

  const updateObligation = useCallback(async (id: string, obligation: Partial<Obligation>) => {
    const res = await api<{ obligation: Obligation }>(`/api/obligations/${id}`, { method: 'PUT', body: obligation })
    setObligations((prev) => prev.map((item) => (item.id === id ? res.obligation : item)))
    return res.obligation
  }, [])

  const removeObligation = useCallback(async (id: string) => {
    await api(`/api/obligations/${id}`, { method: 'DELETE' })
    setObligations((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const addObligationPayment = useCallback(async (id: string, payment: PaymentInput) => {
    const res = await api<{ obligation: Obligation }>(`/api/obligations/${id}/payments`, { method: 'POST', body: payment })
    setObligations((prev) => prev.map((item) => (item.id === id ? res.obligation : item)))
    return res.obligation
  }, [])

  const voidObligationPayment = useCallback(async (id: string, paymentId: string, reason: string) => {
    const res = await api<{ obligation: Obligation }>(`/api/obligations/${id}/payments/${paymentId}/void`, { method: 'POST', body: { reason } })
    setObligations((prev) => prev.map((item) => (item.id === id ? res.obligation : item)))
    return res.obligation
  }, [])

  const createClient = useCallback(async (client: Omit<ClientRecord, 'id' | 'createdAt'>) => {
    const res = await api<{ client: ClientRecord }>('/api/clients', { method: 'POST', body: client })
    setClients((prev) => [res.client, ...prev.filter((item) => item.id !== res.client.id)])
    return res.client
  }, [])

  const updateClient = useCallback(async (id: string, client: Partial<ClientRecord>) => {
    const res = await api<{ client: ClientRecord }>(`/api/clients/${id}`, { method: 'PUT', body: client })
    setClients((prev) => prev.map((item) => (item.id === id ? res.client : item)))
    return res.client
  }, [])

  const removeClient = useCallback(async (id: string) => {
    await api(`/api/clients/${id}`, { method: 'DELETE' })
    setClients((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const saveProfile = useCallback(async (next: CompanyProfile) => {
    const res = await api<{ profile: CompanyProfile }>('/api/profile', { method: 'PUT', body: next })
    setProfile(res.profile)
    if (isLang(res.profile.language)) setLang(res.profile.language)
    return res.profile
  }, [setLang])

  const downloadBackup = useCallback(async () => {
    const backup = await api<Record<string, unknown>>('/api/sync/backup')
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nextinvoice-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const restoreBackup = useCallback(async (backup: unknown) => {
    const body = typeof backup === 'object' && backup ? { ...(backup as object), confirm: 'RESTORE' } : { confirm: 'RESTORE' }
    await api('/api/sync/backup/restore', { method: 'POST', body })
    await refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      invoices,
      obligations,
      clients,
      profile,
      loading,
      refresh,
      createInvoice,
      updateInvoice,
      removeInvoice,
      issueInvoice,
      cancelInvoice,
      correctInvoice,
      addInvoicePayment,
      voidInvoicePayment,
      createObligation,
      updateObligation,
      removeObligation,
      addObligationPayment,
      voidObligationPayment,
      createClient,
      updateClient,
      removeClient,
      saveProfile,
      downloadBackup,
      restoreBackup,
    }),
    [
      invoices,
      obligations,
      clients,
      profile,
      loading,
      refresh,
      createInvoice,
      updateInvoice,
      removeInvoice,
      issueInvoice,
      cancelInvoice,
      correctInvoice,
      addInvoicePayment,
      voidInvoicePayment,
      createObligation,
      updateObligation,
      removeObligation,
      addObligationPayment,
      voidObligationPayment,
      createClient,
      updateClient,
      removeClient,
      saveProfile,
      downloadBackup,
      restoreBackup,
    ],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}

export type { Payment }
