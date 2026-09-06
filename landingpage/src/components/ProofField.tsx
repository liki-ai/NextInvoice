import { useState } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import { fileToProof, isImageProof, openProofData, proofSource, type ProofFields } from '../lib/proof'
import { Button, Modal } from './ui'

export function ProofField({
  proof,
  onChange,
  t,
}: {
  proof?: ProofFields | null
  onChange: (next: ProofFields) => void | Promise<void>
  t: (key: string) => string
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState(false)
  const attached = Boolean(proof?.proofName || proof?.proofData || proof?.proofUri)
  const src = proofSource(proof)
  const image = attached && isImageProof(proof) && src

  async function onPick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await onChange(await fileToProof(file))
    } catch (err) {
      setError(err instanceof Error && err.message === 'PROOF_TOO_LARGE' ? t('obligations.proofTooLarge') : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {image ? (
        <button type="button" onClick={() => setViewing(true)} className="block w-full overflow-hidden rounded-xl bg-[#EEF2F3]">
          <img src={src} alt={proof?.proofName || t('obligations.proofAttached')} className="h-44 w-full object-cover" />
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {attached ? (
          <button
            type="button"
            onClick={() => (image ? setViewing(true) : openProofData(src, proof?.proofName))}
            className="inline-flex max-w-[220px] items-center gap-1 truncate text-xs font-semibold text-brand hover:underline"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            {proof?.proofName || t('obligations.proofAttached')}
          </button>
        ) : null}
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/10">
          <Upload className="h-3.5 w-3.5" />
          {busy ? t('common.loading') : attached ? t('obligations.proofReplace') : t('obligations.proofAdd')}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              void onPick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {error ? <p className="text-xs text-[#C0503A]">{error}</p> : null}
      {viewing && src ? (
        <Modal
          title={proof?.proofName || t('obligations.proofTitle')}
          onClose={() => setViewing(false)}
          footer={
            <Button type="button" variant="secondary" onClick={() => setViewing(false)}>
              {t('common.close')}
            </Button>
          }
        >
          <img src={src} alt="" className="max-h-[70vh] w-full bg-black object-contain" />
        </Modal>
      ) : null}
    </div>
  )
}
