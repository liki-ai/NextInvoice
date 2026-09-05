const express = require('express');
const { authRequired } = require('../auth');
const { listObligations, getObligation, addObligation, updateObligation, deleteObligation, addPayment, voidPayment } = require('../store');

const router = express.Router();
router.use(authRequired);

function sendError(res, err) {
  const map = {
    AMOUNT_INVALID: [400, 'Enter a valid payment amount.'],
    AMOUNT_EXCEEDS: [400, 'Payment cannot exceed the remaining amount.'],
    DATE_REQUIRED: [400, 'Payment date is required.'],
    VOID_REASON: [400, 'A reason is required to correct a payment.'],
    CANCELLED_LOCKED: [409, 'Cancelled documents cannot be changed.'],
  };
  const mapped = map[err.message];
  if (!mapped) throw err;
  const body = { error: mapped[1], code: err.message };
  if (err.remaining != null) body.remaining = err.remaining;
  return res.status(mapped[0]).json(body);
}

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

router.post('/:id/payments', (req, res) => {
  try {
    const obligation = addPayment(req.user.id, 'obligation', req.params.id, req.body || {});
    if (!obligation) return res.status(404).json({ error: 'Obligation not found.' });
    res.status(201).json({ obligation });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/:id/payments/:paymentId', (req, res) => {
  try {
    const obligation = addPayment(req.user.id, 'obligation', req.params.id, { ...req.body, id: req.params.paymentId }, { replaceId: req.params.paymentId });
    if (!obligation) return res.status(404).json({ error: 'Obligation or payment not found.' });
    res.json({ obligation });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/payments/:paymentId/void', (req, res) => {
  try {
    const obligation = voidPayment(req.user.id, 'obligation', req.params.id, req.params.paymentId, req.body?.reason);
    if (!obligation) return res.status(404).json({ error: 'Obligation or payment not found.' });
    res.json({ obligation });
  } catch (err) {
    sendError(res, err);
  }
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
