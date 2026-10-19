// App Store Connect for NextInvoice through the official API (an API key, no Apple ID login).
//   ASC_KEY_PATH=…/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX ASC_ISSUER_ID=… node asc.mjs <command>
// Commands:
//   inspect                 read only: the app, its versions, the newest builds and the listing languages
//   screenshots <version>   replace the iPhone 6.9" and iPad 13" screenshots of that version's primary language
//                           with screenshots/out/iphone-6.9/*.png and screenshots/out/ipad-13/*.png
//   submit <version> <build> <whatsNewFile>
//                           create the version if needed, attach the build, set What's New for every language
//                           of the version, and submit it for review
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const APP_ID = '6792242040';
const here = dirname(fileURLToPath(import.meta.url));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));

// Without settings: the newest AuthKey_*.p8 in Downloads (its id is in the file name) and the team's Issuer ID.
function newestDownloadedKey() {
  const dir = join(homedir(), 'Downloads');
  const keys = readdirSync(dir)
    .filter((f) => /^AuthKey_[A-Z0-9]+\.p8$/.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return keys[0];
}
const ASC_KEY_PATH = process.env.ASC_KEY_PATH || newestDownloadedKey();
const ASC_KEY_ID = process.env.ASC_KEY_ID || /AuthKey_([A-Z0-9]+)\.p8$/.exec(ASC_KEY_PATH || '')?.[1];
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || '7bde9169-d759-4ad7-955b-6dc4ee51f3e8';
if (ASC_KEY_ID) console.log(`Using API key ${ASC_KEY_ID}`);
if (!ASC_KEY_ID || !ASC_ISSUER_ID) {
  console.error('The key id and the Issuer ID are needed.');
  process.exit(1);
}
const key = createPrivateKey(readFileSync(ASC_KEY_PATH));

function token() {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' });
  // An Individual key has no issuer: Apple wants sub "user" instead.
  const body = b64(ASC_ISSUER_ID === 'individual'
    ? { sub: 'user', iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }
    : { iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${signature}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors || []).map((e) => `${e.title}: ${e.detail}`).join('\n') || text;
    throw new Error(`${method} ${path} → ${res.status}\n${detail}`);
  }
  return json;
}

async function versions() {
  const { data } = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`);
  return data;
}

async function findVersion(versionString) {
  return (await versions()).find((v) => v.attributes.versionString === versionString);
}

async function localizations(versionId) {
  return (await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`)).data;
}

async function primaryLocale() {
  return (await api('GET', `/v1/apps/${APP_ID}`)).data.attributes.primaryLocale;
}

async function inspect() {
  const app = (await api('GET', `/v1/apps/${APP_ID}`)).data.attributes;
  console.log(`App: ${app.name} (${app.bundleId}), primary language ${app.primaryLocale}`);
  for (const v of await versions()) {
    console.log(`Version ${v.attributes.versionString}: ${v.attributes.appStoreState}, release ${v.attributes.releaseType}`);
  }
  const builds = await api('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5&include=preReleaseVersion`);
  const pre = Object.fromEntries((builds.included || []).map((i) => [i.id, i.attributes.version]));
  for (const b of builds.data) {
    console.log(`Build ${pre[b.relationships.preReleaseVersion.data?.id] || '?'} (${b.attributes.version}): ${b.attributes.processingState}, uploaded ${b.attributes.uploadedDate}`);
  }
  const live = (await versions()).find((v) => v.attributes.appStoreState === 'READY_FOR_SALE') || (await versions())[0];
  if (live) {
    for (const loc of await localizations(live.id)) {
      const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
      console.log(`Listing ${loc.attributes.locale} (v${live.attributes.versionString}): ${sets.map((s) => s.attributes.screenshotDisplayType).join(', ') || 'no screenshots'}`);
    }
  }
}

// iPhone 6.9" screenshots go in the 6.7" slot, which takes 1320 x 2868; iPad 13" goes in the 12.9" slot.
const SLOTS = [
  ['APP_IPHONE_67', 'iphone-6.9'],
  ['APP_IPAD_PRO_3GEN_129', 'ipad-13'],
];

async function uploadScreenshot(setId, file) {
  const bytes = readFileSync(file);
  const name = file.split(/[\\/]/).pop();
  const reserved = (await api('POST', '/v1/appScreenshots', {
    data: { type: 'appScreenshots', attributes: { fileName: name, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } },
  })).data;
  for (const op of reserved.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`Upload of ${name} failed: ${res.status}`);
  }
  await api('PATCH', `/v1/appScreenshots/${reserved.id}`, {
    data: { type: 'appScreenshots', id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } },
  });
  return reserved.id;
}

