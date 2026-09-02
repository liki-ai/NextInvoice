import { useI18n, type Lang } from '../i18n'
import { cn } from '../lib/cn'

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="flex items-center overflow-hidden rounded-full border border-brand-ink/10 bg-white/70 p-1">
      {(['sq', 'en'] as Lang[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={cn(
            'rounded-full px-3 py-1.5 text-[10px] font-bold tracking-wider transition',
            lang === code ? 'bg-brand-ink text-white' : 'text-brand-ink/60 hover:text-brand-ink',
          )}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
