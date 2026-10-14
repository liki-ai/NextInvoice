// The words of automatic emails: the subject and message for an invoice going out, in the customer's
// language, chosen by what the invoice is for. A subscription that is up for renewal (iPacienti, or
// any plan marked as a subscription) gets a renewal reminder that counts the days to its expiry; any
// other invoice gets a plain, complete invoice email. Texts live with the app's other translations.

const { daysBetween } = require('./schedule');

const LANGS = ['sq', 'en', 'it'];

function pickLang(...candidates) {
  return candidates.find((item) => LANGS.includes(item)) || 'sq';
}

/** "2026-11-01" or "01.11.2026" as 01.11.2026. */
function formatDay(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : text;
}

/** A plan bills a subscription when it says so, or when its product is iPacienti. */
function isSubscription(plan) {
  if (!plan) return false;
  if (plan.kind === 'subscription') return true;
  if (plan.kind === 'invoice') return false;
  const product = `${plan.product || ''} ${((plan.items || [])[0] || {}).description || ''}`;
  return /ipacienti/i.test(product);
}

function productName(plan, invoice) {
  const named = String((plan && plan.product) || '').trim();
  if (named) return named;
  const line = String((((plan && plan.items) || (invoice && invoice.items) || [])[0] || {}).description || '').trim();
  // "iPacienti – Abonim Vjetor" names the product before the dash.
  return line.split(/\s+[–-]\s+/)[0] || line || 'Next Invoice';
}

/**
 * Subject and plain-text body for an invoice email.
 *   t: (lang, key, params) => text      the app's translations
 *   money: formatted amount with its currency
 */
function invoiceEmail({ t, lang, today, plan, invoice, clientName, companyName, senderName, money, link, paymentUrl }) {
  const say = (key, params) => t(lang, `recurring.mail.${key}`, params);
  const number = invoice.number;
  const due = formatDay(invoice.dueDate) || say('onReceipt');
  const pay = paymentUrl ? `\n\n${say('payHere', { url: paymentUrl })}` : '';
  const view = link ? `\n${say('viewHere', { url: link })}` : '';
  const close = `\n\n${say('thanks')}\n${senderName || companyName}`;
  const hello = say('hello', { name: clientName || '' }).replace(/\s+,/, ',');

  if (isSubscription(plan) && invoice.recurring && invoice.recurring.period) {
    const product = productName(plan, invoice);
    const expires = invoice.recurring.period;
    const days = daysBetween(today, expires);
    const graceEnds = invoice.recurring.graceEnds;
    let subject;
    let opening;
    if (days > 1) {
      subject = say('subSubjectDays', { product, days });
      opening = say('subOpenDays', { product, date: formatDay(expires), days });
    } else if (days === 1) {
      subject = say('subSubjectTomorrow', { product });
      opening = say('subOpenTomorrow', { product, date: formatDay(expires) });
    } else if (days === 0) {
      subject = say('subSubjectToday', { product });
      opening = say('subOpenToday', { product, date: formatDay(expires) });
    } else {
      subject = say('subSubjectExpired', { product });
      const graceLeft = graceEnds ? daysBetween(today, graceEnds) : 0;
      opening =
        graceLeft > 0
          ? say('subOpenGrace', { product, date: formatDay(expires), graceEnd: formatDay(graceEnds), days: graceLeft })
          : say('subOpenExpired', { product, date: formatDay(expires) });
    }
    const invoiceLine = say('subInvoice', {
      number,
      from: formatDay(invoice.recurring.period),
      to: formatDay(invoice.recurring.periodEnd),
      amount: money,
      due,
    });
    return { subject, text: `${hello}\n\n${opening}\n\n${invoiceLine}${pay}${view}${close}`, kind: 'subscription' };
  }

  const description = String(((invoice.items || [])[0] || {}).description || '').trim();
  const subject = say('subject', { number, company: companyName });
  const body = say(description ? 'body' : 'bodyNoDescription', { number, description, amount: money, due });
  return { subject, text: `${hello}\n\n${body}${pay}${view}${close}`, kind: 'invoice' };
}

/** The note to the company itself that an invoice went out. */
function sentNotice({ t, lang, invoice, clientName, money, to, subscription }) {
  const say = (key, params) => t(lang, `recurring.notify.${key}`, params);
  const lines = [say('sentBody', { number: invoice.number, client: clientName, amount: money, to: to.join(', ') })];
  if (subscription) lines.push(say('subscriptionLine', { product: subscription.product, from: formatDay(subscription.from), to: formatDay(subscription.to) }));
  return { subject: say('sentSubject', { number: invoice.number, client: clientName }), text: lines.join('\n\n') };
}

/** The note to the company itself that an invoice has been paid in full. */
function paidNotice({ t, lang, invoice, clientName, money, paidOn, source, subscription }) {
  const say = (key, params) => t(lang, `recurring.notify.${key}`, params);
  const lines = [say('paidBody', { number: invoice.number, client: clientName, amount: money, date: formatDay(paidOn) })];
  if (source) lines.push(say('paidSource', { source }));
  if (subscription) lines.push(say('renewedLine', { product: subscription.product, through: formatDay(subscription.through) }));
  return { subject: say('paidSubject', { number: invoice.number, client: clientName }), text: lines.join('\n\n') };
}

/** One note for several invoices paid in the same round. */
function paidDigest({ t, lang, rows }) {
  const say = (key, params) => t(lang, `recurring.notify.${key}`, params);
  const lines = rows.map((row) => say('digestLine', { number: row.invoice.number, client: row.clientName, amount: row.money, date: formatDay(row.paidOn) }));
  return { subject: say('digestSubject', { count: rows.length }), text: [say('digestIntro', { count: rows.length }), '', ...lines].join('\n') };
}

module.exports = { LANGS, pickLang, formatDay, isSubscription, productName, invoiceEmail, sentNotice, paidNotice, paidDigest };
