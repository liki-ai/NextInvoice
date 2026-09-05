const express = require('express');
const { authRequired } = require('../auth');
const { applySync, snapshotForUser, exportBackup, restoreBackup } = require('../store');

const router = express.Router();
router.use(authRequired);

function sendError(res, err) {
  const map = {
    RESTORE_CONFIRM: [400, 'Restore requires confirm: "RESTORE".'],
    RESTORE_EMPTY: [400, 'Backup data is missing.'],
    RESTORE_CHECKSUM: [400, 'Backup checksum does not match.'],
    UNKNOWN_CHANGE: [400, 'Unknown sync change.'],
    PLAN_LIMIT: [402, 'Free plan includes 10 invoices per month. Upgrade to Premium for unlimited invoices.'],
    ISSUED_LOCKED: [409, 'Issued invoices cannot be edited silently. Use correction or cancel.'],
    CANCELLED_LOCKED: [409, 'Cancelled invoices cannot be changed.'],
    ISSUED_DELETE: [409, 'Issued invoices cannot be deleted. Cancel them instead.'],
    CANCEL_REASON: [400, 'A cancel reason is required.'],
    CORRECT_REASON: [400, 'A correction reason is required.'],
    CLIENT_NAME: [400, 'Client name is required.'],
    AMOUNT_INVALID: [400, 'Enter a valid payment amount.'],
    AMOUNT_EXCEEDS: [400, 'Payment cannot exceed the remaining amount.'],
    DATE_REQUIRED: [400, 'Payment date is required.'],
    VOID_REASON: [400, 'A reason is required to correct a payment.'],
    DRAFT_PAYMENT: [409, 'Issue the invoice before recording a payment.'],
    PAYMENTS_EXCEED: [400, 'Correction would make recorded payments exceed the new total.'],
  };
  const mapped = map[err.message];
  if (!mapped) throw err;
  return res.status(mapped[0]).json({ error: mapped[1], code: err.message, remaining: err.remaining, usage: err.usage });
}

router.get('/', (req, res) => {
  res.json(snapshotForUser(req.user.id));
});

router.post('/', (req, res) => {
  try {
    const result = applySync(req.user.id, req.body || {});
    res.json({ ...result, snapshot: snapshotForUser(req.user.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/backup', (req, res) => {
  res.json(exportBackup(req.user.id));
});

router.post('/backup/restore', (req, res) => {
  try {
    const restored = restoreBackup(req.user.id, req.body || {});
    res.json(restored);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
