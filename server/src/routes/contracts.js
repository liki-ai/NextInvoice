const express = require('express');
const multer = require('multer');
const { authRequired } = require('../auth');
const contracts = require('../contracts/service');

// The company's contracts, with the signed document behind each one. Part of the catalogue, like
// clients and items, so every user of the company sees them.

const router = express.Router();
router.use(authRequired);

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

const ERRORS = {
  CONTRACT_TITLE: [400, 'Name the contract or add its document.'],
  CONTRACTS_FULL: [409, 'The list of contracts is full.'],
  FILE_REQUIRED: [400, 'Choose a file.'],
  LIMIT_FILE_SIZE: [413, 'The file is larger than 25 MB.'],
};

function sendError(res, err) {
  const code = err && (err.contractCode || err.code);
  const mapped = ERRORS[code];
  if (!mapped) return false;
  res.status(mapped[0]).json({ error: mapped[1], code });
  return true;
}

/** The uploaded file, if any, with its name back in the UTF-8 the browser meant. */
function uploaded(req) {
  if (!req.file) return null;
  return {
    name: Buffer.from(req.file.originalname || 'kontrata', 'latin1').toString('utf8').slice(0, 200),
    mime: req.file.mimetype || 'application/octet-stream',
    data: req.file.buffer,
  };
}

/** A form with a file sends its other fields as one JSON text named "fields". */
function bodyOf(req) {
  if (typeof req.body?.fields === 'string') {
    try {
      return JSON.parse(req.body.fields) || {};
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function withUpload(handler) {
  return (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (!sendError(res, err)) next(err);
        return;
      }
      Promise.resolve(handler(req, res)).catch((failure) => {
        if (!sendError(res, failure)) next(failure);
      });
    });
}

router.get('/', (req, res) => {
  res.json({ contracts: contracts.list(req.user.id) });
});

router.post(
  '/',
  withUpload(async (req, res) => {
    const contract = await contracts.create(req.user.id, req.user, bodyOf(req), uploaded(req));
    res.status(201).json({ contract });
  }),
);

/** Contracts from a spreadsheet, read on the page: one set of fields per row. */
router.post('/import', (req, res, next) => {
  try {
    const result = contracts.importContracts(req.user.id, req.user, req.body?.contracts);
    res.json({ ...result, contracts: contracts.list(req.user.id) });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const contract = contracts.update(req.user.id, req.params.id, req.body || {});
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    res.json({ contract });
  } catch (err) {
    if (!sendError(res, err)) next(err);
  }
});

router.post(
  '/:id/file',
  withUpload(async (req, res) => {
    const contract = await contracts.replaceFile(req.user.id, req.params.id, uploaded(req));
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    res.json({ contract });
  }),
);

router.post('/:id/read', (req, res) => {
  const contract = contracts.readAgain(req.user.id, req.params.id);
  if (!contract) return res.status(404).json({ error: 'Contract not found.' });
  res.json({ contract });
});

router.get('/:id/file', async (req, res, next) => {
  try {
    const found = await contracts.contractFile(req.user.id, req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found.' });
    const safeName = String(found.contract.file.name || 'kontrata').replace(/["\r\n\\]/g, '_');
    res.setHeader('Content-Type', found.contract.file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(found.data);
  } catch (err) {
    next(err);
  }
});

/** The words of a Word document, for its preview on the page. */
router.get('/:id/text', async (req, res, next) => {
  try {
    const text = await contracts.contractText(req.user.id, req.params.id);
    if (text == null) return res.status(404).json({ error: 'Not found.' });
    res.json({ text: text.slice(0, 200000) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const contract = await contracts.remove(req.user.id, req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
