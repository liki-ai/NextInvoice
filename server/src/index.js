require('dotenv').config();

const { proxyTarget, startProxy } = require('./proxy');

// On the retired host this process only forwards to the real API and needs nothing else.
if (proxyTarget()) {
  startProxy(proxyTarget(), process.env.PORT || 4000);
  return;
}

const express = require('express');
const cors = require('cors');

const extractClientRouter = require('./routes/extractClient');
const extractCompanyRouter = require('./routes/extractCompany');
const authRouter = require('./routes/auth');
const invoicesRouter = require('./routes/invoices');
const obligationsRouter = require('./routes/obligations');
const clientsRouter = require('./routes/clients');
const itemsRouter = require('./routes/items');
const syncRouter = require('./routes/sync');
const profileRouter = require('./routes/profile');
const billingRouter = require('./routes/billing');
const publicRouter = require('./routes/public');
const mailRouter = require('./routes/mail');
const teamRouter = require('./routes/team');
const financeRouter = require('./routes/finance');
const recurringRouter = require('./routes/recurring');
const { handleStripeWebhook } = require('./routes/billing');
const { initStore, flushStore, storeHealth } = require('./store');
const { billingHealth } = require('./billing/stripe');
const { startFinanceChecks } = require('./finance/service');
const { startAutomation } = require('./automation/service');
const { handleCompanyWebhook } = require('./automation/companyStripe');

const app = express();

app.use(cors({ origin: true }));

// Stripe needs the raw body for signature verification.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
// Each company's own Stripe, for card payments of its invoices; verified with that company's secret.
app.post('/api/public/stripe/:ownerId/webhook', express.raw({ type: 'application/json' }), handleCompanyWebhook);

app.use(express.json({ limit: '20mb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'nextinvoice-api',
    website: 'https://mynextinvoice.com',
    health: '/health',
  });
});

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    ...storeHealth(),
    billing: billingHealth(),
  }),
);

app.use('/api/auth', authRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/obligations', obligationsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/profile', profileRouter);
app.use('/api/billing', billingRouter);
app.use('/api/public', publicRouter);
app.use('/api/mail', mailRouter);
app.use('/api/team', teamRouter);
app.use('/api/finance', financeRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api', extractClientRouter);
app.use('/api', extractCompanyRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 4000;

initStore()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`[nextinvoice-server] listening on http://0.0.0.0:${PORT}`);
    });
    // Documents from the accountant arrive by email; each company's mailbox is checked now and then.
    startFinanceChecks();
    // Recurring invoices are made, scheduled emails go out, payments are announced.
    startAutomation();
    // A deploy stops the old process with SIGTERM. Finish the writes in flight before going.
    let stopping = false;
    const stop = (signal) => {
      if (stopping) return;
      stopping = true;
      console.log(`[nextinvoice-server] ${signal} received, saving and shutting down`);
      server.close();
      const giveUp = setTimeout(() => process.exit(1), 10000);
      flushStore()
        .then((state) => {
          clearTimeout(giveUp);
          process.exit(state.ok ? 0 : 1);
        })
        .catch(() => process.exit(1));
    };
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));
  })
  .catch((err) => {
    console.error('[nextinvoice-server] failed to start', err);
    process.exit(1);
  });
