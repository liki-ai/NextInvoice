import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Link2, Mail, Send } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { LANGS, translateIn, useI18n, type Lang } from '../i18n'
import { isInvoiceSent, parseLooseDate } from '../lib/document'
import { buildInvoiceHtml, downloadHtmlAsPdf, formatMoney, type Invoice } from '../lib/invoice'
import { companyForPdf, displayCompanyValue } from '../lib/companySamples'
import { cn } from '../lib/cn'
import { Button, Field, Modal, TextArea } from './ui'

function shareUrl(token: string) {
  return `${window.location.origin}/i/?t=${token}`
}

function formatSentDate(value?: string) {
  const date = parseLooseDate(value)
  if (!date) return ''
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

/**
 * Sending an invoice: an email ready to go in the user's own mail program, carrying a link where
 * the client reads and downloads the invoice. Also the place to say by hand that it was (or was not) sent.
 */
export function SendInvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { profile, shareInvoice, issueInvoice, updateInvoice } = useAppData()
  const { t, lang: uiLang, dict } = useI18n()
  const draft = invoice.lifecycle === 'draft'
  const sent = isInvoiceSent(invoice)
  const client = invoice.clientSnapshot || invoice.client
  const currency = invoice.currency || profile?.currency || 'EUR'

  const [token, setToken] = useState(invoice.shareToken || '')
  const [messageLang, setMessageLang] = useState<Lang>(uiLang)
  const [to, setTo] = useState(client?.email || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [opened, setOpened] = useState(false)

  const link = token ? shareUrl(token) : ''

  // The link exists only for issued invoices; a draft is issued first, on the user's say-so.
  useEffect(() => {
    if (draft || token) return
    let cancelled = false
    shareInvoice(invoice.id)
      .then((value) => {
        if (!cancelled) setToken(value)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('common.error'))
      })
    return () => {
      cancelled = true
    }
  }, [draft, token, invoice.id, shareInvoice, t])

  const drafted = useMemo(() => {
    const company = displayCompanyValue('companyName', profile?.companyName)
    const person = displayCompanyValue('contactPerson', profile?.contactPerson)
    const bank = [profile?.bankName, profile?.iban ? `IBAN ${profile.iban}` : '', profile?.swift ? `SWIFT ${profile.swift}` : ''].filter(Boolean).join(', ')
    const say = (key: string, params?: Record<string, string | number>) => translateIn(messageLang, key, params)
    return {
      subject: say('send.defaultSubject', { number: invoice.number, company: company || 'Next Invoice' }),
      body: say('send.defaultBody', {
        number: invoice.number,
        date: invoice.date,
        total: formatMoney(Number(invoice.total) || 0, currency),
        due: invoice.dueDate || say('pdf.onReceipt'),
        link: link || '…',
        payment: bank ? `\n${say('send.paymentLine', { details: bank })}\n` : '',
        sender: [person, company].filter(Boolean).join('\n'),
      }),
    }
  }, [profile, messageLang, invoice.number, invoice.date, invoice.dueDate, invoice.total, currency, link])

  // The text follows the chosen language and the link; once sent to the mail program it is the user's.
  useEffect(() => {
    setSubject(drafted.subject)
    setBody(drafted.body)
  }, [drafted])

  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const mailto = `mailto:${encodeURIComponent(to.trim())}?${query}`
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  async function copy(kind: 'link' | 'message', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1600)
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  function onDownload() {
    if (!profile || !client) return
    downloadHtmlAsPdf(
      buildInvoiceHtml({
        company: companyForPdf(invoice, profile, t),
        client,
        invoice,
        pdfLabels: { ...dict.pdf, amountDue: t('docs.amountDue'), amountPaid: t('docs.amountPaid') },
      }),
      `${invoice.number}.pdf`,
    )
  }

  const ready = !draft && Boolean(link)
  const linkButton = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition'

  return (
    <Modal
      title={t('send.title', { number: invoice.number })}
      onClose={onClose}
      footer={
        <>
          <p className={cn('mr-auto flex items-center gap-2 text-sm font-semibold', sent ? 'text-brand' : 'text-brand-ink/50')}>
            {sent ? <Check className="h-4 w-4" /> : null}
            {sent ? (formatSentDate(invoice.sentAt) ? t('send.sentOn', { date: formatSentDate(invoice.sentAt) }) : t('send.sentNoDate')) : t('send.notSentYet')}
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {draft ? null : sent ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(() => updateInvoice(invoice.id, { sent: false, sentAt: '' }).then(onClose))}>
              {t('send.markUnsent')}
            </Button>
          ) : (
            <Button
              type="button"
              variant={opened ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => void run(() => updateInvoice(invoice.id, { sent: true, sentAt: new Date().toISOString() }).then(onClose))}
            >
              <Check className="h-4 w-4" />
              {t('send.markSent')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 bg-white p-6">
        {draft ? (
          <div className="rounded-xl border border-[#E8B84A] bg-[#FFF6E5] px-4 py-3">
            <p className="text-sm leading-6 text-[#8A5A00]">{t('send.draftNote')}</p>
            <Button type="button" className="mt-3" disabled={busy} onClick={() => void run(async () => setToken(await issueInvoice(invoice.id).then(() => shareInvoice(invoice.id))))}>
              <Send className="h-4 w-4" />
              {busy ? t('common.loading') : t('send.issueAndPrepare')}
            </Button>
          </div>
        ) : null}

        <div className={cn('space-y-5', !ready && 'pointer-events-none opacity-50')} aria-disabled={!ready}>
          <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label={t('send.to')} type="email" value={to} placeholder={t('send.toPlaceholder')} autoComplete="email" onChange={(e) => setTo(e.target.value)} />
            <div className="mb-5">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('send.messageLanguage')}</p>
              <div className="flex rounded-xl bg-brand-bg p-1" role="radiogroup" aria-label={t('send.messageLanguage')}>
                {LANGS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={messageLang === item.code}
                    onClick={() => setMessageLang(item.code)}
                    className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition', messageLang === item.code ? 'bg-white text-brand-ink shadow-sm' : 'text-brand-ink/55 hover:text-brand-ink')}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Field label={t('send.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <TextArea label={t('send.message')} rows={9} value={body} onChange={(e) => setBody(e.target.value)} />

          <div className="rounded-xl border border-brand-ink/8 bg-brand-bg px-4 py-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">
              <Link2 className="h-3.5 w-3.5" />
              {t('send.link')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-brand-ink/75">{link || t('send.preparing')}</code>
              <button type="button" disabled={!link} onClick={() => void copy('link', link)} className={cn(linkButton, 'border border-brand-ink/12 bg-white px-3 py-2 text-xs hover:border-brand/30')}>
                {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === 'link' ? t('send.copied') : t('send.copyLink')}
              </button>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className={cn(linkButton, 'px-2 py-2 text-xs text-brand hover:bg-brand/8')} aria-label={t('newInvoice.preview')}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-brand-ink/50">{t('send.linkHint')}</p>
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              <a href={mailto} onClick={() => setOpened(true)} className={cn(linkButton, 'bg-brand text-white shadow-sm hover:bg-brand-dark')}>
                <Mail className="h-4 w-4" />
                {t('send.openMail')}
              </a>
              <a href={gmail} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className={cn(linkButton, 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5')}>
                <ExternalLink className="h-4 w-4" />
                {t('send.openGmail')}
              </a>
              <button type="button" onClick={() => void copy('message', `${subject}\n\n${body}`)} className={cn(linkButton, 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5')}>
                {copied === 'message' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === 'message' ? t('send.copied') : t('send.copyMessage')}
              </button>
              <button type="button" onClick={onDownload} className={cn(linkButton, 'text-brand-ink/70 hover:bg-brand-ink/5 hover:text-brand-ink')}>
                <Download className="h-4 w-4" />
                {t('send.downloadPdf')}
              </button>
            </div>
            <p className="mt-2 text-xs text-brand-ink/50">{t('send.howTo')}</p>
          </div>
        </div>

        {error ? <p className="text-sm text-[#C0503A]">{error}</p> : null}
      </div>
    </Modal>
  )
}
