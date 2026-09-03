import { useI18n, LANGS, type Lang } from '../i18n'
import { cn } from '../lib/cn'

export function LanguagePicker({
  variant = 'compact',
  className,
  onChange,
  showLabel,
}: {
  variant?: 'compact' | 'full' | 'dark'
  className?: string
  onChange?: (lang: Lang) => void
  showLabel?: boolean
}) {
  const { lang, setLang, t } = useI18n()
  const dark = variant === 'dark'

  function pick(code: Lang) {
    setLang(code)
    onChange?.(code)
  }

  if (variant === 'full') {
    return (
      <div className={cn('w-full', className)}>
        {showLabel !== false ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('auth.language')}</p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {LANGS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => pick(item.code)}
              className={cn(
                'rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition',
                lang === item.code ? 'bg-brand text-white shadow-sm' : 'bg-brand-bg text-brand-ink/65 hover:text-brand-ink',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center overflow-hidden rounded-lg p-0.5',
        dark ? 'bg-white/10' : 'border border-brand-ink/10 bg-white/70',
        className,
      )}
      role="group"
      aria-label={t('auth.language')}
    >
      {LANGS.map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => pick(item.code)}
          className={cn(
            'rounded-md px-2 py-1.5 text-[10px] font-bold tracking-wider transition',
            lang === item.code
              ? dark
                ? 'bg-white text-brand-dark'
                : 'bg-brand-ink text-white'
              : dark
                ? 'text-white/55 hover:text-white'
                : 'text-brand-ink/60 hover:text-brand-ink',
          )}
        >
          {item.short}
        </button>
      ))}
    </div>
  )
}

/** @deprecated use LanguagePicker */
export function LangSwitch({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  return <LanguagePicker variant={variant === 'dark' ? 'dark' : 'compact'} />
}
