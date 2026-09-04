const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser,
  findUserByEmail,
  publicUser,
  createPasswordReset,
  resetPasswordWithToken,
} = require('../store');
const { signToken, authRequired } = require('../auth');
const { appUrl, sendPasswordResetEmail } = require('../mail');

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

    const existing = findUserByEmail(email);
    if (existing) {
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (matches) {
        const token = signToken(existing);
        return res.json({ token, user: publicUser(existing) });
      }
      return res.status(409).json({
        error: 'An account with this email already exists. Log in or reset your password.',
        code: 'EMAIL_TAKEN',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, passwordHash, language: req.body?.language });
    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.message === 'EMAIL_TAKEN') {
      return res.status(409).json({
        error: 'An account with this email already exists. Log in or reset your password.',
        code: 'EMAIL_TAKEN',
      });
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
      return res.status(401).json({
        error: 'No account with this email. Create one.',
        code: 'UNKNOWN_EMAIL',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        error: 'Wrong password. You can reset it from the login page.',
        code: 'WRONG_PASSWORD',
      });
    }
    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Could not sign in.' });
  }
});

router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    const { user, token } = await createPasswordReset(email);
    if (!user || !token) {
      return res.json({ ok: true });
    }
    const resetUrl = `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      if (err.message === 'MAIL_NOT_CONFIGURED') {
        const payload = { ok: true };
        if (process.env.MAIL_DEV === '1' || !process.env.RENDER) {
          payload.resetUrl = err.resetUrl;
          payload.dev = true;
        }
        if (process.env.RENDER && process.env.MAIL_DEV !== '1') {
          return res.status(503).json({
            error: 'Password reset email is not configured yet. Try logging in, or set RESEND_API_KEY on the server.',
            code: 'MAIL_NOT_CONFIGURED',
          });
        }
        return res.json(payload);
      }
      throw err;
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[forgot]', err);
    return res.status(500).json({ error: 'Could not start password reset.' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!token) {
      return res.status(400).json({ error: 'Reset token is missing.', code: 'RESET_INVALID' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await resetPasswordWithToken(token, passwordHash);
    if (!user) {
      return res.status(400).json({
        error: 'This reset link is invalid or has expired.',
        code: 'RESET_INVALID',
      });
    }
    const authToken = signToken(user);
    return res.json({ ok: true, token: authToken, user: publicUser(user) });
  } catch (err) {
    console.error('[reset]', err);
    return res.status(500).json({ error: 'Could not reset the password.' });
  }
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
