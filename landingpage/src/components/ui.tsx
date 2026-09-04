import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-brand-ink/8 bg-white p-6 shadow-[0_1px_2px_rgba(29,43,46,0.04)]', className)}>
      {children}
    </section>
  )
}

export function Field({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="mb-5 flex flex-col gap-2.5 last:mb-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</span>
      <input
        {...props}
        className={cn(
          'w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15',
          className,
        )}
      />
    </label>
  )
}

export function TextArea({
  label,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="mb-5 flex flex-col gap-2.5 last:mb-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{label}</span>
      <textarea
        {...props}
        className={cn(
          'w-full resize-y rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15',
          className,
        )}
      />
    </label>
  )
}

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white shadow-sm hover:bg-brand-dark',
        variant === 'secondary' && 'border border-brand-ink/12 bg-white text-brand-ink hover:border-brand/30 hover:bg-brand/5',
        variant === 'ghost' && 'text-brand-ink/70 hover:bg-brand-ink/5 hover:text-brand-ink',
        variant === 'danger' && 'text-[#C0503A] hover:bg-red-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Modal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-brand-ink/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-brand-ink/8 px-6 py-4">
          <h2 className="font-display text-xl font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-brand-ink/50 hover:bg-brand-ink/5 hover:text-brand-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#F7F8F9]">{children}</div>
        {footer ? <div className="flex justify-end gap-3 border-t border-brand-ink/8 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}
