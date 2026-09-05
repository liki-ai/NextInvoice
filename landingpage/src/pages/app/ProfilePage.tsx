import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, TextArea } from '../../components/ui'
import { LanguagePicker } from '../../components/LangSwitch'
import { api } from '../../lib/api'
import type { CompanyProfile } from '../../lib/invoice'
import { stripSampleCompanyFields } from '../../lib/companySamples'

export function ProfilePage() {
  const { user } = useAuth()
  const { profile, saveProfile, clients, createClient, removeClient, downloadBackup, restoreBackup } = useAppData()
  const { t, lang } = useI18n()
  const [form, setForm] = useState<CompanyProfile | null>(() => (profile ? stripSampleCompanyFields(profile) : null))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [clientForm, setClientForm] = useState({ fullName: '', address: '', phone: '', email: '', businessId: '' })

  useEffect(() => {
    if (profile) setForm(stripSampleCompanyFields(profile))
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
            <Link
              to="/app/upgrade"
              className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
            >
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
            <h2 className="font-semibold">{t('docs.clients')}</h2>
            <Field label={t('newInvoice.fullName')} value={clientForm.fullName} onChange={(e) => setClientForm((c) => ({ ...c, fullName: e.target.value }))} />
            <Field label={t('newInvoice.phone')} value={clientForm.phone} onChange={(e) => setClientForm((c) => ({ ...c, phone: e.target.value }))} />
            <Field label={t('docs.email')} value={clientForm.email} onChange={(e) => setClientForm((c) => ({ ...c, email: e.target.value }))} />
            <Field label={t('newInvoice.address')} value={clientForm.address} onChange={(e) => setClientForm((c) => ({ ...c, address: e.target.value }))} />
            <Field label={t('docs.businessId')} value={clientForm.businessId} onChange={(e) => setClientForm((c) => ({ ...c, businessId: e.target.value }))} />
            <Button
              type="button"
              className="mt-2"
              onClick={async () => {
                if (!clientForm.fullName.trim()) return
                await createClient(clientForm)
                setClientForm({ fullName: '', address: '', phone: '', email: '', businessId: '' })
              }}
            >
              {t('docs.addClient')}
            </Button>
            <ul className="mt-4 space-y-2 text-sm">
              {clients.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-2 border-t border-brand-ink/8 pt-2">
                  <div>
                    <p className="font-semibold">{item.fullName}</p>
                    <p className="text-xs text-brand-ink/50">{[item.phone, item.email, item.businessId].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button type="button" className="text-xs font-semibold text-[#C0503A]" onClick={() => void removeClient(item.id)}>
                    {t('common.delete')}
                  </button>
                </li>
              ))}
            </ul>
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
              <Field
                label={t('profile.companyName')}
                value={form.companyName}
                placeholder={t('profile.phCompanyName')}
                onChange={(e) => setField('companyName', e.target.value)}
              />
            </div>
            <Field
              label={t('profile.contactPerson')}
              value={form.contactPerson}
              placeholder={t('profile.phContactPerson')}
              onChange={(e) => setField('contactPerson', e.target.value)}
            />
            <Field
              label={t('profile.nui')}
              value={form.nui}
              placeholder={t('profile.phNui')}
              onChange={(e) => setField('nui', e.target.value)}
            />
            <div className="sm:col-span-2">
              <Field
                label={t('profile.streetAddress')}
                value={form.streetAddress}
                placeholder={t('profile.phStreetAddress')}
                onChange={(e) => setField('streetAddress', e.target.value)}
              />
            </div>
            <Field
              label={t('profile.state')}
              value={form.state}
              placeholder={t('profile.phState')}
              onChange={(e) => setField('state', e.target.value)}
            />
            <Field
              label={t('profile.zipCode')}
              value={form.zipCode}
              placeholder={t('profile.phZipCode')}
              onChange={(e) => setField('zipCode', e.target.value)}
            />
            <Field
              label={t('profile.email')}
              value={form.email}
              placeholder={t('profile.phEmail')}
              onChange={(e) => setField('email', e.target.value)}
            />
            <Field
              label={t('profile.phone')}
              value={form.phone}
              placeholder={t('profile.phPhone')}
              onChange={(e) => setField('phone', e.target.value)}
            />
            <Field
              label={t('profile.currency')}
              value={form.currency}
              placeholder={t('profile.phCurrency')}
              maxLength={3}
              onChange={(e) => setField('currency', e.target.value.toUpperCase())}
            />
            <Field
              label={t('profile.bankName')}
              value={form.bankName || ''}
              placeholder={t('profile.phBankName')}
              onChange={(e) => setField('bankName', e.target.value)}
            />
            <Field
              label={t('profile.iban')}
              value={form.iban || ''}
              placeholder={t('profile.phIban')}
              onChange={(e) => setField('iban', e.target.value)}
            />
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
    </div>
  )
}
