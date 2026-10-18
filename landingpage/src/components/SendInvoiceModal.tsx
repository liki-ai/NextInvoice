import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, Copy, Download, ExternalLink, Link2, Mail, Paperclip, Send } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { LANGS, translateIn, useI18n, type Lang } from '../i18n'
import { isInvoiceSent, parseLooseDate } from '../lib/document'
import { buildInvoiceHtml, downloadHtmlAsPdf, formatMoney, type Invoice } from '../lib/invoice'
import { companyForPdf, displayCompanyValue } from '../lib/companySamples'
import { mailErrorText, splitRecipients } from '../lib/mail'
import { cn } from '../lib/cn'
import { Button, Field, Modal, Select, TextArea } from './ui'

function shareUrl(token: string) {
  return `${window.location.origin}/i/?t=${token}`
}

type EmailRecord = NonNullable<Invoice['emails']>[number]

function formatSentTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`
}

function formatSentDate(value?: string) {
  const date = parseLooseDate(value)
  if (!date) return ''
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

/**
 * Sending an invoice. With the company mailbox connected, the email goes out from here, from the
 * address the user picks, with the invoice attached. Without it, the same email is handed to the
 * user's own mail program. Either way it carries a link where the client reads and downloads the
 * invoice, and this is also the place to say by hand that it was (or was not) sent.
 */
export function SendInvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { profile, mail, shareInvoice, issueInvoice, updateInvoice, sendInvoiceEmail } = useAppData()
  const { t, lang: uiLang, dict } = useI18n()
  const navigate = useNavigate()
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
  const senders = mail?.from || []
  const direct = senders.length > 0
  const [from, setFrom] = useState('')
  const [cc, setCc] = useState('')
  const [attachPdf, setAttachPdf] = useState(true)
  const [sending, setSending] = useState(false)
  // Set once the email has gone out: the dialog then shows what was sent, and to whom.
  const [receipt, setReceipt] = useState<EmailRecord | null>(null)
  const sender = senders.some((item) => item.email === from) ? from : senders[0]?.email || ''
  const lastEmail = invoice.emails?.[invoice.emails.length - 1]

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
    const say = (key: string, params?: Record<string, string | number>) => translateIn(messageLang, key, params)
    const bank = [
      profile?.bankName,
      profile?.accountNumber ? `${say('pdf.accountLabel')} ${profile.accountNumber}` : '',
      profile?.iban ? `IBAN ${profile.iban}` : '',
      profile?.swift ? `SWIFT ${profile.swift}` : '',
    ]
      .filter(Boolean)
      .join(', ')
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

  async function onSend() {
    const recipients = splitRecipients(to)
    if (!recipients?.length || !splitRecipients(cc)) {
      setError(t('send.invalidTo'))
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await sendInvoiceEmail(invoice.id, { from: sender, to, cc, subject, body, lang: messageLang, attachPdf: attachPdf && Boolean(mail?.pdf) })
      const logged = res.invoice.emails?.[res.invoice.emails.length - 1]
      setReceipt(logged || { at: new Date().toISOString(), from: sender, to: recipients, cc: splitRecipients(cc) || [], subject, attached: res.attached })
    } catch (err) {
      setError(mailErrorText(err, t))
    } finally {
      setSending(false)
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

  if (receipt) {
    // The invoice is already marked sent; OK goes back to the list, where its row shows it.
    const done = () => {
      onClose()
      navigate('/app')
    }
    const senderName = senders.find((item) => item.email === receipt.from)?.name
    const rows: [string, string][] = [
      [t('send.from'), senderName ? `${senderName} <${receipt.from}>` : receipt.from],
      [t('send.to'), receipt.to.join(', ')],
      ...(receipt.cc?.length ? [[t('send.cc'), receipt.cc.join(', ')] as [string, string]] : []),
      [t('send.subject'), receipt.subject],
      [t('send.receiptInvoice'), `${invoice.number} · ${formatMoney(Number(invoice.total) || 0, currency)}`],
      [t('send.receiptAttachment'), receipt.attached ? `${invoice.number}.pdf` : t('send.receiptNoAttachment')],
      [t('send.receiptTime'), formatSentTime(receipt.at)],
    ]
    return (
      <Modal
        size="sm"
        title={t('send.receiptTitle')}
        onClose={done}
        footer={
          <Button type="button" autoFocus className="min-w-28" onClick={done}>
            {t('send.receiptOk')}
          </Button>
        }
      >
        <div className="bg-white p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-9 w-9 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-base font-semibold">{t('send.receiptHeadline')}</p>
              <p className="mt-1 text-sm leading-6 text-brand-ink/60">{t('send.receiptNote', { number: invoice.number })}</p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-brand-ink/8 rounded-xl border border-brand-ink/8 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-2.5">
                <dt className="text-[11px] font-semibold uppercase leading-5 tracking-[0.08em] text-brand-ink/45">{label}</dt>
                <dd className="min-w-0 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={t('send.title', { number: invoice.number })}
      onClose={onClose}
      footer={
        <>
          <p className={cn('mr-auto flex min-w-0 flex-[1_1_10rem] items-center gap-2 text-sm font-semibold', sent ? 'text-brand' : 'text-brand-ink/50')}>
            {sent ? <Check className="h-4 w-4 shrink-0" /> : null}
            <span className="min-w-0 truncate">
              {sent ? (formatSentDate(invoice.sentAt) ? t('send.sentOn', { date: formatSentDate(invoice.sentAt) }) : t('send.sentNoDate')) : t('send.notSentYet')}
              {sent && lastEmail ? ` · ${t('send.emailedTo', { to: lastEmail.to.join(', ') })}` : ''}
            </span>
          </p>
          <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={onClose}>
            {t('common.close')}
          </Button>
          {draft ? null : sent ? (
            <Button type="button" variant="ghost" className="shrink-0 whitespace-nowrap" disabled={busy || sending} onClick={() => void run(() => updateInvoice(invoice.id, { sent: false, sentAt: '' }).then(onClose))}>
              {t('send.markUnsent')}
            </Button>
          ) : (
            <Button
              type="button"
              variant={opened && !direct ? 'primary' : 'secondary'}
              className="shrink-0 whitespace-nowrap"
              disabled={busy || sending}
              onClick={() => void run(() => updateInvoice(invoice.id, { sent: true, sentAt: new Date().toISOString() }).then(onClose))}
            >
              <Check className="h-4 w-4" />
              {t('send.markSent')}
            </Button>
          )}
          {direct && !draft ? (
            <Button type="button" className="shrink-0 whitespace-nowrap" disabled={!ready || sending || busy || !sender} onClick={() => void onSend()}>
              <Send className="h-4 w-4" />
              {sending ? t('send.sending') : t('send.sendNow')}
            </Button>
          ) : null}
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

        {!direct && mail && !draft ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('send.connectTitle')}</p>
              <p className="mt-0.5 text-xs leading-5 text-brand-ink/60">{t('send.connectHint')}</p>
            </div>
            <Link to="/app/profile#email" className={cn(linkButton, 'border border-brand bg-white px-3 py-2 text-xs text-brand hover:bg-brand hover:text-white')}>
              <Mail className="h-3.5 w-3.5" />
              {t('send.connectAction')}
            </Link>
          </div>
        ) : null}

        <div className={cn('space-y-5', !ready && 'pointer-events-none opacity-50')} aria-disabled={!ready}>
          {direct ? (
            <Select label={t('send.from')} value={sender} onChange={(e) => setFrom(e.target.value)}>
              {senders.map((item) => (
                <option key={item.email} value={item.email}>
                  {item.name ? `${item.name} <${item.email}>` : item.email}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className={cn(direct && 'grid gap-x-4 sm:grid-cols-2')}>
              <Field label={t('send.to')} type={direct ? 'text' : 'email'} inputMode="email" value={to} placeholder={t('send.toPlaceholder')} autoComplete="email" title={direct ? t('send.recipientsHint') : undefined} onChange={(e) => setTo(e.target.value)} />
              {direct ? <Field label={t('send.cc')} inputMode="email" value={cc} placeholder={t('send.ccPlaceholder')} autoComplete="off" wrapperClassName="last:mb-5" title={t('send.recipientsHint')} onChange={(e) => setCc(e.target.value)} /> : null}
            </div>
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

          {direct && mail?.pdf ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 rounded border-brand-ink/25 accent-[#2C6E7F]" />
              <Paperclip className="h-4 w-4 text-brand-ink/45" />
              {t('send.attachPdf')}
              <span className="font-normal text-brand-ink/45">{invoice.number}.pdf</span>
            </label>
          ) : null}

          <div className={cn(direct && 'border-t border-brand-ink/8 pt-4')}>
            {direct ? <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('send.otherWays')}</p> : null}
            <div className="flex flex-wrap gap-2">
              <a
                href={mailto}
                onClick={() => setOpened(true)}
                className={cn(linkButton, direct ? 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5' : 'bg-brand text-white shadow-sm hover:bg-brand-dark')}
              >
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
            {direct ? null : <p className="mt-2 text-xs text-brand-ink/50">{t('send.howTo')}</p>}
          </div>
        </div>

        <div role="alert">{error ? <p className="text-sm leading-6 text-[#C0503A]">{error}</p> : null}</div>
      </div>
    </Modal>
  )
}
