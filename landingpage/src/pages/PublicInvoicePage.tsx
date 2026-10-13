import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import { isLang, pdfLabelsIn, translateIn, type Lang } from '../i18n'
import { buildInvoiceHtml, downloadHtmlAsPdf, type Client, type CompanyProfile, type Invoice } from '../lib/invoice'
import { companyForPdf, displayCompanyValue } from '../lib/companySamples'

type Shared = { invoice: Invoice & { client: Client }; profile: CompanyProfile | null }

/** What a client sees from an invoice link: the invoice itself, in the sender's language, with a way to save it. */
export default function PublicInvoicePage() {
  const { token } = useParams()
  const [shared, setShared] = useState<Shared | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<Shared>(`/api/public/invoices/${encodeURIComponent(token || '')}`, { token: null })
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
        <button
          type="button"
          onClick={() => downloadHtmlAsPdf(html, `${shared.invoice.number}.pdf`)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
        >
          <Download className="h-4 w-4" />
          {translateIn(lang, 'send.publicDownload')}
        </button>
      </header>
      <main className="mx-auto w-full max-w-[860px] flex-1 p-4 sm:p-6">
        <iframe title={shared.invoice.number} sandbox="" srcDoc={html} className="h-[1160px] w-full rounded-lg border border-brand-ink/8 bg-white shadow-[0_2px_12px_rgba(29,43,46,0.08)]" />
      </main>
    </div>
  )
}
