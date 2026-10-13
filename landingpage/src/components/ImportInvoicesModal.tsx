import { useMemo, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { parseLooseDate } from '../lib/document'
import { formatMoney } from '../lib/invoice'
import { importPayload, planInvoiceImport, type ImportPlan, type ImportProblem, type ImportWarning } from '../lib/invoiceImport'
import { readWorkbook } from '../lib/xlsx'
import { cn } from '../lib/cn'
import { Button, Modal } from './ui'

const PREVIEW_ROWS = 8

const REASON_KEYS: Record<ImportProblem['reason'], string> = {
  date: 'importer.reasonDate',
  client: 'importer.reasonClient',
  items: 'importer.reasonItems',
  duplicate: 'importer.reasonDuplicate',
}

const WARNING_KEYS: Record<ImportWarning, string> = {
  totalMismatch: 'importer.warnTotalMismatch',
  other: 'importer.warnOther',
  noLines: 'importer.warnNoLines',
  unknownClient: 'importer.warnUnknownClient',
}

type Result = { created: number; clientsCreated: number; skipped: { number: string; reason: string }[] }

function Stat({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-brand-ink/8 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-medium tabular-nums', muted && 'text-brand-ink/40')}>{value}</p>
    </div>
  )
}

export function ImportInvoicesModal({ onClose }: { onClose: () => void }) {
  const { invoices, profile, importInvoices } = useAppData()
  const { t } = useI18n()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [markPaid, setMarkPaid] = useState(false)
  const [includeOtherClients, setIncludeOtherClients] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const currency = profile?.currency || 'EUR'

  const existingNumbers = useMemo(
    () => new Set(invoices.filter((item) => item.lifecycle !== 'draft').map((item) => item.number)),
    [invoices],
  )
  const fresh = useMemo(() => (plan ? plan.invoices.filter((item) => !existingNumbers.has(item.number)) : []), [plan, existingNumbers])
  const flagged = fresh.filter((item) => item.warnings.length > 0)
  const period = useMemo(() => {
    const times = fresh.map((item) => parseLooseDate(item.date)?.getTime() || 0).filter(Boolean)
    if (times.length === 0) return ''
    const first = fresh.find((item) => parseLooseDate(item.date)?.getTime() === Math.min(...times))
    const last = fresh.find((item) => parseLooseDate(item.date)?.getTime() === Math.max(...times))
    return first && last ? `${first.date} – ${last.date}` : ''
  }, [fresh])

  async function onFile(file: File | undefined) {
    if (!file) return
    setReading(true)
    setError('')
    setPlan(null)
    setFileName(file.name)
    try {
      setPlan(planInvoiceImport(await readWorkbook(file)))
    } catch (err) {
      setError(err instanceof Error && err.message === 'NO_INVOICE_SHEET' ? t('importer.noSheet') : t('importer.notXlsx'))
    } finally {
      setReading(false)
    }
  }

  async function onImport() {
    if (!plan || fresh.length === 0) return
    setImporting(true)
    setError('')
    try {
      setResult(await importInvoices(importPayload(plan, existingNumbers, { markPaid, includeOtherClients })))
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === 'PLAN_LIMIT' ? t('importer.limit') : err instanceof Error ? err.message : t('common.error'))
    } finally {
      setImporting(false)
    }
  }

  const picker = (label: string, primary: boolean) => (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-brand/20',
        primary ? 'bg-brand text-white shadow-sm hover:bg-brand-dark' : 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5',
        (reading || importing) && 'pointer-events-none opacity-50',
      )}
    >
      <FileSpreadsheet className="h-4 w-4" />
      {reading ? t('importer.reading') : label}
      <input
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void onFile(file)
        }}
      />
    </label>
  )

  return (
    <Modal
      title={t('importer.title')}
      onClose={onClose}
      footer={
        result ? (
          <Button type="button" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {plan ? (
              <Button type="button" disabled={importing || fresh.length === 0} onClick={() => void onImport()}>
                {importing ? t('importer.importing') : t('importer.confirm', { count: fresh.length })}
              </Button>
            ) : null}
          </>
        )
      }
    >
      <div className="space-y-5 p-6">
        {result ? (
          <div className="rounded-2xl border border-brand/25 bg-white p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-2xl font-medium">{t('importer.done')}</h3>
            <p className="mt-2 text-sm text-brand-ink/65">{t('importer.doneSummary', { created: result.created, clients: result.clientsCreated })}</p>
            {result.skipped.length > 0 ? <p className="mt-1 text-sm text-brand-ink/50">{t('importer.doneSkipped', { count: result.skipped.length })}</p> : null}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-brand-ink/8 bg-white p-5">
              <p className="text-sm leading-6 text-brand-ink/70">{t('importer.intro')}</p>
              <p className="mt-1 text-xs leading-5 text-brand-ink/45">{t('importer.formats')}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {picker(plan ? t('importer.chooseAnother') : t('importer.choose'), !plan)}
                {fileName ? <span className="truncate text-sm text-brand-ink/55">{fileName}</span> : null}
              </div>
              {error ? (
                <p className="mt-4 flex items-start gap-2 text-sm text-[#C0503A]" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}
            </div>

            {plan ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label={t('importer.toImport')} value={fresh.length} />
                  <Stat label={t('importer.existing')} value={plan.invoices.length - fresh.length} muted={plan.invoices.length === fresh.length} />
                  <Stat label={t('importer.newClients')} value={new Set(fresh.map((item) => item.clientKey)).size} />
                  <Stat label={t('importer.total')} value={formatMoney(fresh.reduce((sum, item) => sum + item.total, 0), currency)} />
                </div>
                <p className="text-xs text-brand-ink/50">
                  {t('importer.sheets')}: {[plan.sheets.invoices, plan.sheets.lines, plan.sheets.clients].filter(Boolean).join(' · ')}
                  {period ? ` — ${t('importer.period')}: ${period}` : ''}
                </p>

                {fresh.length === 0 ? <p className="rounded-xl bg-white px-4 py-3 text-sm text-brand-ink/65">{t('importer.nothing')}</p> : null}
                {fresh.length > 0 && plan.invoices.length > fresh.length ? (
                  <p className="text-sm text-brand-ink/60">{t('importer.existingNote', { count: plan.invoices.length - fresh.length })}</p>
                ) : null}

                {plan.problems.length > 0 ? (
                  <div className="rounded-xl border border-[#C0503A]/30 bg-[#F8E8E4] px-4 py-3 text-sm">
                    <p className="font-semibold text-[#C0503A]">{t('importer.problems', { count: plan.problems.length })}</p>
                    <ul className="mt-1 space-y-0.5 text-brand-ink/70">
                      {plan.problems.slice(0, 6).map((item, index) => (
                        <li key={`${item.number}-${index}`}>
                          <span className="font-semibold">{item.number}</span> — {t(REASON_KEYS[item.reason])}
                        </li>
                      ))}
                    </ul>
                    {plan.problems.length > 6 ? <p className="mt-1 text-brand-ink/50">{t('importer.more', { count: plan.problems.length - 6 })}</p> : null}
                  </div>
                ) : null}

                {flagged.length > 0 ? (
                  <div className="rounded-xl border border-[#E8B84A] bg-[#FFF6E5] px-4 py-3 text-sm">
                    <p className="font-semibold text-[#8A5A00]">{t('importer.warnings', { count: flagged.length })}</p>
                    <ul className="mt-1 space-y-0.5 text-brand-ink/70">
                      {flagged.slice(0, 6).map((item) => (
                        <li key={item.number}>
                          <span className="font-semibold">{item.number}</span> — {item.warnings.map((warning) => t(WARNING_KEYS[warning])).join('; ')}
                        </li>
                      ))}
                    </ul>
                    {flagged.length > 6 ? <p className="mt-1 text-brand-ink/50">{t('importer.more', { count: flagged.length - 6 })}</p> : null}
                  </div>
                ) : null}

                {fresh.length > 0 ? (
                  <>
                    <div className="overflow-x-auto rounded-2xl border border-brand-ink/8 bg-white">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-semibold">{t('importer.colNumber')}</th>
                            <th className="px-4 py-2.5 text-left font-semibold">{t('importer.colClient')}</th>
                            <th className="px-4 py-2.5 text-left font-semibold">{t('importer.colDate')}</th>
                            <th className="px-4 py-2.5 text-right font-semibold">{t('importer.colLines')}</th>
                            <th className="px-4 py-2.5 text-right font-semibold">{t('importer.colTax')}</th>
                            <th className="px-4 py-2.5 text-right font-semibold">{t('importer.colTotal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fresh.slice(0, PREVIEW_ROWS).map((item) => (
                            <tr key={item.number} className="border-t border-brand-ink/5">
                              <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{item.number}</td>
                              <td className="max-w-[240px] truncate px-4 py-2.5 text-brand-ink/70">{item.clientName}</td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-brand-ink/60">{item.date}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-brand-ink/60">{item.items.length}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-brand-ink/60">{item.taxRate}%</td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{formatMoney(item.total, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {fresh.length > PREVIEW_ROWS ? (
                        <p className="border-t border-brand-ink/5 px-4 py-2.5 text-xs text-brand-ink/45">{t('importer.more', { count: fresh.length - PREVIEW_ROWS })}</p>
                      ) : null}
                    </div>

                    <div className="space-y-3 rounded-2xl border border-brand-ink/8 bg-white p-5">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} className="mt-1 h-4 w-4 accent-[#2C6E7F]" />
                        <span>
                          <span className="block text-sm font-semibold">{t('importer.markPaid')}</span>
                          <span className="block text-xs text-brand-ink/50">{t('importer.markPaidHint')}</span>
                        </span>
                      </label>
                      {plan.otherClients.length > 0 ? (
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="checkbox" checked={includeOtherClients} onChange={(e) => setIncludeOtherClients(e.target.checked)} className="mt-1 h-4 w-4 accent-[#2C6E7F]" />
                          <span className="text-sm font-semibold">{t('importer.otherClients', { count: plan.otherClients.length })}</span>
                        </label>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}
