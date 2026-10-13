const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

// Invoices are laid out as HTML; a headless browser on the server prints that page to a real PDF,
// the same way "Save as PDF" does in the user's own browser. The browser is driven from a separate
// short-lived process (pdfWorker.js), so whatever goes wrong with it cannot take the API down.

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const TIMEOUT_MS = 45000;

let executable;
let queue = Promise.resolve();

function browserPath() {
  if (executable === undefined) executable = CANDIDATES.find((item) => item && fs.existsSync(item)) || null;
  return executable;
}

function pdfAvailable() {
  return Boolean(browserPath());
}

function render(html) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'pdfWorker.js'), [], {
      // The worker gets the browser's location and nothing else: none of the server's secrets.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, PDF_BROWSER: browserPath() },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let settled = false;
    let stderr = '';
    const finish = (err, pdf) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Give the worker a moment to close its browser, then make sure it is gone.
      const reap = setTimeout(() => worker.kill('SIGKILL'), err ? 0 : 5000);
      if (reap.unref) reap.unref();
      worker.once('exit', () => clearTimeout(reap));
      if (err) reject(err);
      else resolve(pdf);
    };
    const timer = setTimeout(() => finish(new Error('PDF_TIMEOUT')), TIMEOUT_MS);
    worker.stderr.on('data', (chunk) => {
      if (stderr.length < 2000) stderr += chunk;
    });
    worker.on('message', (message) => {
      if (message && message.pdf) finish(null, Buffer.from(message.pdf, 'base64'));
      else finish(new Error((message && message.error) || 'PDF_FAILED'));
    });
    worker.on('error', (err) => finish(err));
    worker.on('exit', (code) => finish(new Error(`PDF worker stopped (${code}) ${stderr.trim()}`)));
    worker.send({ html }, (err) => {
      if (err) finish(err);
    });
  });
}

/** One invoice page as PDF bytes. Pages are printed one at a time. */
function htmlToPdf(html) {
  if (!pdfAvailable()) return Promise.reject(new Error('PDF_UNAVAILABLE'));
  const job = queue.then(() => render(html));
  queue = job.catch(() => {});
  return job;
}

module.exports = { pdfAvailable, htmlToPdf };
