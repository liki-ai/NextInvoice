import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Hash, Loader2, Send, Unplug } from 'lucide-react'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { Button, Card, Field } from './ui'

type SlackEvents = { sent: boolean; reminder: boolean; paid: boolean }
type SlackView = { connected: boolean; webhookHint: string; channel: string; events: SlackEvents; lastAt: string | null; lastError: string | null }

const SLACK_APPS = 'https://api.slack.com/apps'
const EVENTS: (keyof SlackEvents)[] = ['reminder', 'sent', 'paid']
const EVENT_KEYS: Record<keyof SlackEvents, string> = { sent: 'slack.eventSent', reminder: 'slack.eventReminder', paid: 'slack.eventPaid' }

function shortTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Settings → the company's Slack channel: an incoming webhook made in Slack is pasted here, and the
 * reminders, sent invoices and payments chosen below are posted to it. For the administrators.
 */
export function SlackSettingsCard() {
  const { t } = useI18n()
  const [view, setView] = useState<SlackView | null>(null)
  const [webhook, setWebhook] = useState('')
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState<'' | 'connect' | 'test'>('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const errorText = (err: unknown) => {
    const code = (err as { code?: string })?.code || ''
    const known = t(`slack.err.${code}`)
    return known !== `slack.err.${code}` ? known : err instanceof Error ? err.message : t('common.error')
  }

  useEffect(() => {
    api<SlackView>('/api/slack')
      .then(setView)
      .catch(() => setView(null))
  }, [])

  async function connect() {
    setBusy('connect')
    setNotice(null)
    let saved = false
    try {
      await api<SlackView>('/api/slack', { method: 'PUT', body: { webhook: webhook.trim(), channel } })
      saved = true
      setView(await api<SlackView>('/api/slack/test', { method: 'POST' }))
      setWebhook('')
      setNotice({ ok: true, text: t('slack.tested') })
    } catch (err) {
      setNotice({ ok: false, text: errorText(err) })
      // A webhook Slack refuses is not kept: the form stays, to paste the right one.
      if (saved) await api<SlackView>('/api/slack', { method: 'DELETE' }).catch(() => null)
      setView(await api<SlackView>('/api/slack').catch(() => view))
    } finally {
      setBusy('')
    }
  }

  async function sendTest() {
    setBusy('test')
    setNotice(null)
    try {
      setView(await api<SlackView>('/api/slack/test', { method: 'POST' }))
      setNotice({ ok: true, text: t('slack.tested') })
    } catch (err) {
      setNotice({ ok: false, text: errorText(err) })
    } finally {
      setBusy('')
    }
  }

  async function toggle(key: keyof SlackEvents, on: boolean) {
    if (!view) return
    setView({ ...view, events: { ...view.events, [key]: on } })
    try {
      setView(await api<SlackView>('/api/slack', { method: 'PUT', body: { events: { [key]: on } } }))
    } catch (err) {
      setNotice({ ok: false, text: errorText(err) })
    }
  }

  async function disconnect() {
    if (!window.confirm(t('slack.disconnectConfirm'))) return
    setNotice(null)
    try {
      setView(await api<SlackView>('/api/slack', { method: 'DELETE' }))
    } catch (err) {
      setNotice({ ok: false, text: errorText(err) })
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4A154B]/10 text-[#4A154B]">
          <Hash className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t('slack.title')}</h2>
          <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('slack.intro')}</p>
        </div>
      </div>

      {view?.connected ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#2E8B57]/8 px-3.5 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#2E7D32]">
              <CheckCircle2 className="h-4 w-4" />
              {view.channel ? t('slack.connected', { channel: view.channel }) : t('slack.connectedNoChannel')}
            </p>
            <span className="text-xs text-brand-ink/50">
              {t('slack.webhookHint', { hint: view.webhookHint })}
              {view.lastAt ? ` · ${t('slack.lastAt', { date: shortTime(view.lastAt) })}` : ''}
            </span>
          </div>
          {view.lastError && !notice ? <p className="rounded-xl bg-[#C0503A]/8 px-3.5 py-2.5 text-sm text-[#C0503A]">{errorText({ code: view.lastError })}</p> : null}
          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('slack.events')}</legend>
            <div className="mt-2 space-y-2">
              {EVENTS.map((key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#2C6E7F]" checked={view.events[key]} onChange={(e) => void toggle(key, e.target.checked)} />
                  {t(EVENT_KEYS[key])}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy !== ''} onClick={() => void sendTest()}>
              {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy === 'test' ? t('slack.testing') : t('slack.test')}
            </Button>
            <Button type="button" variant="danger" onClick={() => void disconnect()}>
              <Unplug className="h-4 w-4" />
              {t('slack.disconnect')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('slack.stepsTitle')}</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-brand-ink/70">
            <li>{t('slack.step1')}</li>
            <li>{t('slack.step2')}</li>
            <li>{t('slack.step3')}</li>
          </ol>
          <a href={SLACK_APPS} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            {t('slack.openSlack')}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              void connect()
            }}
          >
            <Field label={t('slack.webhook')} value={webhook} placeholder={t('slack.webhookPlaceholder')} className="font-mono text-[13px]" spellCheck={false} autoComplete="off" onChange={(e) => setWebhook(e.target.value)} />
            <Field label={t('slack.channel')} value={channel} placeholder={t('slack.channelPlaceholder')} onChange={(e) => setChannel(e.target.value)} />
            <Button type="submit" disabled={busy !== '' || !webhook.trim()}>
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
              {busy === 'connect' ? t('slack.connecting') : t('slack.connect')}
            </Button>
          </form>
        </div>
      )}

      {notice ? <p className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${notice.ok ? 'bg-[#2E8B57]/8 text-[#2E7D32]' : 'bg-[#C0503A]/8 text-[#C0503A]'}`}>{notice.text}</p> : null}
    </Card>
  )
}
