import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card } from '../../components/ui'
import { buildInvoiceHtml, downloadHtmlAsPdf, formatMoney } from '../../lib/invoice'

export function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const { invoices, profile, loading, removeInvoice } = useAppData()
  const { t, dict } = useI18n()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const invoice = invoices.find((item) => item.id === invoiceId)
  const currency = profile?.currency || 'EUR'

  const html = useMemo(() => {
    if (!invoice || !profile || !preview) return ''
    return buildInvoiceHtml({
      company: profile,
      client: invoice.client,
      invoice,
      pdfLabels: dict.pdf,
    })
  }, [invoice, profile, preview, dict.pdf])

  if (!invoice) {
    return <p className="text-brand-ink/60">{loading ? t('common.loading') : t('invoiceList.empty')}</p>
  }

  const current = invoice

  async function onDelete() {
    if (!confirm(t('invoiceList.deleteConfirm'))) return
    setBusy(true)
    try {
      await removeInvoice(current.id)
      navigate('/app')
    } finally {
      setBusy(false)
    }
  }

  function onDownload() {
    if (!profile) return
    const doc = buildInvoiceHtml({
      company: profile,
      client: current.client,
      invoice: current,
      pdfLabels: dict.pdf,
    })
    downloadHtmlAsPdf(doc, `${current.number}.pdf`)
  }

  return (
    <div>
      <Link to="/app" className="text-sm font-bold text-brand">
        ← {t('nav.invoices')}
      </Link>
      <h1 className="mt-3 font-display text-3xl font-medium">{t('invoiceDetail.title')}</h1>

      <Card className="mt-6">
        <p className="font-semibold">
          {t('newInvoice.invoiceNumber')}: {invoice.number}
        </p>
        <p className="text-sm text-brand-ink/60">
          {t('newInvoice.date')}: {invoice.date}
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('newInvoice.clientSectionTitle')}</h2>
        <p className="mt-2">{invoice.client?.fullName}</p>
        <p className="text-sm text-brand-ink/60">{invoice.client?.address}</p>
        <p className="text-sm text-brand-ink/60">{invoice.client?.phone}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">{t('newInvoice.itemsSectionTitle')}</h2>
        <div className="mt-3 space-y-2">
          {(invoice.items || []).map((item) => (
            <div key={item.id} className="flex justify-between gap-4 text-sm">
              <span>{item.description}</span>
              <span className="text-brand-ink/60">
                {item.quantity} × {formatMoney(Number(item.unitPrice), currency)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t border-brand-ink/10 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-ink/60">{t('newInvoice.subtotal')}</span>
            <span>{formatMoney(invoice.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-ink/60">{t('newInvoice.discount')}</span>
            <span>{formatMoney(Number(invoice.discount) || 0, currency)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>{t('newInvoice.total')}</span>
            <span>{formatMoney(invoice.total, currency)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link
          to={`/app/invoices/${invoice.id}/edit`}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-brand bg-white px-4 py-2.5 text-sm font-bold text-brand"
        >
          <Pencil className="h-4 w-4" />
          {t('common.edit')}
        </Link>
        <Button type="button" variant="secondary" onClick={() => setPreview(true)}>
          <Eye className="h-4 w-4" />
          {t('newInvoice.preview')}
        </Button>
      </div>
      <Button type="button" className="mt-3 w-full" onClick={onDownload}>
        {t('invoiceDetail.downloadPdf')}
      </Button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="mx-auto mt-4 flex items-center gap-2 text-sm font-semibold text-[#C0503A]"
      >
        <Trash2 className="h-4 w-4" />
        {t('invoiceDetail.deleteInvoice')}
      </button>

      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-brand-ink/10 px-4 py-3">
            <h2 className="font-bold">{t('newInvoice.previewTitle')}</h2>
            <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
              {t('common.close')}
            </Button>
          </div>
          <iframe title="preview" className="min-h-0 flex-1 bg-white" srcDoc={html} />
          <div className="flex gap-3 border-t border-brand-ink/10 p-4">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPreview(false)}>
              {t('common.close')}
            </Button>
            <Button type="button" className="flex-[1.4]" onClick={onDownload}>
              {t('invoiceDetail.downloadPdf')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
