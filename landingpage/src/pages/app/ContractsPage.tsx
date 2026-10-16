import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleCheck, Copy, Download, Eye, FileSignature, FileText, Loader2, Plus, RotateCcw, Search, Trash2, Upload, UserPlus, Users, FileSpreadsheet } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Field, Modal, Select, TextArea } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/invoice'
import { composeClient } from '../../lib/client'
import type { ClientRecord } from '../../lib/document'
import { planContractImport, type ContractImportPlan } from '../../lib/contractImport'
import { readAnyWorkbook } from '../../lib/serverFinance'
import {
  ACCEPT,
  addMonths,
  contractBlob,
  contractState,
  contractText,
  createContract,
  daysBetween,
  deleteContract,
  downloadContract,
  fileKind,
  lastDay,
  importContracts,
  listContracts,
  readContractAgain,
  replaceContractFile,
  shortDate,
  today,
  updateContract,
  type Contract,
  type ContractFields,
  type ContractState,
} from '../../lib/contracts'

type T = (key: string, params?: Record<string, string | number>) => string
type Tab = 'active' | 'completed' | 'all'

const STATE_STYLE: Record<ContractState, string> = {
  active: 'bg-[#E6F4EC] text-[#1F7A4A]',
  expiring: 'bg-[#FDF1DC] text-[#9A6412]',
  expired: 'bg-[#F8E8E4] text-[#B0472F]',
  upcoming: 'bg-[#E8EEF8] text-[#3A5A93]',
  maintenance: 'bg-[#E3F1F2] text-[#1F6670]',
  completed: 'bg-brand-ink/6 text-brand-ink/55',
}

function errorText(t: T, err: unknown) {
  const code = (err as { code?: string })?.code
  if (code) {
    const known = t(`contracts.err.${code}`, { name: (err as { detail?: string })?.detail || '' })
    if (known !== `contracts.err.${code}`) return known
  }
  return (err as Error)?.message || t('common.error')
}

function contractName(contract: Contract) {
  return contract.title || contract.number || contract.file?.name || '—'
}

