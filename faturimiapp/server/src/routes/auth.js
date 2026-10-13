const express = require('express');
const bcrypt = require('bcryptjs');
const {
  createUser,
  findUserByEmail,
  sessionUser,
  findInvite,
  acceptInvite,
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

    // Joining a company from an invitation: the address is the invited one, whatever was typed.
    const inviteToken = String(req.body?.invite || '');
    if (inviteToken) {
      if (!findInvite(inviteToken)) {
        return res.status(400).json({ error: 'This invitation is no longer valid. Ask for a new one.', code: 'INVITE_INVALID' });
      }
      const member = await acceptInvite(inviteToken, await bcrypt.hash(password, 12));
      return res.status(201).json({ token: signToken(member), user: sessionUser(member) });
    }

    const existing = findUserByEmail(email);
    if (existing) {
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (matches) {
        const token = signToken(existing);
        return res.json({ token, user: sessionUser(existing) });
      }
      return res.status(409).json({
        error: 'An account with this email already exists. Log in or reset your password.',
        code: 'EMAIL_TAKEN',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, passwordHash, language: req.body?.language, industry: req.body?.industry });
    const token = signToken(user);
    return res.status(201).json({ token, user: sessionUser(user) });
  } catch (err) {
    if (err.message === 'INVITE_INVALID') {
      return res.status(400).json({ error: 'This invitation is no longer valid. Ask for a new one.', code: 'INVITE_INVALID' });
    }
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
    return res.json({ token, user: sessionUser(user) });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Could not sign in.' });
  }
});

// A few reset emails per address per hour at most, so the form cannot be used to flood a mailbox.
const RESET_WINDOW_MS = 60 * 60 * 1000;
const RESET_MAX = 3;
const recentResets = new Map();

function resetAllowed(email) {
  const key = String(email).toLowerCase();
  const now = Date.now();
  const times = (recentResets.get(key) || []).filter((at) => now - at < RESET_WINDOW_MS);
  const allowed = times.length < RESET_MAX;
  if (allowed) times.push(now);
  recentResets.set(key, times);
  return allowed;
}

router.post('/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    // The same answer whether or not the address has an account, and when it has asked too often.
    if (!resetAllowed(email)) {
      return res.json({ ok: true });
    }
    const { user, token } = await createPasswordReset(email);
    if (!user || !token) {
      return res.json({ ok: true });
    }
    // With the slash: that address is a real page on the site, so the link answers 200.
    const resetUrl = `${appUrl()}/reset/?token=${encodeURIComponent(token)}`;
    try {
      await sendPasswordResetEmail(user, resetUrl);
    } catch (err) {
      if (err.message === 'MAIL_NOT_CONFIGURED') {
        const payload = { ok: true };
        // The link is the key to the account: it is handed back in the answer only on a developer's
        // machine that asked for it, never by a production server.
        const developerMachine = process.env.MAIL_DEV === '1' && process.env.NODE_ENV !== 'production' && !process.env.RENDER;
        if (developerMachine) {
          payload.resetUrl = err.resetUrl;
          payload.dev = true;
        }
        if (!developerMachine) {
          return res.status(503).json({
            error: 'A reset email cannot be sent for this account yet: its company has not connected a mailbox.',
            code: 'MAIL_NOT_CONFIGURED',
          });
        }
        return res.json(payload);
      }
      // The mail server refused or could not be reached; say so rather than promise an email.
      console.error('[forgot] reset email failed', err.mailCode || err.message, err.detail || '');
      return res.status(503).json({ error: 'The reset email could not be sent. Try again in a little while.', code: 'RESET_MAIL_FAILED' });
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
    return res.json({ ok: true, token: authToken, user: sessionUser(user) });
  } catch (err) {
    console.error('[reset]', err);
    return res.status(500).json({ error: 'Could not reset the password.' });
  }
});

/** What the sign-up page shows someone who opened an invitation link. */
router.get('/invite/:token', (req, res) => {
  const found = findInvite(req.params.token);
  if (!found) return res.status(404).json({ error: 'This invitation is no longer valid. Ask for a new one.', code: 'INVITE_INVALID' });
  res.set('Cache-Control', 'private, no-store');
  return res.json({ email: found.invite.email, role: found.invite.role, companyName: found.companyName });
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
