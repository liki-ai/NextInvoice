import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Tag, Users } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, TextArea } from '../../components/ui'
import { LanguagePicker } from '../../components/LangSwitch'
import { api } from '../../lib/api'
import type { CompanyProfile } from '../../lib/invoice'
import { stripSampleCompanyFields } from '../../lib/companySamples'
import { INDUSTRIES, normalizeIndustry } from '../../lib/client'
import { fileToProof, proofSource } from '../../lib/proof'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const { profile, saveProfile, downloadBackup, restoreBackup } = useAppData()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [form, setForm] = useState<CompanyProfile | null>(() => (profile ? stripSampleCompanyFields(profile) : null))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)

  useEffect(() => {
    if (profile) setForm(stripSampleCompanyFields(profile))
  }, [profile])

  function setField<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const logo = form?.logoData || form?.logoUri || profile?.logoData || profile?.logoUri || ''

  async function onImport(file: File | undefined) {
    if (!file) return
    setImporting(true)
    setError('')
    setMessage('')
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
      setMessage(t('profile.importSuccess'))
    } catch {
      setError(t('profile.importError'))
    } finally {
      setImporting(false)
    }
  }

  async function onSave() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      await saveProfile({ ...stripSampleCompanyFields(form), language: lang })
      setMessage(t('profile.saveSuccess'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <p className="text-brand-ink/60">{t('common.loading')}</p>

  return (
    <div>
      <h1 className="font-display text-4xl font-medium tracking-tight">{t('more.title')}</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/app/clients"
          className="flex items-center gap-3 rounded-2xl border border-brand-ink/8 bg-white px-5 py-4 font-semibold hover:border-brand/30"
        >
          <Users className="h-5 w-5 text-brand" />
          {t('more.clients')}
        </Link>
        <Link
          to="/app/items"
          className="flex items-center gap-3 rounded-2xl border border-brand-ink/8 bg-white px-5 py-4 font-semibold hover:border-brand/30"
        >
          <Tag className="h-5 w-5 text-brand" />
          {t('more.items')}
        </Link>
      </div>

      <Card className="mt-6 flex items-center gap-4">
        <label className="flex h-[72px] w-[72px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#EEF5F7]">
          {logo ? <img src={proofSource({ proofData: form.logoData, proofUri: form.logoUri }) || logo} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-brand">Logo</span>}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const picked = await fileToProof(file)
                setField('logoData', picked.proofData)
                setField('logoUri', '')
              } catch {
                setError(t('obligations.proofTooLarge'))
              }
            }}
          />
        </label>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{form.companyName || t('profile.companyName')}</p>
          <p className="text-sm text-brand-ink/55">{form.contactPerson}</p>
          <p className="text-sm text-brand-ink/55">{form.phone}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand">{t(`industry.${normalizeIndustry(form.industry)}`)}</p>
        </div>
      </Card>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('profile.languageSectionTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-brand-ink/55">{t('profile.languageHint')}</p>
            <LanguagePicker
              variant="full"
              showLabel={false}
              className="mt-4"
              onChange={(code) => {
                if (form) void saveProfile({ ...stripSampleCompanyFields(form), language: code })
              }}
            />
          </Card>
          <Card>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('profile.account')}</h2>
            <p className="mt-3 text-sm font-medium">{user?.email}</p>
            <p className="mt-2 text-sm text-brand-ink/55">
              {t('billing.current')}:{' '}
              <span className="font-semibold text-brand-ink">
                {user?.plan === 'premium' ? t('billing.premiumName') : t('billing.freeName')}
              </span>
            </p>
            {user?.plan !== 'premium' ? (
              <p className="mt-2 text-sm leading-6 text-brand-ink/55">{t('billing.freeHint')}</p>
            ) : null}
            <Link to="/app/upgrade" className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline">
              {user?.plan === 'premium' ? t('billing.manage') : t('billing.cta')}
            </Link>
          </Card>
          <Card>
            <h2 className="font-semibold">{t('docs.backup')}</h2>
            <p className="mt-2 text-sm leading-6 text-brand-ink/55">{t('docs.checksum')}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button type="button" variant="secondary" onClick={() => void downloadBackup()}>
                {t('docs.backupExport')}
              </Button>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-brand-ink/12 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5">
                {restoreBusy ? t('common.loading') : t('docs.backupRestore')}
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
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
                      setMessage(t('docs.backupOk'))
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
          <Card>
            <h2 className="font-semibold">{t('profile.importSectionTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-brand-ink/55">{t('profile.importDescription')}</p>
            <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-xl border border-brand-ink/12 px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5">
              {importing ? t('profile.importing') : t('profile.importButton')}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
            </label>
          </Card>
        </div>

        <Card>
          <h2 className="font-semibold">{t('profile.companySectionTitle')}</h2>
          <p className="mb-4 mt-2 text-sm text-brand-ink/55">{t('industry.label')}</p>
          <div className="mb-6 flex flex-wrap gap-2">
            {INDUSTRIES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setField('industry', value)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${normalizeIndustry(form.industry) === value ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white'}`}
              >
                {t(`industry.${value}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('profile.companyName')} value={form.companyName} placeholder={t('profile.phCompanyName')} onChange={(e) => setField('companyName', e.target.value)} />
            </div>
            <Field label={t('profile.contactPerson')} value={form.contactPerson} placeholder={t('profile.phContactPerson')} onChange={(e) => setField('contactPerson', e.target.value)} />
            <Field label={t('profile.nui')} value={form.nui} placeholder={t('profile.phNui')} onChange={(e) => setField('nui', e.target.value)} />
            <div className="sm:col-span-2">
              <Field label={t('profile.streetAddress')} value={form.streetAddress} placeholder={t('profile.phStreetAddress')} onChange={(e) => setField('streetAddress', e.target.value)} />
            </div>
            <Field label={t('profile.state')} value={form.state} placeholder={t('profile.phState')} onChange={(e) => setField('state', e.target.value)} />
            <Field label={t('profile.zipCode')} value={form.zipCode} placeholder={t('profile.phZipCode')} onChange={(e) => setField('zipCode', e.target.value)} />
            <Field label={t('profile.email')} value={form.email} placeholder={t('profile.phEmail')} onChange={(e) => setField('email', e.target.value)} />
            <Field label={t('profile.phone')} value={form.phone} placeholder={t('profile.phPhone')} onChange={(e) => setField('phone', e.target.value)} />
            <Field label={t('profile.currency')} value={form.currency} placeholder={t('profile.phCurrency')} maxLength={3} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
            <Field label={t('profile.bankName')} value={form.bankName || ''} placeholder={t('profile.phBankName')} onChange={(e) => setField('bankName', e.target.value)} />
            <Field label={t('profile.iban')} value={form.iban || ''} placeholder={t('profile.phIban')} onChange={(e) => setField('iban', e.target.value)} />
            <div className="sm:col-span-2">
              <TextArea
                label={t('profile.exportNote')}
                rows={2}
                value={form.exportNote ?? 'Eksport ne bazë te Ligjit (05-L-037 Neni 33)'}
                placeholder={t('profile.phExportNote')}
                onChange={(e) => setField('exportNote', e.target.value)}
              />
              <p className="mb-4 -mt-2 text-xs text-brand-ink/45">{t('profile.exportNoteHint')}</p>
            </div>
          </div>
          {message ? <p className="mt-2 text-sm text-brand">{message}</p> : null}
          {error ? <p className="mt-2 text-sm text-[#C0503A]">{error}</p> : null}
          <div className="mt-2 flex justify-end">
            <Button type="button" disabled={saving} onClick={onSave}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={() => {
            logout()
            navigate('/')
          }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-ink/55 hover:bg-white hover:text-brand-ink"
        >
          <LogOut className="h-4 w-4" />
          {t('nav.logout')}
        </button>
      </div>
    </div>
  )
}
