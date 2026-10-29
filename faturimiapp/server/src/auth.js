const jwt = require('jsonwebtoken');
const { findUserById, sessionUser } = require('./store');

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
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required.' });
  }
}

/** For what only the owner and administrators may do: company settings, users, billing. Use after authRequired. */
function managerRequired(req, res, next) {
  if (req.user && (req.user.role === 'owner' || req.user.role === 'admin')) return next();
  return res.status(403).json({ error: 'Only an administrator of the company can do this.', code: 'MANAGER_ONLY' });
}

module.exports = { signToken, authRequired, managerRequired };
