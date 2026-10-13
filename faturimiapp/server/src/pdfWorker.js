// Runs as its own process (see pdf.js): opens a headless browser, prints one HTML page to PDF,
// hands the bytes back and exits.

const puppeteer = require('puppeteer-core');

async function print(html) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PDF_BROWSER,
    headless: true,
    // The container already confines the browser, and it only ever opens pages built by the server.
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    // The page is a finished document: no scripts run, and nothing is fetched from anywhere.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') request.continue().catch(() => {});
      else request.abort().catch(() => {});
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 20000 });
  } finally {
    await browser.close().catch(() => {});
  }
}

function reply(message) {
  if (process.send) process.send(message, () => process.exit(message.pdf ? 0 : 1));
}

process.on('unhandledRejection', (err) => console.error(err));
process.on('uncaughtException', (err) => reply({ error: String((err && err.message) || err) }));

process.once('message', (message) => {
  print(String(message.html))
    .then((pdf) => reply({ pdf: Buffer.from(pdf).toString('base64') }))
    .catch((err) => reply({ error: String((err && err.message) || err).split('\n')[0] }));
});
