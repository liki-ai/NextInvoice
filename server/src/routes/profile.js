const express = require('express');
const { authRequired, managerRequired } = require('../auth');
const { getProfile, updateProfile } = require('../store');
const { INDUSTRIES, INVOICE_TEMPLATES, normalizeTaxRate } = require('../domain');

const router = express.Router();
router.use(authRequired);

const TEXT_FIELDS = {
  companyName: 160,
  contactPerson: 120,
  nui: 40,
  vatNumber: 40,
  streetAddress: 200,
  state: 120,
  zipCode: 20,
  email: 160,
  phone: 40,
  website: 160,
  currency: 3,
  bankName: 120,
  iban: 48,
  swift: 16,
  exportNote: 400,
  logoUri: 600,
  logoName: 160,
  logoMime: 60,
};

// Images travel as data URLs. The web client downsizes them first; this is the backstop.
const IMAGE_FIELDS = ['logoData', 'signatureData', 'stampData'];
const MAX_IMAGE_CHARS = 1_500_000;

function sanitizeProfile(body) {
  const partial = {};
  const src = body && typeof body === 'object' ? body : {};
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (src[key] === undefined || src[key] === null) continue;
    partial[key] = String(src[key]).slice(0, max);
  }
  for (const key of IMAGE_FIELDS) {
    if (src[key] === undefined || src[key] === null) continue;
    const value = String(src[key]);
    if (value && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) {
      const err = new Error('Image must be a PNG, JPG, WEBP or GIF.');
      err.status = 400;
      throw err;
    }
    if (value.length > MAX_IMAGE_CHARS) {
      const err = new Error('Image is too large.');
      err.status = 413;
      throw err;
    }
    partial[key] = value;
  }
  if (['sq', 'en', 'it'].includes(src.language)) partial.language = src.language;
  if (INDUSTRIES.includes(src.industry)) partial.industry = src.industry;
  if (INVOICE_TEMPLATES.includes(src.invoiceTemplate)) partial.invoiceTemplate = src.invoiceTemplate;
  if (src.accentColor !== undefined && src.accentColor !== null) {
    const color = String(src.accentColor).trim();
    if (color === '' || /^#[0-9a-fA-F]{6}$/.test(color)) partial.accentColor = color;
  }
  if (src.defaultTaxRate !== undefined && src.defaultTaxRate !== null) partial.defaultTaxRate = normalizeTaxRate(src.defaultTaxRate);
  if (partial.currency !== undefined) partial.currency = partial.currency.toUpperCase() || 'EUR';
  return partial;
}

router.get('/', (req, res) => {
  res.json({ profile: getProfile(req.user.id) });
});

router.put('/', managerRequired, (req, res) => {
  let partial;
  try {
    partial = sanitizeProfile(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  res.json({ profile: updateProfile(req.user.id, partial) });
});

module.exports = router;
module.exports.sanitizeProfile = sanitizeProfile;
