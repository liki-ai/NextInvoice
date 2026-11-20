import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, CalendarRange, Check, ChevronDown, Link2, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { formatMoney } from '../lib/invoice'
import { NO_PERIOD, hasPeriod, monthPeriod, yearPeriod, type Period } from '../lib/listTools'

const PAGE_SIZE = 50

/** The period kept in the page's address (?from=…&to=…), so it survives going to an invoice and back. */
export function usePeriodParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const period = useMemo<Period>(() => ({ from, to }), [from, to])
  const setPeriod = useCallback(
    (next: Period) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          for (const key of ['from', 'to'] as const) {
            if (next[key]) params.set(key, next[key])
            else params.delete(key)
          }
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  return [period, setPeriod] as const
}

function samePeriod(a: Period, b: Period) {
  return a.from === b.from && a.to === b.to
}

/** Quick picks (this month, last month, this year) and a from–to pair of dates. */
export function PeriodFilter({ period, onChange, showYear = true }: { period: Period; onChange: (next: Period) => void; showYear?: boolean }) {
  const { t } = useI18n()
  const presets: [string, Period][] = [
    [t('lists.thisMonth'), monthPeriod(0)],
    [t('lists.lastMonth'), monthPeriod(-1)],
    ...(showYear ? ([[t('lists.thisYear'), yearPeriod()]] as [string, Period][]) : []),
  ]
  const dateClass =
    'h-9 rounded-xl border bg-white px-2.5 text-sm tabular-nums text-brand-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('lists.period')}>
      <CalendarRange className="h-4 w-4 shrink-0 text-brand-ink/40" aria-hidden="true" />
      {presets.map(([label, value]) => {
        const active = samePeriod(period, value)
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? NO_PERIOD : value)}
            className={`h-9 rounded-xl px-3 text-sm font-semibold transition ${active ? 'bg-brand-ink text-white' : 'border border-brand-ink/10 bg-white text-brand-ink/65 hover:border-brand/30 hover:text-brand-ink'}`}
          >
            {label}
          </button>
        )
      })}
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
        {t('lists.from')}
        <input
          type="date"
          value={period.from}
          max={period.to || undefined}
          onChange={(e) => onChange({ ...period, from: e.target.value })}
          className={`${dateClass} ${period.from ? 'border-brand/50' : 'border-brand-ink/10'}`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-brand-ink/45">
        {t('lists.to')}
        <input
          type="date"
          value={period.to}
          min={period.from || undefined}
          onChange={(e) => onChange({ ...period, to: e.target.value })}
          className={`${dateClass} ${period.to ? 'border-brand/50' : 'border-brand-ink/10'}`}
        />
      </label>
      {hasPeriod(period) ? (
        <button
          type="button"
          onClick={() => onChange(NO_PERIOD)}
          title={t('lists.clearPeriod')}
          aria-label={t('lists.clearPeriod')}
          className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-brand-ink/55 hover:bg-brand-ink/5 hover:text-brand-ink"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">{t('lists.clearPeriod')}</span>
        </button>
      ) : null}
    </div>
  )
}

/**
 * Shows a long list 50 rows at a time: the next 50 come in as the end of the list scrolls into view
 * (or by the button under it). Any change of `resetKey` (a filter, a search) starts again at 50.
 */
export function usePaged<T>(rows: T[], resetKey: string) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) {
    setKey(resetKey)
    setLimit(PAGE_SIZE)
  }
  const shown = Math.min(limit, rows.length)
  const visible = useMemo(() => rows.slice(0, shown), [rows, shown])
  const more = useCallback(() => setLimit((value) => value + PAGE_SIZE), [])
  const sentinel = useRef<HTMLDivElement | null>(null)
  const hasMore = shown < rows.length

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more()
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, more, shown])

  return { visible, shown, total: rows.length, hasMore, more, sentinel }
}

/** "Showing 1–50 of 249" under a paged list, with a button for the next 50. */
export function PagerFooter({ paged }: { paged: ReturnType<typeof usePaged<unknown>> }) {
  const { t } = useI18n()
  if (paged.total === 0) return null
  const next = Math.min(PAGE_SIZE, paged.total - paged.shown)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-ink/8 px-5 py-3 text-xs text-brand-ink/55">
      <span className="tabular-nums">{t('lists.showing', { from: 1, to: paged.shown, total: paged.total })}</span>
      {paged.hasMore ? (
        <button
          type="button"
          onClick={paged.more}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand-ink/10 bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:border-brand/30 hover:bg-brand/5"
        >
          <ChevronDown className="h-4 w-4" />
          {t('lists.showMore', { count: next })}
        </button>
      ) : null}
      <div ref={paged.sentinel} aria-hidden="true" className="h-px w-full" />
    </div>
  )
}

