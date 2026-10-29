import { useRef, useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { noteParts } from '../lib/invoiceTemplates'
import { Button, Card } from './ui'

/** Notes as the client sees them: the links clickable, opening in a new tab. */
export function NoteText({ notes, className }: { notes: string; className?: string }) {
  return (
    <p className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {noteParts(notes).map((part, index) =>
        part.href ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-brand underline hover:text-brand-dark">
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  )
}

function cleanUrl(value: string) {
  const text = value.trim()
  if (!text) return ''
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'https:' || url.protocol === 'http:' ? withScheme.replace(/\s/g, '') : ''
  } catch {
    return ''
  }
}

/**
 * The invoice's notes, under its items: large enough to read and write in, with a way to turn part of
 * the text into a link (a Stripe payment link, say) written as [text](address).
 */
export function InvoiceNotes({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const { t } = useI18n()
  const area = useRef<HTMLTextAreaElement>(null)
  const [linking, setLinking] = useState<{ start: number; end: number } | null>(null)
  const [linkText, setLinkText] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const hasLinks = noteParts(value).some((part) => part.href)

  function openLink() {
    const el = area.current
    const start = el ? el.selectionStart : value.length
    const end = el ? el.selectionEnd : value.length
    const selected = value.slice(start, end)
    // A selected address is the link itself; selected words are what the client sees.
    if (cleanUrl(selected) && /^\S+$/.test(selected.trim()) && /[./]/.test(selected)) {
      setUrl(selected.trim())
      setLinkText('')
    } else {
      setUrl('')
      setLinkText(selected.trim())
    }
    setError('')
    setLinking({ start, end })
  }

  function applyLink() {
    if (!linking) return
    const address = cleanUrl(url)
    if (!address) {
      setError(t('notesEditor.urlInvalid'))
      return
    }
    const shown = (linkText.trim() || t('notesEditor.defaultText')).replace(/[[\]]/g, '')
    const inserted = `[${shown}](${address})`
    const next = value.slice(0, linking.start) + inserted + value.slice(linking.end)
    onChange(next)
    setLinking(null)
    const caret = linking.start + inserted.length
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(caret, caret)
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{label}</h2>
        <button
          type="button"
          // Keeps the selection in the text while the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLink}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF5F7] px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand/10"
        >
          <Link2 className="h-4 w-4" />
          {t('notesEditor.addLink')}
        </button>
      </div>
      <textarea
        ref={area}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-3 text-base leading-relaxed text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
      />
      {linking ? (
        <div className="mt-3 rounded-xl border border-brand/20 bg-[#F4F9FA] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('notesEditor.linkText')}</span>
              <input
                value={linkText}
                placeholder={t('notesEditor.defaultText')}
                onChange={(e) => setLinkText(e.target.value)}
                className="rounded-lg border border-brand-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('notesEditor.url')}</span>
              <input
                value={url}
                autoFocus
                inputMode="url"
                placeholder={t('notesEditor.urlPlaceholder')}
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyLink()
                  }
                }}
                className="rounded-lg border border-brand-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </label>
          </div>
          {error ? <p className="mt-2 text-xs font-medium text-[#C0503A]">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLinking(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={applyLink}>
              <Link2 className="h-4 w-4" />
              {t('notesEditor.apply')}
            </Button>
          </div>
        </div>
      ) : null}
      {hasLinks ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#F7F8F9] px-3.5 py-2.5 text-sm">
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink/40" />
          <div className="min-w-0">
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('notesEditor.onInvoice')}</span>
            <NoteText notes={value} className="inline text-brand-ink/80" />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-brand-ink/50">{t('notesEditor.hint')}</p>
      )}
    </Card>
  )
}
