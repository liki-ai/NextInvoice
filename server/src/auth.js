const jwt = require('jsonwebtoken');
const { findUserById, publicUser } = require('./store');

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
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    req.user = publicUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: 'Authentication required.' });
  }
}

module.exports = { signToken, authRequired };