function sizeText(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function ContractsPage() {
  const { t } = useI18n()
  const { profile, clients } = useAppData()
  const currency = profile?.currency || 'EUR'
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Contract | 'new' | null>(null)
  const [previewing, setPreviewing] = useState<Contract | null>(null)
  const [importing, setImporting] = useState(false)
  const [asking, setAsking] = useState<{ kind: 'delete' | 'complete'; contract: Contract } | null>(null)
  const [imported, setImported] = useState<{ added: number; skipped: number } | null>(null)

  const refresh = useCallback(async () => {
    try {
      setContracts(await listContracts())
    } catch (err) {
      setNotice(errorText(t, err))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A document being read fills its contract in a few seconds; look again until it is done.
  const reading = contracts.some((item) => item.reading?.state === 'pending')
  useEffect(() => {
    if (!reading) return
    const timer = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(timer)
  }, [reading, refresh])

  const upsert = useCallback((contract: Contract) => {
    setContracts((list) => (list.some((item) => item.id === contract.id) ? list.map((item) => (item.id === contract.id ? contract : item)) : [contract, ...list]))
  }, [])

  const drop = useCallback((id: string) => setContracts((list) => list.filter((item) => item.id !== id)), [])

  const on = today()
  const counts = useMemo(() => {
    const open = contracts.filter((item) => item.status !== 'completed')
    const states = open.map((item) => contractState(item, on))
    return {
      active: open.length,
      completed: contracts.length - open.length,
      expiring: states.filter((state) => state === 'expiring').length,
      expired: states.filter((state) => state === 'expired').length,
    }
  }, [contracts, on])

  const clientName = useMemo(() => new Map(clients.map((client) => [client.id, client.fullName])), [clients])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = contracts.filter((item) => (tab === 'all' ? true : tab === 'completed' ? item.status === 'completed' : item.status !== 'completed'))
    const found = q
      ? rows.filter((item) => [item.title, item.number, item.reference, item.counterparty, clientName.get(item.clientId), item.type, item.summary, item.file?.name].join(' ').toLowerCase().includes(q))
      : rows
    // Open contracts by the day they end, soonest first; finished ones by when they were finished.
    return [...found].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'completed' ? 1 : -1
      if (a.status === 'completed') return String(b.completedAt || '').localeCompare(String(a.completedAt || ''))
      return (lastDay(a) || '9999').localeCompare(lastDay(b) || '9999') || b.createdAt.localeCompare(a.createdAt)
    })
  }, [contracts, tab, query, clientName])

  async function act(run: () => Promise<void>) {
    try {
      setNotice('')
      await run()
    } catch (err) {
      setNotice(errorText(t, err))
    }
  }

  function setCompleted(contract: Contract, completed: boolean) {
    if (completed) setAsking({ kind: 'complete', contract })
    else void act(async () => upsert(await updateContract(contract.id, { status: 'active' })))
  }

  async function confirmAsked() {
    if (!asking) return
    const { kind, contract } = asking
    await act(async () => {
      if (kind === 'complete') upsert(await updateContract(contract.id, { status: 'completed' }))
      else {
        await deleteContract(contract.id)
        drop(contract.id)
      }
    })
    setAsking(null)
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'active', label: t('contracts.tabActive'), count: counts.active },
    { key: 'completed', label: t('contracts.tabCompleted'), count: counts.completed },
    { key: 'all', label: t('contracts.tabAll'), count: contracts.length },
  ]

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('contracts.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('contracts.intro')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setImporting(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            {t('contracts.importExcel')}
          </Button>
          <Button type="button" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('contracts.add')}
          </Button>
        </div>
      </div>

      {notice ? <p className="mt-6 rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm text-[#B0472F]">{notice}</p> : null}
      {imported != null ? <p className="mt-6 rounded-xl bg-[#E6F4EC] px-4 py-3 text-sm text-[#1F6A42]">{t('contracts.importDone', { count: imported.added })}{imported.skipped ? ` ${t('contracts.importSkipped', { count: imported.skipped })}` : ''}</p> : null}

      {loading && contracts.length === 0 ? <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p> : null}

      {!loading && contracts.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="mt-10 block w-full rounded-2xl border border-dashed border-brand-ink/15 bg-white p-10 text-center transition hover:border-brand/40 hover:bg-brand/5"
        >
          <FileSignature className="mx-auto h-10 w-10 text-brand-ink/30" />
          <p className="mt-4 text-sm font-semibold text-brand-ink/70">{t('contracts.empty')}</p>
          <p className="mt-1 text-sm text-brand-ink/50">{t('contracts.emptyHint')}</p>
        </button>
      ) : null}

      {contracts.length > 0 ? (
        <>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-brand-ink/60">
            <span>{t('contracts.statActive', { count: counts.active })}</span>
            {counts.expiring ? <span className="font-semibold text-[#9A6412]">{t('contracts.statExpiring', { count: counts.expiring })}</span> : null}
            {counts.expired ? <span className="font-semibold text-[#B0472F]">{t('contracts.statExpired', { count: counts.expired })}</span> : null}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 rounded-xl bg-brand-ink/5 p-1">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    tab === item.key ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-ink/55 hover:text-brand-ink',
                  )}
                >
                  {item.label}
                  <span className="ml-1.5 text-xs font-medium text-brand-ink/40">{item.count}</span>
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search')}
                aria-label={t('common.search')}
                className="w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_190px_150px_130px_152px] gap-4 border-b border-brand-ink/8 bg-[#FAFBFB] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40 xl:grid">
              <span>{t('contracts.colContract')}</span>
              <span>{t('contracts.colPeriod')}</span>
              <span className="text-right">{t('contracts.colValue')}</span>
              <span>{t('contracts.colStatus')}</span>
              <span />
            </div>
            {visible.length === 0 ? <p className="px-5 py-8 text-center text-sm text-brand-ink/55">{t('common.noResults')}</p> : null}
            <ul>
              {visible.map((contract) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  party={clientName.get(contract.clientId) || contract.counterparty}
                  on={on}
                  currency={currency}
                  t={t}
                  onOpen={() => setEditing(contract)}
                  onPreview={() => setPreviewing(contract)}
                  onDownload={() => void act(() => downloadContract(contract))}
                  onComplete={(done) => setCompleted(contract, done)}
                  onDelete={() => setAsking({ kind: 'delete', contract })}
                />
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {editing ? (
        <ContractModal
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          contracts={contracts}
          currency={currency}
          onChange={upsert}
          onDiscard={drop}
          onPreview={setPreviewing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {previewing ? <PreviewModal contract={previewing} onClose={() => setPreviewing(null)} /> : null}
      {asking ? (
        <ConfirmModal
          title={asking.kind === 'delete' ? t('contracts.deleteTitle') : t('contracts.completeTitle')}
          name={contractName(asking.contract)}
          message={asking.kind === 'delete' ? t('contracts.deleteMessage') : t('contracts.completeMessage')}
          action={asking.kind === 'delete' ? t('contracts.delete') : t('contracts.complete')}
          danger={asking.kind === 'delete'}
          onConfirm={confirmAsked}
          onClose={() => setAsking(null)}
        />
      ) : null}
      {importing ? (
        <ImportContractsModal
          contracts={contracts}
          onClose={() => setImporting(false)}
          onImported={(list, added, skipped) => {
            setContracts(list)
            setImporting(false)
            setNotice('')
            setImported({ added, skipped })
          }}
        />
      ) : null}
    </div>
  )
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg p-2 text-brand-ink/40 transition disabled:pointer-events-none disabled:opacity-30',
        danger ? 'hover:bg-[#F8E8E4] hover:text-[#C0503A]' : 'hover:bg-brand/8 hover:text-brand-dark',
      )}
    >
      {children}
    </button>
  )
}

