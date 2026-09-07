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
  let firstName = String(fields.firstName || '').trim();
  let lastName = String(fields.lastName || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || String(fields.fullName || '').trim();
  if (fullName && !firstName && !lastName) {
    const split = splitClientName({ fullName });
    firstName = split.firstName;
    lastName = split.lastName;
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
    measurements: fields.measurements || {},
    photos: Array.isArray(fields.photos) ? fields.photos : [],
  };
}

export function clientSearchText(client) {
  return [clientDisplayName(client), client?.phone, client?.email, client?.address, client?.businessId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function clientMatchesQuery(client, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return clientSearchText(client).includes(q);
}

export function frequentClients(clients, invoices, limit = 8) {
  const counts = {};
  (invoices || []).forEach((inv) => {
    const id = inv.clientId || inv.client?.id;
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  return [...(clients || [])]
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || clientDisplayName(a).localeCompare(clientDisplayName(b)))
    .slice(0, limit);
}

export function invoiceClientFields(client) {
  return {
    fullName: clientDisplayName(client),
    address: client?.address || '',
    phone: client?.phone || '',
    email: client?.email || '',
    businessId: client?.businessId || '',
  };
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function findMatchingClient(clients, extracted) {
  const list = clients || [];
  const name = String(extracted?.fullName || '').trim().toLowerCase();
  const phone = digits(extracted?.phone);
  const email = String(extracted?.email || '').trim().toLowerCase();
  const businessId = String(extracted?.businessId || '').trim().toLowerCase();

  if (phone.length >= 6) {
    const byPhone = list.find((item) => {
      const p = digits(item.phone);
      return p && (p === phone || (p.length >= 6 && (p.endsWith(phone) || phone.endsWith(p))));
    });
    if (byPhone) return byPhone;
  }
  if (email) {
    const byEmail = list.find((item) => String(item.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (businessId) {
    const byId = list.find((item) => String(item.businessId || '').trim().toLowerCase() === businessId);
    if (byId) return byId;
  }
  if (name) {
    const exact = list.find((item) => clientDisplayName(item).toLowerCase() === name);
    if (exact) return exact;
    const partial = list.find((item) => {
      const n = clientDisplayName(item).toLowerCase();
      return n.length >= 4 && name.length >= 4 && (n.includes(name) || name.includes(n));
    });
    if (partial) return partial;
  }
  return null;
}
