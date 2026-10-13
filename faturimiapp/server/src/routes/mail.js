const express = require('express');
const { authRequired } = require('../auth');
const { appUrl } = require('../mail');
const { getProfile, getInvoice, shareInvoice, getMailSettings, saveMailSettings, recordInvoiceEmail } = require('../store');
const { countSend, deliver, mailReady, messageHtml, parseRecipients, pickSender, publicMailSettings, sanitizeMailSettings, verifyConnection } = require('../mailer');
const { pdfAvailable, htmlToPdf } = require('../pdf');

const router = express.Router();
router.use(authRequired);

const MAIL_ERRORS = {
  MAIL_NOT_CONFIGURED: [409, 'Connect the company mailbox in Settings first.'],
  MAIL_INCOMPLETE: [400, 'Enter the mail server, the mailbox and its password.'],
  MAIL_HOST: [400, 'This mail server is not allowed.'],
  MAIL_AUTH: [422, 'The mailbox or its app password was not accepted.'],
  MAIL_CONNECT: [502, 'Could not reach the mail server.'],
  MAIL_REJECTED: [422, 'The mail server refused the message.'],
  MAIL_SENDER: [400, 'This address is not on the list of senders.'],
  MAIL_RECIPIENT: [400, 'Enter at least one valid recipient address.'],
  MAIL_CONTENT: [400, 'The email needs a subject and a message.'],
  MAIL_LIMIT: [429, 'The daily email limit has been reached.'],
  MAIL_FAILED: [502, 'The email could not be sent.'],
  PDF_FAILED: [500, 'The invoice PDF could not be created.'],
};

/** Answers with the matching mail error; false when the error is not one of them. */
function sendMailError(res, err) {
  const mapped = MAIL_ERRORS[err && (err.mailCode || err.message)];
  if (!mapped) return false;
  const body = { error: mapped[1], code: err.mailCode || err.message };
  if (err.detail) body.detail = err.detail;
  res.status(mapped[0]).json(body);
  return true;
}

function code(name) {
  const err = new Error(name);
  err.mailCode = name;
  return err;
}

/** The invoice templates, built from the web app's own source so both print the same page. */
function invoiceRender() {
  try {
    return require('../generated/invoiceRender');
  } catch {
    return null;
  }
}

function canAttachPdf() {
  return pdfAvailable() && Boolean(invoiceRender());
}

function describe(user) {
  const profile = getProfile(user.id);
  return { mail: publicMailSettings(getMailSettings(user.id), user, profile.companyName), pdf: canAttachPdf() };
}

function messageParts(body) {
  const subject = String(body.subject || '').trim();
  const text = String(body.body || '').trim();
  if (!subject || !text || text.length > 10000) throw code('MAIL_CONTENT');
  return { subject, text };
}

/**
 * Emails an issued invoice from the company's mailbox: the message the user wrote, a button to the
 * invoice's public page and, when a browser is installed on the server, the invoice itself as a PDF.
 */
async function sendInvoiceEmail(user, invoiceId, body) {
  const invoice = getInvoice(user.id, invoiceId);
  if (!invoice) return null;
  if (invoice.lifecycle === 'draft') throw new Error('DRAFT_SHARE');
  if (invoice.lifecycle === 'cancelled') throw new Error('CANCELLED_LOCKED');
  const settings = getMailSettings(user.id);
  if (!mailReady(settings)) throw code('MAIL_NOT_CONFIGURED');
  const profile = getProfile(user.id);
  const sender = pickSender(settings, user, profile.companyName, body.from);
  const to = parseRecipients(body.to, { required: true });
  const cc = parseRecipients(body.cc);
  const { subject, text } = messageParts(body);

  const render = invoiceRender();
  const lang = render && render.isLang(body.lang) ? body.lang : profile.language || 'sq';
  const attachments = [];
  if (body.attachPdf !== false && canAttachPdf()) {
    try {
      const pdf = await htmlToPdf(render.renderInvoiceHtml({ invoice, profile, lang }));
      attachments.push({ filename: `${String(invoice.number || 'invoice').replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' });
    } catch (err) {
      console.error('[mail] invoice PDF failed', err);
      throw code('PDF_FAILED');
    }
  }

  countSend(user.id);
  const link = `${appUrl()}/i/?t=${shareInvoice(user.id, invoiceId)}`;
  const button = { url: link, label: render ? render.translate(lang, 'send.viewInvoice') : 'View invoice' };
  await deliver(settings, { sender, to, cc, subject, text, html: messageHtml(text, { button, accent: profile.accentColor }), attachments });
  const saved = recordInvoiceEmail(user.id, invoiceId, { from: sender.email, to, cc, subject, attached: attachments.length > 0 });
  return { invoice: saved, attached: attachments.length > 0 };
}

router.get('/', (req, res) => {
  res.json(describe(req.user));
});

/**
 * Saves the connection only after the mail server has accepted the mailbox and its password, so a
 * saved connection is one that works. Changing just the list of senders needs no new sign-in.
 */
router.put('/', async (req, res, next) => {
  try {
    const settings = sanitizeMailSettings(req.body, getMailSettings(req.user.id), req.user.email);
    if (!settings.host || !settings.user || !settings.pass) throw code('MAIL_INCOMPLETE');
    if (!settings.verifiedAt) {
      await verifyConnection(settings);
      settings.verifiedAt = new Date().toISOString();
    }
    saveMailSettings(req.user.id, settings);
    res.json(describe(req.user));
  } catch (err) {
    if (!sendMailError(res, err)) next(err);
  }
});

router.delete('/', (req, res) => {
  saveMailSettings(req.user.id, null);
  res.json(describe(req.user));
});

/** A message to the account's own address, to prove the saved connection works. */
router.post('/test', async (req, res, next) => {
  try {
    const settings = getMailSettings(req.user.id);
    if (!mailReady(settings)) throw code('MAIL_NOT_CONFIGURED');
    const profile = getProfile(req.user.id);
    const sender = pickSender(settings, req.user, profile.companyName, req.body && req.body.from);
    const to = parseRecipients(req.user.email, { required: true });
    const { subject, text } = messageParts(req.body || {});
    countSend(req.user.id);
    await deliver(settings, { sender, to, subject, text, html: messageHtml(text, { accent: profile.accentColor }) });
    // A connection saved before saving checked it: a delivered test proves it just as well.
    if (!settings.verifiedAt) saveMailSettings(req.user.id, { ...settings, verifiedAt: new Date().toISOString() });
    res.json({ ok: true, to: to[0], from: sender.email, ...describe(req.user) });
  } catch (err) {
    if (!sendMailError(res, err)) next(err);
  }
});

module.exports = router;
module.exports.sendInvoiceEmail = sendInvoiceEmail;
module.exports.sendMailError = sendMailError;
