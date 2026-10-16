const express = require('express');
const { authRequired, managerRequired } = require('../auth');
const slack = require('../slack');

// The company's Slack channel: connecting it with an incoming webhook, choosing what is posted
// there, and a test message. For the owner and the administrators.

const router = express.Router();
router.use(authRequired, managerRequired);

const SLACK_ERRORS = {
  SLACK_WEBHOOK: [400, 'Paste the Webhook URL that Slack gives (it starts with https://hooks.slack.com/).'],
  SLACK_NOT_CONNECTED: [409, 'Connect a Slack channel first.'],
};

function sendError(res, err) {
  const code = (err && (err.slackCode || err.message)) || '';
  const mapped = SLACK_ERRORS[code];
  if (mapped) return res.status(mapped[0]).json({ error: mapped[1], code });
  // Slack refused the message: a webhook that was removed, or a channel archived.
  if (/^SLACK_/.test(code)) return res.status(502).json({ error: 'Slack did not accept the message.', code });
  return null;
}

router.get('/', (req, res) => {
  res.json(slack.describe(req.user.id));
});

router.put('/', (req, res, next) => {
  try {
    res.json(slack.update(req.user.id, req.body || {}));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.delete('/', (req, res) => {
  res.json(slack.update(req.user.id, { webhook: '', channel: '' }));
});

router.post('/test', async (req, res, next) => {
  try {
    await slack.test(req.user.id);
    res.json(slack.describe(req.user.id));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

module.exports = router;
