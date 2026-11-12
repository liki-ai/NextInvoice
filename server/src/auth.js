const jwt = require('jsonwebtoken');
const { findUserById, getInvoice, sessionUser } = require('./store');

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  console.warn('[auth] JWT_SECRET is not set. Using a development fallback.')
  return 'dev-only-change-me'
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret(), { expiresIn: '30d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    const user = findUserById(payload.sub);
    // A user taken out of their company, or whose company is gone, is no longer signed in.
    // X-Company-Id picks which of the person's companies this request works in; any other id means their main one.
    const session = user ? sessionUser(user, String(req.headers['x-company-id'] || '')) : null;
    if (!session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    // req.user.id is the company's data key; req.user.teamId the main company, which holds the users and
    // the plan; req.user.accountId and .email are the person's own.
    req.user = session;
    if (session.role === 'invoicer') return invoicerGate(req, res, next);
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required.' });
  }
}

// What an invoicer may do: write invoices, send them and share their link, add clients, and read
// what that needs. Anything not listed is refused, so a route added later stays closed to them.
// 'own': the invoice in the address must be one they wrote.
const INVOICER_ALLOWED = [
  ['GET', /^\/api\/auth\/me$/],
  ['GET', /^\/api\/billing\/(me|usage)$/],
  ['GET', /^\/api\/profile$/],
  ['GET', /^\/api\/companies$/],
  ['GET', /^\/api\/mail$/],
  ['GET', /^\/api\/invoices$/],
  ['GET', /^\/api\/invoices\/numbers$/],
  ['POST', /^\/api\/invoices$/],
  ['GET PUT DELETE', /^\/api\/invoices\/([^/]+)$/, 'own'],
  ['POST', /^\/api\/invoices\/([^/]+)\/(issue|share|send|deliver)$/, 'own'],
  ['PUT DELETE', /^\/api\/invoices\/([^/]+)\/schedule$/, 'own'],
  ['GET', /^\/api\/clients(\/[^/]+)?$/],
  ['POST', /^\/api\/clients$/],
  ['GET', /^\/api\/items(\/[^/]+)?$/],
  ['POST', /^\/api\/extract-client$/],
];

/** Lets an invoicer through to what they may do, and to an invoice only if they wrote it. */
function invoicerGate(req, res, next) {
  const path = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  for (const [methods, pattern, own] of INVOICER_ALLOWED) {
    const match = methods.split(' ').includes(req.method) ? pattern.exec(path) : null;
    if (!match) continue;
    if (own) {
      const invoice = getInvoice(req.user.id, decodeURIComponent(match[1]));
      // Someone else's invoice answers as if it were not there.
      if (invoice && invoice.createdBy !== req.user.accountId) return res.status(404).json({ error: 'Invoice not found.' });
    }
    return next();
  }
  return res.status(403).json({ error: 'Your role in the company can only write and send invoices.', code: 'INVOICER_ONLY' });
}

/** For what only the owner and administrators may do: company settings, users, billing. Use after authRequired. */
function managerRequired(req, res, next) {
  if (req.user && (req.user.role === 'owner' || req.user.role === 'admin')) return next();
  return res.status(403).json({ error: 'Only an administrator of the company can do this.', code: 'MANAGER_ONLY' });
}

module.exports = { signToken, authRequired, managerRequired };
