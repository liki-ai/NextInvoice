import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { cn } from '../lib/cn'
import { activeSigners, invoiceSigner, signerRoleKey, type Signer } from '../lib/signers'

/**
 * Which of the company's authorized representatives signs the invoice. Shown only when there is a
 * choice; an invoice whose signer has since been taken off the list keeps them as an option.
 */
export function SignerPicker({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const { profile } = useAppData()
  const { t } = useI18n()
  const listed = activeSigners(profile)
  const chosen = invoiceSigner(profile, value)
  const options = chosen && !listed.some((item) => item.id === chosen.id) ? [...listed, chosen] : listed
  if (options.length < 2) return null

  const label = (signer: Signer) => {
    const key = signerRoleKey(signer.role)
    const role = key ? t(`pdf.${key}`) : String(signer.role || '').trim()
    const name = signer.name.trim() || t('profile.signerUnnamed')
    return [name, role].filter(Boolean).join(' · ') + (signer.signatureData ? '' : ` (${t('newInvoice.signerNoImage')})`)
  }

  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold">{t('newInvoice.signer')}</span>
      <select
        value={chosen?.id || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-brand-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        {options.map((signer) => (
          <option key={signer.id} value={signer.id}>
            {label(signer)}
          </option>
        ))}
      </select>
      <span className="text-xs text-brand-ink/45">{t('newInvoice.signerHint')}</span>
    </label>
  )
}
