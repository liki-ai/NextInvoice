export const INDUSTRIES = ['fashion', 'services', 'retail', 'hospitality', 'construction', 'other'];

export const MEASUREMENT_FIELDS = ['chest', 'waist', 'hips', 'shoulders', 'height'];

export function normalizeIndustry(value) {
  return INDUSTRIES.includes(value) ? value : 'other';
}

export function isFashionIndustry(profile) {
  return normalizeIndustry(profile?.industry) === 'fashion';
}

export function clientDisplayName(client) {
  const named = [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim();
  return named || String(client?.fullName || '').trim();
}

export function splitClientName(client) {
  if (client?.firstName || client?.lastName) {
    return {
      firstName: String(client.firstName || '').trim(),
      lastName: String(client.lastName || '').trim(),
    };
  }
  const parts = String(client?.fullName || '').trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

export function composeClient(fields) {
  const firstName = String(fields.firstName || '').trim();
  const lastName = String(fields.lastName || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || String(fields.fullName || '').trim();
  return {
    ...fields,
    firstName,
    lastName,
    fullName,
    phone: String(fields.phone || '').trim(),
    email: String(fields.email || '').trim(),
    address: String(fields.address || '').trim(),
    notes: String(fields.notes || '').trim(),
    measurements: fields.measurements || {},
    photos: Array.isArray(fields.photos) ? fields.photos : [],
  };
}
