const express = require('express');
const { authRequired, managerRequired } = require('../auth');
const { createCompany, findUserById, sessionUser } = require('../store');

// The companies of one account: the main one and those opened from it. The apps say which one they
// work in with the X-Company-Id header on every request; see authRequired.

const router = express.Router();
router.use(authRequired);

const COMPANY_ERRORS = {
  COMPANY_NAME_REQUIRED: [400, 'Enter the company name.'],
  COMPANIES_FULL: [409, 'This account has reached the maximum number of companies.'],
};

router.get('/', (req, res) => {
  res.json({ companies: req.user.companies, current: req.user.id });
});

router.post('/', managerRequired, async (req, res) => {
  try {
    const company = await createCompany(req.user.teamId, {
      companyName: req.body && req.body.companyName,
      currency: req.body && req.body.currency,
      createdBy: req.user.email,
    });
    // The person as they are in the new company, which the app switches to.
    return res.status(201).json({ company, user: sessionUser(findUserById(req.user.accountId), company.id) });
  } catch (err) {
    const mapped = COMPANY_ERRORS[err && (err.teamCode || err.message)];
    if (mapped) return res.status(mapped[0]).json({ error: mapped[1], code: err.teamCode });
    console.error('[companies]', err);
    return res.status(500).json({ error: 'Could not create the company.' });
  }
});

module.exports = router;