function ContractRow({
  contract,
  party,
  on,
  currency,
  t,
  onOpen,
  onPreview,
  onDownload,
  onComplete,
  onDelete,
}: {
  contract: Contract
  party: string
  on: string
  currency: string
  t: T
  onOpen: () => void
  onPreview: () => void
  onDownload: () => void
  onComplete: (done: boolean) => void
  onDelete: () => void
}) {
  const state = contractState(contract, on)
  const pending = contract.reading?.state === 'pending'
  const money = contract.currency || currency
  const number = contract.title ? contract.number : ''

  let period = ''
  if (contract.startDate && contract.endDate) period = `${shortDate(contract.startDate)} – ${shortDate(contract.endDate)}`
  else if (contract.endDate) period = t('contracts.until', { date: shortDate(contract.endDate) })
  else if (contract.startDate) period = t('contracts.from', { date: shortDate(contract.startDate) })

  let periodNote = ''
  if (state === 'completed' && contract.completedAt) periodNote = t('contracts.completedOn', { date: shortDate(contract.completedAt) })
  else if (state === 'expired') periodNote = t('contracts.endedAgo', { days: daysBetween(lastDay(contract), on) })
  else if (lastDay(contract) && state !== 'upcoming') periodNote = t('contracts.daysLeft', { days: daysBetween(on, lastDay(contract)) })
  const maintenanceNote = contract.maintenanceEndDate && contract.maintenanceEndDate > (contract.endDate || '') ? t('contracts.maintenanceUntil', { date: shortDate(contract.maintenanceEndDate) }) : ''

  const valueNote = [
    contract.monthlyValue ? t('contracts.perMonth', { amount: formatMoney(contract.monthlyValue, money) }) : '',
    contract.vatIncluded === true ? t('contracts.withVat') : contract.vatIncluded === false ? t('contracts.withoutVat') : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="flex flex-col gap-1 border-b border-brand-ink/5 pr-2 last:border-0 hover:bg-brand-bg/60 xl:flex-row xl:items-center">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOpen()
          }
        }}
        className="grid min-w-0 flex-1 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 pt-3.5 text-left xl:grid-cols-[minmax(0,1fr)_190px_150px_130px] xl:py-3.5"
      >
        <span className="col-start-1 row-start-1 flex min-w-0 items-start gap-3 xl:col-start-auto xl:row-start-auto">
          <FileText className={cn('mt-0.5 h-5 w-5 shrink-0', contract.file ? 'text-brand' : 'text-brand-ink/25')} />
          <span className="min-w-0">
            <span className="flex items-start gap-1">
              <span className="line-clamp-2 font-semibold text-brand-ink xl:line-clamp-1">{contractName(contract)}</span>
              <CopyButton text={contractName(contract)} label={t('contracts.copyName')} copied={t('contracts.copied')} />
            </span>
            {number || party ? (
              <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                {number ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-semibold tabular-nums text-brand">{number}</span>
                    <CopyButton text={number} label={t('contracts.copyNumber')} copied={t('contracts.copied')} />
                  </span>
                ) : null}
                {party ? <span className="truncate font-medium text-[#4A5BA8]">{party}</span> : null}
              </span>
            ) : null}
            {pending ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('contracts.reading')}
              </span>
            ) : null}
          </span>
        </span>
        <span className="col-start-1 row-start-2 pl-8 text-sm text-brand-ink/70 xl:col-start-auto xl:row-start-auto xl:pl-0">
          <span className="block tabular-nums">{period || '—'}</span>
          {maintenanceNote ? <span className="block text-xs text-[#1F6670]">{maintenanceNote}</span> : null}
          {periodNote ? <span className={cn('block text-xs', state === 'expired' ? 'text-[#B0472F]' : state === 'expiring' ? 'text-[#9A6412]' : 'text-brand-ink/45')}>{periodNote}</span> : null}
        </span>
        <span className="col-start-2 row-start-1 max-w-[8.5rem] text-right text-sm xl:col-start-auto xl:row-start-auto xl:max-w-none">
          <span className="block font-semibold tabular-nums text-brand-ink">{contract.value != null ? formatMoney(contract.value, money) : '—'}</span>
          {valueNote ? <span className="block text-xs text-brand-ink/45">{valueNote}</span> : null}
        </span>
        <span className="col-start-2 row-start-2 justify-self-end xl:col-start-auto xl:row-start-auto xl:justify-self-start">
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', STATE_STYLE[state])}>{t(`contracts.status.${state}`)}</span>
        </span>
      </div>
      <span className="flex shrink-0 items-center justify-end gap-0.5 pb-2 pl-5 xl:w-[152px] xl:pb-0 xl:pl-0">
        <IconButton label={t('contracts.preview')} onClick={onPreview} disabled={!contract.file}>
          <Eye className="h-4 w-4" />
        </IconButton>
        <IconButton label={t('contracts.download')} onClick={onDownload} disabled={!contract.file}>
          <Download className="h-4 w-4" />
        </IconButton>
        {contract.status === 'completed' ? (
          <IconButton label={t('contracts.reopen')} onClick={() => onComplete(false)}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
        ) : (
          <IconButton label={t('contracts.complete')} onClick={() => onComplete(true)}>
            <CircleCheck className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label={t('contracts.delete')} onClick={onDelete} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </span>
    </li>
  )
}

