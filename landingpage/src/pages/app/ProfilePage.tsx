import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Eye, ImagePlus, LogOut, Settings, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal, Select, TextArea } from '../../components/ui'
import { LanguagePicker } from '../../components/LangSwitch'
import { MailSettingsCard } from '../../components/MailSettingsCard'
import { SlackSettingsCard } from '../../components/SlackSettingsCard'
import { canManageCompany } from '../../lib/team'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { CURRENCIES, DEFAULT_EXPORT_NOTE, normalizeTaxRate, usesExportNote, type CompanyProfile } from '../../lib/invoice'
import { localizeCompanyProfile, stripSampleCompanyFields } from '../../lib/companySamples'
import { INDUSTRIES, normalizeIndustry } from '../../lib/client'
import { fileToBrandImage } from '../../lib/proof'
import {
  ACCENT_SWATCHES,
  INVOICE_TEMPLATES,
  TEMPLATE_ACCENT,
  buildSampleInvoiceHtml,
  isHexColor,
  normalizeTemplate,
  type InvoiceTemplateId,
} from '../../lib/invoiceTemplates'

const EDITABLE = [
  'companyName',
  'contactPerson',
  'nui',
  'vatNumber',
  'streetAddress',
  'state',
  'zipCode',
  'email',
  'phone',
  'website',
  'currency',
  'bankName',
  'iban',
  'swift',
  'exportNote',
  'industry',
  'logoData',
  'signatureData',
  'stampData',
  'invoiceTemplate',
  'accentColor',
] as const satisfies readonly (keyof CompanyProfile)[]

type ImageField = 'logoData' | 'signatureData' | 'stampData'

const TEMPLATE_KEYS: Record<InvoiceTemplateId, string> = {
  classic: 'Classic',
  corporate: 'Corporate',
  minimal: 'Minimal',
}

// A4 at 96dpi; the template previews are real invoice pages scaled down to fit their card.
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123

function toForm(profile: CompanyProfile): CompanyProfile {
  return {
    ...stripSampleCompanyFields(profile),
    industry: normalizeIndustry(profile.industry),
    invoiceTemplate: normalizeTemplate(profile.invoiceTemplate),
    accentColor: isHexColor(profile.accentColor) ? profile.accentColor : '',
    defaultTaxRate: normalizeTaxRate(profile.defaultTaxRate),
  }
}

function sameFields(a: CompanyProfile, b: CompanyProfile) {
  return EDITABLE.every((key) => (a[key] ?? '') === (b[key] ?? '')) && (a.defaultTaxRate ?? 0) === (b.defaultTaxRate ?? 0)
}

function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}

function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-sm leading-6 text-brand-ink/55">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </Card>
  )
}

function PagePreview({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PAGE_WIDTH))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-white', className)} style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}>
      <iframe
        title="template"
        aria-hidden
        tabIndex={-1}
        sandbox=""
        srcDoc={html}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
      />
    </div>
  )
}