async function ensureVersion(versionString) {
  const existing = await findVersion(versionString);
  if (existing) return existing;
  const created = (await api('POST', '/v1/appStoreVersions', {
    data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  })).data;
  console.log(`Created version ${versionString}`);
  return created;
}

async function screenshots(versionString) {
  const version = await ensureVersion(versionString);
  const locale = await primaryLocale();
  const loc = (await localizations(version.id)).find((l) => l.attributes.locale === locale);
  if (!loc) throw new Error(`Version ${versionString} has no ${locale} listing.`);
  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
  // Older sizes copied from the previous version would keep the old screenshots on those devices; without
  // them Apple shows the new 6.9" and 13" ones everywhere.
  for (const set of sets.filter((s) => /^APP_(IPHONE|IPAD)/.test(s.attributes.screenshotDisplayType) && !SLOTS.some(([type]) => type === s.attributes.screenshotDisplayType))) {
    await api('DELETE', `/v1/appScreenshotSets/${set.id}`);
    console.log(`${set.attributes.screenshotDisplayType}: removed the old set`);
  }
  for (const [type, folder] of SLOTS) {
    let set = sets.find((s) => s.attributes.screenshotDisplayType === type);
    if (set) {
      const old = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
      for (const shot of old) await api('DELETE', `/v1/appScreenshots/${shot.id}`);
      if (old.length) console.log(`${type}: removed ${old.length} old screenshots`);
    } else {
      set = (await api('POST', '/v1/appScreenshotSets', {
        data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } },
      })).data;
    }
    const dir = join(here, 'screenshots', 'out', folder);
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    for (const f of files) {
      await uploadScreenshot(set.id, join(dir, f));
      console.log(`${type}: uploaded ${f} (${(statSync(join(dir, f)).size / 1e6).toFixed(2)} MB)`);
    }
  }
  // Apple checks each file after the upload; report what it made of them.
  await new Promise((r) => setTimeout(r, 8000));
  const after = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
  for (const set of after.filter((s) => SLOTS.some(([type]) => type === s.attributes.screenshotDisplayType))) {
    const shots = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    const states = shots.map((s) => s.attributes.assetDeliveryState?.state || '?');
    console.log(`${set.attributes.screenshotDisplayType}: ${shots.length} screenshots, ${[...new Set(states)].join(', ')}`);
  }
}

async function submit(versionString, buildNumber, whatsNewFile) {
  const whatsNew = readFileSync(whatsNewFile, 'utf8').trim();
  const version = await ensureVersion(versionString);
  const builds = (await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&filter[preReleaseVersion.version]=${versionString}&limit=1`)).data;
  const build = builds[0];
  if (!build) throw new Error(`Build ${versionString} (${buildNumber}) is not in App Store Connect yet.`);
  if (build.attributes.processingState !== 'VALID') throw new Error(`Build ${buildNumber} is ${build.attributes.processingState}, not ready yet.`);
  await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
  console.log(`Attached build ${buildNumber} to ${versionString}`);
  for (const loc of await localizations(version.id)) {
    await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { whatsNew } } });
    console.log(`What's New set for ${loc.attributes.locale}`);
  }
  const submission = (await api('POST', '/v1/reviewSubmissions', {
    data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } },
  })).data;
  await api('POST', '/v1/reviewSubmissionItems', {
    data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } },
  });
  const done = (await api('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } })).data;
  console.log(`Submitted ${versionString} (${buildNumber}) for review: ${done.attributes.state}`);
}

let [command, ...args] = process.argv.slice(2);
try {
  if (!command) {
    // Picked from a menu when run without arguments: 1.4.0 with build 49 and its What's New file.
    const VERSION = '1.4.0';
    const BUILD = '49';
    const NOTES = join(here, `whats-new-${VERSION}.txt`);
    await inspect();
    console.log(`\n1) Upload the new screenshots to ${VERSION}\n2) Attach build ${BUILD}, set What's New and submit ${VERSION} for review\n3) Both, screenshots first\n0) Nothing`);
    const pick = await ask('Choose: ');
    if (pick === '1' || pick === '3') await screenshots(VERSION);
    if (pick === '2' || pick === '3') {
      const sure = await ask(`Submit ${VERSION} (${BUILD}) to Apple for review now? Type yes: `);
      if (sure.toLowerCase() === 'yes') await submit(VERSION, BUILD, NOTES);
      else console.log('Not submitted.');
    }
  } else if (command === 'inspect') await inspect();
  else if (command === 'screenshots') await screenshots(args[0]);
  else if (command === 'submit') await submit(args[0], args[1], args[2]);
  else console.error('Commands: inspect | screenshots <version> | submit <version> <build> <whatsNewFile>');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
