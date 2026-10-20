import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, ChevronDown, CreditCard, Copy, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { clientDisplayName } from '../../lib/client'
import { deliveryErrorText, printDay, printMoment } from '../../lib/delivery'
import { computeTotals, formatMoney, type InvoiceItem } from '../../lib/invoice'
import { FREQUENCIES, type PlanInput, type PlanView, type RecurringState } from '../../lib/recurring'
import { canManageCompany } from '../../lib/team'
import { Button, Card, Field, Modal, Select, TextArea } from '../../components/ui'

function planTotal(plan: { items: PlanInput['items']; discount: number | string; taxRate: number | string }) {
  const items: InvoiceItem[] = plan.items.map((item, i) => ({ id: String(i), description: item.description, quantity: String(item.quantity), unitPrice: String(item.unitPrice) }))
  return computeTotals(items, plan.discount, plan.taxRate).total
}

function blankPlan(currency: string, taxRate: number): PlanInput {
  return {
    clientId: '',
    product: '',
    kind: 'auto',
    items: [{ description: '', quantity: 1, unitPrice: '' }],
    discount: 0,
    taxRate,
    currency,
    frequency: 'monthly',
    anchorDate: '',
    endDate: '',
    sendDaysBefore: 7,
    dueDays: 7,
    graceDays: 7,
    lang: '',
    to: '',
    cc: '',
    from: '',
    paymentUrl: '',
    notes: '',
    sendMode: 'auto',
    active: true,
  }
}

function toInput(plan: PlanView): PlanInput {
  return { ...plan, to: plan.to.join(', '), cc: plan.cc.join(', '), sendMode: plan.sendMode || 'auto' }
}

function errorText(err: unknown, t: (key: string) => string) {
  const code = (err as { code?: string } | null)?.code
  if (code) {
    const key = `recurring.err.${code}`
    const text = t(key)
    if (text !== key) return text
  }
  return err instanceof Error ? err.message : t('common.error')
}

