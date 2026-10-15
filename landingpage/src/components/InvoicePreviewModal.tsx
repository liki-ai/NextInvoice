import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { Button, Modal } from './ui'
import { TemplateSwitch } from './TemplateSwitch'
import { buildInvoiceHtml, downloadHtmlAsPdf, type Invoice } from '../lib/invoice'
import { companyForPdf } from '../lib/companySamples'
import { normalizeTemplate, type InvoiceTemplateId } from '../lib/invoiceTemplates'

/**
 * The invoice as it prints, with the company's own details and the choice of template, and its PDF
 * to download. Downloading a draft issues it first, as the PDF is the issued invoice.
 */
export function InvoicePreviewModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { profile, issueInvoice, updateInvoice } = useAppData()
  const { t, dict } = useI18n()
  const [templateChoice, setTemplateChoice] = useState<InvoiceTemplateId | null>(null)
  const company = useMemo(() => (profile ? companyForPdf(invoice, profile, t) : invoice.companySnapshot || null), [invoice, profile, t])
  const template = templateChoice || normalizeTemplate(company?.invoiceTemplate)
  const client = invoice.clientSnapshot || invoice.client
  const pdfLabels = useMemo(() => ({ ...dict.pdf, amountDue: t('docs.amountDue'), amountPaid: t('docs.amountPaid') }), [dict.pdf, t])
  const html = useMemo(() => (company && client ? buildInvoiceHtml({ company, client, invoice, pdfLabels, template }) : ''), [company, client, invoice, pdfLabels, template])

  async function onDownload() {
    if (!company || !client) return
    if (invoice.lifecycle === 'draft') await issueInvoice(invoice.id)
    downloadHtmlAsPdf(buildInvoiceHtml({ company, client, invoice, pdfLabels, template }), `${invoice.number}.pdf`)
    void updateInvoice(invoice.id, { sent: true, sentAt: new Date().toISOString() })
  }

  return (
    <Modal
      title={t('newInvoice.previewTitle')}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="button" onClick={() => void onDownload()}>
            {t('invoiceDetail.downloadPdf')}
          </Button>
        </>
      }
    >
      <TemplateSwitch value={template} onChange={setTemplateChoice} />
      <iframe title={t('newInvoice.previewTitle')} className="h-[70vh] w-full bg-white" srcDoc={html} />
    </Modal>
  )
}
