function appUrl() {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '');
  if (!process.env.RENDER) return 'http://localhost:5180';
  return 'https://mynextinvoice.com';
}

/** The texts of the app, shared with the web app; missing only if the server was not built with them. */
function texts() {
  try {
    return require('./generated/invoiceRender');
  } catch {
    return null;
  }
}

const FALLBACK = {
  'auth.resetEmailSubject': 'Reset your Next Invoice password',
  'auth.resetEmailBody': 'Hello,\n\nWe received a request to reset the password of the account {email}.\n\nOpen the link and set a new password:\n{link}\n\nThe link is valid for 1 hour. If you did not ask for this, do nothing; your password stays as it is.',
  'auth.resetEmailButton': 'Set a new password',
};

function resetEmailContent(resetUrl, email, lang) {
  const shared = texts();
  const say = (key, params) => {
    const text = shared && shared.isLang(lang) ? shared.translate(lang, key, params) : key;
    if (text !== key) return text;
    return FALLBACK[key].replace(/\{(\w+)\}/g, (match, name) => (params && params[name] !== undefined ? String(params[name]) : match));
  };
  return {
    subject: say('auth.resetEmailSubject'),
    text: say('auth.resetEmailBody', { email, link: resetUrl }),
    button: say('auth.resetEmailButton'),
  };
}

/**
 * Emails the link for choosing a new password. It goes out through the app's own mail service when
 * one is set up (RESEND_API_KEY); otherwise through the mailbox the person's company has connected
 * for sending invoices. With neither, there is no way to reach them and MAIL_NOT_CONFIGURED is thrown.
 */
async function sendPasswordResetEmail(user, resetUrl) {
  // Required here, not at the top: the store and the mailer are not needed just to know the app's address.
  const { sessionUser, getProfile, getMailSettings } = require('./store');
  const { cleanEmail, countSend, deliver, mailReady, messageHtml } = require('./mailer');

  const session = sessionUser(user);
  const profile = session ? getProfile(session.id) : {};
  const content = resetEmailContent(resetUrl, user.email, profile.language);
  const html = messageHtml(content.text, { button: { url: resetUrl, label: content.button }, accent: profile.accentColor });

  const key = process.env.RESEND_API_KEY;
  if (key) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'Next Invoice <noreply@mynextinvoice.com>', to: user.email, subject: content.subject, html, text: content.text }),
    });
    if (!response.ok) {
      console.error('[mail] Resend failed', response.status, await response.text());
      throw new Error('MAIL_FAILED');
    }
    return { sent: true, via: 'resend' };
  }

  const settings = session ? getMailSettings(session.id) : null;
  if (mailReady(settings)) {
    countSend(session.id);
    // From the connected mailbox itself: the one address that mailbox is certain to be allowed to send as.
    const address = cleanEmail(settings.user) || cleanEmail(session.email);
    await deliver(settings, { sender: { name: 'Next Invoice', email: address }, to: [user.email], subject: content.subject, text: content.text, html });
    return { sent: true, via: 'company' };
  }

  const err = new Error('MAIL_NOT_CONFIGURED');
  err.resetUrl = resetUrl;
  throw err;
}

module.exports = { appUrl, sendPasswordResetEmail };
