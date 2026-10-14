import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CreditCard, Download, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { isLang, pdfLabelsIn, translateIn, type Lang } from '../i18n'
import { buildInvoiceHtml, downloadHtmlAsPdf, type Client, type CompanyProfile, type Invoice } from '../lib/invoice'
import { companyForPdf, displayCompanyValue } from '../lib/companySamples'

type Shared = { invoice: Invoice & { client: Client }; profile: CompanyProfile | null; payment?: { card: boolean; url: string } }

/** What a client sees from an invoice link: the invoice itself, in the sender's language, with a way to save it. */
export default function PublicInvoicePage() {
  const params = useParams()
  const [search] = useSearchParams()
  const token = params.token || search.get('t') || ''
  const [shared, setShared] = useState<Shared | null>(null)
  const [failed, setFailed] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payFailed, setPayFailed] = useState(false)
  const autoPay = useRef(search.get('pay') === '1')
  const justPaid = search.get('paid') === '1'

  /** Opens the company's Stripe Checkout for what is still owed. */
  async function payByCard() {
    setPaying(true)
    setPayFailed(false)
    try {
      const res = await api<{ url: string }>(`/api/public/invoices/${encodeURIComponent(token)}/pay`, { method: 'POST', body: {}, token: null })
      window.location.assign(res.url)
    } catch {
      setPayFailed(true)
      setPaying(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api<Shared>(`/api/public/invoices/${encodeURIComponent(token)}`, { token: null })
      .then((res) => {
        if (!cancelled) setShared(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const lang: Lang = isLang(shared?.profile?.language) ? shared.profile.language : 'sq'
  const html = useMemo(() => {
    if (!shared?.profile) return ''
    return buildInvoiceHtml({
      company: companyForPdf(shared.invoice, shared.profile, (key) => translateIn(lang, key)),
      client: shared.invoice.client,
      invoice: shared.invoice,
      pdfLabels: pdfLabelsIn(lang),
    })
  }, [shared, lang])

  // The link in the email ("Pay now") goes straight on to the card payment.
  useEffect(() => {
    if (shared?.payment?.card && autoPay.current && !justPaid) {
      autoPay.current = false
      void payByCard()
    }
  })

  useEffect(() => {
    if (shared) document.title = `${shared.invoice.number} — ${displayCompanyValue('companyName', shared.profile?.companyName) || 'Next Invoice'}`
  }, [shared])

  if (failed || (shared && !shared.profile)) {
    return <div className="flex min-h-screen items-center justify-center px-6 text-center text-brand-ink/60">{translateIn('sq', 'send.publicInvalid')}</div>
  }
  if (!shared) {
    return <div className="flex min-h-screen items-center justify-center text-brand-ink/60">{translateIn('sq', 'common.loading')}</div>
  }

  const company = displayCompanyValue('companyName', shared.profile?.companyName)
  return (
    <div className="flex min-h-screen flex-col bg-brand-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-ink/8 bg-white px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{translateIn(lang, 'send.publicFrom', { company: company || 'Next Invoice' })}</p>
          <p className="text-xs text-brand-ink/50">
            {shared.invoice.number} · {shared.invoice.date}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        {shared.payment?.card ? (
          <button
            type="button"
            disabled={paying}
            onClick={() => void payByCard()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-ink/85 disabled:opacity-60"
          >
            <CreditCard className="h-4 w-4" />
            {translateIn(lang, 'recurring.pay.card')}
          </button>
        ) : shared.payment?.url ? (
          <a
            href={shared.payment.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-ink/85"
          >
            <ExternalLink className="h-4 w-4" />
            {translateIn(lang, 'recurring.pay.link')}
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => downloadHtmlAsPdf(html, `${shared.invoice.number}.pdf`)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <Download className="h-4 w-4" />
          {translateIn(lang, 'send.publicDownload')}
        </button>
        </div>
      </header>
      {justPaid ? <p className="bg-brand/10 px-5 py-3 text-center text-sm font-semibold text-brand">{translateIn(lang, 'recurring.pay.paid')}</p> : null}
      {payFailed ? <p className="bg-[#F8E8E4] px-5 py-3 text-center text-sm font-medium text-[#C0503A]">{translateIn(lang, 'recurring.pay.failed')}</p> : null}
      <main className="mx-auto w-full max-w-[860px] flex-1 p-4 sm:p-6">
        <iframe title={shared.invoice.number} sandbox="" srcDoc={html} className="h-[1160px] w-full rounded-lg border border-brand-ink/8 bg-white shadow-[0_2px_12px_rgba(29,43,46,0.08)]" />
      </main>
    </div>
  )
}
