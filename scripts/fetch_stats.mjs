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
  { id: '6760152476', label: 'NomNom Student' },
];

const PLAY_APPS = [{ packageName: 'com.rudraksh99.ShareAllBooks', label: 'ShareAllBooks' }];

// --- Cloudflare sites to aggregate --------------------------------------
const CF_SITES = [
  { domain: 'rudrakshbhandari.com' },
  { domain: 'nomnom.cc' },
  { domain: 'shareallbooks.com' },
  { domain: 'outfitr.net' },
  { domain: 'nyaaywatch.in' },
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

// --- Cloudflare Zone Analytics -----------------------------------------

function collectCloudflareSites() {
  const sites = [...CF_SITES];
  const extraZones = process.env.CF_EXTRA_ZONES?.trim();
  const legacyExtraSites = process.env.CF_EXTRA_SITE_TAGS?.trim();

  if (extraZones) {
    for (const pair of extraZones.split(',')) {
      const [domain, zoneTag] = pair.split(':').map(s => s?.trim());
      if (domain) sites.push({ domain, zoneTag: zoneTag || null });
    }
  }

  if (legacyExtraSites) {
    for (const pair of legacyExtraSites.split(',')) {
      const [domain] = pair.split(':').map(s => s?.trim());
      if (domain) sites.push({ domain });
    }
  }
  return sites;
}

async function cloudflareRest({ token, path }) {
  const res = await httpsRequest({
    method: 'GET',
    hostname: 'api.cloudflare.com',
    path,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const parsed = JSON.parse(res.body.toString('utf8'));
  return { statusCode: res.statusCode, parsed };
}

async function cloudflareGraphql({ token, query, variables }) {
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
    JSON.stringify({ query, variables })
  );
  const parsed = JSON.parse(res.body.toString('utf8'));
  return { statusCode: res.statusCode, parsed };
}

async function resolveCloudflareZoneTag({ token, site }) {
  if (site.zoneTag) return site.zoneTag;
  const res = await cloudflareRest({
    token,
    path: `/client/v4/zones?name=${encodeURIComponent(site.domain)}&per_page=1`,
  });
  if (!res.parsed.success) {
    throw new Error(`zone lookup failed: ${JSON.stringify(res.parsed.errors || [])}`);
  }
  const zoneTag = res.parsed.result?.[0]?.id;
  if (!zoneTag) throw new Error('zone lookup returned no matching zone');
  return zoneTag;
}

async function fetchCloudflareVisitors() {
  const token = process.env.CF_API_TOKEN?.trim();
  if (!token) {
    console.warn('[cf] CF_API_TOKEN missing — skipping visitors');
    return null;
  }

  const sites = collectCloudflareSites();
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString();
  const endStr = end.toISOString();
  const startDate = startStr.slice(0, 10);
  const endDate = endStr.slice(0, 10);
  const totalsQuery = `
    query ($zoneTag: string, $start: Date, $end: Date) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(limit: 1, filter: { date_geq: $start, date_lt: $end }) {
            sum { requests pageViews }
            uniq { uniques }
          }
        }
      }
    }
  `;
  const results = {};
  let totalVisits = 0;
  let totalPageviews = 0;
  let totalRequests = 0;
  let anySucceeded = false;

  for (const site of sites) {
    try {
      const zoneTag = await resolveCloudflareZoneTag({ token, site });
      const totalsRes = await cloudflareGraphql({
        token,
        query: totalsQuery,
        variables: { zoneTag, start: startDate, end: endDate },
      });
      if (totalsRes.parsed.errors) {
        console.warn(`[cf] ${site.domain}: totals API errors ${JSON.stringify(totalsRes.parsed.errors)}`);
        continue;
      }
      const totals = totalsRes.parsed.data?.viewer?.zones?.[0]?.httpRequests1dGroups?.[0];
      const visits = totals?.uniq?.uniques;
      const pageviews = totals?.sum?.pageViews ?? 0;
      const requests = totals?.sum?.requests ?? 0;

      if (visits == null) {
        console.warn(`[cf] ${site.domain}: no unique visitor value returned`);
        continue;
      }
      results[site.domain] = {
        visits,
        pageviews,
        requests,
      };
      totalVisits += visits;
      totalPageviews += pageviews;
      totalRequests += requests;
      anySucceeded = true;
    } catch (err) {
      console.warn(`[cf] ${site.domain}: ${err.message}`);
    }
  }

  if (!anySucceeded) return null;

  return {
    sourceStatus: 'fresh',
    source: {
      provider: 'cloudflare',
      dataset: 'httpRequests1dGroups',
      metric: 'uniq.uniques (whole window)',
      pageviewMetric: 'sum.pageViews (whole window)',
      requestMetric: 'sum.requests (whole window)',
      siteTagKind: 'cloudflare-zone-id',
      zoneResolution: 'domain lookup via /client/v4/zones',
    },
    windowDays: 30,
    windowStart: startStr,
    windowEnd: endStr,
    totalVisits,
    totalPageviews,
    totalRequests,
    perSite: results,
  };
}

function markStaleWebsiteVisitors(previous, reason) {
  if (!previous?.websiteVisitors) return null;
  return {
    ...previous.websiteVisitors,
    sourceStatus: 'stale',
    staleReason: reason,
    lastRefreshAttemptedAt: new Date().toISOString(),
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

// Exchange a user OAuth2 refresh token for an access token.
// Used when service account ACL propagation is incomplete or unavailable.
async function getUserOAuthAccessToken(oauthJson) {
  const { client_id, client_secret, refresh_token, token_uri } = JSON.parse(oauthJson);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id,
    client_secret,
  }).toString();
  const url = new URL(token_uri || 'https://oauth2.googleapis.com/token');
  const res = await httpsRequest(
    {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );
  const parsed = JSON.parse(res.body.toString('utf8'));
  if (!parsed.access_token) {
    throw new Error(`User OAuth token exchange failed: ${res.statusCode}`);
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
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
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
  // The "Total User Installs" column is deprecated (always 0 in current
  // reports). Lifetime first-time installs = sum of "Daily User Installs"
  // across every row of every monthly overview CSV. This matches the
  // "downloaded + uninstalled = 1" directive: each unique user counts once
  // on first install and is never decremented.
  const prefix = `stats/installs/installs_${packageName}_`;
  const items = await gcsList({ accessToken, bucket: PLAY_GCS_BUCKET, prefix });
  const overviews = items.filter(o => o.name.endsWith('_overview.csv')).sort((a, b) => a.name.localeCompare(b.name));
  if (overviews.length === 0) {
    throw new Error(`no install overview CSVs found with prefix ${prefix}`);
  }

  let total = 0;
  for (const overview of overviews) {
    const buf = await gcsGet({ accessToken, bucket: PLAY_GCS_BUCKET, object: overview.name });

    // Play bulk reports are UTF-16 LE with BOM.
    let text;
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      text = buf.slice(2).toString('utf16le');
    } else {
      text = buf.toString('utf8');
    }

    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) continue;
    const header = parseCsvLine(lines[0]).map(h => h.trim());
    const col = header.indexOf('Daily User Installs');
    if (col === -1) {
      throw new Error(`"Daily User Installs" column missing in ${overview.name}; header: ${header.join('|')}`);
    }
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const v = Number(row[col]);
      if (Number.isFinite(v)) total += v;
    }
  }
  return total;
}

async function fetchPlayDownloads() {
  // Prefer user OAuth (has confirmed ACL access to pubsite bucket).
  // Fall back to service account JWT (may be blocked by ACL propagation delay).
  const userOauthJson = process.env.GOOGLE_GCS_USER_OAUTH_JSON?.trim();
  const sa = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();

  if (!userOauthJson && !sa) {
    console.warn('[play] no GCS credentials configured — skipping Play');
    return null;
  }

  let accessToken;
  if (userOauthJson) {
    try {
      accessToken = await getUserOAuthAccessToken(userOauthJson);
      console.log('[play] using user OAuth token for GCS access');
    } catch (err) {
      console.warn(`[play] user OAuth token exchange failed: ${err.message}`);
    }
  }
  if (!accessToken && sa) {
    try {
      accessToken = await getGoogleAccessToken(sa);
      console.log('[play] using service account token for GCS access');
    } catch (err) {
      console.warn(`[play] SA token exchange failed: ${err.message}`);
    }
  }
  if (!accessToken) {
    console.warn('[play] could not obtain any GCS access token — skipping Play');
    return null;
  }

  const perApp = {};
  let anyOk = false;
  for (const app of PLAY_APPS) {
    try {
      const installs = await fetchPlayInstallsForApp({ accessToken, packageName: app.packageName });
      perApp[app.packageName] = { label: app.label, androidInstalls: installs };
      anyOk = true;
    } catch (err) {
      console.warn(`[play] ${app.packageName}: ${err.message}`);
    }
  }
  // Return null if nothing succeeded so sources.googlePlay reflects reality.
  return anyOk ? perApp : null;
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

// Ratchet: cumulative counts (installs, downloads) can only go up.
// If a fresh value is lower than the stored one, keep the stored one and warn.
// This catches partial-fetch bugs — a real count never decreases because
// uninstalls are not subtracted ("downloaded + uninstalled = 1").
function ratchet(key, freshVal, prevVal) {
  if (freshVal == null) return prevVal ?? null;
  if (prevVal == null) return freshVal;
  if (freshVal < prevVal) {
    console.warn(`[ratchet] ${key}: fresh=${freshVal} < prev=${prevVal} — keeping previous`);
    return prevVal;
  }
  return freshVal;
}

function mergeApps({ previous, apple, play }) {
  const prevSAB = previous?.apps?.shareallbooks;
  const prevNNR = previous?.apps?.nomnomRider;
  const prevNNS = previous?.apps?.nomnomStudent;

  const shareAllBooksApple = ratchet(
    'shareallbooks.iosDownloads',
    apple?.['6457063516']?.iosDownloads ?? null,
    prevSAB?.iosDownloads ?? null
  );
  const shareAllBooksPlay = ratchet(
    'shareallbooks.androidInstalls',
    play?.['com.rudraksh99.ShareAllBooks']?.androidInstalls ?? null,
    prevSAB?.androidInstalls ?? null
  );
  const nomnomRiderApple = ratchet(
    'nomnomRider.iosDownloads',
    apple?.['6760152698']?.iosDownloads ?? null,
    prevNNR?.iosDownloads ?? null
  );
  const nomnomStudentApple = ratchet(
    'nomnomStudent.iosDownloads',
    apple?.['6760152476']?.iosDownloads ?? null,
    prevNNS?.iosDownloads ?? null
  );

  const shareAllBooksTotal =
    shareAllBooksApple != null || shareAllBooksPlay != null
      ? (shareAllBooksApple ?? 0) + (shareAllBooksPlay ?? 0)
      : (prevSAB?.total ?? null);

  const nomnomRiderTotal = nomnomRiderApple != null ? nomnomRiderApple : (prevNNR?.total ?? null);
  const nomnomStudentTotal = nomnomStudentApple != null ? nomnomStudentApple : (prevNNS?.total ?? null);

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
    nomnomStudent: {
      label: 'NomNom Student',
      iosDownloads: nomnomStudentApple,
      androidInstalls: null,
      total: nomnomStudentTotal,
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
  const websiteVisitors = visitors ?? markStaleWebsiteVisitors(previous, 'cloudflare_refresh_unavailable');

  const out = {
    lastUpdated: new Date().toISOString(),
    sources: {
      cloudflare: visitors ? 'ok' : websiteVisitors ? 'stale' : 'skipped',
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
