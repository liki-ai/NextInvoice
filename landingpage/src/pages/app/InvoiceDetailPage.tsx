import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { Button, Card, Field, Modal } from '../../components/ui'
import { PaymentModal } from '../../components/PaymentModal'
import { buildInvoiceHtml, downloadHtmlAsPdf, formatMoney, invoiceStatus } from '../../lib/invoice'
import { activePayments, daysOverdue, remainingOf, reminderText } from '../../lib/document'
import { localizeCompanyProfile } from '../../lib/companySamples'

export function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const { invoices, profile, loading, removeInvoice, issueInvoice, cancelInvoice, addInvoicePayment, voidInvoicePayment } = useAppData()
  const { t, dict } = useI18n()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [copied, setCopied] = useState(false)
  const invoice = invoices.find((item) => item.id === invoiceId)
  const liveCompany = profile ? localizeCompanyProfile(profile, t) : null
  const company = invoice?.companySnapshot || liveCompany
  const client = invoice?.clientSnapshot || invoice?.client
  const currency = invoice?.currency || company?.currency || 'EUR'
  const status = invoice ? invoiceStatus(invoice) : 'unpaid'
  const late = invoice ? daysOverdue(invoice) : 0
  const due = invoice ? remainingOf(invoice) : 0

  const html = useMemo(() => {
    if (!invoice || !company || !client || !preview) return ''
    return buildInvoiceHtml({
      company,
      client,
      invoice,
      pdfLabels: { ...dict.pdf, amountDue: t('docs.amountDue'), amountPaid: t('docs.amountPaid') },
    })
  }, [invoice, company, client, preview, dict.pdf, t])

  if (!invoice) {
    return <p className="text-brand-ink/60">{loading ? t('common.loading') : t('invoiceList.empty')}</p>
  }

  const current = invoice
  const reminder = reminderText(
    current,
    {
      hello: t('docs.reminderHello'),
      body: t('docs.reminderBody'),
      thanks: t('docs.reminderThanks'),
      onReceipt: dict.pdf.onReceipt,
    },
    late || 0,
  )

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

  async function onIssue() {
    setBusy(true)
    try {
      await issueInvoice(current.id)
    } finally {
      setBusy(false)
    }
  }

  async function onCancel() {
    if (!cancelReason.trim()) return
    setBusy(true)
    try {
      await cancelInvoice(current.id, cancelReason.trim())
      setCancelOpen(false)
    } finally {
      setBusy(false)
    }
  }

  function onDuplicate() {
    navigate('/app/new', { state: { duplicateFromId: current.id } })
  }

  function onDownload() {
    if (!company || !client) return
    const doc = buildInvoiceHtml({
      company,
      client,
      invoice: current,
      pdfLabels: { ...dict.pdf, amountDue: t('docs.amountDue'), amountPaid: t('docs.amountPaid') },
    })
    downloadHtmlAsPdf(doc, `${current.number}.pdf`)
  }

  async function onCopyReminder() {
    await navigator.clipboard.writeText(reminder)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const payments = current.payments || []

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
          <p className="mt-1 text-sm text-brand-ink/55">
            {t('newInvoice.dueDate')}: {invoice.dueDate || dict.pdf.onReceipt}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-brand-ink/8 px-2.5 py-1 text-xs font-semibold">
              {status === 'paid' ? t('invoiceList.statusPaid') : status === 'partial' ? t('docs.statusPartial') : status === 'draft' ? t('docs.statusDraft') : status === 'cancelled' ? t('docs.statusCancelled') : t('invoiceList.statusUnpaid')}
            </span>
            {late > 0 ? <span className="rounded-full bg-[#F8E8E4] px-2.5 py-1 text-xs font-semibold text-[#C0503A]">{t('docs.overdueDays', { days: late })}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'draft' ? (
            <>
              <Link
                to={`/app/invoices/${invoice.id}/edit`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
              >
                <Pencil className="h-4 w-4" />
                {t('common.edit')}
              </Link>
              <Button type="button" disabled={busy} onClick={() => void onIssue()}>
                {t('docs.issue')}
              </Button>
            </>
          ) : (
            <Link
              to={`/app/invoices/${invoice.id}/edit`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-4 py-2.5 text-sm font-semibold hover:border-brand/30 hover:bg-brand/5"
            >
              <Pencil className="h-4 w-4" />
              {t('docs.correct')}
            </Link>
          )}
          <Button type="button" variant="secondary" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4" />
            {t('newInvoice.preview')}
          </Button>
          <Button type="button" variant="secondary" onClick={onDuplicate}>
            {t('invoiceDetail.duplicate')}
          </Button>
          <Button type="button" onClick={onDownload}>
            {t('invoiceDetail.downloadPdf')}
          </Button>
        </div>
      </div>

      {invoice.snapshotSource === 'migrated' && !invoice.companySnapshot ? (
        <p className="mt-4 rounded-xl bg-[#FFF4D6] px-4 py-3 text-sm text-[#8A6D00]">{t('docs.snapshotMigrated')}</p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('invoiceDetail.issuedTo')}</h2>
            <p className="mt-3 text-lg font-semibold">{client?.fullName}</p>
            <p className="mt-1 text-sm text-brand-ink/55">{client?.address}</p>
            <p className="text-sm text-brand-ink/55">{client?.phone}</p>
            {client?.email ? <p className="text-sm text-brand-ink/55">{client.email}</p> : null}
            {client?.businessId ? <p className="text-sm text-brand-ink/55">{client.businessId}</p> : null}
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

          {status !== 'draft' ? (
            <Card>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('docs.paymentHistory')}</h2>
              {payments.length === 0 ? (
                <p className="mt-3 text-sm text-brand-ink/50">{status === 'paid' ? t('invoiceList.statusPaid') : t('docs.remaining')}</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {payments.map((item) => (
                    <li key={item.id} className={`flex items-start justify-between gap-3 ${item.voidedAt ? 'opacity-50' : ''}`}>
                      <div>
                        <p className="font-semibold">{formatMoney(Number(item.amount), currency)}</p>
                        <p className="text-xs text-brand-ink/50">{item.date}{item.method ? ` · ${item.method}` : ''}{item.note ? ` · ${item.note}` : ''}</p>
                        {item.voidedAt ? <p className="text-xs text-[#C0503A]">{t('docs.voided')}: {item.voidReason}</p> : null}
                      </div>
                      {!item.voidedAt && status !== 'cancelled' ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#C0503A]"
                          onClick={async () => {
                            const reason = window.prompt(t('docs.voidReason'))
                            if (!reason?.trim()) return
                            await voidInvoicePayment(current.id, item.id, reason.trim())
                          }}
                        >
                          {t('docs.voidPayment')}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {late > 0 ? (
            <Card>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('docs.reminder')}</h2>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-brand-ink/70">{reminder}</pre>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="secondary" onClick={() => void onCopyReminder()}>
                  {copied ? t('docs.copied') : t('docs.copy')}
                </Button>
                {typeof navigator.share === 'function' ? (
                  <Button type="button" variant="secondary" onClick={() => void navigator.share({ text: reminder })}>
                    {t('docs.share')}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
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
            <div className="flex justify-between text-brand-ink/60">
              <span>{t('docs.paidAmount')}</span>
              <span>{formatMoney(Number(invoice.amountPaid) || activePayments(payments).reduce((sum, item) => sum + Number(item.amount), 0), currency)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('docs.amountDue')}</span>
              <span>{formatMoney(due, currency)}</span>
            </div>
          </div>
          {invoice.notes ? <p className="mt-5 text-sm text-brand-ink/55">{invoice.notes}</p> : null}
          {invoice.cancelReason ? <p className="mt-5 text-sm text-[#C0503A]">{t('docs.cancelInvoice')}: {invoice.cancelReason}</p> : null}
          <div className="mt-5 flex flex-col gap-2">
            {status !== 'draft' && status !== 'cancelled' && due > 0 ? (
              <Button type="button" onClick={() => setPayOpen(true)}>
                {t('docs.recordPayment')}
              </Button>
            ) : null}
            {status !== 'cancelled' && status !== 'draft' ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setCancelOpen(true)}>
                {t('docs.cancelInvoice')}
              </Button>
            ) : null}
          </div>
          {status === 'draft' ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#C0503A] hover:underline"
            >
              <Trash2 className="h-4 w-4" />
              {t('invoiceDetail.deleteInvoice')}
            </button>
          ) : null}
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

      {payOpen ? (
        <PaymentModal
          doc={current}
          currency={currency}
          onClose={() => setPayOpen(false)}
          onSave={(payment) => addInvoicePayment(current.id, payment).then(() => undefined)}
        />
      ) : null}

      {cancelOpen ? (
        <Modal
          title={t('docs.cancelInvoice')}
          onClose={() => setCancelOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
                {t('common.close')}
              </Button>
              <Button type="button" disabled={busy || !cancelReason.trim()} onClick={() => void onCancel()}>
                {t('docs.cancelInvoice')}
              </Button>
            </>
          }
        >
          <div className="bg-white p-6">
            <Field label={t('docs.cancelReason')} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
