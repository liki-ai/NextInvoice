const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptSecret, encryptSecret, isPrivateAddress, mailError, mailReady, messageHtml, parseRecipients, pickSender, publicMailSettings, sanitizeMailSettings, senderOptions } = require('./mailer');

const account = { id: 'u1', email: 'Owner@Tretek.io' };

test('a saved password comes back only through decryptSecret', () => {
  const blob = encryptSecret('abcd efgh ijkl mnop');
  assert.ok(!JSON.stringify(blob).includes('abcd'));
  assert.equal(decryptSecret(blob), 'abcd efgh ijkl mnop');
  assert.equal(decryptSecret({ ...blob, tag: encryptSecret('x').tag }), '');
  assert.equal(decryptSecret(null), '');
});

test('settings are cleaned, and a blank password keeps the saved one', () => {
  const first = sanitizeMailSettings({ host: ' SMTP.Gmail.com ', port: 587, user: ' info@tretek.io ', password: 'abcd efgh ijkl mnop', senders: [{ name: 'Financa "x"\r\nBcc: a@b.c', email: 'Finance@Tretek.io' }, { email: 'owner@tretek.io' }, { email: 'nope' }] }, null, account.email);
  assert.equal(first.host, 'smtp.gmail.com');
  assert.equal(first.user, 'info@tretek.io');
  assert.equal(decryptSecret(first.pass), 'abcdefghijklmnop');
  assert.deepEqual(first.senders, [{ name: 'Financa x Bcc: a@b.c', email: 'finance@tretek.io' }]);
  assert.ok(mailReady(first));

  const kept = sanitizeMailSettings({ host: 'smtp.gmail.com', port: 587, user: 'info@tretek.io', senders: [] }, first, account.email);
  assert.equal(decryptSecret(kept.pass), 'abcdefghijklmnop');

  const checked = { ...first, verifiedAt: '2026-10-13T10:00:00.000Z' };
  assert.equal(sanitizeMailSettings({ host: 'smtp.gmail.com', port: 587, user: 'info@tretek.io', senders: [{ email: 'a@tretek.io' }] }, checked, account.email).verifiedAt, checked.verifiedAt);
  assert.equal(sanitizeMailSettings({ host: 'smtp.gmail.com', port: 587, user: 'info@tretek.io', password: 'another' }, checked, account.email).verifiedAt, null);
  assert.equal(sanitizeMailSettings({ host: 'smtp.gmail.com', port: 465, user: 'info@tretek.io' }, checked, account.email).verifiedAt, null);

  const moved = sanitizeMailSettings({ host: 'smtp.gmail.com', port: 587, user: 'other@tretek.io' }, first, account.email);
  assert.equal(moved.pass, null);
  assert.ok(!mailReady(moved));
});

test('only real mail ports and well-formed hosts are accepted', () => {
  assert.throws(() => sanitizeMailSettings({ host: 'smtp.gmail.com', port: 5432, user: 'a@b.c', password: 'x' }, null, account.email), /MAIL_HOST/);
  assert.throws(() => sanitizeMailSettings({ host: 'bad host/..', port: 587, user: 'a@b.c', password: 'x' }, null, account.email), /MAIL_HOST/);
});

test('the browser never receives the password', () => {
  const saved = sanitizeMailSettings({ host: 'smtp.gmail.com', port: 587, user: 'info@tretek.io', password: 'secret-value', senders: [{ name: 'Financa', email: 'finance@tretek.io' }] }, null, account.email);
  const shown = publicMailSettings(saved, account, 'Tretek SH.P.K.');
  assert.equal(shown.hasPassword, true);
  assert.equal(shown.ready, true);
  assert.equal(shown.verified, false);
  assert.equal(publicMailSettings({ ...saved, verifiedAt: '2026-10-13T10:00:00.000Z' }, account, 'Tretek SH.P.K.').verified, true);
  assert.ok(!JSON.stringify(shown).includes('secret-value'));
  assert.ok(!('pass' in shown));
  assert.deepEqual(shown.from, [
    { name: 'Tretek SH.P.K.', email: 'owner@tretek.io' },
    { name: 'Financa', email: 'finance@tretek.io' },
  ]);
});

test('the sender defaults to the account address and must be on the list', () => {
  const saved = { senders: [{ name: '', email: 'finance@tretek.io' }] };
  assert.equal(pickSender(saved, account, 'Tretek', '').email, 'owner@tretek.io');
  assert.deepEqual(pickSender(saved, account, 'Tretek', 'FINANCE@tretek.io'), { name: 'Tretek', email: 'finance@tretek.io' });
  assert.throws(() => pickSender(saved, account, 'Tretek', 'ceo@other.com'), /MAIL_SENDER/);
  assert.equal(senderOptions(null, account, 'Tretek').length, 1);
});

test('recipients are parsed, de-duplicated and limited', () => {
  assert.deepEqual(parseRecipients('a@x.com, B@x.com; a@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(parseRecipients(''), []);
  assert.throws(() => parseRecipients('', { required: true }), /MAIL_RECIPIENT/);
  assert.throws(() => parseRecipients('a@x.com, not-an-address'), /MAIL_RECIPIENT/);
  assert.throws(() => parseRecipients('a@x.com,b@x.com,c@x.com,d@x.com,e@x.com,f@x.com'), /MAIL_RECIPIENT/);
});

test('addresses inside the machine or a private network are recognised', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.17.0.1', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['142.250.102.108', '172.32.0.1', '8.8.8.8', '2a00:1450:4013:c00::6c']) assert.equal(isPrivateAddress(address), false, address);
});

test('mail server failures map to our own codes', () => {
  assert.equal(mailError({ code: 'EAUTH', response: '535 nope' }).mailCode, 'MAIL_AUTH');
  assert.equal(mailError({ code: 'ETIMEDOUT' }).mailCode, 'MAIL_CONNECT');
  assert.equal(mailError({ code: 'EENVELOPE', responseCode: 550, response: '550 no such user' }).detail, '550 no such user');
  assert.equal(mailError(new Error('boom')).mailCode, 'MAIL_FAILED');
});

test('the message becomes safe HTML with links and a button', () => {
  const html = messageHtml('Hello <b>you</b>\nhttps://mynextinvoice.com/i/?t=abc&x=1', { button: { url: 'https://mynextinvoice.com/i/?t=abc', label: 'View "invoice"' }, accent: '#2E75B6' });
  assert.ok(html.includes('Hello &lt;b&gt;you&lt;/b&gt;<br>'));
  assert.ok(html.includes('<a href="https://mynextinvoice.com/i/?t=abc&amp;x=1"'));
  assert.ok(html.includes('View &quot;invoice&quot;'));
  assert.ok(html.includes('#2E75B6'));
  const fallback = messageHtml('https://mynextinvoice.com', { accent: 'red;}</style>' });
  assert.ok(fallback.includes('#2C6E7F') && !fallback.includes('red;'));
});
