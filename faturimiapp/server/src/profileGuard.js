// Placeholder company details the phone app shows before its owner fills them in, in its languages.
const SAMPLE_PROFILE_VALUES = {
  companyName: ['Kompania juaj (shembull)', 'Your company (sample)', 'La tua azienda (esempio)'],
  contactPerson: ['Emri juaj (shembull)', 'Your name (sample)', 'Il tuo nome (esempio)'],
  nui: ['000000000'],
  streetAddress: ['Rruga shembull, nr. 1', 'Example street, no. 1', 'Via esempio, n. 1'],
  zipCode: ['10000'],
  email: ['email@shembull.com', 'email@example.com', 'email@esempio.com'],
  phone: ['+383 00 000 000'],
};

function isSampleProfileValue(field, value) {
  return (SAMPLE_PROFILE_VALUES[field] || []).includes(String(value ?? '').trim());
}

function hasRealCompanyName(profile) {
  const name = String(profile?.companyName ?? '').trim();
  return Boolean(name) && !isSampleProfileValue('companyName', name);
}

/**
 * The part of a profile sent by a phone that may be saved, or null when none of it may. A phone
 * whose company was never filled in must not replace a company set up on the web: the App Store
 * build 1.3.0 (46) sends its whole unfilled profile on its first sign-in, which would otherwise
 * overwrite the name, NUI, address, bank details and industry with its placeholders.
 */
function syncedProfileChange(current, body) {
  if (hasRealCompanyName(current) && !hasRealCompanyName(body)) return null;
  const next = {};
  for (const [field, value] of Object.entries(body || {})) {
    if (isSampleProfileValue(field, value)) continue;
    next[field] = value;
  }
  return next;
}

module.exports = { syncedProfileChange, isSampleProfileValue };
