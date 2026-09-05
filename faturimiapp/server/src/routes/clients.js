const express = require('express');
const { authRequired } = require('../auth');
const { listClients, getClient, addClient, updateClient, deleteClient } = require('../store');

const router = express.Router();
router.use(authRequired);

function sendError(res, err) {
  if (err.message === 'CLIENT_NAME') {
    return res.status(400).json({ error: 'Client name is required.', code: 'CLIENT_NAME' });
  }
  throw err;
}

router.get('/', (req, res) => {
  res.json({ clients: listClients(req.user.id) });
});

router.post('/', (req, res) => {
  try {
    const result = addClient(req.user.id, req.body || {});
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', (req, res) => {
  const client = getClient(req.user.id, req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  res.json({ client });
});

router.put('/:id', (req, res) => {
  try {
    const client = updateClient(req.user.id, req.params.id, req.body || {});
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    res.json({ client });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/:id', (req, res) => {
  const ok = deleteClient(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Client not found.' });
  res.json({ ok: true });
});

module.exports = router;
