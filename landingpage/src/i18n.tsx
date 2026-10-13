import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { isLang, translateIn, translations, type Dict, type Lang } from './i18nCore'

export * from './i18nCore'

type I18nValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, params?: Record<string, string | number>) => string
  dict: Dict
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('nextinvoice.lang')
    return isLang(stored) ? stored : 'sq'
  })

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    localStorage.setItem('nextinvoice.lang', next)
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translateIn(lang, key, params),
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t, dict: translations[lang] }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
