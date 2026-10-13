export type TeamRole = 'owner' | 'admin' | 'member'

export type TeamMember = { id: string; email: string; role: TeamRole; createdAt?: string; addedBy?: string; you: boolean }

export type TeamInvite = { id: string; email: string; role: 'admin' | 'member'; createdAt: string; expiresAt: string; invitedBy?: string }

/** The users of the company and the invitations still open. */
export type Team = {
  members: TeamMember[]
  invites: TeamInvite[]
  /** Whether the person looking may add, change and remove users. */
  canManage: boolean
  /** Whether the company's mailbox is connected, so invitations can be emailed from the app. */
  mailReady: boolean
}

export type InviteResult = Team & { invite: TeamInvite; link: string; emailed: boolean; emailError?: { code: string; detail?: string } }

/** The owner and administrators run the company's settings, users and billing; a plain user does not. */
export function canManageCompany(user: { role?: TeamRole } | null | undefined) {
  return Boolean(user) && user?.role !== 'member'
}

const ROLE_KEYS: Record<TeamRole, string> = { owner: 'team.roleOwner', admin: 'team.roleAdmin', member: 'team.roleMember' }

export function roleLabelKey(role: TeamRole) {
  return ROLE_KEYS[role] || ROLE_KEYS.member
}

const ERROR_KEYS: Record<string, string> = {
  EMAIL_TAKEN: 'team.errEmailTaken',
  TEAM_FULL: 'team.errTeamFull',
  EMAIL_INVALID: 'team.errEmailInvalid',
  PASSWORD_SHORT: 'team.errPasswordShort',
  MANAGER_ONLY: 'team.errManagerOnly',
  OWNER_FIXED: 'team.errOwnerFixed',
  SELF_FIXED: 'team.errSelfFixed',
}

export function teamErrorText(err: unknown, t: (key: string) => string) {
  const failure = err as { code?: string; message?: string } | null
  const key = failure?.code ? ERROR_KEYS[failure.code] : undefined
  return key ? t(key) : failure?.message || t('common.error')
}

export function formatDay(value?: string) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}