function ImageSlot({
  label,
  value,
  wide,
  busy,
  uploadLabel,
  changeLabel,
  removeLabel,
  onPick,
  onRemove,
}: {
  label: string
  value?: string
  wide?: boolean
  busy?: boolean
  uploadLabel: string
  changeLabel: string
  removeLabel: string
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const has = Boolean(value?.startsWith('data:image/'))
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</p>
      <div className="mt-2.5 flex items-center gap-4">
        <div
          className={cn(
            'flex h-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-brand-ink/15 bg-brand-bg',
            wide ? 'w-40' : 'w-24',
            has && 'border-solid bg-white',
          )}
        >
          {has ? <img src={value} alt={label} className="h-full w-full object-contain p-2" /> : <ImagePlus className="h-6 w-6 text-brand-ink/25" />}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label
            className={cn(
              'inline-flex cursor-pointer items-center justify-center rounded-xl border border-brand-ink/12 bg-white px-3.5 py-2 text-sm font-semibold text-brand-ink transition hover:border-brand/30 hover:bg-brand/5 focus-within:ring-2 focus-within:ring-brand/20',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            {has ? changeLabel : uploadLabel}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onPick(file)
              }}
            />
          </label>
          {has ? (
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-[#C0503A] hover:bg-[#F8E8E4]">
              <Trash2 className="h-3.5 w-3.5" />
              {removeLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Which part of the settings to show: the company's own page, or one tab of the invoice settings. */
export type ProfilePart = 'company' | 'templates' | 'defaults'

export function ProfilePage({ part = 'company' }: { part?: ProfilePart }) {
  const { user, logout } = useAuth()
  const { profile, saveProfile, downloadBackup, restoreBackup } = useAppData()
  const { t, dict, lang } = useI18n()
  const navigate = useNavigate()
  // A plain user of the company sees its settings but cannot change them.
  const manager = canManageCompany(user)
  const baseline = useMemo(() => (profile ? toForm(profile) : null), [profile])
  const [form, setForm] = useState<CompanyProfile | null>(baseline)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState<ImageField | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplateId | null>(null)
  // Kept as typed text so "18." or an empty box can be typed; the form holds the parsed rate.
  const [taxInput, setTaxInput] = useState(() => String(baseline?.defaultTaxRate ?? 0))
  useEffect(() => {
    setTaxInput((prev) => (normalizeTaxRate(prev) === (form?.defaultTaxRate ?? 0) ? prev : String(form?.defaultTaxRate ?? 0)))
  }, [form?.defaultTaxRate])

  const dirty = Boolean(form && baseline && !sameFields(form, baseline))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // The profile also changes when the language is switched; that must not wipe edits in progress.
  useEffect(() => {
    if (!baseline) return
    setForm((prev) => (prev && dirtyRef.current ? prev : baseline))
  }, [baseline])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const previewForm = useDebounced(form, 350)
  const previews = useMemo(() => {
    if (!previewForm) return null
    const company = localizeCompanyProfile(previewForm, t)
    const sample = {
      clientName: t('profile.sampleClient'),
      clientAddress: t('profile.sampleAddress'),
      lines: [t('profile.sampleLine1'), t('profile.sampleLine2'), t('profile.sampleLine3')],
      date: new Date().toLocaleDateString('en-GB'),
    }
    return Object.fromEntries(
      INVOICE_TEMPLATES.map((id) => [
        id,
        buildSampleInvoiceHtml({ company, template: id, accentColor: previewForm.accentColor || undefined, pdfLabels: dict.pdf, sample }),
      ]),
    ) as Record<InvoiceTemplateId, string>
  }, [previewForm, dict.pdf, t])

  function setField<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function onPickImage(field: ImageField, file: File) {
    setImageBusy(field)
    setError('')
    try {
      setField(field, await fileToBrandImage(file, field === 'logoData' ? 640 : 520))
    } catch {
      setError(t('profile.imageError'))
    } finally {
      setImageBusy(null)
    }
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const body = new FormData()
      body.append('file', file)
      const data = await api<Partial<CompanyProfile>>('/api/extract-company', { method: 'POST', form: body })
      setForm((prev) =>
        prev
          ? {
              ...prev,
              companyName: data.companyName || prev.companyName,
              contactPerson: data.contactPerson || prev.contactPerson,
              nui: data.nui || prev.nui,
              streetAddress: data.streetAddress || prev.streetAddress,
              state: data.state || prev.state,
              zipCode: data.zipCode || prev.zipCode,
              email: data.email || prev.email,
              phone: data.phone || prev.phone,
            }
          : prev,
      )
      setNotice(t('profile.importSuccess'))
    } catch {
      setError(t('profile.importError'))
    } finally {
      setImporting(false)
    }
  }

  async function onSave() {
    if (!form) return
    const email = form.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError(t('profile.invalidEmail'))
      return
    }
    setSaving(true)
    setError('')
    setEmailError('')
    try {
      const payload: Partial<CompanyProfile> = {}
      for (const key of EDITABLE) payload[key] = String(form[key] ?? '').trim()
      payload.iban = (payload.iban || '').toUpperCase()
      payload.swift = (payload.swift || '').toUpperCase()
      // A logo picked on the phone is stored as a path on that phone; the uploaded image replaces it.
      if (payload.logoData !== (baseline?.logoData ?? '')) payload.logoUri = ''
      payload.language = lang
      payload.defaultTaxRate = form.defaultTaxRate ?? 0
      const saved = await saveProfile(payload)
      setForm(toForm(saved))
      setNotice(t('profile.saveSuccess'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <p className="text-brand-ink/60">{t('common.loading')}</p>

  const industry = normalizeIndustry(form.industry)
  const template = normalizeTemplate(form.invoiceTemplate)
  const currencies: string[] = CURRENCIES.includes(form.currency as (typeof CURRENCIES)[number]) ? [...CURRENCIES] : [form.currency, ...CURRENCIES]
  const imageLabels = { uploadLabel: t('profile.upload'), changeLabel: t('profile.change'), removeLabel: t('profile.remove') }

  const templateSection = (
    <SettingsSection title={t('profile.sectionInvoice')} hint={t('profile.invoiceHint')}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('profile.templateLabel')}</p>
      <div className="mt-2.5 grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label={t('profile.templateLabel')}>
        {INVOICE_TEMPLATES.map((id) => {
          const selected = template === id
          return (
            <div key={id} className={cn('overflow-hidden rounded-2xl border bg-white transition', selected ? 'border-brand ring-2 ring-brand/20' : 'border-brand-ink/10 hover:border-brand/30')}>
              <button type="button" role="radio" aria-checked={selected} onClick={() => setField('invoiceTemplate', id)} className="block w-full text-left">
                <div className="relative border-b border-brand-ink/8 bg-brand-bg p-3">
                  <PagePreview html={previews?.[id] || ''} className="rounded-md shadow-[0_1px_4px_rgba(29,43,46,0.14)]" />
                  {selected ? (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      <Check className="h-3 w-3" />
                      {t('profile.templateSelected')}
                    </span>
                  ) : null}
                </div>
                <div className="px-4 pt-3">
                  <p className="text-sm font-semibold">{t(`profile.template${TEMPLATE_KEYS[id]}`)}</p>
                  <p className="mt-1 text-xs leading-5 text-brand-ink/55">{t(`profile.template${TEMPLATE_KEYS[id]}Desc`)}</p>
                </div>
              </button>
              <button type="button" onClick={() => setPreviewTemplate(id)} className="m-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand hover:bg-brand/8">
                <Eye className="h-3.5 w-3.5" />
                {t('profile.templatePreview')}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('profile.accent')}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label={t('profile.accent')}>
        <button
          type="button"
          role="radio"
          aria-checked={!form.accentColor}
          onClick={() => setField('accentColor', '')}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
            !form.accentColor ? 'border-brand bg-brand/8 text-brand' : 'border-brand-ink/12 bg-white text-brand-ink/70 hover:border-brand/30',
          )}
        >
          <span className="h-4 w-4 rounded-full" style={{ background: TEMPLATE_ACCENT[template] }} />
          {t('profile.accentDefault')}
        </button>
        {ACCENT_SWATCHES.map((color) => {
          const selected = form.accentColor?.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color}
              title={color}
              onClick={() => setField('accentColor', color)}
              className={cn('flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition hover:scale-105', selected && 'ring-2 ring-brand-ink/60')}
              style={{ background: color }}
            >
              {selected ? <Check className="h-4 w-4 text-white" /> : null}
            </button>
          )
        })}
      </div>
    </SettingsSection>
  )
  const defaultsSection = (
    <SettingsSection title={t('recurring.settings.defaultsTitle')} hint={t('recurring.settings.defaultsHint')}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Select label={t('profile.currency')} value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
          {currencies.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <div>
          <Field
            label={t('profile.defaultTaxRate')}
            value={taxInput}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => {
              setTaxInput(e.target.value)
              setField('defaultTaxRate', normalizeTaxRate(e.target.value))
            }}
          />
          <p className="mt-2 text-xs text-brand-ink/45">{t('profile.defaultTaxRateHint')}</p>
        </div>
      </div>
      {usesExportNote(form) ? (
        <div className="mt-2">
          <TextArea
            label={t('profile.exportNote')}
            rows={2}
            value={form.exportNote ?? DEFAULT_EXPORT_NOTE}
            placeholder={t('profile.phExportNote')}
            onChange={(e) => setField('exportNote', e.target.value)}
          />
          <p className="-mt-2 text-xs text-brand-ink/45">{t('profile.exportNoteHint')}</p>
        </div>
      ) : null}
    </SettingsSection>
  )
  const signatureSection = (
    <SettingsSection title={t('profile.sectionSignature')} hint={t('profile.signatureHint')}>
      <div className="grid gap-6 sm:grid-cols-2">
        <ImageSlot
          label={t('profile.signature')}
          value={form.signatureData}
          wide
          busy={imageBusy === 'signatureData'}
          {...imageLabels}
          onPick={(file) => void onPickImage('signatureData', file)}
          onRemove={() => setField('signatureData', '')}
        />
        <ImageSlot
          label={t('profile.stamp')}
          value={form.stampData}
          busy={imageBusy === 'stampData'}
          {...imageLabels}
          onPick={(file) => void onPickImage('stampData', file)}
          onRemove={() => setField('stampData', '')}
        />
      </div>
    </SettingsSection>
  )

  const saveBar =
    dirty || saving || notice || error ? (
    <div className="sticky bottom-4 z-20 mt-6 flex justify-center" role="status" aria-live="polite">
      <div
        className={cn(
          'flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-[0_10px_30px_rgba(29,43,46,0.16)]',
          error ? 'border-[#C0503A]/40' : 'border-brand-ink/10',
        )}
      >
        <p className={cn('min-w-0 flex-1 text-sm font-semibold', error ? 'text-[#C0503A]' : notice ? 'text-brand' : 'text-brand-ink')}>
          {error ? (
            error
          ) : notice ? (
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4" />
              {notice}
            </span>
          ) : (
            t('profile.unsaved')
          )}
        </p>
        {dirty || saving ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setForm(baseline)
                setError('')
                setEmailError('')
              }}
            >
              {t('profile.discard')}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  ) : null
  const templateModal =
    previewTemplate && previews ? (
    <Modal
      title={t(`profile.template${TEMPLATE_KEYS[previewTemplate]}`)}
      onClose={() => setPreviewTemplate(null)}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => setPreviewTemplate(null)}>
            {t('common.close')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setField('invoiceTemplate', previewTemplate)
              setPreviewTemplate(null)
            }}
          >
            {t('profile.templateLabel')}: {t(`profile.template${TEMPLATE_KEYS[previewTemplate]}`)}
          </Button>
        </>
      }
    >
      <iframe title="template-preview" sandbox="" className="h-[70vh] w-full bg-white" srcDoc={previews[previewTemplate]} />
    </Modal>
  ) : null

  if (part !== 'company') {
    return (
      <div className="min-w-0">
        {manager ? null : <p className="mb-6 rounded-xl bg-[#FFF6E5] px-4 py-3 text-sm font-medium text-[#8A5A00]">{t('profile.memberNotice')}</p>}
        <fieldset disabled={!manager} className="m-0 min-w-0 space-y-6 border-0 p-0">
          {part === 'templates' ? templateSection : (
            <>
              {defaultsSection}
              {signatureSection}
            </>
          )}
        </fieldset>
        {saveBar}
        {templateModal}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <h1 className="font-display text-4xl font-medium tracking-tight">{t('profile.title')}</h1>
      <p className="mt-2 text-sm text-brand-ink/55">{t('profile.subtitle')}</p>
      {manager ? null : <p className="mt-5 rounded-xl bg-[#FFF6E5] px-4 py-3 text-sm font-medium text-[#8A5A00]">{t('profile.memberNotice')}</p>}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <fieldset disabled={!manager} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <SettingsSection title={t('profile.sectionBusiness')} hint={t('profile.businessHint')}>
            <div className="mb-6">
              <ImageSlot
                label={t('profile.sectionBrand')}
                value={form.logoData}
                wide
                busy={imageBusy === 'logoData'}
                {...imageLabels}
                onPick={(file) => void onPickImage('logoData', file)}
                onRemove={() => setField('logoData', '')}
              />
              <p className="mt-2 text-xs text-brand-ink/45">{t('profile.logoHint')}</p>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field wrapperClassName="sm:col-span-2" label={t('profile.companyName')} value={form.companyName} placeholder={t('profile.phCompanyName')} autoComplete="organization" onChange={(e) => setField('companyName', e.target.value)} />
              <Field label={t('profile.nui')} value={form.nui} placeholder={t('profile.phNui')} inputMode="numeric" onChange={(e) => setField('nui', e.target.value)} />
              <Field label={`${t('profile.vatNumber')} (${t('common.optional')})`} value={form.vatNumber || ''} placeholder={t('profile.phVatNumber')} inputMode="numeric" onChange={(e) => setField('vatNumber', e.target.value)} />
              <Field wrapperClassName="sm:col-span-2" label={t('profile.contactPerson')} value={form.contactPerson} placeholder={t('profile.phContactPerson')} autoComplete="name" onChange={(e) => setField('contactPerson', e.target.value)} />
            </div>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('industry.label')}</p>
            <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label={t('industry.label')}>
              {INDUSTRIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={industry === value}
                  onClick={() => setField('industry', value)}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
                    industry === value ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/75 hover:border-brand/30',
                  )}
                >
                  {t(`industry.${value}`)}
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection title={t('profile.sectionContact')} hint={t('profile.contactHint')}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field wrapperClassName="sm:col-span-2" label={t('profile.streetAddress')} value={form.streetAddress} placeholder={t('profile.phStreetAddress')} autoComplete="street-address" onChange={(e) => setField('streetAddress', e.target.value)} />
              <Field label={t('profile.state')} value={form.state} placeholder={t('profile.phState')} onChange={(e) => setField('state', e.target.value)} />
              <Field label={t('profile.zipCode')} value={form.zipCode} placeholder={t('profile.phZipCode')} autoComplete="postal-code" onChange={(e) => setField('zipCode', e.target.value)} />
              <Field
                label={t('profile.email')}
                type="email"
                value={form.email}
                placeholder={t('profile.phEmail')}
                autoComplete="email"
                error={emailError}
                onChange={(e) => {
                  setEmailError('')
                  setField('email', e.target.value)
                }}
              />
              <Field label={t('profile.phone')} type="tel" value={form.phone} placeholder={t('profile.phPhone')} autoComplete="tel" onChange={(e) => setField('phone', e.target.value)} />
              <Field wrapperClassName="sm:col-span-2" label={`${t('profile.website')} (${t('common.optional')})`} value={form.website || ''} placeholder={t('profile.phWebsite')} autoComplete="url" onChange={(e) => setField('website', e.target.value)} />
            </div>
          </SettingsSection>

          <SettingsSection title={t('profile.sectionPayment')} hint={t('profile.paymentHint')}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label={t('profile.bankName')} value={form.bankName || ''} placeholder={t('profile.phBankName')} onChange={(e) => setField('bankName', e.target.value)} />
              <Field label={t('profile.iban')} value={form.iban || ''} placeholder={t('profile.phIban')} className="font-mono tracking-wide" spellCheck={false} onChange={(e) => setField('iban', e.target.value.toUpperCase())} />
              <Field label={`${t('profile.swift')} (${t('common.optional')})`} value={form.swift || ''} placeholder={t('profile.phSwift')} className="font-mono tracking-wide" spellCheck={false} maxLength={11} onChange={(e) => setField('swift', e.target.value.toUpperCase())} />
            </div>
          </SettingsSection>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{t('recurring.settings.title')}</h2>
              <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('recurring.settings.movedHint')}</p>
            </div>
            <Link to="/app/invoices/settings" className="inline-flex items-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-3.5 py-2 text-sm font-semibold text-brand hover:border-brand/30 hover:bg-brand/5">
              <Settings className="h-4 w-4" />
              {t('recurring.settings.open')}
            </Link>
          </Card>

          {manager ? <MailSettingsCard box="company" /> : null}
          {manager ? <SlackSettingsCard /> : null}
        </fieldset>

        {/* Outside the administrators' part: everyone connects and manages their own mailbox. */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <MailSettingsCard box="personal" />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card>
            <h2 className="text-base font-semibold">{t('profile.account')}</h2>
            <p className="mt-1 truncate text-sm text-brand-ink/55">{user?.email}</p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-bg px-3.5 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('billing.current')}</p>
                <p className="mt-0.5 text-sm font-semibold">{user?.plan === 'premium' ? t('billing.premiumName') : t('billing.freeName')}</p>
              </div>
              <Link to="/app/upgrade" className="rounded-lg px-2 py-1.5 text-right text-xs font-semibold text-brand hover:bg-brand/8">
                {user?.plan === 'premium' ? t('billing.manage') : t('nav.subscribe')}
              </Link>
            </div>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('profile.languageSectionTitle')}</p>
            <LanguagePicker variant="full" showLabel={false} className="mt-2.5" onChange={(code) => (manager ? void saveProfile({ language: code }).catch(() => undefined) : undefined)} />
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/')
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-brand-ink/55 hover:bg-brand-bg hover:text-brand-ink"
            >
              <LogOut className="h-4 w-4" />
              {t('nav.logout')}
            </button>
          </Card>

          <fieldset disabled={!manager} className={cn('m-0 min-w-0 space-y-6 border-0 p-0', !manager && 'hidden')}>
          <Card>
            <h2 className="text-base font-semibold">{t('profile.importSectionTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('profile.importDescription')}</p>
            <label
              className={cn(
                'mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-brand-ink/12 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5 focus-within:ring-2 focus-within:ring-brand/20',
                importing && 'pointer-events-none opacity-60',
              )}
            >
              {importing ? t('profile.importing') : t('profile.importButton')}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  void onImport(file)
                }}
              />
            </label>
          </Card>

          <Card>
            <h2 className="text-base font-semibold">{t('docs.backup')}</h2>
            <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('profile.backupHint')}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button type="button" variant="secondary" onClick={() => void downloadBackup()}>
                {t('docs.backupExport')}
              </Button>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-brand-ink/12 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5 focus-within:ring-2 focus-within:ring-brand/20">
                {restoreBusy ? t('common.loading') : t('docs.backupRestore')}
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const typed = window.prompt(t('docs.backupConfirm'))
                    if (typed !== 'RESTORE') return
                    setRestoreBusy(true)
                    setError('')
                    try {
                      const parsed = JSON.parse(await file.text())
                      await restoreBackup(parsed)
                      setNotice(t('docs.backupOk'))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t('common.error'))
                    } finally {
                      setRestoreBusy(false)
                    }
                  }}
                />
              </label>
            </div>
          </Card>
          </fieldset>
        </aside>
      </div>

      {saveBar}
    </div>
  )
}
