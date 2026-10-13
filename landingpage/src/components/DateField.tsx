import { useRef, type InputHTMLAttributes } from 'react'
import { CalendarDays } from 'lucide-react'
import { parseLooseDate } from '../lib/document'
import { formatDateForInvoice } from '../lib/invoice'
import { cn } from '../lib/cn'

function isoDay(value: string) {
  const date = parseLooseDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * A date that can be typed the way invoices print it (OCT 13, 2026) or picked from the browser's
 * calendar. Whichever way it is entered, the value stays in the printed form.
 */
export function DateField({
  label,
  value,
  onChange,
  pickLabel,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { label: string; value: string; onChange: (value: string) => void; pickLabel: string }) {
  const picker = useRef<HTMLInputElement>(null)

  function openCalendar() {
    const input = picker.current
    if (!input) return
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Falls through to focusing the field, which opens the calendar where showPicker cannot.
      }
    }
    input.focus()
    input.click()
  }

  return (
    <label className="mb-5 flex flex-col gap-2.5 last:mb-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</span>
      <span className="relative block">
        <input
          {...props}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-brand-ink/10 bg-white py-2.5 pl-3.5 pr-11 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15',
            className,
          )}
        />
        <button
          type="button"
          title={pickLabel}
          aria-label={pickLabel}
          onClick={(e) => {
            e.preventDefault()
            openCalendar()
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-brand-ink/45 transition hover:bg-brand/8 hover:text-brand"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        {/* The browser's own calendar, opened by the button and anchored under the field. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={isoDay(value)}
          onChange={(e) => {
            const picked = parseLooseDate(e.target.value)
            onChange(picked ? formatDateForInvoice(picked) : '')
          }}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-full opacity-0"
        />
      </span>
    </label>
  )
}
