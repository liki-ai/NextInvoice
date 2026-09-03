import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field } from '../../components/ui'
import { LanguagePicker } from '../../components/LangSwitch'
import { api } from '../../lib/api'
import type { CompanyProfile } from '../../lib/invoice'

export function ProfilePage() {
  const { user } = useAuth()
  const { profile, saveProfile } = useAppData()
  const { t, lang } = useI18n()
  const [form, setForm] = useState<CompanyProfile | null>(profile)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  function setField<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

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
      await saveProfile({ ...form, language: lang })
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
      <h1 className="font-display text-4xl font-medium tracking-tight">{t('profile.title')}</h1>
      <p className="mt-2 text-sm text-brand-ink/55">{t('profile.workspaceHint')}</p>

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
                if (form) void saveProfile({ ...form, language: code })
              }}
            />
          </Card>
          <Card>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('profile.account')}</h2>
            <p className="mt-3 text-sm font-medium">{user?.email}</p>
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
          <p className="mb-6 mt-2 text-sm text-brand-ink/55">{t('profile.companyHint')}</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('profile.companyName')} value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} />
            </div>
            <Field label={t('profile.contactPerson')} value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} />
            <Field label={t('profile.nui')} value={form.nui} onChange={(e) => setField('nui', e.target.value)} />
            <div className="sm:col-span-2">
              <Field label={t('profile.streetAddress')} value={form.streetAddress} onChange={(e) => setField('streetAddress', e.target.value)} />
            </div>
            <Field label={t('profile.state')} value={form.state} onChange={(e) => setField('state', e.target.value)} />
            <Field label={t('profile.zipCode')} value={form.zipCode} onChange={(e) => setField('zipCode', e.target.value)} />
            <Field label={t('profile.email')} value={form.email} onChange={(e) => setField('email', e.target.value)} />
            <Field label={t('profile.phone')} value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            <Field label={t('profile.currency')} value={form.currency} maxLength={3} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
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
    </div>
  )
}
