const express = require('express');
const { authRequired } = require('../auth');
const { listObligations, getObligation, addObligation, updateObligation, deleteObligation } = require('../store');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const obligations = listObligations(req.user.id).map((item) => {
    const { proofData, ...rest } = item;
    return rest;
  });
  res.json({ obligations });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!String(body.vendor || '').trim()) {
    return res.status(400).json({ error: 'Vendor name is required.' });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'Enter a valid amount.' });
  }
  const saved = addObligation(req.user.id, body);
  res.status(201).json({ obligation: saved });
});

router.get('/:id', (req, res) => {
  const obligation = getObligation(req.user.id, req.params.id);
  if (!obligation) return res.status(404).json({ error: 'Obligation not found.' });
  res.json({ obligation });
});

router.put('/:id', (req, res) => {
  const saved = updateObligation(req.user.id, req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: 'Obligation not found.' });
  res.json({ obligation: saved });
});

router.delete('/:id', (req, res) => {
  const ok = deleteObligation(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Obligation not found.' });
  res.json({ ok: true });
});

module.exports = router;
