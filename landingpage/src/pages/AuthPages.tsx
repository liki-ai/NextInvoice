import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { Button, Field } from '../components/ui'
import { LangSwitch } from '../components/LangSwitch'

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
    <div className="min-h-screen bg-brand-bg px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">
            Next Invoice
          </Link>
          <LangSwitch />
        </div>
        <form onSubmit={onSubmit} className="rounded-3xl border border-brand-ink/10 bg-white p-8 shadow-sm">
          <h1 className="font-display text-3xl font-medium">{t('auth.loginTitle')}</h1>
          <div className="mt-6">
            <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? <p className="mb-4 text-sm text-[#C0503A]">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? t('common.loading') : t('auth.loginCta')}
          </Button>
          <p className="mt-6 text-center text-sm text-brand-ink/60">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="font-bold text-brand">
              {t('auth.signupCta')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export function SignupPage() {
  const { user, loading, signup } = useAuth()
  const { t } = useI18n()
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
      await signup(email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">
            Next Invoice
          </Link>
          <LangSwitch />
        </div>
        <form onSubmit={onSubmit} className="rounded-3xl border border-brand-ink/10 bg-white p-8 shadow-sm">
          <h1 className="font-display text-3xl font-medium">{t('auth.signupTitle')}</h1>
          <p className="mt-2 text-sm text-brand-ink/60">{t('auth.passwordHint')}</p>
          <div className="mt-6">
            <Field label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label={t('auth.password')} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Field label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error ? <p className="mb-4 text-sm text-[#C0503A]">{error}</p> : null}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? t('common.loading') : t('auth.signupCta')}
          </Button>
          <p className="mt-6 text-center text-sm text-brand-ink/60">
            {t('auth.hasAccount')}{' '}
            <Link to="/login" className="font-bold text-brand">
              {t('auth.loginCta')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
