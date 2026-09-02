require('dotenv').config();

const express = require('express');
const cors = require('cors');

const extractClientRouter = require('./routes/extractClient');
const extractCompanyRouter = require('./routes/extractCompany');
const authRouter = require('./routes/auth');
const invoicesRouter = require('./routes/invoices');
const profileRouter = require('./routes/profile');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/profile', profileRouter);
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
