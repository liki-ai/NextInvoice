import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { Button, Field } from '../components/ui'
import { LanguagePicker } from '../components/LangSwitch'

function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand-dark px-12 py-12 text-white lg:flex lg:flex-col">
        <Link to="/" className="font-display text-2xl font-semibold">
          Next Invoice
        </Link>
        <div className="relative z-10 mt-auto max-w-md pb-8">
          <p className="font-display text-4xl font-medium leading-tight">{t('auth.tagline')}</p>
          <p className="mt-4 text-sm leading-6 text-white/60">{t('invoiceList.subtitle')}</p>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-10 h-56 w-56 rounded-full bg-brand-accent/20 blur-3xl" />
      </aside>
      <div className="flex min-h-screen flex-col bg-brand-bg px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-semibold lg:hidden">
            Next Invoice
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-ink/8 bg-white p-8 shadow-sm">
        <LanguagePicker variant="full" className="mb-6" />
        <h1 className="font-display text-3xl font-medium">{t('auth.loginTitle')}</h1>
        <div className="mt-6">
          <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p className="mb-4 text-sm text-[#C0503A]">{error}</p> : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('common.loading') : t('auth.loginCta')}
        </Button>
        <p className="mt-6 text-center text-sm text-brand-ink/55">
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-brand">
            {t('auth.signupCta')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  const { user, loading, signup } = useAuth()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/app" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('auth.mismatch'))
      return
    }
    setSubmitting(true)
    try {
      await signup(email, password, lang)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-ink/8 bg-white p-8 shadow-sm">
        <LanguagePicker variant="full" className="mb-6" />
        <h1 className="font-display text-3xl font-medium">{t('auth.signupTitle')}</h1>
        <p className="mt-2 text-sm text-brand-ink/55">{t('auth.passwordHint')}</p>
        <div className="mt-6">
          <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label={t('auth.password')} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error ? <p className="mb-4 text-sm text-[#C0503A]">{error}</p> : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('common.loading') : t('auth.signupCta')}
        </Button>
        <p className="mt-6 text-center text-sm text-brand-ink/55">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand">
            {t('auth.loginCta')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
