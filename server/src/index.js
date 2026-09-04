require('dotenv').config();

const express = require('express');
const cors = require('cors');

const extractClientRouter = require('./routes/extractClient');
const extractCompanyRouter = require('./routes/extractCompany');
const authRouter = require('./routes/auth');
const invoicesRouter = require('./routes/invoices');
const obligationsRouter = require('./routes/obligations');
const profileRouter = require('./routes/profile');
const billingRouter = require('./routes/billing');
const { handleStripeWebhook } = require('./routes/billing');

const app = express();

app.use(cors({ origin: true }));

// Stripe needs the raw body for signature verification.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'nextinvoice-api',
    website: 'https://mynextinvoice.com',
    health: '/health',
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/obligations', obligationsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/billing', billingRouter);
app.use('/api', extractClientRouter);
app.use('/api', extractCompanyRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[nextinvoice-server] listening on http://0.0.0.0:${PORT}`);
});
