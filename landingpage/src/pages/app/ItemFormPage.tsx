import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, TextArea } from '../../components/ui'
import { ITEM_UNITS, emptyCatalogItem } from '../../lib/catalog'

export function ItemFormPage() {
  const { itemId } = useParams()
  const { items, createItem, updateItem } = useAppData()
  const { t } = useI18n()
  const navigate = useNavigate()
  const existing = itemId ? items.find((item) => item.id === itemId) : null
  const [form, setForm] = useState(() => ({ ...emptyCatalogItem(), ...(existing || {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSave() {
    if (!String(form.description || '').trim()) {
      setError(t('items.validationDescription'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        description: String(form.description).trim(),
        unitCost: Number(String(form.unitCost).replace(',', '.')) || 0,
        unit: form.unit || 'pcs',
        taxable: Boolean(form.taxable),
        additionalDetails: String(form.additionalDetails || '').trim(),
      }
      if (existing) await updateItem(existing.id, payload)
      else await createItem(payload)
      navigate('/app/items')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/app/items" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('items.title')}
      </Link>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">
        {existing ? t('items.edit') : t('items.add')}
      </h1>

      <div className="mt-8 max-w-2xl space-y-6">
        <Card>
          <Field
            label={t('items.description')}
            value={form.description}
            placeholder={t('items.phDescription')}
            onChange={(e) => setField('description', e.target.value)}
          />
          <div className="mb-5 flex items-center justify-between gap-4">
            <span className="text-sm font-semibold">{t('items.unitCost')}</span>
            <input
              value={String(form.unitCost ?? '')}
              placeholder="0.00"
              inputMode="decimal"
              onChange={(e) => setField('unitCost', e.target.value)}
              className="w-40 rounded-xl border border-brand-ink/10 px-3.5 py-2.5 text-right text-sm outline-none focus:border-brand"
            />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('items.unitLabel')}</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {ITEM_UNITS.map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setField('unit', unit)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${form.unit === unit ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white'}`}
              >
                {t(`items.unit.${unit}`)}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold">{t('items.taxable')}</span>
            <input type="checkbox" checked={Boolean(form.taxable)} onChange={(e) => setField('taxable', e.target.checked)} />
          </label>
        </Card>
        <Card>
          <TextArea
            label={t('items.additionalDetails')}
            rows={4}
            value={form.additionalDetails}
            placeholder={t('items.phAdditional')}
            onChange={(e) => setField('additionalDetails', e.target.value)}
          />
        </Card>
        {error ? <p className="text-sm text-[#C0503A]">{error}</p> : null}
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
