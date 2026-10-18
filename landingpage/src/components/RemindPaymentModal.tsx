import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Check, CheckCircle2, Copy, Mail, Paperclip, Send } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { LANGS, translateIn, useI18n, type Lang } from '../i18n'
import { daysOverdue, formatMoneyList, parseLooseDate, remainingOf, totalsByCurrency } from '../lib/document'
import { formatMoney, formatStamp, lastReminderTime, owedInvoicesOfClient, type Invoice } from '../lib/invoice'
import { displayCompanyValue } from '../lib/companySamples'
import { mailErrorText, splitRecipients } from '../lib/mail'
import { cn } from '../lib/cn'
import { Button, Field, Modal, Select, TextArea } from './ui'

/** An invoice's date as DD.MM.YYYY, however it was typed; as it stands when it cannot be read. */
function letterDate(value?: string) {
  const date = parseLooseDate(value)
  if (!date) return String(value || '')
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

/** Above this many invoices the server sends the reminder without the PDFs. */
const PDF_MAX = 10

/** What is still owed on these invoices, one amount per currency. */
function owedTotal(list: Invoice[], fallbackCurrency: string) {
  return formatMoneyList(
    totalsByCurrency(
      list.map((item) => ({ ...item, currency: item.currency || fallbackCurrency })),
      (item) => remainingOf(item),
    ),
    formatMoney,
  )
}

/**
 * Reminding a client to pay. It opens from one invoice and covers every invoice of that client
 * that is still owed, so the client gets a single message; any of them can be left out. With the
 * company mailbox connected the email goes out from here with the invoices attached; without it
 * the same text is handed to the user's own mail program. Either way each covered invoice is
 * marked as reminded.
 */
export function RemindPaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { invoices, profile, mail, remindInvoices } = useAppData()
  const { t, lang: uiLang } = useI18n()
  const client = invoice.clientSnapshot || invoice.client

  // Fixed when the dialog opens, so a row does not vanish from under the user while they read.
  const [owed] = useState(() => {
    const list = owedInvoicesOfClient(invoices, invoice)
    return list.some((item) => item.id === invoice.id) ? list : [invoice, ...list]
  })
  const [chosenIds, setChosenIds] = useState(() => new Set(owed.map((item) => item.id)))
  const [messageLang, setMessageLang] = useState<Lang>(uiLang)
  const [to, setTo] = useState(client?.email || '')
  const [cc, setCc] = useState('')
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachPdf, setAttachPdf] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [receipt, setReceipt] = useState<{ to: string[]; subject: string; numbers: string[]; attached: number; at: string } | null>(null)

  const senders = mail?.from || []
  const direct = senders.length > 0
  const sender = senders.some((item) => item.email === from) ? from : senders[0]?.email || ''
  const chosen = useMemo(() => owed.filter((item) => chosenIds.has(item.id)), [owed, chosenIds])
  const fallbackCurrency = profile?.currency || 'EUR'

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
    // One short line per invoice, and no links: the client has the invoices already.
    const lines = chosen
      .map((item) => say('remind.line', { number: item.number, date: letterDate(item.date), amount: formatMoney(remainingOf(item), item.currency || fallbackCurrency) }))
      .join('\n')
    return {
      subject:
        chosen.length === 1
          ? say('remind.subjectOne', { number: chosen[0].number, company: company || 'Next Invoice' })
          : say('remind.subjectMany', { count: chosen.length, company: company || 'Next Invoice' }),
      body: say('remind.body', {
        intro: say(chosen.length === 1 ? 'remind.introOne' : 'remind.introMany'),
        lines,
        total: owedTotal(chosen, fallbackCurrency),
        payment: bank ? `\n${say('send.paymentLine', { details: bank })}\n` : '',
        sender: company || person,
      }),
    }
  }, [profile, fallbackCurrency, messageLang, chosen])

  // The text follows the chosen invoices and language; edits made after that are the user's.
  useEffect(() => {
    setSubject(drafted.subject)
    setBody(drafted.body)
  }, [drafted])

  function toggle(id: string) {
    setChosenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(record: boolean) {
    if (chosen.length === 0) {
      setError(t('remind.none'))
      return
    }
    const recipients = splitRecipients(to)
    if (!record && (!recipients?.length || !splitRecipients(cc))) {
      setError(t('send.invalidTo'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const ids = chosen.map((item) => item.id)
      if (record) {
        await remindInvoices({ ids, record: true })
        onClose()
        return
      }
      const res = await remindInvoices({ ids, from: sender, to, cc, subject, body, lang: messageLang, attachPdf: attachPdf && Boolean(mail?.pdf) })
      setReceipt({ to: recipients || [], subject, numbers: chosen.map((item) => item.number), attached: res.attached, at: new Date().toISOString() })
    } catch (err) {
      setError(mailErrorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(`${subject}\n\n${body}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (receipt) {
    const rows: [string, string][] = [
      [t('send.to'), receipt.to.join(', ')],
      [t('send.subject'), receipt.subject],
      [t('remind.receiptInvoices'), receipt.numbers.join(', ')],
      [t('send.receiptAttachment'), receipt.attached > 0 ? t('remind.receiptAttachments', { count: receipt.attached }) : t('send.receiptNoAttachment')],
      [t('send.receiptTime'), formatStamp(receipt.at)],
    ]
    return (
      <Modal
        size="sm"
        title={t('remind.receiptTitle')}
        onClose={onClose}
        footer={
          <Button type="button" autoFocus className="min-w-28" onClick={onClose}>
            {t('send.receiptOk')}
          </Button>
        }
      >
        <div className="bg-white p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-9 w-9 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-base font-semibold">{t('remind.receiptHeadline')}</p>
              <p className="mt-1 text-sm leading-6 text-brand-ink/60">{t('remind.receiptNote', { count: receipt.numbers.length })}</p>
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

  const lastOnOpened = lastReminderTime(invoice)
  const count = invoice.reminders?.length || 0
  const linkButton = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition'
  const mailto = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <Modal
      title={t('remind.title', { client: client?.fullName || invoice.number })}
      onClose={onClose}
      footer={
        <>
          <p className={cn('mr-auto flex min-w-0 flex-[1_1_10rem] items-center gap-2 text-sm font-semibold', count ? 'text-[#8A5A00]' : 'text-brand-ink/50')}>
            {count ? <BellRing className="h-4 w-4 shrink-0" /> : null}
            <span className="min-w-0 truncate">{count ? `${t('remind.sentCount', { count })} · ${t('remind.lastSent', { date: lastOnOpened })}` : t('remind.neverSent')}</span>
          </p>
          <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" variant={direct ? 'ghost' : 'primary'} className="shrink-0 whitespace-nowrap" disabled={busy || chosen.length === 0} onClick={() => void submit(true)}>
            <Check className="h-4 w-4" />
            {t('remind.markReminded')}
          </Button>
          {direct ? (
            <Button type="button" className="shrink-0 whitespace-nowrap" disabled={busy || chosen.length === 0 || !sender} onClick={() => void submit(false)}>
              <Send className="h-4 w-4" />
              {busy ? t('send.sending') : t('remind.sendNow')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5 bg-white p-6">
        {!direct && mail ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t('send.connectTitle')}</p>
              <p className="mt-0.5 text-xs leading-5 text-brand-ink/60">{t('remind.connectHint')}</p>
            </div>
            <Link to="/app/profile#email" className={cn(linkButton, 'border border-brand bg-white px-3 py-2 text-xs text-brand hover:bg-brand hover:text-white')}>
              <Mail className="h-3.5 w-3.5" />
              {t('send.connectAction')}
            </Link>
          </div>
        ) : null}

        <div>
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('remind.invoices')}</p>
          <div className="overflow-hidden rounded-xl border border-brand-ink/8">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="w-10 py-2.5 pl-4" />
                  <th className="px-3 py-2.5 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('newInvoice.date')}</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">{t('remind.dueDate')}</th>
                  <th className="px-3 py-2.5 pr-4 text-right font-semibold">{t('remind.remaining')}</th>
                </tr>
              </thead>
              <tbody>
                {owed.map((item) => {
                  const late = daysOverdue(item)
                  const times = item.reminders?.length || 0
                  return (
                    <tr key={item.id} className="border-t border-brand-ink/5">
                      <td className="py-2.5 pl-4">
                        <input
                          type="checkbox"
                          aria-label={item.number}
                          checked={chosenIds.has(item.id)}
                          onChange={() => toggle(item.id)}
                          className="h-4 w-4 cursor-pointer accent-[#2C6E7F]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{item.number}</span>
                        {times ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#FFF6E5] px-2 py-0.5 text-[11px] font-semibold text-[#8A5A00]" title={t('remind.lastSent', { date: lastReminderTime(item) })}>
                            <BellRing className="h-3 w-3" />
                            {t('remind.sentCount', { count: times })}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-brand-ink/70">{item.date}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-brand-ink/70 sm:table-cell">
                        {item.dueDate || t('pdf.onReceipt')}
                        {late > 0 ? <span className="ml-2 text-xs font-semibold text-[#C0503A]">{t('docs.overdueDays', { days: late })}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right font-semibold tabular-nums">{formatMoney(remainingOf(item), item.currency || fallbackCurrency)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-brand-ink/8 bg-[#FAFBFB]">
                  <td colSpan={2} className="py-2.5 pl-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">
                    {t('remind.total')}
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td colSpan={2} className="px-3 py-2.5 pr-4 text-right font-semibold tabular-nums">
                    {owedTotal(chosen, fallbackCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

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
        <TextArea label={t('send.message')} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />

        {direct && mail?.pdf ? (
          chosen.length > PDF_MAX ? (
            <p className="text-xs leading-5 text-brand-ink/50">{t('remind.tooManyPdf')}</p>
          ) : (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 rounded border-brand-ink/25 accent-[#2C6E7F]" />
              <Paperclip className="h-4 w-4 text-brand-ink/45" />
              {t('remind.attachPdf')}
            </label>
          )
        ) : null}

        <div className={cn(direct && 'border-t border-brand-ink/8 pt-4')}>
          {direct ? <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('send.otherWays')}</p> : null}
          <div className="flex flex-wrap gap-2">
            <a href={mailto} className={cn(linkButton, direct ? 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5' : 'bg-brand text-white shadow-sm hover:bg-brand-dark')}>
              <Mail className="h-4 w-4" />
              {t('send.openMail')}
            </a>
            <button type="button" onClick={() => void copyMessage()} className={cn(linkButton, 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5')}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t('send.copied') : t('send.copyMessage')}
            </button>
          </div>
        </div>

        <div role="alert">{error ? <p className="text-sm leading-6 text-[#C0503A]">{error}</p> : null}</div>
      </div>
    </Modal>
  )
}
