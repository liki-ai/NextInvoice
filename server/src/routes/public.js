const express = require('express');
const { sharedInvoice } = require('../store');

// Pages a recipient opens from a link, without an account.
const router = express.Router();

router.get('/invoices/:token', (req, res) => {
  const shared = sharedInvoice(req.params.token);
  if (!shared) return res.status(404).json({ error: 'This invoice link is not valid.', code: 'NOT_FOUND' });
  // The link is the key; keep it out of shared caches and search engines.
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex');
  res.json(shared);
});

module.exports = router;