/** Recurring invoices: the plans, the notifications the company gets, and card payments by Stripe. */
export function RecurringPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const { clients, profile, mail, refresh } = useAppData()
  const { t } = useI18n()
  const manager = canManageCompany(user)
  const [state, setState] = useState<RecurringState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<PlanInput | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await api<RecurringState>('/api/recurring'))
    } catch (err) {
      setLoadError(errorText(err, t))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const message = await action()
      if (message) setNotice(message)
      return true
    } catch (err) {
      setError(errorText(err, t))
      return false
    } finally {
      setBusy('')
    }
  }

  const clientName = useCallback((id: string) => clientDisplayName(clients.find((item) => item.id === id)) || '—', [clients])
  const sortedClients = useMemo(() => [...clients].sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b))), [clients])

  if (loadError) return <p className="text-sm text-[#C0503A]">{loadError}</p>
  if (!state) return <p className="text-brand-ink/60">{t('common.loading')}</p>

  const currency = profile?.currency || 'EUR'

  function openNew() {
    setEditingId(null)
    setError('')
    setForm(blankPlan(currency, profile?.defaultTaxRate ?? 18))
  }

  function openEdit(plan: PlanView) {
    setEditingId(plan.id)
    setError('')
    setForm(toInput(plan))
  }

  function setField<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    void run('save', async () => {
      const body = { ...form, items: form.items.filter((item) => String(item.description).trim()) }
      const res = editingId
        ? await api<RecurringState>(`/api/recurring/${editingId}`, { method: 'PUT', body })
        : await api<RecurringState>('/api/recurring', { method: 'POST', body })
      setState(res)
      setForm(null)
      // A period due now has been made at once; the invoice list shows it.
      void refresh()
      return t('recurring.saved')
    })
  }

  function patchPlan(plan: PlanView, body: Record<string, unknown>) {
    return run(`plan:${plan.id}`, async () => {
      setState(await api<RecurringState>(`/api/recurring/${plan.id}`, { method: 'PUT', body }))
      void refresh()
    })
  }

  function removePlan(plan: PlanView) {
    if (!window.confirm(t('recurring.removeConfirm'))) return
    void run(`plan:${plan.id}`, async () => setState(await api<RecurringState>(`/api/recurring/${plan.id}`, { method: 'DELETE' })))
  }

  const badge = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold'

  return (
    <div className={embedded ? 'min-w-0' : 'mx-auto max-w-[1180px]'}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {embedded ? (
            <h2 className="text-xl font-semibold tracking-tight">{t('recurring.title')}</h2>
          ) : (
            <h1 className="font-display text-4xl font-medium tracking-tight">{t('recurring.title')}</h1>
          )}
          <p className={cn('max-w-2xl text-sm leading-6 text-brand-ink/55', embedded ? 'mt-1' : 'mt-2')}>{t('recurring.subtitle')}</p>
        </div>
        <Button type="button" onClick={openNew}>
          <Plus className="h-4 w-4" />
          {t('recurring.add')}
        </Button>
      </div>

      {mail && !mail.mail.ready ? (
        <p className="mt-5 rounded-xl bg-[#FFF6E5] px-4 py-3 text-sm text-[#8A5A00]">
          {t('recurring.mailMissing')}{' '}
          <Link to="/app/profile#email" className="font-semibold underline underline-offset-2">
            {t('send.connectAction')}
          </Link>
        </p>
      ) : null}

      <div role="status" aria-live="polite">
        {notice ? (
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-brand/8 px-4 py-3 text-sm font-semibold text-brand">
            <Check className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        ) : null}
        {error && !form ? <p className="mt-5 rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm font-medium text-[#C0503A]">{error}</p> : null}
      </div>

      <div className={cn('grid items-start gap-6', embedded ? 'mt-6' : 'mt-8', manager && (embedded ? '2xl:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1fr)_360px]'))}>
        <div className="min-w-0 space-y-4">
          {state.plans.length === 0 ? (
            <Card>
              <p className="text-sm leading-6 text-brand-ink/60">{t('recurring.empty')}</p>
            </Card>
          ) : null}
          {state.plans.map((plan) => {
            const total = planTotal(plan)
            const sub = plan.subscription
            const expanded = open === plan.id
            return (
              <Card key={plan.id} className="p-0">
                <div className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                        <Repeat className="h-4 w-4 shrink-0 text-brand" />
                        <span className="min-w-0 truncate">{plan.productName || plan.items[0]?.description}</span>
                        {!plan.active ? <span className={cn(badge, 'bg-brand-ink/6 text-brand-ink/55')}>{t('recurring.paused')}</span> : null}
                        {sub ? (
                          <span
                            className={cn(
                              badge,
                              sub.state === 'active' ? 'bg-brand/10 text-brand' : sub.state === 'grace' ? 'bg-[#FFF6E5] text-[#8A5A00]' : 'bg-[#F8E8E4] text-[#C0503A]',
                            )}
                          >
                            {sub.state === 'active'
                              ? t('recurring.subActive', { date: printDay(sub.expires) })
                              : sub.state === 'grace'
                                ? t('recurring.subGrace', { date: printDay(sub.graceEnds) })
                                : t('recurring.subExpired', { date: printDay(sub.expires) })}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-brand-ink/60">
                        {clientName(plan.clientId)} · {t(`recurring.${plan.frequency}`)} ·{' '}
                        <span className="font-semibold text-brand-ink">{formatMoney(total, plan.currency)}</span> {t('recurring.perPeriod')}
                      </p>
                      <p className="mt-1 text-xs text-brand-ink/50">
                        {plan.active && plan.next ? t(plan.sendMode === 'manual' ? 'recurring.nextManual' : 'recurring.next', { from: printDay(plan.next.start), to: printDay(plan.next.end), date: printDay(plan.next.sendOn) }) : plan.active ? t('recurring.noNext') : null}
                      </p>
                      {plan.lastError ? <p className="mt-1 text-xs text-[#C0503A]">{t('recurring.lastError', { error: deliveryErrorText(plan.lastError, t) })}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy !== ''} onClick={() => openEdit(plan)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t('recurring.edit')}
                      </Button>
                      <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy !== ''} onClick={() => void patchPlan(plan, { active: !plan.active })}>
                        {plan.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {plan.active ? t('recurring.pause') : t('recurring.resume')}
                      </Button>
                      <Button type="button" variant="danger" className="px-2.5 py-1.5 text-xs" disabled={busy !== ''} onClick={() => removePlan(plan)} aria-label={t('recurring.remove')} title={t('recurring.remove')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : plan.id)}
                    aria-expanded={expanded}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} />
                    {t('recurring.planInvoices')} ({plan.invoices.length}) · {t('recurring.history')}
                  </button>
                </div>
                {expanded ? (
                  <div className="grid gap-4 border-t border-brand-ink/8 px-5 py-4 sm:px-6 lg:grid-cols-2">
                    <ul className="space-y-1.5 text-sm">
                      {plan.invoices.length === 0 ? <li className="text-brand-ink/50">—</li> : null}
                      {plan.invoices.map((invoice) => (
                        <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2">
                          <Link to={invoice.lifecycle === 'draft' ? `/app/invoices/${invoice.id}/edit` : `/app/invoices/${invoice.id}`} className="font-semibold text-brand hover:underline">
                            {invoice.lifecycle === 'draft' ? t('recurring.delivery.draft') : invoice.number}
                          </Link>
                          <span className="text-xs text-brand-ink/55">
                            {printDay(invoice.period)} – {printDay(invoice.periodEnd)}
                          </span>
                          <span className="text-xs font-semibold">
                            {invoice.delivery?.status ? t(`recurring.delivery.${invoice.delivery.status === 'scheduled' ? 'scheduled' : invoice.delivery.status === 'cancelled' ? 'notScheduled' : invoice.delivery.status}`) : ''} ·{' '}
                            {invoice.status === 'paid' ? t('invoiceList.statusPaid') : t('invoiceList.statusUnpaid')}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <ol className="space-y-1 text-xs text-brand-ink/60">
                      {[...(plan.history || [])].reverse().slice(0, 12).map((entry, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="shrink-0 tabular-nums text-brand-ink/40">{printMoment(entry.at).slice(0, 10)}</span>
                          <span>
                            {t(`recurring.events.${entry.type}`, {
                              period: printDay(String(entry.detail?.period || '')),
                              error: deliveryErrorText(String(entry.detail?.code || ''), t),
                            })}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>

        {manager ? (
          <aside className="space-y-6">
            <NotificationsCard state={state} onSaved={setState} />
            <StripeCard state={state} onSaved={setState} />
          </aside>
        ) : null}
      </div>

      {form ? (
        <Modal title={t('recurring.editTitle')} onClose={() => setForm(null)}>
          <form onSubmit={onSave} className="space-y-1 bg-white p-6">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Select label={t('recurring.client')} value={form.clientId} required onChange={(e) => setField('clientId', e.target.value)}>
                <option value="">{t('recurring.chooseClient')}</option>
                {sortedClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {clientDisplayName(client)}
                  </option>
                ))}
              </Select>
              <Field label={t('recurring.product')} value={form.product} onChange={(e) => setField('product', e.target.value)} />
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('recurring.items')}</p>
            <div className="mb-5 space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_72px_120px_auto] items-center gap-2">
                  <input
                    aria-label={t('recurring.description')}
                    placeholder={t('recurring.description')}
                    value={item.description}
                    onChange={(e) => setField('items', form.items.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)))}
                    className="w-full rounded-xl border border-brand-ink/10 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <input
                    aria-label={t('recurring.quantity')}
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => setField('items', form.items.map((row, i) => (i === index ? { ...row, quantity: e.target.value } : row)))}
                    className="w-full rounded-xl border border-brand-ink/10 px-3 py-2 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <input
                    aria-label={t('recurring.price')}
                    placeholder={t('recurring.price')}
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(e) => setField('items', form.items.map((row, i) => (i === index ? { ...row, unitPrice: e.target.value } : row)))}
                    className="w-full rounded-xl border border-brand-ink/10 px-3 py-2 text-right text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <button
                    type="button"
                    aria-label={t('recurring.removeLine')}
                    disabled={form.items.length === 1}
                    onClick={() => setField('items', form.items.filter((_, i) => i !== index))}
                    className="rounded-lg p-2 text-brand-ink/40 hover:bg-red-50 hover:text-[#C0503A] disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setField('items', [...form.items, { description: '', quantity: 1, unitPrice: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                  <Plus className="h-4 w-4" />
                  {t('recurring.addLine')}
                </button>
                <span className="text-sm">
                  {t('recurring.amount')}: <strong>{formatMoney(planTotal(form), form.currency)}</strong>
                </span>
              </div>
            </div>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <Field label={t('recurring.taxRate')} inputMode="decimal" value={String(form.taxRate)} onChange={(e) => setField('taxRate', e.target.value as unknown as number)} />
              <Select label={t('recurring.frequency')} value={form.frequency} onChange={(e) => setField('frequency', e.target.value as PlanInput['frequency'])}>
                {FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`recurring.${value}`)}
                  </option>
                ))}
              </Select>
              <Field label={t('recurring.anchor')} type="date" required value={form.anchorDate} onChange={(e) => setField('anchorDate', e.target.value)} />
            </div>
            <p className="-mt-2 mb-4 text-xs leading-5 text-brand-ink/50">{t('recurring.anchorHint')}</p>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <Field label={t('recurring.sendDaysBefore')} type="number" min={0} max={90} value={form.sendDaysBefore} onChange={(e) => setField('sendDaysBefore', Number(e.target.value))} />
              <Field label={t('recurring.dueDays')} type="number" min={0} max={120} value={form.dueDays} onChange={(e) => setField('dueDays', Number(e.target.value))} />
              <Field label={t('recurring.graceDays')} type="number" min={0} max={60} value={form.graceDays} onChange={(e) => setField('graceDays', Number(e.target.value))} />
            </div>
            <p className="-mt-2 mb-4 text-xs leading-5 text-brand-ink/50">{t('recurring.graceHint')}</p>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Select label={t('recurring.sendMode')} value={form.sendMode || 'auto'} onChange={(e) => setField('sendMode', e.target.value as PlanInput['sendMode'])}>
                <option value="auto">{t('recurring.sendAuto')}</option>
                <option value="manual">{t('recurring.sendManual')}</option>
              </Select>
              <Select label={t('recurring.kind')} value={form.kind} onChange={(e) => setField('kind', e.target.value as PlanInput['kind'])}>
                <option value="auto">{t('recurring.kindAuto')}</option>
                <option value="subscription">{t('recurring.kindSubscription')}</option>
                <option value="invoice">{t('recurring.kindInvoice')}</option>
              </Select>
              <Select label={t('recurring.lang')} value={form.lang} onChange={(e) => setField('lang', e.target.value as PlanInput['lang'])}>
                <option value="">{t('recurring.langClient')}</option>
                <option value="sq">Shqip</option>
                <option value="en">English</option>
                <option value="it">Italiano</option>
              </Select>
              <Field label={t('recurring.to')} inputMode="email" value={form.to} placeholder={t('recurring.toHint')} onChange={(e) => setField('to', e.target.value)} />
              <Field label={t('recurring.cc')} inputMode="email" value={form.cc} placeholder={t('send.ccPlaceholder')} onChange={(e) => setField('cc', e.target.value)} />
              <Field label={t('recurring.paymentUrl')} type="url" value={form.paymentUrl} placeholder="https://" onChange={(e) => setField('paymentUrl', e.target.value)} />
              <Field label={t('recurring.endDate')} type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} />
            </div>
            <p className="-mt-2 mb-4 text-xs leading-5 text-brand-ink/50">{t('recurring.paymentUrlHint')}</p>
            <TextArea label={t('recurring.notes')} rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />

            {error ? <p className="pt-3 text-sm text-[#C0503A]">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy !== ''}>
                {busy === 'save' ? t('common.loading') : t('recurring.save')}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function NotificationsCard({ state, onSaved }: { state: RecurringState; onSaved: (next: RecurringState) => void }) {
  const { t } = useI18n()
  const [emails, setEmails] = useState(state.settings.notifyEmails.join(', '))
  const [sent, setSent] = useState(state.settings.notifySent)
  const [paid, setPaid] = useState(state.settings.notifyPaid)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setMessage('')
    try {
      onSaved(await api<RecurringState>('/api/recurring/settings', { method: 'PUT', body: { notifyEmails: emails, notifySent: sent, notifyPaid: paid } }))
      setMessage(t('recurring.settingsSaved'))
    } catch (err) {
      setMessage(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Bell className="h-4 w-4 text-brand" />
        {t('recurring.notifyTitle')}
      </h2>
      <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('recurring.notifyHint')}</p>
      <div className="mt-4">
        <Field label={t('recurring.notifyEmails')} inputMode="email" value={emails} placeholder={t('recurring.notifyEmailsHint')} onChange={(e) => setEmails(e.target.value)} />
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} className="h-4 w-4 accent-[#2C6E7F]" />
          {t('recurring.notifySent')}
        </label>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[#2C6E7F]" />
          {t('recurring.notifyPaid')}
        </label>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void save()}>
          {t('recurring.saveSettings')}
        </Button>
        {message ? <p className="mt-2 text-sm text-brand-ink/70">{message}</p> : null}
      </div>
    </Card>
  )
}

function StripeCard({ state, onSaved }: { state: RecurringState; onSaved: (next: RecurringState) => void }) {
  const { t } = useI18n()
  const stripe = state.settings.stripe
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function call(method: 'PUT' | 'DELETE') {
    setBusy(true)
    setMessage('')
    try {
      onSaved(await api<RecurringState>('/api/recurring/stripe', { method, body: method === 'PUT' ? { secretKey, webhookSecret } : undefined }))
      setSecretKey('')
      setWebhookSecret('')
      setMessage(method === 'PUT' ? t('recurring.stripeSaved') : '')
    } catch (err) {
      setMessage(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CreditCard className="h-4 w-4 text-brand" />
          {t('recurring.stripeTitle')}
        </h2>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', stripe.ready ? 'bg-brand/10 text-brand' : 'bg-brand-ink/6 text-brand-ink/55')}>
          {stripe.ready ? `${t('recurring.stripeConnected')}${stripe.mode === 'test' ? ` · ${t('recurring.stripeTest')}` : ''}` : t('recurring.stripeNotConnected')}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('recurring.stripeHint')}</p>
      <div className="mt-4">
        <Field label={t('recurring.stripeSecret')} type="password" autoComplete="off" value={secretKey} placeholder={stripe.ready ? t('recurring.stripeKeySaved') : 'sk_live_…'} onChange={(e) => setSecretKey(e.target.value)} />
        <Field label={t('recurring.stripeWebhookSecret')} type="password" autoComplete="off" value={webhookSecret} placeholder={stripe.ready ? t('recurring.stripeKeySaved') : 'whsec_…'} onChange={(e) => setWebhookSecret(e.target.value)} />
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('recurring.stripeWebhookUrl')}</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-brand-bg px-3 py-2 text-xs">{stripe.webhookUrl}</code>
          <button
            type="button"
            aria-label={t('send.copyLink')}
            onClick={() =>
              void navigator.clipboard.writeText(stripe.webhookUrl).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              })
            }
            className="rounded-lg p-2 text-brand hover:bg-brand/10"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-brand-ink/50">{t('recurring.stripeWebhookHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || (!stripe.ready && (!secretKey || !webhookSecret)) || (stripe.ready && !secretKey && !webhookSecret)} onClick={() => void call('PUT')}>
            {t('recurring.stripeSave')}
          </Button>
          {stripe.ready ? (
            <Button type="button" variant="danger" disabled={busy} onClick={() => void call('DELETE')}>
              {t('recurring.stripeRemove')}
            </Button>
          ) : null}
        </div>
        {message ? <p className="mt-2 text-sm text-brand-ink/70">{message}</p> : null}
      </div>
    </Card>
  )
}
