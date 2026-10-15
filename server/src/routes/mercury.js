const express = require('express');
const { authRequired, managerRequired } = require('../auth');
const mercury = require('../finance/mercury');

// The Mercury bank connection: for the owner and the administrators only. The webhook Mercury
// calls has no login; it is handled in index.js, where the raw body is still available.

const router = express.Router();
router.use(authRequired, managerRequired);

const ERRORS = {
  MERCURY_TOKEN: [400, 'Paste the API token from Mercury.'],
  MERCURY_AUTH: [422, 'Mercury did not accept this token.'],
  MERCURY_CONNECT: [502, 'Could not reach Mercury.'],
  MERCURY_FAILED: [502, 'Mercury answered with an error.'],
  MERCURY_SINCE: [400, 'Enter a valid start date.'],
};

function sendError(res, err) {
  const code = err && (err.mercuryCode || err.message);
  const mapped = ERRORS[code];
  if (!mapped) return false;
  res.status(mapped[0]).json({ error: mapped[1], code, ...(err.detail ? { detail: err.detail } : {}) });
  return true;
}

router.get('/', (req, res) => {
  res.json(mercury.publicView(req.user.id));
});

router.put('/', async (req, res, next) => {
  try {
    await mercury.connect(req.user.id, req.body || {});
    res.json(mercury.publicView(req.user.id));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.delete('/', (req, res) => {
  mercury.disconnect(req.user.id);
  res.json(mercury.publicView(req.user.id));
});

router.post('/sync', async (req, res) => {
  await mercury.sync(req.user.id);
  res.json(mercury.publicView(req.user.id));
});

/** Mercury's own delivery: answered with the status only. */
function handleMercuryWebhook(req, res) {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const status = mercury.webhook(req.params.key, body, req.get('Mercury-Signature'));
  res.status(status).json({ ok: status === 200 });
}

module.exports = router;
module.exports.handleMercuryWebhook = handleMercuryWebhook;
