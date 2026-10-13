const express = require('express');
const bcrypt = require('bcryptjs');
const { authRequired, managerRequired } = require('../auth');
const { appUrl } = require('../mail');
const { getProfile, getMailSettings, listTeam, addMember, setMemberRole, removeMember, createInvite, revokeInvite } = require('../store');
const { cleanEmail, countSend, deliver, mailReady, messageHtml, pickSender } = require('../mailer');

// The users of a company: who they are, adding one directly, inviting one by email.
// Everyone in the company may see the list; only the owner and administrators may change it.

const router = express.Router();
router.use(authRequired);

const TEAM_ERRORS = {
  EMAIL_INVALID: [400, 'Enter a valid email address.'],
  PASSWORD_SHORT: [400, 'Password must be at least 8 characters.'],
  EMAIL_TAKEN: [409, 'This email already has an account.'],
  TEAM_FULL: [409, 'The company has reached the maximum number of users.'],
  OWNER_FIXED: [409, 'The owner of the company cannot be changed or removed.'],
  SELF_FIXED: [409, 'You cannot change or remove your own access.'],
};

function fail(code) {
  const err = new Error(code);
  err.teamCode = code;
  return err;
}

function sendTeamError(res, err) {
  const mapped = TEAM_ERRORS[err && (err.teamCode || err.message)];
  if (!mapped) return false;
  res.status(mapped[0]).json({ error: mapped[1], code: err.teamCode || err.message });
  return true;
}

function describe(user) {
  const team = listTeam(user.id);
  return {
    members: team.members.map((item) => ({ ...item, you: item.id === user.accountId })),
    invites: team.invites,
    canManage: user.role === 'owner' || user.role === 'admin',
    mailReady: mailReady(getMailSettings(user.id)),
  };
}

function inviteLink(token) {
  // With the slash: that address is a real page on the site, so the link answers 200.
  return `${appUrl()}/signup/?invite=${encodeURIComponent(token)}`;
}

/** The owner, and the person asking, are never the target of a role change or a removal. */
function assertTarget(user, memberId) {
  if (memberId === user.id) throw fail('OWNER_FIXED');
  if (memberId === user.accountId) throw fail('SELF_FIXED');
}

router.get('/', (req, res) => {
  res.json(describe(req.user));
});

router.post('/members', managerRequired, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body && req.body.email);
    const password = String((req.body && req.body.password) || '');
    if (!email) throw fail('EMAIL_INVALID');
    if (password.length < 8) throw fail('PASSWORD_SHORT');
    await addMember(req.user.id, { email, passwordHash: await bcrypt.hash(password, 12), role: req.body.role, addedBy: req.user.email });
    res.status(201).json(describe(req.user));
  } catch (err) {
    if (!sendTeamError(res, err)) next(err);
  }
});

router.patch('/members/:id', managerRequired, (req, res, next) => {
  try {
    assertTarget(req.user, req.params.id);
    if (!setMemberRole(req.user.id, req.params.id, req.body && req.body.role)) return res.status(404).json({ error: 'User not found.' });
    res.json(describe(req.user));
  } catch (err) {
    if (!sendTeamError(res, err)) next(err);
  }
});

router.delete('/members/:id', managerRequired, (req, res, next) => {
  try {
    assertTarget(req.user, req.params.id);
    if (!removeMember(req.user.id, req.params.id)) return res.status(404).json({ error: 'User not found.' });
    res.json(describe(req.user));
  } catch (err) {
    if (!sendTeamError(res, err)) next(err);
  }
});

/**
 * Creates an invitation and, when the company's mailbox is connected, emails the link from it.
 * The link is returned either way, so it can also be passed on by hand. `message` is the text of
 * the email as the inviter sees it, with {link} where the link belongs.
 */
router.post('/invites', managerRequired, async (req, res, next) => {
  try {
    const email = cleanEmail(req.body && req.body.email);
    if (!email) throw fail('EMAIL_INVALID');
    const { invite, token } = createInvite(req.user.id, { email, role: req.body.role, invitedBy: req.user.email });
    const link = inviteLink(token);
    const result = { ...describe(req.user), invite, link, emailed: false };

    const settings = getMailSettings(req.user.id);
    const subject = String((req.body && req.body.subject) || '').trim();
    const message = String((req.body && req.body.message) || '').trim();
    if (mailReady(settings) && subject && message && message.length <= 4000) {
      try {
        const profile = getProfile(req.user.id);
        const text = message.includes('{link}') ? message.split('{link}').join(link) : `${message}\n\n${link}`;
        countSend(req.user.id);
        await deliver(settings, {
          sender: pickSender(settings, req.user, profile.companyName),
          to: [email],
          subject,
          text,
          html: messageHtml(text, { button: { url: link, label: String((req.body && req.body.button) || '').slice(0, 60) || 'Join' }, accent: profile.accentColor }),
        });
        result.emailed = true;
      } catch (err) {
        // The invitation stands; the inviter is told the email did not go and passes the link on.
        result.emailError = { code: err.mailCode || 'MAIL_FAILED', detail: err.detail || '' };
      }
    }
    res.status(201).json(result);
  } catch (err) {
    if (!sendTeamError(res, err)) next(err);
  }
});

router.delete('/invites/:id', managerRequired, (req, res) => {
  if (!revokeInvite(req.user.id, req.params.id)) return res.status(404).json({ error: 'Invitation not found.' });
  res.json(describe(req.user));
});

module.exports = router;
