const express = require('express');
const { authRequired } = require('../auth');
const { listItems, getItem, addItem, updateItem, deleteItem } = require('../store');

const router = express.Router();
router.use(authRequired);

function sendError(res, err) {
  if (err.message === 'ITEM_NAME') {
    return res.status(400).json({ error: 'Item description is required.', code: 'ITEM_NAME' });
  }
  throw err;
}

router.get('/', (req, res) => {
  res.json({ items: listItems(req.user.id) });
});

router.post('/', (req, res) => {
  try {
    const result = addItem(req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', (req, res) => {
  const item = getItem(req.user.id, req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json({ item });
});

router.put('/:id', (req, res) => {
  try {
    const item = updateItem(req.user.id, req.params.id, req.body || {});
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id', (req, res) => {
  const ok = deleteItem(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
});

module.exports = router;
