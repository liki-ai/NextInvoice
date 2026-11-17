import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Building2, Check, ChevronDown, Plus } from 'lucide-react'
import { useI18n } from '../i18n'
import { formatMoney } from '../lib/invoice'

export type VendorOption = { vendor: string; count: number; unpaid: number }

/**
 * The supplier of a purchase: one picked from those bought from before, or a new one typed straight
 * in, which the list then offers to add. A new supplier is kept with the purchase it is saved on.
 */
export function VendorPicker({
  label,
  value,
  onChange,
  options,
  currency,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: VendorOption[]
  currency: string
  placeholder: string
  autoFocus?: boolean
}) {
  const { t } = useI18n()
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const typed = value.trim()
  const exact = options.find((item) => item.vendor.toLowerCase() === typed.toLowerCase())

  const matches = useMemo(() => {
    const q = typed.toLowerCase()
    // While the box holds a supplier already picked, the whole list shows, so another is one click away.
    if (!q || exact) return options
    return options
      .filter((item) => item.vendor.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.vendor.toLowerCase().startsWith(q)) - Number(!b.vendor.toLowerCase().startsWith(q)))
  }, [options, typed, exact])

  // The rows of the open list: the suppliers that match, then "add new" when the typed name is no
  // one's yet, so Enter on "dh" picks DHL rather than adding a supplier called "dh".
  const rows: ({ kind: 'add' } | { kind: 'vendor'; item: VendorOption })[] = [
    ...matches.slice(0, 50).map((item) => ({ kind: 'vendor' as const, item })),
    ...(typed && !exact ? [{ kind: 'add' as const }] : []),
  ]

  function choose(name: string) {
    onChange(name)
    setOpen(false)
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (!rows.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setIndex((current) => (current + step + rows.length) % rows.length)
    } else if (e.key === 'Enter' && open && rows.length) {
      e.preventDefault()
      const row = rows[Math.min(index, rows.length - 1)]
      choose(row.kind === 'add' ? typed : row.item.vendor)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="flex flex-col gap-2.5">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</span>
        <span className="relative block">
          <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/35" />
          <input
            ref={input}
            autoFocus={autoFocus}
            value={value}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            onChange={(e) => {
              onChange(e.target.value)
              setIndex(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKey}
            className="w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-10 pr-24 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          {typed && !exact ? (
            <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 rounded-md bg-[#FFF6E5] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A5A00]">
              {t('purchases.newVendor')}
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen((current) => !current)
              input.current?.focus()
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-brand-ink/45 hover:bg-brand/8 hover:text-brand"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </span>
      </label>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-brand-ink/10 bg-white py-1 shadow-[0_12px_32px_rgba(29,43,46,0.14)]"
        >
          {rows.length === 0 ? <li className="px-4 py-3 text-sm text-brand-ink/50">{t('purchases.noVendors')}</li> : null}
          {rows.map((row, i) => (
            <li key={row.kind === 'add' ? '__add' : row.item.vendor} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(row.kind === 'add' ? typed : row.item.vendor)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === index ? 'bg-brand/5' : ''}`}
              >
                {row.kind === 'add' ? (
                  <>
                    <Plus className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-brand">{t('purchases.addVendor', { name: typed })}</span>
                  </>
                ) : (
                  <>
                    {exact?.vendor === row.item.vendor ? <Check className="h-4 w-4 shrink-0 text-brand" /> : <Building2 className="h-4 w-4 shrink-0 text-brand-ink/35" />}
                    <span className="min-w-0 flex-1 truncate font-semibold">{row.item.vendor}</span>
                    <span className="shrink-0 text-xs text-brand-ink/45">{t('purchases.purchases', { count: row.item.count })}</span>
                    {row.item.unpaid > 0 ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[#C0503A]">{t('purchases.owed', { amount: formatMoney(row.item.unpaid, currency) })}</span>
                    ) : null}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
