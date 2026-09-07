import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field } from '../../components/ui'
import { MEASUREMENT_FIELDS, clientDisplayName, composeClient, isFashionIndustry } from '../../lib/client'
import { fileToProof, isImageProof, proofSource } from '../../lib/proof'
import type { ClientRecord } from '../../lib/document'

export function ClientFormPage() {
  const { clientId } = useParams()
  const { clients, profile, createClient, updateClient } = useAppData()
  const { t } = useI18n()
  const navigate = useNavigate()
  const existing = clientId ? clients.find((item) => item.id === clientId) : null
  const fashion = isFashionIndustry(profile)

  const [fullName, setFullName] = useState(clientDisplayName(existing || {}))
  const [phone, setPhone] = useState(existing?.phone || '')
  const [email, setEmail] = useState(existing?.email || '')
  const [address, setAddress] = useState(existing?.address || '')
  const [businessId, setBusinessId] = useState(existing?.businessId || '')
  const [measurements, setMeasurements] = useState<Record<string, string>>(existing?.measurements || {})
  const [photos, setPhotos] = useState(existing?.photos || [])
  const [viewPhoto, setViewPhoto] = useState<(typeof photos)[number] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const payload = useMemo(
    () =>
      composeClient({
        fullName,
        phone,
        email,
        address,
        businessId,
        notes: existing?.notes || '',
        measurements: fashion ? measurements : existing?.measurements || {},
        photos: fashion ? photos : existing?.photos || [],
      }),
    [fullName, phone, email, address, businessId, measurements, photos, fashion, existing?.notes, existing?.measurements, existing?.photos],
  )

  async function persist(thenInvoice: boolean) {
    if (!payload.fullName) {
      setError(t('clients.validationName'))
      return
    }
    if (!payload.phone) {
      setError(t('clients.validationPhone'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = existing ? await updateClient(existing.id, payload as Partial<ClientRecord>) : await createClient(payload as Omit<ClientRecord, 'id' | 'createdAt'>)
      const id = existing?.id || saved.id
      if (thenInvoice) navigate(`/app/new?clientId=${encodeURIComponent(id)}`)
      else navigate('/app/clients')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/app/clients" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('clients.title')}
      </Link>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">
        {existing ? t('clients.edit') : t('clients.add')}
      </h1>

      <Card className="mt-8 max-w-2xl">
        <h2 className="mb-4 font-semibold">{t('clients.bio')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('newInvoice.fullName')} value={fullName} placeholder={t('newInvoice.phFullName')} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Field label={t('newInvoice.address')} value={address} placeholder={t('newInvoice.phAddress')} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <Field label={t('newInvoice.phone')} value={phone} placeholder={t('newInvoice.phPhone')} onChange={(e) => setPhone(e.target.value)} />
          <Field label={`${t('docs.email')} (${t('common.optional')})`} value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="sm:col-span-2">
            <Field label={`${t('docs.businessId')} (${t('common.optional')})`} value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
          </div>
        </div>

        {fashion ? (
          <div className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('clients.measurements')}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {MEASUREMENT_FIELDS.map((key) => (
                <Field
                  key={key}
                  label={t(`clients.measure.${key}`)}
                  value={measurements[key] || ''}
                  onChange={(e) => setMeasurements((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {photos.map((photo, idx) => {
                const src = proofSource(photo)
                return (
                  <button key={photo.proofName || idx} type="button" onClick={() => setViewPhoto(photo)} className="h-[72px] w-[72px] overflow-hidden rounded-xl bg-[#EEF2F3]">
                    {isImageProof(photo) && src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
                  </button>
                )
              })}
              <label className="flex h-[72px] w-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border border-brand-ink/12 bg-white text-[10px] font-semibold text-brand">
                <Camera className="h-5 w-5" />
                {t('clients.addPhoto')}
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
                      setPhotos((prev) => [...prev, picked])
                    } catch {
                      setError(t('obligations.proofTooLarge'))
                    }
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[#C0503A]">{error}</p> : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={saving} onClick={() => void persist(false)}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist(true)}>
            {t('clients.saveAndInvoice')}
          </Button>
        </div>
      </Card>

      {viewPhoto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6" onClick={() => setViewPhoto(null)}>
          <img src={proofSource(viewPhoto)} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      ) : null}
    </div>
  )
}