/** Amounts in several currencies, one per line. */
export function MoneyStack({ rows, className }: { rows: { currency: string; amount: number }[]; className?: string }) {
  if (!rows.length) return <span className={className}>{formatMoney(0, 'EUR')}</span>
  return (
    <>
      {rows.map((row) => (
        <span key={row.currency} className={`block ${className || ''}`}>
          {formatMoney(row.amount, row.currency)}
        </span>
      ))}
    </>
  )
}

export type ListSort<K extends string> = { key: K; desc: boolean }

/**
 * A column heading that sorts a list: a first click sorts names A to Z and amounts and dates from
 * the largest or newest, a second click turns the order round. Put it inside the heading cell,
 * which carries `aria-sort={sortState(sort, column)}`.
 */
export function SortButton<K extends string>({ column, label, sort, onSort, ascFirst }: { column: K; label: string; sort: ListSort<K> | null; onSort: (next: ListSort<K>) => void; ascFirst?: boolean }) {
  const active = sort?.key === column
  const Icon = !active ? ArrowUpDown : sort.desc ? ArrowDownWideNarrow : ArrowUpNarrowWide
  return (
    <button
      type="button"
      onClick={() => onSort({ key: column, desc: active ? !sort.desc : !ascFirst })}
      className={`inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-[0.08em] hover:text-brand-ink ${active ? 'text-brand' : ''}`}
    >
      {label}
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

export function sortState<K extends string>(sort: ListSort<K> | null, column: K) {
  return sort?.key === column ? (sort.desc ? 'descending' : 'ascending') : 'none'
}

/** "asc"/"desc" sort as it is written in a shared link (?sort=total-desc); null when absent or unknown. */
export function sortFromParam<K extends string>(value: string | null, keys: readonly K[]): ListSort<K> | null {
  const match = /^([a-z]+)-(asc|desc)$/.exec(value || '')
  if (!match || !keys.includes(match[1] as K)) return null
  return { key: match[1] as K, desc: match[2] === 'desc' }
}

export function sortToParam<K extends string>(sort: ListSort<K> | null) {
  return sort ? `${sort.key}-${sort.desc ? 'desc' : 'asc'}` : ''
}

const COPY_LINK_TEXTS = {
  sq: {
    label: 'Kopjo linkun',
    done: 'Linku u kopjua',
    tip: 'Kopjon linkun e kësaj liste me filtrat, periudhën, kërkimin dhe renditjen që ke zgjedhur. Dërgoja një kolegu dhe ai e sheh listën njësoj si ti (duhet të ketë qasje në këtë kompani).',
  },
  en: {
    label: 'Copy link',
    done: 'Link copied',
    tip: 'Copies a link to this list with the filters, period, search and sort you chose. Send it to a colleague and they see the list just as you do (they need access to this company).',
  },
  it: {
    label: 'Copia link',
    done: 'Link copiato',
    tip: "Copia il link di questo elenco con i filtri, il periodo, la ricerca e l'ordine scelti. Invialo a un collega e vedrà l'elenco come lo vedi tu (deve avere accesso a questa azienda).",
  },
} as const

/** Copies a link to the list as it is shown, with a short explanation on hover or focus. */
export function CopyLinkButton({ link }: { link: () => string }) {
  const { lang } = useI18n()
  const texts = lang === 'en' || lang === 'it' ? COPY_LINK_TEXTS[lang] : COPY_LINK_TEXTS.sq
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    const url = link()
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // No clipboard (an older browser or a page not allowed to write it): show the link to copy by hand.
      window.prompt(texts.label, url)
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <span className="group/copy relative inline-flex">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={texts.label}
        aria-describedby="copy-link-tip"
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
          copied ? 'border-brand bg-brand text-white' : 'border-brand-ink/12 bg-white text-brand-ink/70 hover:border-brand/40 hover:text-brand'
        }`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {copied ? texts.done : texts.label}
      </button>
      <span
        id="copy-link-tip"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-xl bg-brand-ink px-3.5 py-2.5 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition group-focus-within/copy:opacity-100 group-hover/copy:opacity-100"
      >
        {texts.tip}
      </span>
    </span>
  )
}
