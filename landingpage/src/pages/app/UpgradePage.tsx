import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'

type Usage = {
  plan: 'free' | 'premium'
  used: number
  limit: number | null
}

export function UpgradePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [usage, setUsage] = useState<Usage | null>(null)

  useEffect(() => {
    void api<Usage>('/api/billing/usage')
      .then(setUsage)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const success = searchParams.get('success')
    if (!success || !sessionId) return

    setConfirming(true)
    setError('')
    void api<{ user?: { plan?: string }; usage: Usage }>(`/api/billing/checkout/status?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        setUsage(res.usage)
        await refreshUser()
        setMessage(t('billing.success'))
        navigate('/app/upgrade', { replace: true })
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setConfirming(false))
  }, [searchParams, refreshUser, navigate, t])

  useEffect(() => {
    if (searchParams.get('canceled') === '1') {
      setMessage(t('billing.canceled'))
    }
  }, [searchParams, t])

  async function onUpgrade() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await api<{ url: string }>('/api/billing/checkout', { method: 'POST' })
      if (!res.url) throw new Error(t('billing.stripeMissing'))
      window.location.href = res.url
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
      setLoading(false)
    }
  }

  async function onManage() {
    setLoading(true)
    setError('')
    try {
      const res = await api<{ url: string }>('/api/billing/portal', { method: 'POST' })
      window.location.href = res.url
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
      setLoading(false)
    }
  }

  const isPremium = usage?.plan === 'premium'

  return (
    <div className="max-w-2xl">
      <Link to="/app" className="text-sm font-semibold text-brand-ink/50 hover:text-brand">
        ← {t('nav.invoices')}
      </Link>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">{t('billing.title')}</h1>
      <p className="mt-2 text-sm text-brand-ink/55">{t('billing.subtitle')}</p>

      <div className="mt-8 grid gap-4">
        <Card>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('billing.freeName')}</p>
              <p className="mt-1 font-display text-2xl font-medium">{t('billing.freeLimit')}</p>
              <p className="mt-2 text-sm text-brand-ink/55">{t('billing.freeHint')}</p>
            </div>
            {!isPremium ? (
              <span className="mt-3 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                {t('billing.current')}
              </span>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/40">{t('billing.premiumName')}</p>
                <p className="mt-1 font-display text-3xl font-medium">{t('billing.premiumPrice')}</p>
                <p className="mt-2 text-sm text-brand-ink/55">{t('billing.premiumHint')}</p>
                <p className="mt-1 text-sm font-semibold text-brand-ink/70">{t('billing.premiumLimit')}</p>
              </div>
              {isPremium ? (
                <span className="mt-3 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                  {t('billing.current')}
                </span>
              ) : null}
            </div>

            {confirming ? <p className="text-sm text-brand-ink/55">{t('billing.confirming')}</p> : null}
            {message ? <p className="text-sm text-brand">{message}</p> : null}
            {error ? <p className="text-sm text-[#C0503A]">{error}</p> : null}

            {isPremium ? (
              <Button type="button" variant="secondary" disabled={loading} onClick={onManage} className="w-full">
                {loading ? t('common.loading') : t('billing.manage')}
              </Button>
            ) : (
              <Button type="button" disabled={loading || confirming} onClick={onUpgrade} className="w-full">
                {loading ? t('common.loading') : t('billing.ctaStripe')}
              </Button>
            )}
            <p className="text-xs text-brand-ink/45">{t('billing.stripeNote')}</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
