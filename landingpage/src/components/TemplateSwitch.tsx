import { useI18n } from '../i18n'
import { cn } from '../lib/cn'
import { INVOICE_TEMPLATES, type InvoiceTemplateId } from '../lib/invoiceTemplates'

const LABEL_KEYS: Record<InvoiceTemplateId, string> = {
  classic: 'profile.templateClassic',
  corporate: 'profile.templateCorporate',
  minimal: 'profile.templateMinimal',
}

/** Sits above an invoice preview: try another design for this one PDF without changing the default. */
export function TemplateSwitch({ value, onChange }: { value: InvoiceTemplateId; onChange: (next: InvoiceTemplateId) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-ink/8 bg-white px-6 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('profile.templateLabel')}</span>
      <div className="flex rounded-xl bg-brand-bg p-1" role="radiogroup" aria-label={t('profile.templateLabel')}>
        {INVOICE_TEMPLATES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
              value === id ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-ink/55 hover:text-brand-ink',
            )}
          >
            {t(LABEL_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  )
}