/** A small copy icon beside a name or number; it turns into a tick for a moment once copied. */
function CopyButton({ text, label, copied }: { text: string; label: string; copied: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={done ? copied : label}
      title={done ? copied : label}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      }}
      className={cn('shrink-0 rounded-md p-1 transition', done ? 'text-[#1F7A4A]' : 'text-brand-ink/30 hover:bg-brand/8 hover:text-brand-dark')}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// --- Adding and changing a contract.

const TEXT_KEYS = ['title', 'number', 'reference', 'counterparty', 'counterpartyAddress', 'counterpartyBusinessId', 'clientId', 'type', 'summary', 'paymentTerms', 'signatories', 'notes', 'signedDate', 'startDate', 'endDate', 'maintenanceEndDate', 'currency'] as const
type FormKey = (typeof TEXT_KEYS)[number] | 'value' | 'monthlyValue' | 'maintenanceMonths' | 'vatIncluded'
type Form = Record<FormKey, string>

function formValue(contract: Contract | null, key: FormKey): string {
  if (!contract) return ''
  if (key === 'vatIncluded') return contract.vatIncluded === true ? 'yes' : contract.vatIncluded === false ? 'no' : ''
  if (key === 'value' || key === 'monthlyValue' || key === 'maintenanceMonths') return contract[key] != null ? String(contract[key]) : ''
  return String(contract[key] || '')
}

function formFrom(contract: Contract | null, currency: string): Form {
  const form = {} as Form
  for (const key of [...TEXT_KEYS, 'value', 'monthlyValue', 'maintenanceMonths', 'vatIncluded'] as FormKey[]) form[key] = formValue(contract, key)
  if (!form.currency) form.currency = currency
  return form
}

function fieldsFrom(form: Form): ContractFields {
  const amount = (text: string) => {
    const value = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }
  return {
    title: form.title,
    number: form.number,
    reference: form.reference,
    counterparty: form.counterparty,
    counterpartyAddress: form.counterpartyAddress,
    counterpartyBusinessId: form.counterpartyBusinessId,
    clientId: form.clientId,
    type: form.type,
    summary: form.summary,
    paymentTerms: form.paymentTerms,
    signatories: form.signatories,
    notes: form.notes,
    signedDate: form.signedDate,
    startDate: form.startDate,
    endDate: form.endDate,
    maintenanceMonths: amount(form.maintenanceMonths),
    maintenanceEndDate: form.maintenanceEndDate,
    currency: form.currency,
    value: amount(form.value),
    monthlyValue: amount(form.monthlyValue),
    vatIncluded: form.vatIncluded === 'yes' ? true : form.vatIncluded === 'no' ? false : null,
  }
}

