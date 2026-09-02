const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, findUserByEmail, publicUser } = require('../store');
const { signToken, authRequired } = require('../auth');

const router = express.Router();

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

router.post('/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser({ email, passwordHash });
    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.message === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    if (err.message && err.message.includes('JWT_SECRET')) {
      return res.status(500).json({ error: 'Server auth is not configured.' });
    }
    console.error('[signup]', err);
    return res.status(500).json({ error: 'Could not create the account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Could not sign in.' });
  }
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
