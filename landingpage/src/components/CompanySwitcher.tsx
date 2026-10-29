import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useAuth, type CompanyChoice } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { cn } from '../lib/cn'
import { CURRENCIES } from '../lib/invoice'
import { displayCompanyValue } from '../lib/companySamples'
import { Button, Field, Modal, Select } from './ui'

function initial(name: string) {
  return name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?'
}

/**
 * The company the app works in, and the way to another one or to a new one. Switching loads the app
 * again, so every page shows the chosen company's invoices, clients and settings.
 */
export function CompanySwitcher({ variant = 'dark', className, fallback = null }: { variant?: 'dark' | 'light'; className?: string; fallback?: ReactNode }) {
  const { t } = useI18n()
  const { user, switchCompany } = useAuth()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const dark = variant === 'dark'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return <>{fallback}</>
  const companies: CompanyChoice[] = user.companies?.length ? user.companies : [{ id: user.id, companyName: user.companyName || '' }]
  const canAdd = user.role !== 'member'
  // A member of a company with nothing to switch to has no use for the menu.
  if (companies.length < 2 && !canAdd) return <>{fallback}</>
  const nameOf = (item: CompanyChoice) => displayCompanyValue('companyName', item.companyName) || t('companies.unnamed')
  const current = companies.find((item) => item.id === user.id) || companies[0]

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('companies.switch')}
        className={cn(
          'flex w-full min-w-0 items-center gap-2.5 rounded-xl text-left transition',
          dark ? 'border border-white/10 bg-white/6 px-2.5 py-2 hover:bg-white/10' : 'border border-brand-ink/10 bg-white px-2 py-1.5 hover:border-brand/30',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
            dark ? 'bg-[#C9A227] text-white' : 'bg-brand/10 text-brand-dark',
          )}
        >
          {initial(nameOf(current))}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[10px] font-semibold uppercase tracking-[0.12em]', dark ? 'text-white/40' : 'text-brand-ink/45')}>{t('companies.label')}</span>
          <span className={cn('block truncate text-sm font-semibold', dark ? 'text-white' : 'text-brand-ink')}>{nameOf(current)}</span>
        </span>
        <ChevronsUpDown className={cn('h-4 w-4 shrink-0', dark ? 'text-white/45' : 'text-brand-ink/40')} />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 overflow-hidden rounded-xl border border-brand-ink/10 bg-white py-1.5 text-brand-ink shadow-xl',
            dark ? 'left-0 right-0' : 'right-0 w-64',
          )}
        >
          {companies.map((item, index) => {
            const active = item.id === current.id
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false)
                  if (!active) switchCompany(item.id)
                }}
                className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-brand/5', active && 'font-semibold')}
              >
                <Building2 className="h-4 w-4 shrink-0 text-brand-ink/40" />
                <span className="min-w-0 flex-1 truncate">{nameOf(item)}</span>
                {index === 0 && companies.length > 1 ? (
                  <span className="shrink-0 rounded-full bg-brand-ink/6 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink/50">{t('companies.main')}</span>
                ) : null}
                {active ? <Check className="h-4 w-4 shrink-0 text-brand" /> : null}
              </button>
            )
          })}
          {canAdd ? (
            <>
              <div className="my-1.5 border-t border-brand-ink/8" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  setAdding(true)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-brand/5"
              >
                <Plus className="h-4 w-4 shrink-0" />
                {t('companies.add')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {adding ? <AddCompanyModal defaultCurrency={companies[0]?.currency || 'EUR'} onClose={() => setAdding(false)} /> : null}
    </div>
  )
}

function AddCompanyModal({ defaultCurrency, onClose }: { defaultCurrency: string; onClose: () => void }) {
  const { t } = useI18n()
  const { createCompany, switchCompany } = useAuth()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const currencies: string[] = CURRENCIES.includes(currency as (typeof CURRENCIES)[number]) ? [...CURRENCIES] : [currency, ...CURRENCIES]

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      setError(t('companies.nameRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const company = await createCompany({ companyName: name.trim(), currency })
      // Straight to its settings: the address, NUI and bank details are still to be filled in.
      switchCompany(company.id, '/app/profile')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('companies.addTitle')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? t('companies.creating') : t('companies.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 p-6">
        <p className="text-sm text-brand-ink/60">{t('companies.addHint')}</p>
        <Field
          label={t('companies.name')}
          placeholder={t('companies.namePlaceholder')}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          error={error || undefined}
        />
        <Select label={t('companies.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </form>
    </Modal>
  )
}
