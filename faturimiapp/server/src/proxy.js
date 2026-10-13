const http = require('http');
const https = require('https');

// The API runs on our own server now (see deploy/). The old Render address is written into
// app versions already on people's phones and into payment webhooks, so the Render service
// stays up as nothing more than a forwarding address.
const HOME = 'https://api.mynextinvoice.com';

/** Where this process should forward every request, or '' if it is the real API. */
function proxyTarget() {
  const explicit = String(process.env.PROXY_TO || '').trim();
  if (explicit) return explicit.toLowerCase() === 'off' ? '' : explicit.replace(/\/+$/, '');
  return process.env.RENDER && !process.env.DATABASE_URL ? HOME : '';
}

function startProxy(target, port) {
  const base = new URL(target);
  const client = base.protocol === 'https:' ? https : http;
  const server = http.createServer((req, res) => {
    const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    const upstream = client.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || undefined,
        method: req.method,
        path: req.url,
        // Bodies are streamed through untouched: webhook signatures are checked against the exact bytes.
        headers: { ...req.headers, host: base.host, 'x-forwarded-for': forwardedFor, 'x-forwarded-host': req.headers.host || '' },
      },
      (answer) => {
        res.writeHead(answer.statusCode || 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      console.error('[proxy] upstream failed', err.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'The server is temporarily unreachable. Try again in a moment.' }));
    });
    req.pipe(upstream);
  });
  server.listen(port, () => {
    console.log(`[nextinvoice-server] forwarding every request to ${target} (port ${port})`);
  });
  return server;
}

module.exports = { proxyTarget, startProxy };
