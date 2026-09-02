import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-brand-ink/10 bg-white p-5 shadow-sm', className)}>
      {children}
    </section>
  )
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/50">{label}</span>
      <input
        {...props}
        className={cn(
          'w-full rounded-xl border border-brand-ink/10 bg-brand-bg px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
          props.className,
        )}
      />
    </label>
  )
}

export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-ink/50">{label}</span>
      <textarea
        {...props}
        className={cn(
          'w-full rounded-xl border border-brand-ink/10 bg-brand-bg px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20',
          props.className,
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
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-dark',
        variant === 'secondary' && 'border border-brand bg-white text-brand hover:bg-brand/5',
        variant === 'danger' && 'text-[#C0503A] hover:bg-red-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
