import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Modal } from '../../components/ui'
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
      <Link to="/app" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('nav.invoices')}
      </Link>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand-ink/40">{t('invoiceDetail.title')}</p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{invoice.number}</h1>
          <p className="mt-2 text-sm text-brand-ink/55">{invoice.date}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/invoices/${invoice.id}/edit`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
          >
            <Pencil className="h-4 w-4" />
            {t('common.edit')}
          </Link>
          <Button type="button" variant="secondary" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4" />
            {t('newInvoice.preview')}
          </Button>
          <Button type="button" onClick={onDownload}>
            {t('invoiceDetail.downloadPdf')}
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceDetail.issuedTo')}</h2>
            <p className="mt-3 text-lg font-semibold">{invoice.client?.fullName}</p>
            <p className="mt-1 text-sm text-brand-ink/55">{invoice.client?.address}</p>
            <p className="text-sm text-brand-ink/55">{invoice.client?.phone}</p>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-brand-ink/8 px-6 py-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('newInvoice.itemsSectionTitle')}</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">{t('newInvoice.itemDescription')}</th>
                  <th className="px-6 py-3 text-right font-semibold">{t('newInvoice.itemQuantity')}</th>
                  <th className="px-6 py-3 text-right font-semibold">{t('newInvoice.itemUnitPrice')}</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((item) => (
                  <tr key={item.id} className="border-t border-brand-ink/5">
                    <td className="px-6 py-3">{item.description}</td>
                    <td className="px-6 py-3 text-right text-brand-ink/60">{item.quantity}</td>
                    <td className="px-6 py-3 text-right">{formatMoney(Number(item.unitPrice), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceDetail.summary')}</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between text-brand-ink/60">
              <span>{t('newInvoice.subtotal')}</span>
              <span>{formatMoney(invoice.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-brand-ink/60">
              <span>{t('newInvoice.discount')}</span>
              <span>{formatMoney(Number(invoice.discount) || 0, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-brand-ink/10 pt-3 font-display text-2xl font-medium">
              <span>{t('newInvoice.total')}</span>
              <span>{formatMoney(invoice.total, currency)}</span>
            </div>
          </div>
          {invoice.notes ? <p className="mt-5 text-sm text-brand-ink/55">{invoice.notes}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#C0503A] hover:underline"
          >
            <Trash2 className="h-4 w-4" />
            {t('invoiceDetail.deleteInvoice')}
          </button>
        </Card>
      </div>

      {preview ? (
        <Modal
          title={t('newInvoice.previewTitle')}
          onClose={() => setPreview(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPreview(false)}>
                {t('common.close')}
              </Button>
              <Button type="button" onClick={onDownload}>
                {t('invoiceDetail.downloadPdf')}
              </Button>
            </>
          }
        >
          <iframe title="preview" className="h-[70vh] w-full bg-white" srcDoc={html} />
        </Modal>
      ) : null}
    </div>
  )
}
