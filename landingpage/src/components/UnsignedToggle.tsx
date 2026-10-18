import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { activeSigners } from '../lib/signers'

/**
 * "Without signature and stamp": the invoice prints without the company's signature and stamp,
 * for one that is printed and then signed and stamped by hand. Shown only when the company has
 * a signature (of any of its signers) or a stamp to leave out.
 */
export function UnsignedToggle({ checked, onChange, className, compact }: { checked: boolean; onChange: (checked: boolean) => void; className?: string; compact?: boolean }) {
  const { profile } = useAppData()
  const { t } = useI18n()
  if (!activeSigners(profile).some((item) => item.signatureData) && !profile?.stampData) return null
  return (
    <label title={compact ? t('newInvoice.unsignedHint') : undefined} className={`flex cursor-pointer items-start gap-2.5 ${className || ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2C6E7F]" />
      <span>
        <span className="block text-sm font-semibold">{t('newInvoice.unsigned')}</span>
        {compact ? null : <span className="block text-xs text-brand-ink/45">{t('newInvoice.unsignedHint')}</span>}
      </span>
    </label>
  )
}
