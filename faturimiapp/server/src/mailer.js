const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const nodemailer = require('nodemailer');

// Each company sends invoices through its own mailbox. The mailbox password is kept encrypted and
// never leaves the server again; the browser only learns that one is saved.

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const ALLOWED_PORTS = [587, 465, 2525];
const MAX_SENDERS = 10;
const MAX_RECIPIENTS = 5;
const DAILY_LIMIT = 200;

function fail(code, detail) {
  const err = new Error(code);
  err.mailCode = code;
  if (detail) err.detail = String(detail).slice(0, 300);
  return err;
}

/** Only a local test server may be unencrypted or on a private address. */
function devInsecure() {
  return process.env.MAIL_DEV_INSECURE === '1' && process.env.NODE_ENV !== 'production';
}

function secretKey() {
  const secret = process.env.MAIL_SECRET || process.env.JWT_SECRET || 'dev-only-change-me';
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'nextinvoice', 'mail-password-v1', 32));
}

function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** The saved password, or '' when it cannot be read any more (the server secret changed). */
function decryptSecret(blob) {
  if (!blob || !blob.data) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 160 ? email : '';
}

/** A display name that cannot break out of the header it is written into. */
function cleanName(value) {
  return String(value || '')
    .replace(/[\r\n"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function cleanSenders(list, ownAddress) {
  const seen = new Set([cleanEmail(ownAddress)]);
  const senders = [];
  for (const item of Array.isArray(list) ? list : []) {
    const email = cleanEmail(item && item.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    senders.push({ name: cleanName(item.name), email });
    if (senders.length >= MAX_SENDERS) break;
  }
  return senders;
}

/**
 * What the settings form sent, checked and merged over what is saved. A blank password keeps the
 * saved one. A person's own mailbox (`personal`) sends as itself only, so it takes no extra addresses.
 */
function sanitizeMailSettings(body, current, { personal } = {}) {
  const src = body && typeof body === 'object' ? body : {};
  const host = String(src.host || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (host && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) throw fail('MAIL_HOST');
  const port = Number(src.port) || 587;
  if (!devInsecure() && !ALLOWED_PORTS.includes(port)) throw fail('MAIL_HOST');
  const user = String(src.user || '')
    .trim()
    .slice(0, 160);
  const next = {
    host,
    port,
    user,
    pass: current && current.pass ? current.pass : null,
    senders: personal ? [] : cleanSenders(src.senders, user),
    // When the mail server last accepted this mailbox and password; cleared whenever either changes.
    verifiedAt: (current && current.verifiedAt) || null,
  };
  // A password belongs to one mailbox on one server; it is never carried over to another.
  if (current && (current.host !== host || current.port !== port || current.user !== user)) next.verifiedAt = null;
  if (current && (current.host !== host || current.user !== user)) next.pass = null;
  if (typeof src.password === 'string' && src.password.trim()) {
    next.verifiedAt = null;
    // Google shows app passwords in groups of four; the spaces are not part of it.
    const password = /gmail\.com$|google\.com$/.test(host) ? src.password.replace(/\s+/g, '') : src.password.trim();
    next.pass = encryptSecret(password.slice(0, 200));
  }
  return next;
}

function mailReady(settings) {
  return Boolean(settings && settings.host && settings.user && settings.pass && decryptSecret(settings.pass));
}

/**
 * The addresses one connected mailbox may send as: its own first, then the ones added to it.
 * A mailbox signed in to with something other than an address, and given none, sends as `fallback`.
 */
function mailboxSenders(settings, companyName, fallback) {
  if (!mailReady(settings)) return [];
  const name = cleanName(companyName);
  const own = cleanEmail(settings.user);
  const options = own ? [{ name, email: own }] : [];
  for (const sender of settings.senders || []) {
    if (sender.email !== own) options.push({ name: sender.name || name, email: sender.email });
  }
  if (options.length === 0 && cleanEmail(fallback)) options.push({ name, email: cleanEmail(fallback) });
  return options;
}

/**
 * Everything a person may put under "From": the company mailbox's addresses, which every user of
 * the company shares, then the person's own mailbox. Each choice says which mailbox delivers it;
 * nobody is offered a colleague's address.
 */
function senderOptions(boxes, account, companyName) {
  const email = account && account.email;
  const options = [];
  const add = (box, list) => {
    for (const sender of list) if (!options.some((item) => item.email === sender.email)) options.push({ ...sender, box });
  };
  add('company', mailboxSenders(boxes && boxes.company, companyName, email));
  add('personal', mailboxSenders(boxes && boxes.personal, companyName, email));
  return options;
}

/** The settings as the browser may see them: everything but the password. */
function publicMailSettings(settings) {
  const saved = settings || {};
  return {
    host: saved.host || '',
    port: saved.port || 587,
    user: saved.user || '',
    hasPassword: Boolean(saved.pass && decryptSecret(saved.pass)),
    senders: saved.senders || [],
    ready: mailReady(saved),
    verified: mailReady(saved) && Boolean(saved.verifiedAt),
  };
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb');
}

/**
 * The address to connect to. A company chooses its own mail server, so the name is resolved here and
 * anything inside this machine or its private networks is refused; the connection then goes to the
 * address that was checked, not to the name again.
 */
async function resolveMailHost(host) {
  if (net.isIP(host)) {
    if (!devInsecure()) throw fail('MAIL_HOST');
    return host;
  }
  let found;
  try {
    found = await dns.lookup(host, { all: true });
  } catch {
    throw fail('MAIL_CONNECT');
  }
  const usable = found.filter((item) => devInsecure() || !isPrivateAddress(item.address));
  if (!usable.length) throw fail('MAIL_HOST');
  return (usable.find((item) => item.family === 4) || usable[0]).address;
}

async function openTransport(settings) {
  if (!mailReady(settings)) throw fail('MAIL_NOT_CONFIGURED');
  const address = await resolveMailHost(settings.host);
  const implicitTls = settings.port === 465;
  return nodemailer.createTransport({
    host: address,
    port: settings.port,
    secure: implicitTls,
    requireTLS: !implicitTls && !devInsecure(),
    ignoreTLS: devInsecure(),
    auth: { user: settings.user, pass: decryptSecret(settings.pass) },
    tls: { servername: settings.host, minVersion: 'TLSv1.2' },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 45000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

/** Signs in to the mail server without sending anything, to prove the connection works. */
async function verifyConnection(settings) {
  let transport;
  try {
    transport = await openTransport(settings);
    await transport.verify();
  } catch (err) {
    throw mailError(err);
  } finally {
    if (transport) transport.close();
  }
}

/** Turns whatever the mail server or the network said into one of our own error codes. */
function mailError(err) {
  if (err && err.mailCode) return err;
  const detail = (err && (err.response || err.message)) || '';
  if (err && err.code === 'EAUTH') return fail('MAIL_AUTH', detail);
  if (err && ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ETLS', 'ENOTFOUND', 'ECONNRESET'].includes(err.code)) return fail('MAIL_CONNECT', detail);
  if (err && (err.code === 'EENVELOPE' || err.code === 'EMESSAGE' || (err.responseCode >= 500 && err.responseCode < 600))) return fail('MAIL_REJECTED', detail);
  return fail('MAIL_FAILED', detail);
}

const sentToday = new Map();

/** A ceiling on what one account sends in a day, so a stolen login cannot turn the mailbox into a spam source. */
function countSend(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = sentToday.get(userId);
  const count = entry && entry.day === day ? entry.count : 0;
  if (count >= DAILY_LIMIT) throw fail('MAIL_LIMIT');
  sentToday.set(userId, { day, count: count + 1 });
}

function parseRecipients(value, { required } = {}) {
  const parts = (Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/)).map((item) => String(item).trim()).filter(Boolean);
  const list = [...new Set(parts.map(cleanEmail))];
  if (list.includes('') || list.length > MAX_RECIPIENTS || (required && !list.length)) throw fail('MAIL_RECIPIENT');
  return list;
}

/**
 * The sender a message goes out as, and the mailbox that delivers it. Without a wish it is the
 * first choice, the company's address. Throws when no mailbox is connected or the address is not
 * one this person may use.
 */
function pickSender(boxes, account, companyName, wanted) {
  const options = senderOptions(boxes, account, companyName);
  if (options.length === 0) throw fail('MAIL_NOT_CONFIGURED');
  const email = cleanEmail(wanted) || options[0].email;
  const found = options.find((item) => item.email === email);
  if (!found) throw fail('MAIL_SENDER');
  return { sender: { name: found.name, email: found.email }, settings: boxes[found.box], box: found.box };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The typed message as a simple, widely readable HTML email, with an optional button under it. */
function messageHtml(text, { button, accent } = {}) {
  const colour = /^#[0-9a-fA-F]{6}$/.test(accent || '') ? accent : '#2C6E7F';
  const body = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${colour}">$1</a>`)
    .replace(/\r?\n/g, '<br>');
  const cta =
    button && button.url
      ? `<p style="margin:24px 0 0"><a href="${esc(button.url)}" style="display:inline-block;background:${colour};color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">${esc(button.label)}</a></p>`
      : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1D2B2E"><div style="max-width:600px">${body}${cta}</div></body></html>`;
}

/**
 * Sends one message through the company's mailbox.
 * `sender` must come from pickSender, the recipients from parseRecipients.
 */
async function deliver(settings, { sender, to, cc, subject, text, html, attachments }) {
  let transport;
  try {
    transport = await openTransport(settings);
    const info = await transport.sendMail({
      from: { name: sender.name, address: sender.email },
      replyTo: sender.email,
      to,
      cc: cc && cc.length ? cc : undefined,
      subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200),
      text,
      html,
      attachments,
    });
    return { messageId: info.messageId, accepted: info.accepted || [], rejected: info.rejected || [] };
  } catch (err) {
    throw mailError(err);
  } finally {
    if (transport) transport.close();
  }
}

module.exports = {
  ALLOWED_PORTS,
  cleanEmail,
  countSend,
  decryptSecret,
  deliver,
  encryptSecret,
  isPrivateAddress,
  mailError,
  mailReady,
  messageHtml,
  parseRecipients,
  pickSender,
  publicMailSettings,
  sanitizeMailSettings,
  senderOptions,
  verifyConnection,
};
