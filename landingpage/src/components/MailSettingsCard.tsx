import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, ExternalLink, Mail, Plus, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { useI18n } from '../i18n'
import { MAIL_PROVIDERS, isEmail, isGoogleHost, mailErrorText, providerOf, type MailProviderId, type MailSender } from '../lib/mail'
import { cn } from '../lib/cn'
import { Button, Card, Field, Select } from './ui'

type Form = { host: string; port: string; user: string; password: string; senders: MailSender[] }

const GOOGLE_APP_PASSWORDS = 'https://myaccount.google.com/apppasswords'

function sameForm(a: Form, b: Form) {
  return JSON.stringify({ ...a, password: '' }) === JSON.stringify({ ...b, password: '' }) && !a.password
}

/**
 * Settings → the company's own mailbox for sending invoices: which mail server, which mailbox, its
 * app password, and the addresses that may appear as sender. Saved on its own, apart from the profile.
 */
export function MailSettingsCard() {
  const { user } = useAuth()
  const { mail, saveMail, removeMail, testMail } = useAppData()
  const { t } = useI18n()
  const location = useLocation()
  const cardRef = useRef<HTMLDivElement>(null)

  const saved = mail?.mail
  const baseline = useMemo<Form>(
    () => ({
      host: saved?.host || 'smtp.gmail.com',
      port: String(saved?.port || 587),
      user: saved?.user || '',
      password: '',
      senders: saved?.senders || [],
    }),
    [saved],
  )
  const [form, setForm] = useState<Form>(baseline)
  const [provider, setProvider] = useState<MailProviderId>(() => providerOf(baseline.host))
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setForm(baseline)
    setProvider(providerOf(baseline.host))
  }, [baseline])

  // The send dialog links here when no mailbox is connected yet.
  useEffect(() => {
    if (location.hash === '#email') cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, mail])

  if (!mail || !saved) return null

  const dirty = !sameForm(form, baseline)
  const google = isGoogleHost(form.host)
  const sendersValid = form.senders.every((item) => isEmail(item.email))
  const complete = Boolean(form.host.trim() && form.user.trim() && (form.password.trim() || (saved.hasPassword && form.host === saved.host && form.user === saved.user)))

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setNotice('')
    setError('')
  }

  function onProvider(next: MailProviderId) {
    setProvider(next)
    const preset = MAIL_PROVIDERS.find((item) => item.id === next)
    if (preset) setForm((prev) => ({ ...prev, host: preset.host, port: String(preset.port) }))
  }

  function setSender(index: number, patch: Partial<MailSender>) {
    set(
      'senders',
      form.senders.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    )
  }

  async function run(kind: 'save' | 'test' | 'remove', action: () => Promise<string>) {
    setBusy(kind)
    setNotice('')
    setError('')
    try {
      setNotice(await action())
    } catch (err) {
      setError(mailErrorText(err, t))
    } finally {
      setBusy(null)
    }
  }

  const onSave = () =>
    run('save', async () => {
      await saveMail({
        host: form.host.trim(),
        port: Number(form.port) || 587,
        user: form.user.trim(),
        password: form.password || undefined,
        senders: form.senders.map((item) => ({ name: item.name.trim(), email: item.email.trim() })).filter((item) => item.email),
      })
      return t('mail.saved')
    })

  const onTest = () =>
    run('test', async () => {
      const res = await testMail({ subject: t('mail.testSubject'), body: t('mail.testBody') })
      return t('mail.testOk', { to: res.to })
    })

  const onRemove = () =>
    run('remove', async () => {
      await removeMail()
      return t('mail.disconnected')
    })

  return (
    <div ref={cardRef} id="email" className="scroll-mt-8">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-brand" />
              {t('mail.title')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('mail.hint')}</p>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              saved.ready ? 'bg-brand/10 text-brand' : 'bg-brand-ink/6 text-brand-ink/55',
            )}
          >
            {saved.ready ? <Check className="h-3.5 w-3.5" /> : null}
            {saved.ready ? t('mail.connected') : t('mail.notConnected')}
          </span>
        </div>

        <div className="mt-5">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Select label={t('mail.provider')} value={provider} onChange={(e) => onProvider(e.target.value as MailProviderId)}>
              {MAIL_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.labelKey)}
                </option>
              ))}
              <option value="other">{t('mail.providerOther')}</option>
            </Select>
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-x-3">
              <Field label={t('mail.host')} value={form.host} readOnly={provider !== 'other'} spellCheck={false} onChange={(e) => set('host', e.target.value)} className={provider !== 'other' ? 'bg-brand-bg text-brand-ink/60' : undefined} />
              <Field label={t('mail.port')} value={form.port} readOnly={provider !== 'other'} inputMode="numeric" onChange={(e) => set('port', e.target.value.replace(/\D/g, '').slice(0, 5))} className={provider !== 'other' ? 'bg-brand-bg text-brand-ink/60' : undefined} />
            </div>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label={t('mail.user')} type="email" value={form.user} placeholder={user?.email || ''} autoComplete="off" spellCheck={false} onChange={(e) => set('user', e.target.value)} />
            <Field
              label={t('mail.password')}
              type="password"
              value={form.password}
              placeholder={saved.hasPassword && form.host === saved.host && form.user === saved.user ? t('mail.passwordSaved') : ''}
              autoComplete="new-password"
              onChange={(e) => set('password', e.target.value)}
            />
          </div>
          <p className="-mt-1 text-xs leading-5 text-brand-ink/55">
            {google ? t('mail.passwordHelp') : t('mail.passwordHelpOther')}{' '}
            {google ? (
              <a href={GOOGLE_APP_PASSWORDS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                {t('mail.passwordLink')}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </p>

          <div className="mt-6 border-t border-brand-ink/8 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('mail.senders')}</p>
            <p className="mt-1.5 text-sm leading-6 text-brand-ink/55">{t('mail.sendersHint', { email: user?.email || '' })}</p>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-brand-bg px-3.5 py-2.5 text-sm">
                <Check className="h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 truncate font-medium">{user?.email}</span>
              </div>
              {form.senders.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-start gap-2">
                  <input
                    value={item.name}
                    placeholder={t('mail.senderName')}
                    aria-label={t('mail.senderName')}
                    onChange={(e) => setSender(index, { name: e.target.value })}
                    className="w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <input
                    type="email"
                    value={item.email}
                    placeholder={t('mail.senderEmail')}
                    aria-label={t('mail.senderEmail')}
                    aria-invalid={item.email && !isEmail(item.email) ? true : undefined}
                    spellCheck={false}
                    onChange={(e) => setSender(index, { email: e.target.value })}
                    className={cn(
                      'w-full rounded-xl border border-brand-ink/10 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-brand-ink/40 focus:border-brand focus:ring-2 focus:ring-brand/15',
                      item.email && !isEmail(item.email) && 'border-[#C0503A] focus:border-[#C0503A] focus:ring-[#C0503A]/15',
                    )}
                  />
                  <button
                    type="button"
                    title={t('mail.removeSender')}
                    aria-label={t('mail.removeSender')}
                    onClick={() =>
                      set(
                        'senders',
                        form.senders.filter((_, i) => i !== index),
                      )
                    }
                    className="rounded-xl p-2.5 text-brand-ink/45 transition hover:bg-red-50 hover:text-[#C0503A]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {form.senders.length < 10 ? (
              <button type="button" onClick={() => set('senders', [...form.senders, { name: '', email: '' }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                <Plus className="h-4 w-4" />
                {t('mail.addSender')}
              </button>
            ) : null}
            {google && form.senders.length > 0 ? <p className="mt-3 rounded-xl bg-[#FFF6E5] px-3.5 py-2.5 text-xs leading-5 text-[#8A5A00]">{t('mail.aliasNote')}</p> : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy !== null || !dirty || !complete || !sendersValid} onClick={() => void onSave()}>
              {busy === 'save' ? t('common.loading') : t('mail.save')}
            </Button>
            <Button type="button" variant="secondary" disabled={busy !== null || dirty || !saved.ready} onClick={() => void onTest()}>
              <Send className="h-4 w-4" />
              {busy === 'test' ? t('mail.testing') : t('mail.test')}
            </Button>
            {saved.host ? (
              <Button type="button" variant="danger" className="ml-auto" disabled={busy !== null} onClick={() => void onRemove()}>
                {t('mail.disconnect')}
              </Button>
            ) : null}
          </div>
          <div role="status" aria-live="polite">
            {notice ? <p className="mt-3 flex items-center gap-2 text-sm font-medium text-brand"><Check className="h-4 w-4" />{notice}</p> : null}
            {error ? <p className="mt-3 text-sm leading-6 text-[#C0503A]">{error}</p> : null}
          </div>
        </div>
      </Card>
    </div>
  )
}
