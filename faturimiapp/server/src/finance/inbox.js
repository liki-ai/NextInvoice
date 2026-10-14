const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { decryptSecret, mailReady, resolveMailHost } = require('../mailer');

// Reads the company's mailbox over IMAP, with the same address and app password it sends invoices
// with, and picks out the messages that involve the accountant (or whoever else the company named):
// sent by them, to them, or with them in copy. Nothing is changed in the mailbox; messages are only
// read, and only those.

const MAX_MESSAGE_BYTES = 40 * 1024 * 1024;

function fail(code, detail) {
  const err = new Error(code);
  err.mailCode = code;
  if (detail) err.detail = String(detail).slice(0, 300);
  return err;
}

/** The IMAP server that goes with the mailbox's sending server: smtp.gmail.com → imap.gmail.com. */
function imapHostFor(smtpHost, override) {
  const wanted = String(override || '').trim().toLowerCase();
  if (wanted) return wanted;
  const host = String(smtpHost || '').trim().toLowerCase();
  if (/(^|\.)office365\.com$|^smtp-mail\.outlook\.com$/.test(host)) return 'outlook.office365.com';
  if (host.startsWith('smtp.')) return `imap.${host.slice(5)}`;
  if (host.startsWith('smtp-')) return `imap-${host.slice(5)}`;
  return host;
}

function imapError(err) {
  if (err && err.mailCode) return err;
  const detail = (err && (err.responseText || err.response || err.message)) || '';
  if (err && (err.authenticationFailed || /auth|credential|password|login/i.test(detail))) return fail('MAIL_AUTH', detail);
  if (err && ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EHOSTUNREACH', 'NoConnection'].includes(err.code)) return fail('MAIL_CONNECT', detail);
  return fail('MAIL_READ', detail);
}

/** A local test server ("127.0.0.1:1143", without TLS), only outside production. */
function devServer() {
  const wanted = /^127\.0\.0\.1:(\d+)$/.exec(String(process.env.FINANCE_DEV_IMAP || ''));
  return wanted && process.env.MAIL_DEV_INSECURE === '1' && process.env.NODE_ENV !== 'production' ? Number(wanted[1]) : 0;
}

async function openImap(settings, imapHost) {
  if (!mailReady(settings)) throw fail('MAIL_NOT_CONFIGURED');
  const host = imapHostFor(settings.host, imapHost);
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) throw fail('MAIL_HOST');
  const devPort = devServer();
  const address = devPort ? '127.0.0.1' : await resolveMailHost(host);
  const client = new ImapFlow({
    host: address,
    servername: host,
    port: devPort || 993,
    secure: !devPort,
    auth: { user: settings.user, pass: decryptSecret(settings.pass) },
    tls: { servername: host, minVersion: 'TLSv1.2' },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 120000,
    disableAutoIdle: true,
  });
  // A dropped connection is reported on the next command; it must not end the process.
  client.on('error', (err) => console.error('[finance] imap', err && err.message));
  try {
    await client.connect();
  } catch (err) {
    throw imapError(err);
  }
  return client;
}

/** Gmail keeps every message in "All Mail", including the ones the user sent; elsewhere the inbox. */
async function pickFolder(client) {
  const folders = await client.list();
  const all = folders.find((folder) => folder.specialUse === '\\All');
  return all ? all.path : 'INBOX';
}

function searchQuery(watch, since) {
  const or = [];
  for (const address of watch) or.push({ from: address }, { to: address }, { cc: address });
  const query = or.length === 1 ? { ...or[0] } : { or };
  if (since) query.since = since;
  return query;
}

function addresses(field) {
  const list = field ? (Array.isArray(field) ? field : [field]) : [];
  return list.flatMap((item) => (item.value || []).map((entry) => String(entry.address || '').toLowerCase())).filter(Boolean);
}

function attachmentsOf(parsed) {
  return (parsed.attachments || [])
    .filter((item) => item.content && item.content.length > 0)
    .filter((item) => {
      const type = String(item.contentType || '');
      // Logos and pictures in signatures are inline images; a scanned document is attached.
      if (type.startsWith('image/')) return item.contentDisposition === 'attachment' && !item.related && item.content.length > 30000;
      return true;
    })
    .map((item, index) => ({
      name: String(item.filename || `attachment-${index + 1}`).slice(0, 200),
      mime: String(item.contentType || 'application/octet-stream'),
      data: item.content,
    }));
}

/**
 * Signs in and checks that the mailbox can be read: the folder it would search and how many
 * messages there involve the watched addresses.
 */
async function testInbox(settings, { imapHost, watch, since }) {
  const client = await openImap(settings, imapHost);
  try {
    const folder = await pickFolder(client);
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      const uids = watch.length ? await client.search(searchQuery(watch, since), { uid: true }) : [];
      return { folder, matches: (uids || []).length, host: imapHostFor(settings.host, imapHost) };
    } finally {
      lock.release();
    }
  } catch (err) {
    throw imapError(err);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * The next messages after `cursor` that involve the watched addresses, fully read, a few at a time
 * (`limit` messages or about `maxBytes`), oldest first. Returns them with the cursor to continue from;
 * `done` when nothing is left.
 */
async function fetchBatch(settings, { imapHost, watch, since, cursor, limit = 10, maxBytes = 60 * 1024 * 1024 }) {
  const client = await openImap(settings, imapHost);
  try {
    const folder = await pickFolder(client);
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      const validity = String(client.mailbox.uidValidity || '');
      const sameBox = cursor && cursor.folder === folder && cursor.uidValidity === validity;
      const after = sameBox ? Number(cursor.lastUid) || 0 : 0;
      const query = searchQuery(watch, since);
      if (after > 0) query.uid = `${after + 1}:*`;
      const found = ((await client.search(query, { uid: true })) || []).filter((uid) => uid > after).sort((a, b) => a - b);
      const messages = [];
      let bytes = 0;
      let lastUid = after;
      for (const uid of found) {
        if (messages.length >= limit || bytes >= maxBytes) break;
        const meta = await client.fetchOne(String(uid), { size: true }, { uid: true });
        lastUid = uid;
        if (!meta || meta.size > MAX_MESSAGE_BYTES) continue;
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;
        bytes += message.source.length;
        const parsed = await simpleParser(message.source, { skipImageLinks: true, skipTextToHtml: true });
        messages.push({
          uid,
          messageId: String(parsed.messageId || `${folder}:${validity}:${uid}`).slice(0, 300),
          date: parsed.date ? parsed.date.toISOString() : null,
          subject: String(parsed.subject || '').slice(0, 300),
          from: addresses(parsed.from)[0] || '',
          fromName: String((parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].name) || '').slice(0, 120),
          to: addresses(parsed.to),
          cc: addresses(parsed.cc),
          text: String(parsed.text || '').slice(0, 20000),
          html: typeof parsed.html === 'string' ? parsed.html.slice(0, 300000) : '',
          attachments: attachmentsOf(parsed),
        });
      }
      const done = found.length === 0 || lastUid >= found[found.length - 1];
      return { messages, cursor: { folder, uidValidity: validity, lastUid }, done, remaining: found.filter((uid) => uid > lastUid).length };
    } finally {
      lock.release();
    }
  } catch (err) {
    throw imapError(err);
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { fetchBatch, testInbox, imapHostFor };
