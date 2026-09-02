import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { formatMoney } from '../../lib/invoice'

export function InvoiceListPage() {
  const { invoices, loading, profile } = useAppData()
  const { t } = useI18n()
  const currency = profile?.currency || 'EUR'

  return (
    <div>
      <h1 className="font-display text-3xl font-medium">{t('invoiceList.title')}</h1>
      {loading && invoices.length === 0 ? (
        <p className="mt-8 text-brand-ink/60">{t('common.loading')}</p>
      ) : null}
      {!loading && invoices.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center text-brand-ink/55">
          <FileText className="h-12 w-12" />
          <p className="mt-3 max-w-sm">{t('invoiceList.empty')}</p>
          <Link to="/app/new" className="mt-6 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">
            {t('nav.newInvoice')}
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {invoices.map((item) => (
            <Link
              key={item.id}
              to={`/app/invoices/${item.id}`}
              className="block rounded-2xl border border-brand-ink/10 bg-white p-4 transition hover:border-brand/30 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand">{item.number}</span>
                <span className="font-bold">{formatMoney(item.total, currency)}</span>
              </div>
              <p className="mt-1 text-sm">{item.client?.fullName}</p>
              <div className="mt-1 flex justify-between text-xs text-brand-ink/50">
                <span>{item.date}</span>
                <span>{t('invoiceList.itemsCount', { count: item.items?.length || 0 })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
