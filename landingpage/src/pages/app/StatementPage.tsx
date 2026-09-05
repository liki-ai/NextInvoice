import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Modal } from '../../components/ui'
import {
  buildStatementHtml,
  clientKey,
  clientUnpaidSummaries,
  downloadHtmlAsPdf,
  formatMoney,
  formatStatementFileDate,
  statementFileName,
} from '../../lib/invoice'
import { localizeCompanyProfile, isSampleCompanyValue } from '../../lib/companySamples'
import { parseLooseDate, remainingOf } from '../../lib/document'
import { buildOverview } from '../../lib/overview'

function companyForStatement(profile: Parameters<typeof localizeCompanyProfile>[0], t: (key: string) => string) {
  const company = localizeCompanyProfile(profile, t)
  return {
    ...company,
    email: isSampleCompanyValue('email', profile?.email) ? '' : company.email,
    phone: isSampleCompanyValue('phone', profile?.phone) ? '' : company.phone,
  }
}

export function StatementPage() {
  const { invoices, profile, loading } = useAppData()
  const { t, dict } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [preview, setPreview] = useState(false)
  const fromOverview = searchParams.get('from') === 'overview'
  const asOfRaw = searchParams.get('asOf')
  const asOf = parseLooseDate(asOfRaw)
  const fallbackCurrency = profile?.currency || 'EUR'
  const currency = searchParams.get('currency') || fallbackCurrency
  const summaries = useMemo(() => {
    if (!asOf) return clientUnpaidSummaries(invoices)
    const report = buildOverview({
      invoices,
      obligations: [],
      period: { start: asOf, end: asOf, preset: 'custom' },
      currency,
      fallbackCurrency,
    })
    return report.customers.map((item) => ({
      client: {
        fullName: item.client?.fullName || '',
        address: item.client?.address || '',
        phone: item.client?.phone || '',
        email: item.client?.email || '',
      },
      clientId: item.clientId,
      unpaid: item.invoices.flatMap((inv) => {
        const original = invoices.find((row) => row.id === inv.id)
        return original ? [{ ...original, amountDue: inv.amountDueAsOf }] : []
      }),
      unpaidCount: item.invoices.length,
      unpaidTotal: item.amount,
      paidTotal: 0,
    }))
  }, [invoices, asOf, currency, fallbackCurrency])
  const clientId = searchParams.get('clientId') || ''
  const selectedKey = clientKey(searchParams.get('client') || summaries[0]?.client.fullName)
  const selected =
    summaries.find((item) => {
      const id = 'clientId' in item ? String(item.clientId || '') : ''
      return (clientId && id === clientId) || clientKey(item.client.fullName) === selectedKey
    }) || summaries[0]
  const issuedDate = formatStatementFileDate(asOf || new Date())
  const overviewBack = (() => {
    const params = new URLSearchParams()
    params.set('currency', currency)
    const preset = searchParams.get('preset')
    if (preset) params.set('preset', preset)
    const year = searchParams.get('year')
    if (year) params.set('year', year)
    const month = searchParams.get('month')
    if (month) params.set('month', month)
    const rangeFrom = searchParams.get('rangeFrom')
    const rangeTo = searchParams.get('rangeTo')
    if (rangeFrom) params.set('from', rangeFrom)
    if (rangeTo) params.set('to', rangeTo)
    return `/app/overview?${params.toString()}`
  })()

  const html = useMemo(() => {
    if (!selected || !profile || !preview) return ''
    return buildStatementHtml({
      company: companyForStatement(profile, t),
      client: selected.client,
      invoices: selected.unpaid,
      paidTotal: selected.paidTotal,
      issuedDate,
      pdfLabels: dict.pdf,
      showPayments: false,
    })
  }, [selected, profile, preview, issuedDate, dict.pdf, t])

  function selectClient(name: string, id?: string) {
    const next = new URLSearchParams(searchParams)
    next.set('client', name)
    if (id) next.set('clientId', id)
    setSearchParams(next)
    setPreview(false)
  }

  function onDownload() {
    if (!selected || !profile) return
    const doc = buildStatementHtml({
      company: companyForStatement(profile, t),
      client: selected.client,
      invoices: selected.unpaid,
      paidTotal: selected.paidTotal,
      issuedDate,
      pdfLabels: dict.pdf,
      showPayments: false,
    })
    downloadHtmlAsPdf(doc, statementFileName(selected.client.fullName, issuedDate))
    setPreview(false)
  }

  return (
    <div>
      <Link to={fromOverview ? overviewBack : '/app'} className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {fromOverview ? t('nav.overview') : t('nav.invoices')}
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">{t('statement.title')}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{t('statement.subtitle')}</p>
          {asOfRaw ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('statement.asOf', { date: asOfRaw })}</p> : null}
        </div>
        {selected ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setPreview(true)}>
              <Send className="h-4 w-4" />
              {t('statement.cta')}
            </Button>
          </div>
        ) : null}
      </div>

      {loading && invoices.length === 0 ? <p className="mt-12 text-brand-ink/55">{t('common.loading')}</p> : null}

      {!loading && summaries.length === 0 ? (
        <Card className="mt-8">
          <p className="text-sm text-brand-ink/60">{t('statement.empty')}</p>
        </Card>
      ) : null}

      {summaries.length > 0 ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('statement.selectClient')}</h2>
            <div className="mt-4 space-y-2">
              {summaries.map((item) => {
                const active = clientKey(item.client.fullName) === clientKey(selected?.client.fullName)
                return (
                  <button
                    key={item.client.fullName}
                    type="button"
                    onClick={() => selectClient(item.client.fullName, 'clientId' in item ? String(item.clientId || '') : undefined)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${
                      active ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink hover:bg-brand/10'
                    }`}
                  >
                    <p className="text-sm font-semibold">{item.client.fullName}</p>
                    <p className={`mt-1 text-xs ${active ? 'text-white/80' : 'text-brand-ink/50'}`}>
                      {t('statement.unpaidCount', { count: item.unpaidCount })} · {formatMoney(item.unpaidTotal, currency)}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {selected ? (
            <div className="space-y-6">
              <Card>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{dict.pdf.billedTo}</h2>
                <p className="mt-3 text-lg font-semibold">{selected.client.fullName}</p>
                {selected.client.address ? <p className="mt-1 text-sm text-brand-ink/55">{selected.client.address}</p> : null}
                {selected.client.phone ? <p className="text-sm text-brand-ink/55">{selected.client.phone}</p> : null}
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{dict.pdf.ordersTotal}</p>
                  <p className="mt-2 font-display text-2xl font-medium">{formatMoney(selected.unpaidTotal, currency)}</p>
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{dict.pdf.paymentsTotal}</p>
                  <p className="mt-2 font-display text-2xl font-medium">{formatMoney(selected.paidTotal, currency)}</p>
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{dict.pdf.balanceDue}</p>
                  <p className="mt-2 font-display text-2xl font-medium">{formatMoney(selected.unpaidTotal, currency)}</p>
                </Card>
              </div>

              <Card className="overflow-hidden p-0">
                <div className="border-b border-brand-ink/8 px-6 py-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('statement.invoicesLabel')}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold">{t('newInvoice.invoiceNumber')}</th>
                      <th className="px-6 py-3 text-left font-semibold">{t('newInvoice.date')}</th>
                      <th className="px-6 py-3 text-right font-semibold">{t('invoiceList.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.unpaid.map((item) => (
                      <tr key={item.id} className="border-t border-brand-ink/5">
                        <td className="px-6 py-3">
                          <Link to={`/app/invoices/${item.id}`} className="font-semibold text-brand hover:underline">
                            {item.number}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-brand-ink/60">{item.date}</td>
                        <td className="px-6 py-3 text-right font-semibold">{formatMoney(remainingOf(item), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {preview && selected ? (
        <Modal
          title={t('statement.previewTitle')}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={onDownload}>
                {t('common.send')}
              </Button>
            </>
          }
        >
          <iframe title="statement-preview" className="h-[70vh] w-full bg-white" srcDoc={html} />
        </Modal>
      ) : null}
    </div>
  )
}
