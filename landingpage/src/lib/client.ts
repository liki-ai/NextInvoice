export const INDUSTRIES = ['fashion', 'services', 'retail', 'hospitality', 'construction', 'other'] as const
export type Industry = (typeof INDUSTRIES)[number]
export const MEASUREMENT_FIELDS = ['chest', 'waist', 'hips', 'shoulders', 'height'] as const

export function normalizeIndustry(value?: string | null): Industry {
  return INDUSTRIES.includes(value as Industry) ? (value as Industry) : 'other'
}

export function isFashionIndustry(profile?: { industry?: string | null } | null) {
  return normalizeIndustry(profile?.industry) === 'fashion'
}

export function clientDisplayName(client?: { firstName?: string; lastName?: string; fullName?: string } | null) {
  const named = [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim()
  return named || String(client?.fullName || '').trim()
}

export function splitClientName(client?: { firstName?: string; lastName?: string; fullName?: string } | null) {
  if (client?.firstName || client?.lastName) {
    return { firstName: String(client.firstName || '').trim(), lastName: String(client.lastName || '').trim() }
  }
  const parts = String(client?.fullName || '').trim().split(/\s+/)
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
}

export function composeClient(fields: Record<string, unknown>) {
  let firstName = String(fields.firstName || '').trim()
  let lastName = String(fields.lastName || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || String(fields.fullName || '').trim()
  if (fullName && !firstName && !lastName) {
    const split = splitClientName({ fullName })
    firstName = split.firstName
    lastName = split.lastName
  }
  return {
    ...fields,
    firstName,
    lastName,
    fullName,
    phone: String(fields.phone || '').trim(),
    email: String(fields.email || '').trim(),
    address: String(fields.address || '').trim(),
    businessId: String(fields.businessId || '').trim(),
    notes: String(fields.notes || '').trim(),
    measurements: (fields.measurements as Record<string, string>) || {},
    photos: Array.isArray(fields.photos) ? fields.photos : [],
  }
}

export function clientMatchesQuery(client: { firstName?: string; lastName?: string; fullName?: string; phone?: string; email?: string; address?: string; businessId?: string }, query: string) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return [clientDisplayName(client), client.phone, client.email, client.address, client.businessId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

export function frequentClients<T extends { id: string; firstName?: string; lastName?: string; fullName?: string }>(
  clients: T[],
  invoices: { clientId?: string; client?: { id?: string } }[],
  limit = 8,
) {
  const counts: Record<string, number> = {}
  invoices.forEach((inv) => {
    const id = inv.clientId || inv.client?.id
    if (id) counts[id] = (counts[id] || 0) + 1
  })
  return [...clients]
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || clientDisplayName(a).localeCompare(clientDisplayName(b)))
    .slice(0, limit)
}
