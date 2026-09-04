import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'
import type { CompanyProfile, Invoice } from '../lib/invoice'
import type { Obligation } from '../lib/obligation'
import { useI18n, isLang } from '../i18n'

type DataValue = {
  invoices: Invoice[]
  obligations: Obligation[]
  profile: CompanyProfile | null
  loading: boolean
  refresh: () => Promise<void>
  createInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<Invoice>
  removeInvoice: (id: string) => Promise<void>
  createObligation: (obligation: Omit<Obligation, 'id' | 'createdAt'>) => Promise<Obligation>
  updateObligation: (id: string, obligation: Partial<Obligation>) => Promise<Obligation>
  removeObligation: (id: string) => Promise<void>
  saveProfile: (profile: CompanyProfile) => Promise<CompanyProfile>
}

const DataContext = createContext<DataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const { setLang } = useI18n()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setInvoices([])
      setObligations([])
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const [invRes, profRes, oblRes] = await Promise.all([
        api<{ invoices: Invoice[] }>('/api/invoices'),
        api<{ profile: CompanyProfile }>('/api/profile'),
        api<{ obligations: Obligation[] }>('/api/obligations').catch(() => ({ obligations: [] as Obligation[] })),
      ])
      setInvoices(invRes.invoices || [])
      setObligations(oblRes.obligations || [])
      setProfile(profRes.profile)
      if (isLang(profRes.profile?.language)) {
        setLang(profRes.profile.language)
      }
    } finally {
      setLoading(false)
    }
  }, [token, setLang])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createInvoice = useCallback(async (invoice: Omit<Invoice, 'id' | 'createdAt'>) => {
    const res = await api<{ invoice: Invoice }>('/api/invoices', { method: 'POST', body: invoice })
    setInvoices((prev) => [res.invoice, ...prev])
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

  const saveProfile = useCallback(async (next: CompanyProfile) => {
    const res = await api<{ profile: CompanyProfile }>('/api/profile', { method: 'PUT', body: next })
    setProfile(res.profile)
    if (isLang(res.profile.language)) setLang(res.profile.language)
    return res.profile
  }, [setLang])

  const value = useMemo(
    () => ({
      invoices,
      obligations,
      profile,
      loading,
      refresh,
      createInvoice,
      updateInvoice,
      removeInvoice,
      createObligation,
      updateObligation,
      removeObligation,
      saveProfile,
    }),
    [
      invoices,
      obligations,
      profile,
      loading,
      refresh,
      createInvoice,
      updateInvoice,
      removeInvoice,
      createObligation,
      updateObligation,
      removeObligation,
      saveProfile,
    ],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
