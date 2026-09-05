const express = require('express');
const { authRequired } = require('../auth');
const {
  listInvoices,
  getInvoice,
  addInvoice,
  updateInvoice,
  deleteInvoice,
  issueInvoice,
  cancelInvoice,
  correctInvoice,
  addPayment,
  voidPayment,
} = require('../store');

const router = express.Router();
router.use(authRequired);

function sendError(res, err) {
  const map = {
    PLAN_LIMIT: [402, 'Free plan includes 10 invoices per month. Upgrade to Premium for unlimited invoices.'],
    ISSUED_LOCKED: [409, 'Issued invoices cannot be edited silently. Use correction or cancel.'],
    CANCELLED_LOCKED: [409, 'Cancelled invoices cannot be changed.'],
    ISSUED_DELETE: [409, 'Issued invoices cannot be deleted. Cancel them instead.'],
    CANCEL_REASON: [400, 'A cancel reason is required.'],
    CORRECT_REASON: [400, 'A correction reason is required.'],
    NOT_ISSUED: [409, 'Only issued invoices can be corrected.'],
    DRAFT_CANCEL: [409, 'Delete the draft instead of cancelling it.'],
    DRAFT_PAYMENT: [409, 'Issue the invoice before recording a payment.'],
    AMOUNT_INVALID: [400, 'Enter a valid payment amount.'],
    AMOUNT_EXCEEDS: [400, 'Payment cannot exceed the remaining amount.'],
    DATE_REQUIRED: [400, 'Payment date is required.'],
    VOID_REASON: [400, 'A reason is required to correct a payment.'],
    PAYMENTS_EXCEED: [400, 'Correction would make recorded payments exceed the new total.'],
  };
  const mapped = map[err.message];
  if (!mapped) throw err;
  const body = { error: mapped[1], code: err.message };
  if (err.usage) body.usage = err.usage;
  if (err.remaining != null) body.remaining = err.remaining;
  return res.status(mapped[0]).json(body);
}

router.get('/', (req, res) => {
  res.json({ invoices: listInvoices(req.user.id) });
});

router.post('/', (req, res) => {
  const invoice = req.body || {};
  if (!invoice.client || !String(invoice.client.fullName || '').trim()) {
    return res.status(400).json({ error: 'Client name is required.' });
  }
  if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
    return res.status(400).json({ error: 'Add at least one item.' });
  }
  try {
    const saved = addInvoice(req.user.id, invoice);
    res.status(201).json({ invoice: saved });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/issue', (req, res) => {
  try {
    const invoice = issueInvoice(req.user.id, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    const invoice = cancelInvoice(req.user.id, req.params.id, req.body?.reason);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/correct', (req, res) => {
  try {
    const invoice = correctInvoice(req.user.id, req.params.id, req.body || {});
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/payments', (req, res) => {
  try {
    const invoice = addPayment(req.user.id, 'invoice', req.params.id, req.body || {});
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.status(201).json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/:id/payments/:paymentId', (req, res) => {
  try {
    const invoice = addPayment(req.user.id, 'invoice', req.params.id, { ...req.body, id: req.params.paymentId }, { replaceId: req.params.paymentId });
    if (!invoice) return res.status(404).json({ error: 'Invoice or payment not found.' });
    res.json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/:id/payments/:paymentId/void', (req, res) => {
  try {
    const invoice = voidPayment(req.user.id, 'invoice', req.params.id, req.params.paymentId, req.body?.reason);
    if (!invoice) return res.status(404).json({ error: 'Invoice or payment not found.' });
    res.json({ invoice });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', (req, res) => {
  const invoice = getInvoice(req.user.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice });
});

router.put('/:id', (req, res) => {
  try {
    const saved = updateInvoice(req.user.id, req.params.id, req.body || {});
    if (!saved) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice: saved });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id', (req, res) => {
  try {
    const ok = deleteInvoice(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
