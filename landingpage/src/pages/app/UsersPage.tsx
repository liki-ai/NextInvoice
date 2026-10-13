import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Mail, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAppData } from '../../context/AppDataContext'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { displayCompanyValue } from '../../lib/companySamples'
import { mailErrorText } from '../../lib/mail'
import { formatDay, roleLabelKey, teamErrorText, type InviteResult, type Team, type TeamMember } from '../../lib/team'
import { Button, Card, Field, Select } from '../../components/ui'

type MemberRole = 'admin' | 'member'

function RoleSelect({ label, value, onChange }: { label: string; value: MemberRole; onChange: (role: MemberRole) => void }) {
  const { t } = useI18n()
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value as MemberRole)}>
      <option value="member">{t('team.roleMember')}</option>
      <option value="admin">{t('team.roleAdmin')}</option>
    </Select>
  )
}

/** The company's users: who has access, adding someone directly, or inviting them by email. */
export function UsersPage() {
  const { user } = useAuth()
  const { profile } = useAppData()
  const { t } = useI18n()
  const [team, setTeam] = useState<Team | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('member')
  const [invited, setInvited] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState<MemberRole>('member')

  useEffect(() => {
    let cancelled = false
    api<Team>('/api/team')
      .then((res) => {
        if (!cancelled) setTeam(res)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(teamErrorText(err, t))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const run = useCallback(
    async (key: string, action: () => Promise<string | void>) => {
      setBusy(key)
      setError('')
      setNotice('')
      try {
        const message = await action()
        if (message) setNotice(message)
      } catch (err) {
        setError(teamErrorText(err, t))
      } finally {
        setBusy('')
      }
    },
    [t],
  )

  if (loadError) return <p className="text-sm text-[#C0503A]">{loadError}</p>
  if (!team) return <p className="text-brand-ink/60">{t('common.loading')}</p>

  const company = displayCompanyValue('companyName', profile?.companyName) || 'Next Invoice'

  function onInvite(e: FormEvent) {
    e.preventDefault()
    void run('invite', async () => {
      const res = await api<InviteResult>('/api/team/invites', {
        method: 'POST',
        body: {
          email: inviteEmail.trim(),
          role: inviteRole,
          subject: t('team.inviteSubject', { company }),
          message: t('team.inviteBody', { company, inviter: user?.email || company }),
          button: t('team.inviteButton'),
        },
      })
      setTeam(res)
      setInvited(res)
      setCopied(false)
      setInviteEmail('')
    })
  }

  function onAdd(e: FormEvent) {
    e.preventDefault()
    void run('add', async () => {
      const email = addEmail.trim()
      setTeam(await api<Team>('/api/team/members', { method: 'POST', body: { email, password: addPassword, role: addRole } }))
      setAddEmail('')
      setAddPassword('')
      return t('team.addedOk', { email })
    })
  }

  function onRole(member: TeamMember, role: MemberRole) {
    void run(`role:${member.id}`, async () => setTeam(await api<Team>(`/api/team/members/${member.id}`, { method: 'PATCH', body: { role } })))
  }

  function onRemove(member: TeamMember) {
    if (!window.confirm(t('team.removeConfirm', { email: member.email }))) return
    void run(`remove:${member.id}`, async () => setTeam(await api<Team>(`/api/team/members/${member.id}`, { method: 'DELETE' })))
  }

  function onRevoke(id: string) {
    void run(`revoke:${id}`, async () => {
      setTeam(await api<Team>(`/api/team/invites/${id}`, { method: 'DELETE' }))
      if (invited?.invite.id === id) setInvited(null)
    })
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const badge = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold'

  return (
    <div className="mx-auto max-w-[1180px]">
      <h1 className="font-display text-4xl font-medium tracking-tight">{t('team.title')}</h1>
      <p className="mt-2 text-sm text-brand-ink/55">{t('team.subtitle')}</p>

      <div role="status" aria-live="polite">
        {notice ? (
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-brand/8 px-4 py-3 text-sm font-semibold text-brand">
            <Check className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        ) : null}
        {error ? <p className="mt-5 rounded-xl bg-[#F8E8E4] px-4 py-3 text-sm font-medium text-[#C0503A]">{error}</p> : null}
      </div>

      <div className={cn('mt-8 grid items-start gap-6', team.canManage && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <div className="min-w-0 space-y-6">
          <Card className="p-0">
            <ul className="divide-y divide-brand-ink/8">
              {team.members.map((member) => {
                const fixed = member.role === 'owner' || member.you || !team.canManage
                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{member.email}</span>
                        {member.you ? <span className={cn(badge, 'bg-brand-ink/6 py-0.5 text-brand-ink/55')}>{t('team.you')}</span> : null}
                      </p>
                      {formatDay(member.createdAt) ? <p className="mt-0.5 text-xs text-brand-ink/45">{t('team.added', { date: formatDay(member.createdAt) })}</p> : null}
                    </div>
                    {fixed ? (
                      <span className={cn(badge, member.role === 'member' ? 'bg-brand-ink/6 text-brand-ink/60' : 'bg-brand/10 text-brand')}>
                        {member.role !== 'member' ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                        {t(roleLabelKey(member.role))}
                      </span>
                    ) : (
                      <>
                        <select
                          aria-label={`${t('team.role')}: ${member.email}`}
                          value={member.role}
                          disabled={busy !== ''}
                          onChange={(e) => onRole(member, e.target.value as MemberRole)}
                          className="rounded-xl border border-brand-ink/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        >
                          <option value="member">{t('team.roleMember')}</option>
                          <option value="admin">{t('team.roleAdmin')}</option>
                        </select>
                        <button
                          type="button"
                          title={t('team.remove')}
                          aria-label={`${t('team.remove')}: ${member.email}`}
                          disabled={busy !== ''}
                          onClick={() => onRemove(member)}
                          className="rounded-xl p-2 text-brand-ink/45 transition hover:bg-red-50 hover:text-[#C0503A] disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          {team.invites.length > 0 ? (
            <Card className="p-0">
              <h2 className="px-6 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-ink/45">{t('team.pending')}</h2>
              <ul className="mt-2 divide-y divide-brand-ink/8">
                {team.invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{invite.email}</p>
                      <p className="mt-0.5 text-xs text-brand-ink/45">{t('team.expires', { date: formatDay(invite.expiresAt) })}</p>
                    </div>
                    <span className={cn(badge, 'bg-[#FFF6E5] text-[#8A5A00]')}>{t(roleLabelKey(invite.role))}</span>
                    {team.canManage ? (
                      <Button type="button" variant="danger" className="px-3 py-2 text-xs" disabled={busy !== ''} onClick={() => onRevoke(invite.id)}>
                        {t('team.revoke')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="space-y-1 text-xs leading-5 text-brand-ink/50">
            <p>{t('team.roleMemberHint')}</p>
            <p>{t('team.roleAdminHint')}</p>
            {team.canManage ? null : <p className="font-medium text-brand-ink/60">{t('team.readOnly')}</p>}
          </div>
        </div>

        {team.canManage ? (
          <aside className="space-y-6">
            <Card>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Mail className="h-4 w-4 text-brand" />
                {t('team.inviteTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('team.inviteHint')}</p>
              <form onSubmit={onInvite} className="mt-5">
                <Field label={t('team.email')} type="email" required autoComplete="off" spellCheck={false} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <RoleSelect label={t('team.role')} value={inviteRole} onChange={setInviteRole} />
                {team.mailReady ? null : (
                  <p className="mb-4 rounded-xl bg-[#FFF6E5] px-3.5 py-2.5 text-xs leading-5 text-[#8A5A00]">
                    {t('team.inviteNoMail')}{' '}
                    <Link to="/app/profile#email" className="font-semibold underline underline-offset-2">
                      {t('send.connectAction')}
                    </Link>
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy !== '' || !inviteEmail.trim()}>
                  <Mail className="h-4 w-4" />
                  {busy === 'invite' ? t('common.loading') : team.mailReady ? t('team.inviteCta') : t('team.inviteCtaLink')}
                </Button>
              </form>

              {invited ? (
                <div className="mt-5 rounded-xl border border-brand/20 bg-brand/5 p-4">
                  <p className={cn('flex items-start gap-2 text-sm font-semibold', invited.emailed ? 'text-brand' : 'text-brand-ink')}>
                    {invited.emailed ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                    {invited.emailed ? t('team.inviteSent', { email: invited.invite.email }) : invited.emailError ? t('team.inviteNotSent') : t('team.inviteLinkReady', { email: invited.invite.email })}
                  </p>
                  {invited.emailError ? <p className="mt-1 text-xs leading-5 text-[#C0503A]">{mailErrorText(invited.emailError, t)}</p> : null}
                  <code className="mt-3 block break-all rounded-lg bg-white px-3 py-2 text-xs text-brand-ink/75">{invited.link}</code>
                  <button
                    type="button"
                    onClick={() => void copyLink(invited.link)}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl border border-brand-ink/12 bg-white px-3 py-2 text-xs font-semibold transition hover:border-brand/30"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t('send.copied') : t('send.copyLink')}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-brand-ink/50">{t('team.inviteLinkHint')}</p>
                </div>
              ) : null}
            </Card>

            <Card>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <UserPlus className="h-4 w-4 text-brand" />
                {t('team.addTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-brand-ink/55">{t('team.addHint')}</p>
              <form onSubmit={onAdd} className="mt-5">
                <Field label={t('team.email')} type="email" required autoComplete="off" spellCheck={false} value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
                <Field label={t('team.password')} type="password" required minLength={8} autoComplete="new-password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} />
                <RoleSelect label={t('team.role')} value={addRole} onChange={setAddRole} />
                <Button type="submit" variant="secondary" className="w-full" disabled={busy !== '' || !addEmail.trim() || addPassword.length < 8}>
                  <UserPlus className="h-4 w-4" />
                  {busy === 'add' ? t('common.loading') : t('team.addCta')}
                </Button>
              </form>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
