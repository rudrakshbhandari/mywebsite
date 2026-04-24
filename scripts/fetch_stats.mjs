#!/usr/bin/env node
/**
 * Portfolio Stats Fetcher
 *
 * Writes stats_public.json with:
 *   - Monthly website visitors across CF-tracked sites (last 30 days)
 *   - Lifetime App Store downloads for shipped apps (when Apple creds present)
 *   - Lifetime Google Play installs for shipped apps (when Play creds present)
 *
 * The script is intentionally tolerant: if a data source is missing its
 * credentials, that source is skipped and the last known value is preserved
 * from the existing stats_public.json. This lets us roll out credentials one
 * at a time without breaking the dashboard.
 *
 * Zero external deps — uses only Node.js built-ins.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';

const OUTPUT_PATH = resolve(process.cwd(), 'stats_public.json');
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

// --- Apps to track -------------------------------------------------------

const APPLE_APPS = [
  { id: '6457063516', label: 'ShareAllBooks' },
  { id: '6760152698', label: 'NomNom Rider' },
];

const PLAY_APPS = [{ packageName: 'com.rudraksh99.ShareAllBooks', label: 'ShareAllBooks' }];

// --- Cloudflare sites to aggregate --------------------------------------
//
// siteTag here is the CF internal rum_site_id (from the dashboard URL
// /web-analytics/edit/<id>), NOT the data-cf-beacon token.
const CF_SITES = [
  { domain: 'rudrakshbhandari.com', siteTag: 'fd83acce982749c98c424495b1e0625e' },
  { domain: 'nomnom.cc', siteTag: 'a2bb6225092b406e9c9f41535fbccc7e' },
  { domain: 'shareallbooks.com', siteTag: '2b4d2bbf2cec4c84b2e326865428f7cf' },
  { domain: 'outfitr.net', siteTag: '1671c0d8d5c34790ab61905758858b3f' },
  { domain: 'nyaaywatch.in', siteTag: '47d9aae9eb974d33a4ac4a2c7a07644f' },
];

// --- HTTP helper --------------------------------------------------------

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ statusCode: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- Cloudflare Web Analytics ------------------------------------------

function collectCloudflareSites() {
  const sites = [...CF_SITES];
  const extra = process.env.CF_EXTRA_SITE_TAGS?.trim();
  if (extra) {
    for (const pair of extra.split(',')) {
      const [domain, siteTag] = pair.split(':').map(s => s?.trim());
      if (domain && siteTag) sites.push({ domain, siteTag });
    }
  }
  return sites;
}

async function fetchCloudflareVisitors() {
  const token = process.env.CF_API_TOKEN?.trim();
  const accountId = process.env.CF_ACCOUNT_ID?.trim();
  if (!token || !accountId) {
    console.warn('[cf] CF_API_TOKEN or CF_ACCOUNT_ID missing — skipping visitors');
    return null;
  }

  const sites = collectCloudflareSites();
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  const query = `
    query ($accountTag: String!, $siteTag: String!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          rumPageloadEventsAdaptiveGroups(
            limit: 10000
            filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end }
          ) {
            count
            sum { visits }
          }
        }
      }
    }
  `;

  const results = {};
  let totalVisits = 0;
  let totalPageviews = 0;
  let anySucceeded = false;

  for (const site of sites) {
    try {
      const res = await httpsRequest(
        {
          method: 'POST',
          hostname: 'api.cloudflare.com',
          path: '/client/v4/graphql',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
        JSON.stringify({
          query,
          variables: { accountTag: accountId, siteTag: site.siteTag, start: startStr, end: endStr },
        })
      );
      const parsed = JSON.parse(res.body.toString('utf8'));
      if (parsed.errors) {
        console.warn(`[cf] ${site.domain}: API errors ${JSON.stringify(parsed.errors)}`);
        continue;
      }
      const groups = parsed.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
      let visits = 0;
      let pageviews = 0;
      for (const g of groups) {
        visits += g.sum?.visits ?? 0;
        pageviews += g.count ?? 0;
      }
      results[site.domain] = { visits, pageviews };
      totalVisits += visits;
      totalPageviews += pageviews;
      anySucceeded = true;
    } catch (err) {
      console.warn(`[cf] ${site.domain}: ${err.message}`);
    }
  }

  if (!anySucceeded) return null;

  return {
    windowDays: 30,
    windowStart: startStr,
    windowEnd: endStr,
    totalVisits,
    totalPageviews,
    perSite: results,
  };
}

// --- Apple App Store Connect -------------------------------------------

function loadApplePrivateKey() {
  const inline = process.env.APP_STORE_CONNECT_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
  }
  return null;
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signAppStoreJwt({ issuerId, keyId, privateKey }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const derSig = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(derSig)}`;
}

async function fetchAppleSalesReport({ jwt, vendorNumber, reportDate, frequency }) {
  const params = new URLSearchParams({
    'filter[frequency]': frequency,
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': vendorNumber,
    'filter[reportDate]': reportDate,
  });
  const res = await httpsRequest({
    method: 'GET',
    hostname: 'api.appstoreconnect.apple.com',
    path: `/v1/salesReports?${params.toString()}`,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/a-gzip',
    },
  });
  if (res.statusCode === 404) return null;
  if (res.statusCode !== 200) {
    throw new Error(
      `Apple sales report ${reportDate} (${frequency}) returned ${res.statusCode}: ${res.body.toString('utf8').slice(0, 200)}`
    );
  }
  const tsv = (
    await new Promise((resolve, reject) => {
      import('node:zlib').then(({ gunzip }) => {
        gunzip(res.body, (err, out) => (err ? reject(err) : resolve(out)));
      });
    })
  ).toString('utf8');
  return tsv;
}

function parseAppleSalesTsv(tsv, appId, debugLabel) {
  if (!tsv) return 0;
  const lines = tsv.split('\n').filter(Boolean);
  if (lines.length < 2) return 0;
  const header = lines[0].split('\t');
  const idCol = header.indexOf('Apple Identifier');
  const productTypeCol = header.indexOf('Product Type Identifier');
  const unitsCol = header.indexOf('Units');
  if (idCol < 0 || productTypeCol < 0 || unitsCol < 0) return 0;

  const breakdown = {};
  let units = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts[idCol] !== String(appId)) continue;
    const pt = parts[productTypeCol] || '?';
    const u = Number(parts[unitsCol] || 0);
    breakdown[pt] = (breakdown[pt] || 0) + u;
    // Total Downloads = first-time installs (1-series) + redownloads (3-series).
    // Updates (7-series) are excluded.
    if (pt.startsWith('1') || pt.startsWith('3')) {
      units += u;
    }
  }
  if (process.env.DEBUG_APPLE === '1' && Object.keys(breakdown).length > 0) {
    console.log(`[apple debug] ${debugLabel} app=${appId} counted=${units} breakdown=${JSON.stringify(breakdown)}`);
  }
  return units;
}

function loadAppleTeams() {
  // Preferred path: APPLE_TEAMS env var holding a JSON array, one entry per
  // App Store Connect team. Each entry: { issuerId, keyId, vendorNumber,
  // privateKey, appIds: [...] }. privateKey may use literal \n escapes.
  const raw = process.env.APPLE_TEAMS?.trim();
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      return arr.map(t => ({
        ...t,
        privateKey: t.privateKey?.includes('\\n') ? t.privateKey.replace(/\\n/g, '\n') : t.privateKey,
      }));
    } catch (err) {
      console.warn(`[apple] APPLE_TEAMS parse failed: ${err.message}`);
      return [];
    }
  }
  // Back-compat: legacy single-team env vars.
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER?.trim();
  const privateKey = loadApplePrivateKey();
  if (issuerId && keyId && vendorNumber && privateKey) {
    return [{ issuerId, keyId, vendorNumber, privateKey, appIds: APPLE_APPS.map(a => a.id) }];
  }
  return [];
}

async function fetchAppleDownloadsForTeam(team) {
  const { issuerId, keyId, vendorNumber, privateKey, appIds } = team;
  const jwt = signAppStoreJwt({ issuerId, keyId, privateKey });

  const totals = {};
  for (const id of appIds) totals[id] = 0;

  const now = new Date();
  const currentYear = now.getUTCFullYear();

  for (let year = 2023; year < currentYear; year++) {
    try {
      const tsv = await fetchAppleSalesReport({
        jwt,
        vendorNumber,
        reportDate: String(year),
        frequency: 'YEARLY',
      });
      if (!tsv) continue;
      for (const id of appIds) totals[id] += parseAppleSalesTsv(tsv, id, `YEARLY ${year}`);
    } catch (err) {
      console.warn(`[apple ${vendorNumber}] YEARLY ${year}: ${err.message}`);
    }
  }

  for (let month = 1; month <= now.getUTCMonth() + 1; month++) {
    const mm = String(month).padStart(2, '0');
    try {
      const tsv = await fetchAppleSalesReport({
        jwt,
        vendorNumber,
        reportDate: `${currentYear}-${mm}`,
        frequency: 'MONTHLY',
      });
      if (!tsv) continue;
      for (const id of appIds) totals[id] += parseAppleSalesTsv(tsv, id, `MONTHLY ${currentYear}-${mm}`);
    } catch (err) {
      console.warn(`[apple ${vendorNumber}] MONTHLY ${currentYear}-${mm}: ${err.message}`);
    }
  }

  return totals;
}

async function fetchAppleDownloads() {
  const teams = loadAppleTeams();
  if (teams.length === 0) {
    console.warn('[apple] no teams configured — skipping Apple downloads');
    return null;
  }

  const perApp = {};
  let anyOk = false;
  for (const team of teams) {
    try {
      const totals = await fetchAppleDownloadsForTeam(team);
      for (const id of team.appIds) {
        const label = APPLE_APPS.find(a => a.id === id)?.label ?? id;
        perApp[id] = { label, iosDownloads: totals[id] ?? 0 };
      }
      anyOk = true;
    } catch (err) {
      console.warn(`[apple ${team.vendorNumber}] team failed: ${err.message}`);
    }
  }
  return anyOk ? perApp : null;
}

// --- Google Play bulk reports (Cloud Storage) --------------------------
//
// Play Developer Reporting API does not expose install counts. Lifetime
// first-time installs ("Total User Installs") live in Play Console's
// monthly CSV bulk reports at gs://pubsite_prod_<devId>/stats/installs/.
// We read them via the Cloud Storage JSON API.

const PLAY_GCS_BUCKET = 'pubsite_prod_6564941333959231233';

async function getGoogleAccessToken(serviceAccountJson) {
  const { client_email, private_key } = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_only',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(private_key);
  const assertion = `${signingInput}.${base64url(sig)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const res = await httpsRequest(
    {
      method: 'POST',
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );
  const parsed = JSON.parse(res.body.toString('utf8'));
  if (!parsed.access_token) {
    throw new Error(`Google token exchange failed: ${res.body.toString('utf8').slice(0, 200)}`);
  }
  return parsed.access_token;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function gcsList({ accessToken, bucket, prefix }) {
  const items = [];
  let pageToken = '';
  do {
    const qs = new URLSearchParams({ prefix });
    if (pageToken) qs.set('pageToken', pageToken);
    const res = await httpsRequest({
      method: 'GET',
      hostname: 'storage.googleapis.com',
      path: `/storage/v1/b/${encodeURIComponent(bucket)}/o?${qs.toString()}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.statusCode !== 200) {
      throw new Error(`GCS list ${res.statusCode}: ${res.body.toString('utf8').slice(0, 200)}`);
    }
    const parsed = JSON.parse(res.body.toString('utf8'));
    if (parsed.items) items.push(...parsed.items);
    pageToken = parsed.nextPageToken ?? '';
  } while (pageToken);
  return items;
}

async function gcsGet({ accessToken, bucket, object }) {
  const res = await httpsRequest({
    method: 'GET',
    hostname: 'storage.googleapis.com',
    path: `/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.statusCode !== 200) {
    throw new Error(`GCS get ${res.statusCode}: ${res.body.toString('utf8').slice(0, 200)}`);
  }
  return res.body;
}

async function fetchPlayInstallsForApp({ accessToken, packageName }) {
  // Play monthly install CSVs live at
  //   gs://<bucket>/stats/installs/installs_<pkg>_YYYYMM_overview.csv
  // "Total User Installs" in the last row of the latest month is the
  // lifetime count of unique users — it never decrements on uninstall.
  const prefix = `stats/installs/installs_${packageName}_`;
  const items = await gcsList({ accessToken, bucket: PLAY_GCS_BUCKET, prefix });
  const overviews = items
    .filter(o => o.name.endsWith('_overview.csv'))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (overviews.length === 0) {
    throw new Error(`no install overview CSVs found with prefix ${prefix}`);
  }
  const latest = overviews[overviews.length - 1];
  const buf = await gcsGet({ accessToken, bucket: PLAY_GCS_BUCKET, object: latest.name });

  // Play bulk reports are UTF-16 LE with BOM.
  let text;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.slice(2).toString('utf16le');
  } else {
    text = buf.toString('utf8');
  }

  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return 0;
  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const col = header.indexOf('Total User Installs');
  if (col === -1) {
    throw new Error(`"Total User Installs" column missing in ${latest.name}; header: ${header.join('|')}`);
  }
  const lastRow = parseCsvLine(lines[lines.length - 1]);
  const value = Number(lastRow[col]);
  return Number.isFinite(value) ? value : 0;
}

async function fetchPlayDownloads() {
  const sa = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!sa) {
    console.warn('[play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing — skipping Play');
    return null;
  }
  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(sa);
  } catch (err) {
    console.warn(`[play] token exchange failed: ${err.message}`);
    return null;
  }

  const perApp = {};
  for (const app of PLAY_APPS) {
    try {
      const installs = await fetchPlayInstallsForApp({ accessToken, packageName: app.packageName });
      perApp[app.packageName] = { label: app.label, androidInstalls: installs };
    } catch (err) {
      console.warn(`[play] ${app.packageName}: ${err.message}`);
    }
  }
  return perApp;
}

// --- Main --------------------------------------------------------------

function loadPrevious() {
  if (!existsSync(OUTPUT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function mergeApps({ previous, apple, play }) {
  const shareAllBooksApple = apple?.['6457063516']?.iosDownloads ?? previous?.apps?.shareallbooks?.iosDownloads ?? null;
  const shareAllBooksPlay =
    play?.['com.rudraksh99.ShareAllBooks']?.androidInstalls ?? previous?.apps?.shareallbooks?.androidInstalls ?? null;
  const nomnomRiderApple = apple?.['6760152698']?.iosDownloads ?? previous?.apps?.nomnomRider?.iosDownloads ?? null;

  const shareAllBooksTotal =
    shareAllBooksApple != null || shareAllBooksPlay != null
      ? (shareAllBooksApple ?? 0) + (shareAllBooksPlay ?? 0)
      : (previous?.apps?.shareallbooks?.total ?? null);

  const nomnomRiderTotal = nomnomRiderApple != null ? nomnomRiderApple : (previous?.apps?.nomnomRider?.total ?? null);

  return {
    shareallbooks: {
      label: 'ShareAllBooks',
      iosDownloads: shareAllBooksApple,
      androidInstalls: shareAllBooksPlay,
      total: shareAllBooksTotal,
    },
    nomnomRider: {
      label: 'NomNom Rider',
      iosDownloads: nomnomRiderApple,
      androidInstalls: null,
      total: nomnomRiderTotal,
    },
  };
}

async function main() {
  const previous = loadPrevious();

  const [visitors, apple, play] = await Promise.all([
    fetchCloudflareVisitors().catch(err => {
      console.warn(`[cf] failed: ${err.message}`);
      return null;
    }),
    fetchAppleDownloads().catch(err => {
      console.warn(`[apple] failed: ${err.message}`);
      return null;
    }),
    fetchPlayDownloads().catch(err => {
      console.warn(`[play] failed: ${err.message}`);
      return null;
    }),
  ]);

  const apps = mergeApps({ previous, apple, play });
  const websiteVisitors = visitors ?? previous.websiteVisitors ?? null;

  const out = {
    lastUpdated: new Date().toISOString(),
    sources: {
      cloudflare: visitors ? 'ok' : 'skipped',
      appStore: apple ? 'ok' : 'skipped',
      googlePlay: play ? 'ok' : 'skipped',
    },
    apps,
    websiteVisitors,
  };

  const nextJson = JSON.stringify(out, null, 2) + '\n';
  const prevJson = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : '';
  const stripTimestamps = s => s.replace(/"lastUpdated":\s*"[^"]+",?\s*/g, '');
  if (stripTimestamps(nextJson) === stripTimestamps(prevJson)) {
    console.log('No material changes to stats_public.json; skipping write.');
    writeFileSync(resolve(process.cwd(), '.stats_no_change'), '');
    if (IS_GITHUB_ACTIONS) return;
  }

  writeFileSync(OUTPUT_PATH, nextJson);
  console.log('Wrote', OUTPUT_PATH);
}

main().catch(err => {
  console.error('fetch_stats failed:', err);
  process.exitCode = 1;
});
