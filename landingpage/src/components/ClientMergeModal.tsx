import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { clientDisplayName } from '../lib/client'
import { nuiDiffers, type DuplicateGroup, type MergeTexts } from '../lib/clientMerge'
import { Button, Modal } from './ui'

type Choice = { keepId: string; skipped: Set<string> }

function fill(text: string, params: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

/**
 * The clients that look repeated, a group at a time: which one to keep and which of the others to
 * fold into it. Ones with a different NUI start left out, since they may be another business.
 */
export function ClientMergeModal({
  groups,
  invoicedLabel,
  texts,
  onClose,
}: {
  groups: DuplicateGroup[]
  invoicedLabel: (id: string) => string
  texts: MergeTexts
  onClose: () => void
}) {
  const { refresh } = useAppData()
  const { t } = useI18n()
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [merged, setMerged] = useState(0)

  const choiceOf = useMemo(
    () => (group: DuplicateGroup): Choice => {
      const saved = choices[group.key]
      if (saved && group.members.some((item) => item.id === saved.keepId)) return saved
      return { keepId: group.keepId, skipped: new Set(group.differentId) }
    },
    [choices],
  )

  const plan = (group: DuplicateGroup) => {
    const choice = choiceOf(group)
    return { keepId: choice.keepId, mergeIds: group.members.filter((item) => item.id !== choice.keepId && !choice.skipped.has(item.id)).map((item) => item.id) }
  }

  const run = async (list: DuplicateGroup[]) => {
    setBusy(true)
    setError('')
    let count = 0
    try {
      for (const group of list) {
        const body = plan(group)
        if (body.mergeIds.length === 0) continue
        const res = await api<{ merged: number }>('/api/clients/merge', { method: 'POST', body })
        count += res.merged
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setMerged((prev) => prev + count)
      await refresh().catch(() => {})
      setBusy(false)
    }
  }

  const setKeep = (group: DuplicateGroup, keepId: string) => {
    const keep = group.members.find((item) => item.id === keepId)!
    const skipped = new Set(group.members.filter((item) => item.id !== keepId && nuiDiffers(keep, item)).map((item) => item.id))
    setChoices((prev) => ({ ...prev, [group.key]: { keepId, skipped } }))
  }

  const toggle = (group: DuplicateGroup, id: string) => {
    const choice = choiceOf(group)
    const skipped = new Set(choice.skipped)
    if (skipped.has(id)) skipped.delete(id)
    else skipped.add(id)
    setChoices((prev) => ({ ...prev, [group.key]: { keepId: choice.keepId, skipped } }))
  }

  const mergeable = groups.filter((group) => plan(group).mergeIds.length > 0)

  return (
    <Modal
      title={texts.title}
      onClose={onClose}
      footer={
        <>
          {merged > 0 ? <span className="mr-auto text-sm font-semibold text-brand">{fill(texts.done, { count: merged })}</span> : null}
          <Button variant="secondary" onClick={onClose}>
            {texts.close}
          </Button>
          {mergeable.length > 1 ? (
            <Button disabled={busy} onClick={() => void run(mergeable)}>
              {busy ? texts.merging : texts.mergeAll}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4 p-6">
        <p className="text-sm text-brand-ink/65">{texts.intro}</p>
        {error ? <p className="rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm text-[#C0503A]">{error}</p> : null}
        {groups.length === 0 ? <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-brand-ink/55">{texts.none}</p> : null}
        {groups.map((group) => {
          const choice = choiceOf(group)
          const count = plan(group).mergeIds.length
          return (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-brand-ink/8 bg-white">
              <ul>
                {group.members.map((item) => {
                  const kept = item.id === choice.keepId
                  const included = !kept && !choice.skipped.has(item.id)
                  const keep = group.members.find((row) => row.id === choice.keepId)!
                  return (
                    <li key={item.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-brand-ink/5 px-4 py-3 last:border-0 ${kept ? 'bg-brand/5' : ''}`}>
                      <label className="flex items-center gap-2 text-xs font-semibold text-brand-ink/70">
                        <input type="radio" name={`keep-${group.key}`} checked={kept} onChange={() => setKeep(group, item.id)} className="accent-[var(--color-brand,#0F766E)]" />
                        {texts.keep}
                      </label>
                      <label className={`flex items-center gap-2 text-xs font-semibold ${kept ? 'invisible' : 'text-brand-ink/70'}`}>
                        <input type="checkbox" checked={included} disabled={kept} onChange={() => toggle(group, item.id)} />
                        {texts.include}
                      </label>
                      <span className="min-w-0 flex-1">
                        <Link to={`/app/clients/${item.id}`} className="block truncate font-semibold text-brand-ink hover:text-brand hover:underline">
                          {clientDisplayName(item)}
                        </Link>
                        <span className="block truncate text-xs text-brand-ink/45">
                          {[item.businessId, item.phone, item.email, item.address].filter(Boolean).join(' · ')}
                        </span>
                        {!kept && nuiDiffers(keep, item) ? <span className="block text-xs font-semibold text-[#B7791F]">{texts.otherNui}</span> : null}
                      </span>
                      <span className="text-right text-sm tabular-nums text-brand-ink/70">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-ink/40">{texts.invoiced}</span>
                        {invoicedLabel(item.id)}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="flex justify-end border-t border-brand-ink/8 bg-[#FAFBFB] px-4 py-2.5">
                <Button disabled={busy || count === 0} onClick={() => void run([group])}>
                  {busy ? texts.merging : `${texts.mergeGroup} (${count + 1})`}
                </Button>
              </div>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
