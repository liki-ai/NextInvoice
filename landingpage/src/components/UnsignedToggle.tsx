import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'

/**
 * "Without signature and stamp": the invoice prints without the company's signature and stamp,
 * for one that is printed and then signed and stamped by hand. Shown only when the company has
 * a signature or a stamp to leave out.
 */
export function UnsignedToggle({ checked, onChange, className }: { checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  const { profile } = useAppData()
  const { t } = useI18n()
  if (!profile?.signatureData && !profile?.stampData) return null
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${className || ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2C6E7F]" />
      <span>
        <span className="block text-sm font-semibold">{t('newInvoice.unsigned')}</span>
        <span className="block text-xs text-brand-ink/45">{t('newInvoice.unsignedHint')}</span>
      </span>
    </label>
  )
}
