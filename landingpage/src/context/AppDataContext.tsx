import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'
import type { CompanyProfile, Invoice } from '../lib/invoice'
import { useI18n, isLang } from '../i18n'

type DataValue = {
  invoices: Invoice[]
  profile: CompanyProfile | null
  loading: boolean
  refresh: () => Promise<void>
  createInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<Invoice>
  removeInvoice: (id: string) => Promise<void>
  saveProfile: (profile: CompanyProfile) => Promise<CompanyProfile>
}

const DataContext = createContext<DataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const { setLang } = useI18n()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setInvoices([])
      setProfile(null)
      return
    }
    setLoading(true)
    try {
      const [invRes, profRes] = await Promise.all([
        api<{ invoices: Invoice[] }>('/api/invoices'),
        api<{ profile: CompanyProfile }>('/api/profile'),
      ])
      setInvoices(invRes.invoices || [])
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
  }, [])

  const saveProfile = useCallback(async (next: CompanyProfile) => {
    const res = await api<{ profile: CompanyProfile }>('/api/profile', { method: 'PUT', body: next })
    setProfile(res.profile)
    if (isLang(res.profile.language)) setLang(res.profile.language)
    return res.profile
  }, [setLang])

  const value = useMemo(
    () => ({ invoices, profile, loading, refresh, createInvoice, updateInvoice, removeInvoice, saveProfile }),
    [invoices, profile, loading, refresh, createInvoice, updateInvoice, removeInvoice, saveProfile],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
