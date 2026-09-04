const express = require('express');
const { authRequired } = require('../auth');
const { listInvoices, getInvoice, addInvoice, updateInvoice, deleteInvoice } = require('../store');

const router = express.Router();
router.use(authRequired);

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
    if (err.message === 'PLAN_LIMIT') {
      return res.status(402).json({
        error: 'Free plan includes 10 invoices per month. Upgrade to Premium for unlimited invoices.',
        usage: err.usage,
      });
    }
    throw err;
  }
});

router.get('/:id', (req, res) => {
  const invoice = getInvoice(req.user.id, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice });
});

router.put('/:id', (req, res) => {
  const saved = updateInvoice(req.user.id, req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice: saved });
});

router.delete('/:id', (req, res) => {
  const ok = deleteInvoice(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ ok: true });
});

module.exports = router;
