import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Landmark } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { matchStatement, readStatementFile, reconcilePayload, type BankStatement, type InvoiceVerdict } from '../lib/bankMatch'
import { formatMoney, invoiceStatus } from '../lib/invoice'
import { cn } from '../lib/cn'
import { Button, Modal } from './ui'

/** A change that takes a recorded payment away: the statement only does not show it, which proves less. */
function removes(verdict: InvoiceVerdict) {
  return verdict.change !== 'none' && verdict.bankPaid < verdict.recorded
}

/** 2026-10-13 → 13.10.2026 */
function day(iso: string) {
  const [year, month, date] = iso.split('-')
  return `${date}.${month}.${year}`
}

/**
 * Comparing the invoices with a bank statement. The user uploads the statement as the bank exports
 * it; every incoming payment is paired with the invoices it settles, and the dialog lists what
 * that would change — invoices to mark paid, partly paid or unpaid — for the user to accept or
 * leave out. Payments that belong to no invoice are listed too, which is where a double payment
 * or an invoice missing from the books shows up.
 */
export function BankMatchModal({ onClose, initialFile }: { onClose: () => void; /** A statement already in hand (one that came by email), read as soon as the dialog opens. */ initialFile?: Blob }) {
  const { invoices, profile, reconcileInvoices } = useAppData()
  const { t } = useI18n()
  const [statement, setStatement] = useState<BankStatement | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'changes' | 'paid' | 'loose'>('changes')
  const [left, setLeft] = useState<Set<string>>(new Set())
  const [dates, setDates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const fallbackCurrency = profile?.currency || 'EUR'

  const match = useMemo(() => (statement ? matchStatement(statement, invoices, { dates }) : null), [statement, invoices, dates])
  const changes = useMemo(() => (match ? match.verdicts.filter((item) => item.change !== 'none').sort((a, b) => b.invoice.number.localeCompare(a.invoice.number)) : []), [match])
  const chosen = changes.filter((item) => !left.has(item.invoice.id))
  // What this file pays, whether the app had it already or not.
  const paidByFile = useMemo(() => (match ? match.verdicts.filter((item) => item.bankPaid > 0).sort((a, b) => b.invoice.number.localeCompare(a.invoice.number)) : []), [match])
  const removals = changes.filter(removes)
  const money = (amount: number, verdict?: InvoiceVerdict) => formatMoney(amount, verdict?.invoice.currency || fallbackCurrency)

  async function onFile(file: Blob | undefined) {
    if (!file) return
    setReading(true)
    setError('')
    setResult('')
    try {
      const read = await readStatementFile(file)
      if (!read) setError(t('bank.errNoTable'))
      else {
        setStatement(read)
        // Taking a recorded payment away is left for the user to choose; adding the bank's is ticked.
        setLeft(new Set(matchStatement(read, invoices, { dates }).verdicts.filter(removes).map((item) => item.invoice.id)))
        setTab('changes')
      }
    } catch {
      setError(t('bank.errFile'))
    } finally {
      setReading(false)
    }
  }

  useEffect(() => {
    if (initialFile) void onFile(initialFile)
    // Only the file the dialog opened with; later ones come through the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function apply() {
    if (chosen.length === 0) return
    setBusy(true)
    setError('')
    try {
      const res = await reconcileInvoices(reconcilePayload(chosen))
      setResult([t('bank.done', { count: res.invoices.length }), res.skipped > 0 ? t('bank.skipped', { count: res.skipped }) : ''].filter(Boolean).join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  function nowLabel(verdict: InvoiceVerdict) {
    const status = invoiceStatus(verdict.invoice)
    if (status === 'paid') return t('invoiceList.statusPaid')
    if (status === 'partial') return t('docs.statusPartial')
    return t('invoiceList.statusUnpaid')
  }

  function bankLabel(verdict: InvoiceVerdict) {
    const last = verdict.payments[verdict.payments.length - 1]
    if (verdict.change === 'unpaid') return t('bank.markUnpaid')
    if (verdict.change === 'partial') return t('bank.markPartial', { paid: money(verdict.bankPaid + verdict.kept, verdict), total: money(Number(verdict.invoice.total) || 0, verdict) })
    if (verdict.change === 'dates') return t('bank.fixDates', { date: last ? day(last.date) : '' })
    return t('bank.markPaid', { date: last ? day(last.date) : '' })
  }

  const picker = (label: string, primary: boolean) => (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        primary ? 'bg-brand text-white shadow-sm hover:bg-brand-dark' : 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5',
        reading && 'pointer-events-none opacity-60',
      )}
    >
      <Landmark className="h-4 w-4" />
      {reading ? t('bank.reading') : label}
      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </label>
  )

  const incomingTotal = match ? match.statement.lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100 : 0
  const looseTotal = match ? match.loose.reduce((sum, line) => sum + Math.round(line.rest * 100), 0) / 100 : 0
  const settled = match ? match.verdicts.filter((item) => item.bankPaid > 0).length : 0
  const allChosen = changes.length > 0 && chosen.length === changes.length

  return (
    <Modal
      title={t('bank.title')}
      onClose={onClose}
      footer={
        <>
          <p className={cn('mr-auto flex min-w-0 flex-[1_1_10rem] items-center gap-2 text-sm font-semibold', result ? 'text-brand' : 'text-brand-ink/50')}>
            {result ? <Check className="h-4 w-4 shrink-0" /> : null}
            <span className="min-w-0 truncate">{result || (match ? t('bank.period', { from: day(match.statement.from), to: day(match.statement.to) }) : '')}</span>
          </p>
          <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={onClose}>
            {t('common.close')}
          </Button>
          {match ? (
            <Button type="button" className="shrink-0 whitespace-nowrap" disabled={busy || chosen.length === 0} onClick={() => void apply()}>
              <Check className="h-4 w-4" />
              {busy ? t('bank.applying') : t('bank.apply', { count: chosen.length })}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5 bg-white p-6">
        {!match ? (
          <div className="rounded-xl border border-dashed border-brand-ink/15 px-6 py-10 text-center">
            <Landmark className="mx-auto h-9 w-9 text-brand-ink/30" />
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-brand-ink/60">{t('bank.intro')}</p>
            <div className="mt-5">{picker(t('bank.choose'), true)}</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(
                [
                  [t('bank.incoming'), String(match.statement.lines.length), formatMoney(incomingTotal, fallbackCurrency)],
                  [t('bank.settled'), String(settled), ''],
                  [t('bank.toChange'), String(changes.length), ''],
                  [t('bank.loose'), String(match.loose.length), formatMoney(looseTotal, fallbackCurrency)],
                ] as [string, string, string][]
              ).map(([label, value, note]) => (
                <div key={label} className="rounded-xl border border-brand-ink/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</p>
                  <p className="mt-1 font-display text-2xl font-medium tabular-nums">{value}</p>
                  <p className="h-4 text-xs tabular-nums text-brand-ink/50">{note}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['changes', 'paid', 'loose'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={cn('rounded-xl px-3 py-1.5 text-sm font-semibold transition', tab === item ? 'bg-brand text-white' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink')}
                >
                  {item === 'changes'
                    ? t('bank.tabChanges', { count: changes.length })
                    : item === 'paid'
                      ? t('bank.tabPaid', { count: paidByFile.length })
                      : t('bank.tabLoose', { count: match.loose.length })}
                </button>
              ))}
              <span className="ml-auto">{picker(t('bank.another'), false)}</span>
            </div>

            {tab === 'paid' ? (
              paidByFile.length === 0 ? (
                <p className="rounded-xl border border-brand-ink/8 px-4 py-6 text-center text-sm text-brand-ink/60">{t('bank.noPaid')}</p>
              ) : (
                <div className="max-h-[46vh] overflow-auto rounded-xl border border-brand-ink/8">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                      <tr>
                        <th className="py-2.5 pl-4 pr-3 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                        <th className="px-3 py-2.5 text-right font-semibold">{t('bank.paidFromFile')}</th>
                        <th className="px-3 py-2.5 font-semibold">{t('newInvoice.date')}</th>
                        <th className="px-3 py-2.5 pr-4 font-semibold">{t('bank.now')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidByFile.map((verdict) => (
                        <tr key={verdict.invoice.id} className="border-t border-brand-ink/5">
                          <td className="max-w-0 py-2.5 pl-4 pr-3 align-top sm:w-2/5">
                            <span className="block font-semibold">{verdict.invoice.number}</span>
                            <span className="block truncate text-xs text-brand-ink/50">{verdict.invoice.client?.fullName}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">{money(verdict.bankPaid, verdict)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-top text-brand-ink/70">{verdict.payments.map((payment) => day(payment.date)).join(', ')}</td>
                          <td className="px-3 py-2.5 pr-4 align-top">
                            <span className={cn('font-semibold', verdict.change === 'none' ? 'text-brand-ink/55' : 'text-[#2E7D32]')}>{verdict.change === 'none' ? t('bank.alreadyRecorded') : t('bank.willRecord')}</span>
                            {verdict.basis === 'amount' ? (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#FFF6E5] px-2 py-0.5 text-[11px] font-semibold text-[#8A5A00]" title={t('bank.byAmountHint')}>
                                <AlertTriangle className="h-3 w-3" />
                                {t('bank.byAmount')}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : tab === 'changes' ? (
              <>
                {removals.length > 0 ? <p className="rounded-xl bg-[#FFF6E5] px-3.5 py-2.5 text-xs leading-5 text-[#8A5A00]">{t('bank.removalNote')}</p> : null}
                {changes.length === 0 ? (
                  <p className="rounded-xl border border-brand-ink/8 px-4 py-6 text-center text-sm text-brand-ink/60">{t('bank.noChanges')}</p>
                ) : (
                  <div className="max-h-[46vh] overflow-auto rounded-xl border border-brand-ink/8">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                        <tr>
                          <th className="w-10 py-2.5 pl-4">
                            <input
                              type="checkbox"
                              aria-label={t('invoiceList.selectAll')}
                              checked={allChosen}
                              onChange={() => setLeft(allChosen ? new Set(changes.map((item) => item.invoice.id)) : new Set())}
                              className="h-4 w-4 cursor-pointer accent-[#2C6E7F]"
                            />
                          </th>
                          <th className="px-3 py-2.5 font-semibold">{t('newInvoice.invoiceNumber')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold">{t('invoiceList.amount')}</th>
                          <th className="px-3 py-2.5 font-semibold">{t('bank.now')}</th>
                          <th className="px-3 py-2.5 pr-4 font-semibold">{t('bank.byBank')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((verdict) => (
                          <tr key={verdict.invoice.id} className="border-t border-brand-ink/5">
                            <td className="py-2.5 pl-4 align-top">
                              <input
                                type="checkbox"
                                aria-label={verdict.invoice.number}
                                checked={!left.has(verdict.invoice.id)}
                                onChange={() =>
                                  setLeft((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(verdict.invoice.id)) next.delete(verdict.invoice.id)
                                    else next.add(verdict.invoice.id)
                                    return next
                                  })
                                }
                                className="mt-0.5 h-4 w-4 cursor-pointer accent-[#2C6E7F]"
                              />
                            </td>
                            <td className="max-w-0 px-3 py-2.5 align-top sm:w-2/5">
                              <span className="block font-semibold">{verdict.invoice.number}</span>
                              <span className="block truncate text-xs text-brand-ink/50">
                                {verdict.invoice.client?.fullName} · {verdict.invoice.date}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">{money(Number(verdict.invoice.total) || 0, verdict)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 align-top text-brand-ink/60">{nowLabel(verdict)}</td>
                            <td className="px-3 py-2.5 pr-4 align-top">
                              <span className={cn('font-semibold', verdict.change === 'unpaid' ? 'text-[#C0503A]' : verdict.change === 'partial' ? 'text-[#8A5A00]' : 'text-[#2E7D32]')}>{bankLabel(verdict)}</span>
                              {removes(verdict) ? <span className="block text-xs text-brand-ink/50">{t('bank.removalHint')}</span> : null}
                              {verdict.bankPaid > 0 && verdict.basis === 'amount' ? (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#FFF6E5] px-2 py-0.5 text-[11px] font-semibold text-[#8A5A00]" title={t('bank.byAmountHint')}>
                                  <AlertTriangle className="h-3 w-3" />
                                  {t('bank.byAmount')}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} className="h-4 w-4 rounded border-brand-ink/25 accent-[#2C6E7F]" />
                  {t('bank.dates')}
                </label>
              </>
            ) : (
              <>
                <p className="text-xs leading-5 text-brand-ink/55">{t('bank.looseHint')}</p>
                {match.loose.length === 0 ? (
                  <p className="rounded-xl border border-brand-ink/8 px-4 py-6 text-center text-sm text-brand-ink/60">{t('bank.noLoose')}</p>
                ) : (
                  <div className="max-h-[46vh] overflow-auto rounded-xl border border-brand-ink/8">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[#FAFBFB] text-[11px] uppercase tracking-[0.08em] text-brand-ink/40">
                        <tr>
                          <th className="py-2.5 pl-4 pr-3 font-semibold">{t('newInvoice.date')}</th>
                          <th className="px-3 py-2.5 text-right font-semibold">{t('invoiceList.amount')}</th>
                          <th className="px-3 py-2.5 pr-4 font-semibold">{t('bank.description')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {match.loose.map((line, index) => (
                          <tr key={`${line.date}-${index}`} className="border-t border-brand-ink/5">
                            <td className="whitespace-nowrap py-2.5 pl-4 pr-3 align-top text-brand-ink/70">{day(line.date)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">{formatMoney(line.rest, fallbackCurrency)}</td>
                            <td className="px-3 py-2.5 pr-4 align-top text-xs leading-5 text-brand-ink/65">{line.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div role="alert">{error ? <p className="text-sm leading-6 text-[#C0503A]">{error}</p> : null}</div>
      </div>
    </Modal>
  )
}
