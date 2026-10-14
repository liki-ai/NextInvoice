// Dates for recurring invoices and subscriptions. Plain functions on calendar days ('YYYY-MM-DD'),
// with no clock of their own, so they can be tested and reasoned about without a server.
//
// A plan has an anchor: the original renewal date, the day the first invoiced period starts. Period
// k starts at anchor + k × frequency, always counted from the anchor, so a late payment or a moved
// send date never shifts the periods after it.

const FREQUENCIES = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY_MS = 86400000;

function isDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toDay(date) {
  return date.toISOString().slice(0, 10);
}

function fromDay(day) {
  return new Date(`${day}T00:00:00Z`);
}

function addDays(day, days) {
  return toDay(new Date(fromDay(day).getTime() + days * DAY_MS));
}

function daysBetween(from, to) {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / DAY_MS);
}

/** The anchor moved by whole months, keeping its day of month where the month has it (31 Jan → 28/29 Feb → 31 Mar). */
function addMonths(anchor, months) {
  const [y, m, d] = anchor.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDay(new Date(Date.UTC(year, month, Math.min(d, last))));
}

function monthsOf(frequency) {
  return FREQUENCIES[frequency] || 0;
}

/** Start of period k. */
function periodStart(plan, k) {
  return addMonths(plan.anchorDate, k * monthsOf(plan.frequency));
}

/** The period that starts on `start`: its first and last day. */
function periodOf(plan, k) {
  const start = periodStart(plan, k);
  return { index: k, start, end: addDays(periodStart(plan, k + 1), -1) };
}

/** The day the invoice for a period is sent: some days before the period starts (the renewal). */
function sendDateFor(plan, start) {
  return addDays(start, -Math.max(0, Number(plan.sendDaysBefore) || 0));
}

/** The payment deadline on that invoice. */
function dueDateFor(plan, invoiceDay) {
  return addDays(invoiceDay, Math.max(0, Number(plan.dueDays) || 0));
}

/**
 * The next period that still needs an invoice: the first one, counted from the anchor, that has no
 * invoice yet. It is due to be created once `today` is within `lookahead` days of its send date.
 */
function nextPeriod(plan, today, { lookahead = 7, maxPeriods = 600 } = {}) {
  if (!monthsOf(plan.frequency) || !isDay(plan.anchorDate)) return null;
  const done = plan.periods || {};
  for (let k = 0; k < maxPeriods; k += 1) {
    const period = periodOf(plan, k);
    if (done[period.start]) continue;
    if (plan.endDate && period.start > plan.endDate) return null;
    const sendOn = sendDateFor(plan, period.start);
    return { ...period, sendOn, due: daysBetween(today, sendOn) <= lookahead };
  }
  return null;
}

/**
 * How far the subscription is paid, from the anchor on: the end of the last period whose invoice is
 * paid, with no unpaid period before it. Until anything is paid it is the anchor itself (the term the
 * customer already had). Payment dates play no part, so paying late never moves the next renewal.
 */
function paidThrough(plan, isPeriodPaid) {
  let through = plan.anchorDate;
  for (let k = 0; k < 600; k += 1) {
    const period = periodOf(plan, k);
    if (!isPeriodPaid(period.start)) break;
    through = periodStart(plan, k + 1);
  }
  return through;
}

/**
 * Where the subscription stands today. `active` until it runs out; then `grace` for the configured
 * number of days, while payment may still be on its way and service carries on; then `expired`.
 */
function subscriptionStatus(plan, today, isPeriodPaid) {
  const expires = paidThrough(plan, isPeriodPaid);
  const grace = Math.max(0, Number(plan.graceDays) || 0);
  const graceEnds = addDays(expires, grace);
  const daysLeft = daysBetween(today, expires);
  let state = 'active';
  if (daysLeft <= 0) state = daysBetween(today, graceEnds) > 0 ? 'grace' : 'expired';
  return { state, expires, graceEnds, daysLeft };
}

module.exports = {
  FREQUENCIES,
  isDay,
  toDay,
  addDays,
  addMonths,
  daysBetween,
  periodStart,
  periodOf,
  sendDateFor,
  dueDateFor,
  nextPeriod,
  paidThrough,
  subscriptionStatus,
};