function ContractModal({
  initial,
  contracts,
  currency,
  onChange,
  onDiscard,
  onPreview,
  onClose,
}: {
  initial: Contract | null
  contracts: Contract[]
  currency: string
  onChange: (contract: Contract) => void
  onDiscard: (id: string) => void
  onPreview: (contract: Contract) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [id, setId] = useState(initial?.id || '')
  const [createdHere, setCreatedHere] = useState(false)
  const [form, setForm] = useState<Form>(() => formFrom(initial, currency))
  const [touched, setTouched] = useState<Set<FormKey>>(() => new Set())
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const live = contracts.find((item) => item.id === id) || null
  const readingState = live?.reading?.state

  // When the document has been read, what it found goes into the fields nobody has typed in.
  const merged = useRef('')
  useEffect(() => {
    if (!live || readingState !== 'done') return
    const mark = `${live.id}:${live.reading?.at}`
    if (merged.current === mark) return
    merged.current = mark
    setForm((current) => {
      const next = { ...current }
      for (const key of live.filled as FormKey[]) if (key in next && !touched.has(key)) next[key] = formValue(live, key)
      return next
    })
  }, [live, readingState, touched])

  const set = (key: FormKey) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setTouched((current) => new Set(current).add(key))
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      if (id) {
        onChange(await replaceContractFile(id, file))
      } else {
        // The contract is made as soon as its document is in, so the reading can start at once.
        const typed = fieldsFrom(form)
        const created = await createContract(Object.fromEntries([...touched].map((key) => [key, typed[key as keyof ContractFields]])), file)
        setId(created.id)
        setCreatedHere(true)
        onChange(created)
      }
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setError('')
    setSaving(true)
    try {
      const fields = fieldsFrom(form)
      onChange(id ? await updateContract(id, fields) : await createContract(fields))
      onClose()
    } catch (err) {
      setError(errorText(t, err))
      setSaving(false)
    }
  }

  async function cancel() {
    // A contract that only exists because its document was dropped here goes away with "Cancel".
    if (createdHere && id) {
      await deleteContract(id).catch(() => {})
      onDiscard(id)
    }
    onClose()
  }

  async function retry() {
    if (!id) return
    try {
      onChange(await readContractAgain(id))
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  const fromDoc = (key: FormKey) => Boolean(live?.filled?.includes(key) && !touched.has(key) && form[key])
  const label = (key: FormKey, text: string) => (fromDoc(key) ? `${text} · ${t('contracts.fromDocument')}` : text)
  const file = live?.file || null

  return (
    <Modal
      title={initial ? t('contracts.editTitle') : t('contracts.newTitle')}
      onClose={() => void cancel()}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => void cancel()}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || uploading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-6">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void chooseFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />

        {file ? (
          <div className="rounded-2xl border border-brand-ink/8 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <FileText className="h-8 w-8 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-ink">{file.name}</p>
                <p className="text-xs text-brand-ink/45">{sizeText(file.size)}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => live && onPreview(live)} className="py-2">
                <Eye className="h-4 w-4" />
                {t('contracts.preview')}
              </Button>
              {readingState === 'done' ? (
                <Button type="button" variant="ghost" onClick={() => void retry()} disabled={uploading} className="py-2">
                  <RotateCcw className="h-4 w-4" />
                  {t('contracts.readAgain')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => input.current?.click()} disabled={uploading} className="py-2">
                <Upload className="h-4 w-4" />
                {t('contracts.replaceFile')}
              </Button>
            </div>
            {uploading ? <ReadingNote icon="spin" text={t('contracts.uploading')} /> : null}
            {!uploading && readingState === 'pending' ? <ReadingNote icon="spin" text={t('contracts.readingLong')} /> : null}
            {!uploading && readingState === 'done' && live?.filled?.length ? <ReadingNote icon="done" text={t('contracts.readDone')} /> : null}
            {!uploading && readingState === 'unsupported' ? <ReadingNote icon="warn" text={t('contracts.readUnsupported')} /> : null}
            {!uploading && live?.duplicateOf && contracts.some((item) => item.id === live.duplicateOf) ? (
              <ReadingNote
                icon="warn"
                text={t(createdHere ? 'contracts.duplicateNew' : 'contracts.duplicateOld', { name: contractName(contracts.find((item) => item.id === live.duplicateOf) as Contract) })}
              />
            ) : null}
            {!uploading && readingState === 'failed' ? (
              <ReadingNote icon="warn" text={t('contracts.readFailed')}>
                <button type="button" onClick={() => void retry()} className="font-semibold text-brand underline-offset-2 hover:underline">
                  {t('contracts.readAgain')}
                </button>
              </ReadingNote>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void chooseFile(e.dataTransfer.files?.[0])
            }}
            disabled={uploading}
            className={cn(
              'block w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
              dragging ? 'border-brand bg-brand/8' : 'border-brand-ink/15 bg-white hover:border-brand/40 hover:bg-brand/5',
            )}
          >
            {uploading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" /> : <Upload className="mx-auto h-8 w-8 text-brand-ink/35" />}
            <p className="mt-3 text-sm font-semibold text-brand-ink/75">{uploading ? t('contracts.uploading') : t('contracts.drop')}</p>
            <p className="mt-1 text-xs text-brand-ink/45">{t('contracts.dropHint')}</p>
          </button>
        )}

        {error ? <p className="rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm text-[#B0472F]">{error}</p> : null}

        <Section title={t('contracts.sectionMain')}>
          <Field label={label('title', t('contracts.field.title'))} value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder={t('contracts.phTitle')} wrapperClassName="sm:col-span-2" />
          <Field label={label('number', t('contracts.field.number'))} value={form.number} onChange={(e) => set('number')(e.target.value)} />
          <Field label={label('reference', t('contracts.field.reference'))} value={form.reference} onChange={(e) => set('reference')(e.target.value)} />
          <ClientPicker
            form={form}
            fromDocument={fromDoc('counterparty')}
            matched={fromDoc('clientId')}
            onPick={(client) => {
              set('clientId')(client.id)
              // The name the document gives stays; it is shown beside the client it was linked to.
              if (!form.counterparty) set('counterparty')(client.fullName)
            }}
            onType={(text) => {
              set('clientId')('')
              set('counterparty')(text)
            }}
          />
          <Field label={label('type', t('contracts.field.type'))} value={form.type} onChange={(e) => set('type')(e.target.value)} placeholder={t('contracts.phType')} />
        </Section>

        <Section title={t('contracts.sectionDates')} columns={3}>
          <Field type="date" label={label('signedDate', t('contracts.field.signedDate'))} value={form.signedDate} onChange={(e) => set('signedDate')(e.target.value)} />
          <Field type="date" label={label('startDate', t('contracts.field.startDate'))} value={form.startDate} onChange={(e) => set('startDate')(e.target.value)} />
          <Field type="date" label={label('endDate', t('contracts.field.endDate'))} value={form.endDate} onChange={(e) => set('endDate')(e.target.value)} />
        </Section>

        <Section title={t('contracts.sectionMaintenance')}>
          <Field
            inputMode="numeric"
            label={label('maintenanceMonths', t('contracts.field.maintenanceMonths'))}
            value={form.maintenanceMonths}
            onChange={(e) => {
              set('maintenanceMonths')(e.target.value)
              // Counted from the end of the work, until a day is set by hand.
              const months = parseInt(e.target.value, 10)
              if (!touched.has('maintenanceEndDate') && form.endDate && months > 0) setForm((current) => ({ ...current, maintenanceEndDate: addMonths(current.endDate, months) }))
            }}
          />
          <Field type="date" label={label('maintenanceEndDate', t('contracts.field.maintenanceEndDate'))} value={form.maintenanceEndDate} onChange={(e) => set('maintenanceEndDate')(e.target.value)} />
        </Section>

        <Section title={t('contracts.sectionValue')}>
          <Field inputMode="decimal" label={label('value', t('contracts.field.value'))} value={form.value} onChange={(e) => set('value')(e.target.value)} />
          <Field inputMode="decimal" label={label('monthlyValue', t('contracts.field.monthlyValue'))} value={form.monthlyValue} onChange={(e) => set('monthlyValue')(e.target.value)} />
          <Field label={label('currency', t('contracts.field.currency'))} value={form.currency} maxLength={3} onChange={(e) => set('currency')(e.target.value.toUpperCase())} />
          <Select label={label('vatIncluded', t('contracts.field.vat'))} value={form.vatIncluded} onChange={(e) => set('vatIncluded')(e.target.value)}>
            <option value="">{t('contracts.vatUnknown')}</option>
            <option value="yes">{t('contracts.vatIncluded')}</option>
            <option value="no">{t('contracts.vatExcluded')}</option>
          </Select>
          <Field label={label('paymentTerms', t('contracts.field.paymentTerms'))} value={form.paymentTerms} onChange={(e) => set('paymentTerms')(e.target.value)} wrapperClassName="sm:col-span-2" />
        </Section>

        <Section title={t('contracts.sectionMore')} columns={1}>
          <TextArea label={label('summary', t('contracts.field.summary'))} rows={3} value={form.summary} onChange={(e) => set('summary')(e.target.value)} />
          <Field label={label('signatories', t('contracts.field.signatories'))} value={form.signatories} onChange={(e) => set('signatories')(e.target.value)} />
          <TextArea label={t('contracts.field.notes')} rows={2} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Section>
      </div>
    </Modal>
  )
}

/** Words of a name to search by: no accents, no punctuation. */
function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The client the contract is with: one of the catalogue's clients, picked or found when the document
 * was read, or a name typed here that can be added as a new client on the spot.
 */
function ClientPicker({
  form,
  fromDocument,
  matched,
  onPick,
  onType,
}: {
  form: Form
  fromDocument: boolean
  matched: boolean
  onPick: (client: ClientRecord) => void
  onType: (text: string) => void
}) {
  const { t } = useI18n()
  const { clients } = useAppData()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const linked = clients.find((client) => client.id === form.clientId) || null
  const typed = form.counterparty.trim()

  const options = useMemo(() => {
    const words = searchText(typed).split(' ').filter(Boolean)
    const sorted = [...clients].sort((a, b) => a.fullName.localeCompare(b.fullName))
    const found = words.length ? sorted.filter((client) => words.every((word) => searchText(`${client.fullName} ${client.businessId || ''}`).includes(word))) : sorted
    return found.slice(0, 8)
  }, [clients, typed])

  const labelText = [t('contracts.client'), matched ? t('contracts.matched') : fromDocument ? t('contracts.fromDocument') : ''].filter(Boolean).join(' · ')

  return (
    <div className="mb-5 sm:col-span-2">
      <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{labelText}</span>
      {linked ? (
        <div className="flex items-center gap-3 rounded-xl border border-brand/25 bg-brand/5 px-3.5 py-2.5">
          <Users className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-brand-ink">{linked.fullName}</span>
            {typed && searchText(typed) !== searchText(linked.fullName) ? (
              <span className="block truncate text-xs text-brand-ink/50">{t('contracts.inDocument', { name: typed })}</span>
            ) : null}
          </span>
          <button type="button" onClick={() => onType(typed)} className="shrink-0 text-xs font-semibold text-brand hover:underline">
            {t('contracts.changeClient')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
          <input
            value={form.counterparty}
            onChange={(e) => {
              onType(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder={t('contracts.pickClient')}
            className="w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-10 pr-3.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {open ? (
            <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-xl border border-brand-ink/10 bg-white py-1 shadow-lg">
              {options.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(client)
                    setOpen(false)
                  }}
                  className="block w-full px-3.5 py-2 text-left text-sm hover:bg-brand/6"
                >
                  <span className="block truncate font-semibold text-brand-ink">{client.fullName}</span>
                  {client.address || client.businessId ? <span className="block truncate text-xs text-brand-ink/45">{[client.businessId, client.address].filter(Boolean).join(' · ')}</span> : null}
                </button>
              ))}
              {options.length === 0 ? <p className="px-3.5 py-2 text-sm text-brand-ink/50">{t('contracts.noClients')}</p> : null}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  setAdding(true)
                }}
                className="flex w-full items-center gap-2 border-t border-brand-ink/8 px-3.5 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand/6"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                <span className="truncate">{typed ? t('contracts.newClientNamed', { name: typed }) : t('contracts.newClient')}</span>
              </button>
            </div>
          ) : null}
          {!open && typed ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-brand-ink/55">
              {t('contracts.notInClients', { name: typed })}
              <button type="button" onClick={() => setAdding(true)} className="font-semibold text-brand hover:underline">
                {t('contracts.register')}
              </button>
            </p>
          ) : null}
        </div>
      )}
      {adding ? (
        <NewClientModal
          initial={{ fullName: typed, address: form.counterpartyAddress, businessId: form.counterpartyBusinessId }}
          onClose={() => setAdding(false)}
          onSaved={(client) => {
            setAdding(false)
            onPick(client)
          }}
        />
      ) : null}
    </div>
  )
}

function NewClientModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: { fullName: string; address: string; businessId: string }
  onClose: () => void
  onSaved: (client: ClientRecord) => void
}) {
  const { t } = useI18n()
  const { createClient } = useAppData()
  const [client, setClient] = useState({ ...initial, email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key: keyof typeof client) => (e: { target: { value: string } }) => setClient((current) => ({ ...current, [key]: e.target.value }))

  async function save() {
    const payload = composeClient(client)
    if (!payload.fullName) {
      setError(t('clients.validationName'))
      return
    }
    setSaving(true)
    setError('')
    try {
      onSaved(await createClient(payload as Omit<ClientRecord, 'id' | 'createdAt'>))
    } catch (err) {
      setError(errorText(t, err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('contracts.newClientTitle')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="p-6">
        {error ? <p className="mb-4 rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm text-[#B0472F]">{error}</p> : null}
        <Field label={t('newInvoice.fullName')} value={client.fullName} onChange={set('fullName')} autoFocus />
        <Field label={t('newInvoice.address')} value={client.address} onChange={set('address')} />
        <Field label={`${t('docs.businessId')} (${t('common.optional')})`} value={client.businessId} onChange={set('businessId')} />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={`${t('docs.email')} (${t('common.optional')})`} type="email" value={client.email} onChange={set('email')} />
          <Field label={`${t('newInvoice.phone')} (${t('common.optional')})`} value={client.phone} onChange={set('phone')} />
        </div>
      </div>
    </Modal>
  )
}

function Section({ title, columns = 2, children }: { title: string; columns?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-ink/8 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-brand-ink">{title}</h3>
      <div className={cn('grid gap-x-4', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
        {children}
      </div>
    </section>
  )
}

function ReadingNote({ icon, text, children }: { icon: 'spin' | 'done' | 'warn'; text: string; children?: ReactNode }) {
  return (
    <p className={cn('mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm', icon === 'warn' ? 'bg-[#FDF1DC] text-[#7A4F0E]' : icon === 'done' ? 'bg-[#E6F4EC] text-[#1F6A42]' : 'bg-brand/6 text-brand-dark')}>
      {icon === 'spin' ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : icon === 'done' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>
        {text} {children}
      </span>
    </p>
  )
}

/** Asks before something that changes a contract for good, in the page's own window instead of the browser's. */
function ConfirmModal({
  title,
  name,
  message,
  action,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  name: string
  message: string
  action: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onConfirm()
            }}
            className={danger ? 'bg-[#C0503A] hover:bg-[#A8432F]' : undefined}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : danger ? <Trash2 className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
            {action}
          </Button>
        </>
      }
    >
      <div className="space-y-3 bg-white p-6">
        <p className="flex items-start gap-3 rounded-xl border border-brand-ink/8 bg-[#FAFBFB] px-4 py-3 text-sm font-semibold text-brand-ink">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>{name}</span>
        </p>
        <p className="text-sm text-brand-ink/65">{message}</p>
      </div>
    </Modal>
  )
}

// --- Bringing contracts in from a spreadsheet.

function ImportContractsModal({ contracts, onClose, onImported }: { contracts: Contract[]; onClose: () => void; onImported: (list: Contract[], added: number, skipped: number) => void }) {
  const { t } = useI18n()
  const { profile } = useAppData()
  const currency = profile?.currency || 'EUR'
  const [plan, setPlan] = useState<ContractImportPlan | null>(null)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError('')
    setFileName(file.name)
    try {
      const next = planContractImport(await readAnyWorkbook(new Uint8Array(await file.arrayBuffer()), file.name), contracts)
      if (!next) {
        setPlan(null)
        setError(t('contracts.importNone'))
        return
      }
      setPlan(next)
      setPicked(new Set(next.rows.map((row, index) => (row.existing ? -1 : index)).filter((index) => index !== -1)))
    } catch {
      setPlan(null)
      setError(t('contracts.importUnreadable'))
    }
  }

  async function run() {
    if (!plan) return
    setBusy(true)
    setError('')
    try {
      const rows = plan.rows.filter((_row, index) => picked.has(index)).map((row) => ({ ...row.fields, status: row.status }))
      const result = await importContracts(rows)
      onImported(result.contracts, result.added, result.skipped)
    } catch (err) {
      setError(errorText(t, err))
      setBusy(false)
    }
  }

  const toggle = (index: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  return (
    <Modal
      title={t('contracts.importTitle')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void run()} disabled={!plan || picked.size === 0 || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('contracts.importRun', { count: picked.size })}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-6">
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-brand-ink/15 bg-white px-5 py-4 text-left transition hover:border-brand/40 hover:bg-brand/5"
        >
          <FileSpreadsheet className="h-7 w-7 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-ink">{fileName || t('contracts.importChoose')}</span>
            <span className="block text-xs text-brand-ink/50">{t('contracts.importHint')}</span>
          </span>
        </button>

        {error ? <p className="rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm text-[#B0472F]">{error}</p> : null}

        {plan ? (
          <div className="overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-ink/8 px-4 py-3 text-xs text-brand-ink/55">
              <span>{t('contracts.importFound', { count: plan.rows.length, sheet: plan.sheet })}</span>
              <button
                type="button"
                onClick={() => setPicked(picked.size === plan.rows.length ? new Set() : new Set(plan.rows.map((_row, index) => index)))}
                className="font-semibold text-brand hover:underline"
              >
                {picked.size === plan.rows.length ? t('contracts.importNoneSelected') : t('contracts.importAll')}
              </button>
            </div>
            <ul className="max-h-[50vh] divide-y divide-brand-ink/5 overflow-auto">
              {plan.rows.map((row, index) => {
                const { fields } = row
                const period = [shortDate(fields.startDate), shortDate(fields.endDate)].filter(Boolean).join(' – ')
                return (
                  <li key={index}>
                    <label className={cn('flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-brand-bg/60', !picked.has(index) && 'opacity-55')}>
                      <input type="checkbox" checked={picked.has(index)} onChange={() => toggle(index)} className="mt-1 h-4 w-4 shrink-0 accent-[#2C6E7B]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-brand-ink">{fields.title}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                          {fields.counterparty ? <span className="font-medium text-[#4A5BA8]">{fields.counterparty}</span> : null}
                          {period ? <span className="tabular-nums text-brand-ink/55">{period}</span> : null}
                          {row.status === 'completed' ? <span className="text-brand-ink/45">{t('contracts.status.completed')}</span> : null}
                          {row.existing ? <span className="font-semibold text-[#9A6412]">{t('contracts.importExisting')}</span> : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm">
                        <span className="block font-semibold tabular-nums text-brand-ink">{fields.value != null ? formatMoney(fields.value, currency) : '—'}</span>
                        {fields.monthlyValue ? <span className="block text-xs text-brand-ink/45">{t('contracts.perMonth', { amount: formatMoney(fields.monthlyValue, currency) })}</span> : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

// --- Looking at the document.

function PreviewModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { t } = useI18n()
  const kind = fileKind(contract.file)
  const [url, setUrl] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let made = ''
    setFailed(false)
    if (kind === 'pdf' || kind === 'image') {
      contractBlob(contract)
        .then((blob) => {
          made = URL.createObjectURL(blob)
          if (alive) setUrl(made)
          else URL.revokeObjectURL(made)
        })
        .catch(() => alive && setFailed(true))
    } else if (kind === 'docx' || kind === 'text') {
      contractText(contract.id)
        .then((value) => alive && setText(value))
        .catch(() => alive && setFailed(true))
    }
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [contract, kind])

  const loading = !failed && ((kind === 'pdf' || kind === 'image') ? !url : (kind === 'docx' || kind === 'text') ? text == null : false)

  return (
    <Modal
      title={contractName(contract)}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" onClick={() => void downloadContract(contract)}>
            <Download className="h-4 w-4" />
            {t('contracts.download')}
          </Button>
        </>
      }
    >
      <div className="h-[72vh]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-brand-ink/50">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : failed ? (
          <p className="p-10 text-center text-sm text-brand-ink/60">{t('contracts.previewFailed')}</p>
        ) : kind === 'pdf' ? (
          <iframe title={contractName(contract)} src={url} className="h-full w-full border-0 bg-white" />
        ) : kind === 'image' ? (
          <div className="flex h-full items-start justify-center overflow-auto p-6">
            <img src={url} alt={contractName(contract)} className="max-w-full rounded-lg shadow" />
          </div>
        ) : text != null ? (
          <div className="mx-auto max-w-3xl whitespace-pre-wrap bg-white px-10 py-8 font-serif text-[15px] leading-relaxed text-brand-ink shadow-sm">{text}</div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <FileText className="h-10 w-10 text-brand-ink/30" />
            <p className="text-sm text-brand-ink/60">{t('contracts.noPreview')}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
