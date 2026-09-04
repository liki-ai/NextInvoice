const express = require('express');
const { authRequired } = require('../auth');
const { getProfile, updateProfile } = require('../store');

const router = express.Router();
router.use(authRequired);

const ALLOWED = [
  'companyName',
  'contactPerson',
  'nui',
  'streetAddress',
  'state',
  'zipCode',
  'email',
  'phone',
  'currency',
  'bankName',
  'iban',
  'exportNote',
  'language',
];

router.get('/', (req, res) => {
  res.json({ profile: getProfile(req.user.id) });
});

router.put('/', (req, res) => {
  const partial = {};
  for (const key of ALLOWED) {
    if (req.body && req.body[key] !== undefined) partial[key] = req.body[key];
  }
  res.json({ profile: updateProfile(req.user.id, partial) });
});

module.exports = router;
