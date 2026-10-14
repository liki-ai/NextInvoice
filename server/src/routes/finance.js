const express = require('express');
const multer = require('multer');
const { authRequired, managerRequired } = require('../auth');
const finance = require('../finance/service');
const timesheet = require('../finance/timesheet');
const { sendMailError } = require('./mail');

// The company's finance inbox and health figures. Salaries, taxes and bank balances are for the
// owner and the administrators only.

const router = express.Router();
router.use(authRequired, managerRequired);

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024, files: 20 } });

const FINANCE_ERRORS = {
  FINANCE_WATCH: [400, 'Enter at least one valid email address to follow (at most 10).'],
  FINANCE_SINCE: [400, 'Enter a valid start date.'],
  FINANCE_BOX: [409, 'Connect that mailbox in Settings first.'],
  FINANCE_HOST: [400, 'This mail server name is not valid.'],
  FINANCE_FULL: [409, 'The finance inbox is full.'],
  MAIL_READ: [502, 'The mailbox could not be read.'],
  TIMESHEET_EMPTY: [400, 'The workbook has no hours to bring in.'],
  TIMESHEET_ROW: [400, 'A row of hours is not valid.'],
  TIMESHEET_PROJECT: [400, 'Name the project.'],
};

function sendError(res, err) {
  const code = err && (err.financeCode || err.mailCode || err.message);
  const mapped = FINANCE_ERRORS[code];
  if (mapped) {
    const body = { error: mapped[1], code };
    if (err.detail) body.detail = err.detail;
    res.status(mapped[0]).json(body);
    return true;
  }
  return sendMailError(res, err);
}

router.get('/', (req, res) => {
  res.json(finance.describe(req.user.id, req.user));
});

router.put('/settings', (req, res, next) => {
  try {
    const settings = finance.updateSettings(req.user.id, req.user, req.body || {});
    if (settings.enabled) finance.checkMail(req.user.id).catch(() => {});
    res.json(finance.describe(req.user.id, req.user));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

/** Signs in to the mailbox and counts the messages that would be read, without reading them. */
router.post('/test', async (req, res, next) => {
  try {
    res.json(await finance.testSettings(req.user.id, req.user, req.body || {}));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

/** Starts a mail check now; the page follows its progress. */
router.post('/check', (req, res) => {
  finance.checkMail(req.user.id, { manual: true }).catch(() => {});
  setTimeout(() => res.json(finance.describe(req.user.id, req.user)), 300);
});

router.post('/documents', upload.array('files', 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'Choose at least one file.', code: 'FILE_REQUIRED' });
    const added = [];
    for (const file of files) {
      // Browsers send file names as Latin-1; turn them back into the UTF-8 they were.
      const name = Buffer.from(file.originalname || 'document', 'latin1').toString('utf8').slice(0, 200);
      const { doc, duplicate } = await finance.addFile(req.user.id, { name, mime: file.mimetype || 'application/octet-stream', data: file.buffer, source: 'upload' });
      added.push({ id: doc.id, duplicate });
    }
    res.json({ added, ...finance.describe(req.user.id, req.user) });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.get('/documents/:id/file', async (req, res, next) => {
  try {
    const found = await finance.documentFile(req.user.id, req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found.' });
    const safeName = String(found.doc.name || 'document').replace(/["\r\n\\]/g, '_');
    res.setHeader('Content-Type', found.doc.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(found.data);
  } catch (err) {
    next(err);
  }
});

router.patch('/documents/:id', (req, res) => {
  const doc = finance.editDocument(req.user.id, req.params.id, req.body || {});
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  res.json(finance.describe(req.user.id, req.user));
});

router.post('/documents/:id/retry', (req, res) => {
  const doc = finance.retryDocument(req.user.id, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  res.json(finance.describe(req.user.id, req.user));
});

router.post('/documents/:id/undo-bank', (req, res) => {
  const doc = finance.undoSettlement(req.user.id, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  res.json(finance.describe(req.user.id, req.user));
});

router.delete('/documents/:id', async (req, res, next) => {
  try {
    const doc = await finance.deleteDocument(req.user.id, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    res.json(finance.describe(req.user.id, req.user));
  } catch (err) {
    next(err);
  }
});

/** The hours the team logged by project, and which client each project is for. */
router.get('/projects', (req, res) => {
  res.json(timesheet.describe(req.user.id));
});

router.put('/projects/hours', (req, res, next) => {
  try {
    res.json(timesheet.importHours(req.user.id, req.user, req.body || {}));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.delete('/projects/hours', (req, res) => {
  res.json(timesheet.clearHours(req.user.id));
});

/** Money outside the projects, grouped by the words its bank payments carry. */
router.patch('/projects/source', (req, res, next) => {
  try {
    res.json(timesheet.setSource(req.user.id, req.body || {}));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.patch('/projects/project', (req, res, next) => {
  try {
    res.json(timesheet.setProject(req.user.id, req.body || {}));
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

module.exports = router;
