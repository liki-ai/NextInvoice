import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n, type Lang } from '../../i18n'
import { Button, Card, Field } from '../../components/ui'
import { api } from '../../lib/api'
import type { CompanyProfile } from '../../lib/invoice'

export function ProfilePage() {
  const { user } = useAuth()
  const { profile, saveProfile } = useAppData()
  const { t, lang, setLang } = useI18n()
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
      <h1 className="font-display text-3xl font-medium">{t('profile.title')}</h1>

      <Card className="mt-6">
        <h2 className="font-semibold">{t('profile.account')}</h2>
        <p className="mt-2 text-sm text-brand-ink/70">{user?.email}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('profile.languageSectionTitle')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['sq', 'en'] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={
                lang === code
                  ? 'rounded-xl bg-brand py-2 text-sm font-bold text-white'
                  : 'rounded-xl bg-brand-bg py-2 text-sm font-bold text-brand-ink/60'
              }
            >
              {code === 'sq' ? t('profile.languageSq') : t('profile.languageEn')}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('profile.importSectionTitle')}</h2>
        <p className="mt-2 text-sm text-brand-ink/60">{t('profile.importDescription')}</p>
        <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-full border border-brand px-5 py-2.5 text-sm font-bold text-brand">
          {importing ? t('profile.importing') : t('profile.importButton')}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </label>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('profile.companySectionTitle')}</h2>
        <p className="mb-3 mt-2 text-sm text-brand-ink/60">{t('profile.companyHint')}</p>
        <Field label={t('profile.companyName')} value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} />
        <Field label={t('profile.contactPerson')} value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} />
        <Field label={t('profile.nui')} value={form.nui} onChange={(e) => setField('nui', e.target.value)} />
        <Field label={t('profile.streetAddress')} value={form.streetAddress} onChange={(e) => setField('streetAddress', e.target.value)} />
        <Field label={t('profile.state')} value={form.state} onChange={(e) => setField('state', e.target.value)} />
        <Field label={t('profile.zipCode')} value={form.zipCode} onChange={(e) => setField('zipCode', e.target.value)} />
        <Field label={t('profile.email')} value={form.email} onChange={(e) => setField('email', e.target.value)} />
        <Field label={t('profile.phone')} value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
        <Field label={t('profile.currency')} value={form.currency} maxLength={3} onChange={(e) => setField('currency', e.target.value.toUpperCase())} />
      </Card>

      {message ? <p className="mt-3 text-sm text-brand">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-[#C0503A]">{error}</p> : null}
      <Button type="button" className="mt-5 w-full" disabled={saving} onClick={onSave}>
        {saving ? t('common.loading') : t('common.save')}
      </Button>
    </div>
  )
}
