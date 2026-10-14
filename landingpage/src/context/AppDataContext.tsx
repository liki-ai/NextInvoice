import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'
import type { CompanyProfile, Invoice } from '../lib/invoice'
import type { Obligation } from '../lib/obligation'
import type { ClientRecord, Payment } from '../lib/document'
import type { CatalogItem } from '../lib/catalog'
import type { InvoiceEmailInput, MailBox, MailSettingsInput, MailState, ReminderInput } from '../lib/mail'
import { useI18n, isLang } from '../i18n'

type PaymentInput = { amount: number; date: string; method?: string; note?: string; opId?: string }

type DataValue = {
  invoices: Invoice[]
  obligations: Obligation[]
  clients: ClientRecord[]
  items: CatalogItem[]
  profile: CompanyProfile | null
  loading: boolean
  refresh: () => Promise<void>
  createInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt'>) => Promise<Invoice>
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<Invoice>
  removeInvoice: (id: string) => Promise<void>
  issueInvoice: (id: string) => Promise<Invoice>
  cancelInvoice: (id: string, reason: string) => Promise<Invoice>
  /** Changes an issued invoice. The reason is needed only when the amounts change. */
  correctInvoice: (id: string, body: { items?: Invoice['items']; discount?: Invoice['discount']; taxRate?: number; notes?: string; date?: string; dueDate?: string; reason: string }) => Promise<Invoice>
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
  createItem: (item: Omit<CatalogItem, 'id' | 'createdAt'>) => Promise<CatalogItem>
  updateItem: (id: string, item: Partial<CatalogItem>) => Promise<CatalogItem>
  removeItem: (id: string) => Promise<void>
  /** The code for this invoice's public link, created on first use. */
  shareInvoice: (id: string) => Promise<string>
  importInvoices: (payload: unknown) => Promise<{ created: number; clientsCreated: number; skipped: { number: string; reason: string }[] }>
  /** Records full payment on each invoice. Without a date, each payment is dated like its invoice. */
  markInvoicesPaid: (ids: string[], date?: string) => Promise<{ paid: number; skipped: number }>
  saveProfile: (profile: Partial<CompanyProfile>) => Promise<CompanyProfile>
  /** The company's mailbox connection for sending invoices; null until it is known. */
  mail: MailState | null
  saveMail: (box: MailBox, settings: MailSettingsInput) => Promise<MailState>
  removeMail: (box: MailBox) => Promise<MailState>
  /** Sends a test message to the account's own address. */
  testMail: (message: { box: MailBox; subject: string; body: string }) => Promise<{ to: string }>
  /** Emails the invoice from the company mailbox and marks it sent. */
  sendInvoiceEmail: (id: string, message: InvoiceEmailInput) => Promise<{ invoice: Invoice; attached: boolean }>
  /** "Send now": emails the invoice at once with the standard (or renewal) message. */
  deliverInvoice: (id: string) => Promise<Invoice>
  /** Schedules the email for a day (YYYY-MM-DD), optionally to other recipients. */
  scheduleInvoice: (id: string, body: { date: string; to?: string; cc?: string }) => Promise<Invoice>
  unscheduleInvoice: (id: string) => Promise<Invoice>
  /** Brings recorded payments in line with a bank statement: per invoice, the payments it replaces and the transfers it shows. */
  reconcileInvoices: (changes: { id: string; void: string[]; add: { amount: number; date: string }[] }[]) => Promise<{ invoices: Invoice[]; skipped: number }>
  /** Emails one client a payment reminder for the given invoices (or just notes one) and marks them reminded. */
  remindInvoices: (reminder: ReminderInput) => Promise<{ invoices: Invoice[]; attached: number }>
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
  const [items, setItems] = useState<CatalogItem[]>([])
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [mail, setMail] = useState<MailState | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) {
      setInvoices([])
      setObligations([])
      setClients([])
      setItems([])
      setProfile(null)
      setMail(null)
      return
    }
    setLoading(true)
    try {
      const snap = await api<{ invoices: Invoice[]; obligations: Obligation[]; clients: ClientRecord[]; items: CatalogItem[]; profile: CompanyProfile }>('/api/sync').catch(async () => {
        const [invRes, profRes, oblRes, clientRes, itemRes] = await Promise.all([
          api<{ invoices: Invoice[] }>('/api/invoices'),
          api<{ profile: CompanyProfile }>('/api/profile'),
          api<{ obligations: Obligation[] }>('/api/obligations').catch(() => ({ obligations: [] as Obligation[] })),
          api<{ clients: ClientRecord[] }>('/api/clients').catch(() => ({ clients: [] as ClientRecord[] })),
          api<{ items: CatalogItem[] }>('/api/items').catch(() => ({ items: [] as CatalogItem[] })),
        ])
        return { invoices: invRes.invoices, obligations: oblRes.obligations, clients: clientRes.clients, items: itemRes.items, profile: profRes.profile }
      })
      setInvoices(snap.invoices || [])
      setObligations(snap.obligations || [])
      setClients(snap.clients || [])
      setItems(snap.items || [])
      setProfile(snap.profile)
      if (isLang(snap.profile?.language)) setLang(snap.profile.language)
      // Loaded on the side: the invoices must appear even if this answer is slow or missing.
      void api<MailState>('/api/mail').then(setMail, () => setMail(null))
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

  const correctInvoice = useCallback(async (id: string, body: { items?: Invoice['items']; discount?: Invoice['discount']; taxRate?: number; notes?: string; date?: string; dueDate?: string; reason: string }) => {
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

  const createItem = useCallback(async (item: Omit<CatalogItem, 'id' | 'createdAt'>) => {
    const res = await api<{ item: CatalogItem }>('/api/items', { method: 'POST', body: item })
    setItems((prev) => [res.item, ...prev.filter((row) => row.id !== res.item.id)])
    return res.item
  }, [])

  const updateItem = useCallback(async (id: string, item: Partial<CatalogItem>) => {
    const res = await api<{ item: CatalogItem }>(`/api/items/${id}`, { method: 'PUT', body: item })
    setItems((prev) => prev.map((row) => (row.id === id ? res.item : row)))
    return res.item
  }, [])

  const removeItem = useCallback(async (id: string) => {
    await api(`/api/items/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((row) => row.id !== id))
  }, [])

  const shareInvoice = useCallback(async (id: string) => {
    const res = await api<{ token: string }>(`/api/invoices/${id}/share`, { method: 'POST', body: {} })
    setInvoices((prev) => prev.map((item) => (item.id === id ? { ...item, shareToken: res.token } : item)))
    return res.token
  }, [])

  const markInvoicesPaid = useCallback(
    async (ids: string[], date?: string) => {
      const res = await api<{ paid: number; skipped: number }>('/api/invoices/mark-paid', { method: 'POST', body: { ids, date } })
      await refresh()
      return res
    },
    [refresh],
  )

  const importInvoices = useCallback(
    async (payload: unknown) => {
      const res = await api<{ created: number; clientsCreated: number; skipped: { number: string; reason: string }[] }>('/api/invoices/import', { method: 'POST', body: payload })
      await refresh()
      return res
    },
    [refresh],
  )

  const saveProfile = useCallback(async (next: Partial<CompanyProfile>) => {
    const res = await api<{ profile: CompanyProfile }>('/api/profile', { method: 'PUT', body: next })
    setProfile(res.profile)
    if (isLang(res.profile.language)) setLang(res.profile.language)
    return res.profile
  }, [setLang])

  const saveMail = useCallback(async (box: MailBox, settings: MailSettingsInput) => {
    const res = await api<MailState>(box === 'personal' ? '/api/mail/personal' : '/api/mail', { method: 'PUT', body: settings })
    setMail(res)
    return res
  }, [])

  const removeMail = useCallback(async (box: MailBox) => {
    const res = await api<MailState>(box === 'personal' ? '/api/mail/personal' : '/api/mail', { method: 'DELETE' })
    setMail(res)
    return res
  }, [])

  const testMail = useCallback(async (message: { box: MailBox; subject: string; body: string }) => {
    const res = await api<{ to: string } & MailState>('/api/mail/test', { method: 'POST', body: message })
    // A delivered test also proves a connection that was saved before saving checked it.
    if (res.mail && res.personal) setMail({ mail: res.mail, personal: res.personal, from: res.from || [], pdf: Boolean(res.pdf) })
    return res
  }, [])

  const sendInvoiceEmail = useCallback(async (id: string, message: InvoiceEmailInput) => {
    const res = await api<{ invoice: Invoice; attached: boolean }>(`/api/invoices/${id}/send`, { method: 'POST', body: message })
    setInvoices((prev) => prev.map((item) => (item.id === id ? res.invoice : item)))
    return res
  }, [])

  const replaceInvoice = useCallback((invoice: Invoice) => {
    setInvoices((prev) => prev.map((item) => (item.id === invoice.id ? invoice : item)))
    return invoice
  }, [])

  const deliverInvoice = useCallback(
    async (id: string) => {
      try {
        const res = await api<{ invoice: Invoice }>(`/api/invoices/${id}/deliver`, { method: 'POST', body: {} })
        return replaceInvoice(res.invoice)
      } catch (err) {
        // The failure is noted on the invoice; show it as it now is.
        await api<{ invoice: Invoice }>(`/api/invoices/${id}`).then((res) => replaceInvoice(res.invoice), () => undefined)
        throw err
      }
    },
    [replaceInvoice],
  )

  const scheduleInvoice = useCallback(
    async (id: string, body: { date: string; to?: string; cc?: string }) =>
      replaceInvoice((await api<{ invoice: Invoice }>(`/api/invoices/${id}/schedule`, { method: 'PUT', body })).invoice),
    [replaceInvoice],
  )

  const unscheduleInvoice = useCallback(
    async (id: string) => replaceInvoice((await api<{ invoice: Invoice }>(`/api/invoices/${id}/schedule`, { method: 'DELETE' })).invoice),
    [replaceInvoice],
  )

  const reconcileInvoices = useCallback(async (changes: { id: string; void: string[]; add: { amount: number; date: string }[] }[]) => {
    const res = await api<{ invoices: Invoice[]; skipped: number }>('/api/invoices/reconcile', { method: 'POST', body: { changes } })
    const updated = new Map(res.invoices.map((item) => [item.id, item]))
    setInvoices((prev) => prev.map((item) => updated.get(item.id) || item))
    return res
  }, [])

  const remindInvoices = useCallback(async (reminder: ReminderInput) => {
    const res = await api<{ invoices: Invoice[]; attached: number }>('/api/invoices/remind', { method: 'POST', body: reminder })
    const updated = new Map(res.invoices.map((item) => [item.id, item]))
    setInvoices((prev) => prev.map((item) => updated.get(item.id) || item))
    return res
  }, [])

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
      items,
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
      createItem,
      updateItem,
      removeItem,
      importInvoices,
      markInvoicesPaid,
      shareInvoice,
      saveProfile,
      mail,
      saveMail,
      removeMail,
      testMail,
      sendInvoiceEmail,
      deliverInvoice,
      scheduleInvoice,
      unscheduleInvoice,
      remindInvoices,
      reconcileInvoices,
      downloadBackup,
      restoreBackup,
    }),
    [
      invoices,
      obligations,
      clients,
      items,
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
      createItem,
      updateItem,
      removeItem,
      importInvoices,
      markInvoicesPaid,
      shareInvoice,
      saveProfile,
      mail,
      saveMail,
      removeMail,
      testMail,
      sendInvoiceEmail,
      deliverInvoice,
      scheduleInvoice,
      unscheduleInvoice,
      remindInvoices,
      reconcileInvoices,
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
