#!/usr/bin/env node
/**
 * Oura Ring Data Fetcher
 * Fetches daily health metrics from Oura API and writes to public JSON.
 * Zero external dependencies - uses only Node.js built-in modules.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import { resolve } from 'path';
import https from 'https';

// Configuration
const OUTPUT_PATH = resolve(process.cwd(), 'oura_public.json');
const TOKEN_PATH = resolve(process.cwd(), '.oura_token');
const ROTATED_TOKEN_PATH = resolve(process.cwd(), '.oura_rotated_token');
const OAUTH_ENDPOINT = 'https://api.ouraring.com/oauth/token';
const OAUTH_AUTHORIZE_ENDPOINT = 'https://cloud.ouraring.com/oauth/authorize';
const API_BASE = 'api.ouraring.com';
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const SHOULD_FAIL_ON_API_ERROR = IS_GITHUB_ACTIONS || process.env.OURA_FAIL_ON_API_ERROR === 'true';
const PT_TIME_ZONE = 'America/Los_Angeles';
const OAUTH_SCOPES = ['daily', 'heartrate', 'spo2Daily', 'workout'];
/** Max HR samples in public JSON (~minute-level over 24h; keeps payload small vs full Oura stream). */
const HR_TIMELINE_MAX_POINTS = 1440;

/**
 * Load refresh token from file or env
 * @returns {string|null}
 */
function loadRefreshToken() {
  // Priority: 1. Env var, 2. File
  const envToken = process.env.OURA_REFRESH_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  if (existsSync(TOKEN_PATH)) {
    try {
      const token = readFileSync(TOKEN_PATH, 'utf-8').trim();
      if (token) return token;
    } catch (e) {
      console.warn('Could not read token file:', e.message);
    }
  }
  return null;
}

/**
 * Load direct access token from env if provided
 * @returns {string|null}
 */
function loadDirectAccessToken() {
  const accessToken = process.env.OURA_ACCESS_TOKEN?.trim();
  return accessToken || null;
}

/**
 * Save refresh token to file
 * @param {string} token
 */
function saveRefreshToken(token) {
  try {
    writeFileSync(TOKEN_PATH, token);
    console.log('Refresh token saved to file');
  } catch (e) {
    console.warn('Could not save token file:', e.message);
  }
}

/**
 * Save rotated refresh token for workflow secret update step in CI
 * @param {string} token
 */
function saveRotatedTokenForWorkflow(token) {
  try {
    writeFileSync(ROTATED_TOKEN_PATH, token);
    console.log('Refresh token rotation recorded for workflow secret update');
  } catch (e) {
    console.warn('Could not save rotated token file:', e.message);
  }
}

/**
 * Make an HTTPS request and return parsed JSON response
 * @param {string} url - Full URL
 * @param {Object} options - Request options
 * @param {Object|null} body - Request body for POST
 * @returns {Promise<Object>}
 */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const contentType = options.headers?.['Content-Type'] || 'application/json';
    const isFormUrlEncoded = contentType === 'application/x-www-form-urlencoded';

    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': contentType,
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const apiMessage =
              parsed.error_description || parsed.detail || parsed.title || parsed.error || parsed.message || data;
            reject(new Error(`HTTP ${res.statusCode}: ${apiMessage}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      // Send as-is if form-urlencoded string, otherwise JSON stringify
      req.write(isFormUrlEncoded ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Refresh Oura OAuth access token using refresh token
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} refreshToken
 * @returns {Promise<{accessToken: string, newRefreshToken: string}>} - New tokens
 */
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  // Oura OAuth requires form-urlencoded, not JSON
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await httpsRequest(
    OAUTH_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    params.toString()
  );

  if (!response.access_token) {
    throw new Error('No access_token in OAuth response');
  }

  return {
    accessToken: response.access_token,
    newRefreshToken: response.refresh_token, // Oura may rotate refresh tokens
  };
}

/**
 * Whether this run can recover by launching local OAuth in a browser
 * @returns {boolean}
 */
function canRunInteractiveReauth() {
  return !IS_GITHUB_ACTIONS && process.env.OURA_DISABLE_AUTO_REAUTH !== 'true';
}

/**
 * Decide whether a refresh failure likely means the local refresh token is stale
 * @param {Error} error
 * @returns {boolean}
 */
function isRecoverableRefreshError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('invalid request') ||
    message.includes('invalid_grant') ||
    message.includes('refresh token') ||
    message.includes('token endpoint')
  );
}

/**
 * Create an OAuth state token for callback validation
 * @returns {string}
 */
function createOauthState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Reserve a free loopback port for the OAuth callback server
 * @returns {Promise<number>}
 */
function allocateCallbackPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(closeError => {
        if (closeError) {
          reject(closeError);
          return;
        }
        if (!port) {
          reject(new Error('Could not allocate OAuth callback port'));
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

/**
 * Build a loopback redirect URI from a callback port
 * @param {number} callbackPort
 * @returns {string}
 */
function buildRedirectUri(callbackPort) {
  return `http://localhost:${callbackPort}/callback`;
}

/**
 * Build the Oura authorization URL for local recovery
 * @param {string} clientId
 * @param {string} state
 * @param {string} redirectUri
 * @returns {string}
 */
function buildAuthorizationUrl(clientId, state, redirectUri) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES.join(' '),
    state,
  });
  return `${OAUTH_AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/**
 * Open a URL in the user's default browser
 * @param {string} url
 * @returns {Promise<void>}
 */
function openBrowser(url) {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  return new Promise(resolve => {
    exec(command, error => {
      if (error) {
        console.log('Open this URL manually to re-authorize Oura:');
        console.log(url);
      }
      resolve();
    });
  });
}

/**
 * Wait for the local OAuth callback and return the authorization code
 * @param {string} expectedState
 * @param {string} redirectUri
 * @param {number} callbackPort
 * @returns {Promise<string>}
 */
function waitForAuthorizationCode(expectedState, redirectUri, callbackPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const receivedState = url.searchParams.get('state');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(`OAuth authorize error: ${error}`));
        return;
      }

      if (!receivedState || receivedState !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid state parameter');
        server.close();
        reject(new Error('OAuth callback state mismatch.'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Authorization successful. You can close this tab.');
      server.close();
      resolve(code);
    });

    server.listen(callbackPort, '127.0.0.1', () => {
      console.log(`Waiting for Oura OAuth callback on ${redirectUri}`);
    });

    server.on('error', reject);
  });
}

/**
 * Exchange an authorization code for fresh OAuth tokens
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} code
 * @param {string} redirectUri
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function exchangeAuthorizationCode(clientId, clientSecret, code, redirectUri) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await httpsRequest(
    OAUTH_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    params.toString()
  );

  if (!response.access_token || !response.refresh_token) {
    throw new Error('OAuth code exchange did not return both access and refresh tokens');
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
  };
}

/**
 * Recover local OAuth credentials when the saved refresh token is stale
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function recoverCredentialsInteractively(clientId, clientSecret) {
  console.warn('Refresh token rejected. Starting one-time browser reauthorization to recover local access...');
  const state = createOauthState();
  const callbackPort = await allocateCallbackPort();
  const redirectUri = buildRedirectUri(callbackPort);
  const authUrl = buildAuthorizationUrl(clientId, state, redirectUri);
  console.log('Approve access in your browser if prompted:');
  console.log(authUrl);
  await openBrowser(authUrl);
  const code = await waitForAuthorizationCode(state, redirectUri, callbackPort);
  return exchangeAuthorizationCode(clientId, clientSecret, code, redirectUri);
}

/**
 * Format date parts to YYYY-MM-DD
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function formatYmd(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Get PT calendar date parts for a given instant
 * @param {Date} date
 * @returns {{year: number, month: number, day: number}}
 */
function getPtDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const getPart = type => Number(parts.find(part => part.type === type)?.value);
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
  };
}

/**
 * PT calendar date (YYYY-MM-DD) for an ISO timestamp
 * @param {string} isoTimestamp
 * @returns {string}
 */
function getPtYmdFromTimestamp(isoTimestamp) {
  const { year, month, day } = getPtDateParts(new Date(isoTimestamp));
  return formatYmd(year, month, day);
}

/**
 * Get today's date in YYYY-MM-DD format in PT timezone
 * @returns {string}
 */
function getTodayPT() {
  const { year, month, day } = getPtDateParts(new Date());
  return formatYmd(year, month, day);
}

/**
 * Get date N days ago in YYYY-MM-DD format in PT timezone
 * @param {number} daysAgo
 * @returns {string}
 */
function getDateDaysAgoPT(daysAgo) {
  const { year, month, day } = getPtDateParts(new Date());
  const utcPtDate = new Date(Date.UTC(year, month - 1, day));
  utcPtDate.setUTCDate(utcPtDate.getUTCDate() - daysAgo);
  return formatYmd(utcPtDate.getUTCFullYear(), utcPtDate.getUTCMonth() + 1, utcPtDate.getUTCDate());
}

/**
 * Get date range for last 7 days (inclusive of today)
 * @returns {{ startDate: string, endDate: string }}
 */
function getLast7DaysRange() {
  const endDate = getTodayPT();
  const startDate = getDateDaysAgoPT(6);
  return { startDate, endDate };
}

/**
 * Fetch daily sleep data from Oura API (date range returns array)
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchSleepDataRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/daily_sleep?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch daily readiness data from Oura API (date range returns array)
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchReadinessDataRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch daily activity data from Oura API (date range returns array)
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchActivityDataRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/daily_activity?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch heart rate time-series data from Oura API
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchHeartRateSeries(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/heartrate?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch SpO2 data from Oura API (date range returns array of daily records)
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchSpo2DataRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/spo2?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch period-level sleep data (durations, bedtime, stages) from Oura API
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchSleepPeriodsRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Fetch workout data from Oura API
 * @param {string} token - Access token
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchWorkoutsRange(token, startDate, endDate) {
  const url = `https://${API_BASE}/v2/usercollection/workout?start_date=${startDate}&end_date=${endDate}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/**
 * Load existing public data if available
 * @returns {Object|null}
 */
function loadExistingData() {
  if (!existsSync(OUTPUT_PATH)) {
    return null;
  }
  try {
    const content = readFileSync(OUTPUT_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.warn('Failed to parse existing oura_public.json:', e.message);
    return null;
  }
}

/**
 * Round number to integer, or return null if undefined/null
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
function roundOrNull(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round(Number(value));
}

/**
 * Return first non-null / non-undefined value
 * @param  {...any} values
 * @returns {any}
 */
function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

/**
 * Get date string from an Oura API record (handles various field names)
 * @param {Object} record
 * @returns {string|null}
 */
function getDateFromRecord(record) {
  return firstDefined(record.day, record.date, record.summary_date, record.bedtime_start?.toString().split('T')[0]);
}

/**
 * Get date for sleep period - use wake date (bedtime_end) so it aligns with
 * daily_sleep summary_date. Sleep from Tue night→Wed morning belongs to Wed.
 * @param {Object} period - Sleep period from Oura usercollection/sleep
 * @returns {string|null}
 */
function getDateFromSleepPeriod(period) {
  return firstDefined(
    period.day,
    period.date,
    period.summary_date,
    period.bedtime_end?.toString().split('T')[0],
    period.bedtime_start?.toString().split('T')[0]
  );
}

/**
 * Normalize heart rate record from Oura endpoint (handles various response shapes)
 * Oura v2 may return: {bpm, timestamp}, {heart_rate, datetime}, {hr, ts}, etc.
 * @param {Object} item
 * @returns {{timestamp: string, bpm: number}|null}
 */
function normalizeHeartRatePoint(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const bpmRaw = firstDefined(item.bpm, item.beats_per_minute, item.heart_rate, item.hr, item.value, item.average_hr);
  const timestamp = firstDefined(item.timestamp, item.datetime, item.time, item.ts, item.recorded_at);
  const bpm = Number(bpmRaw);
  if (!timestamp || !Number.isFinite(bpm) || bpm <= 0 || bpm > 250) {
    return null;
  }
  return { timestamp: String(timestamp), bpm: Math.round(bpm) };
}

/**
 * Extract SpO2 percentage from Oura record (handles various field names)
 * @param {Object} record
 * @returns {number|null}
 */
function extractSpo2Percent(record) {
  if (!record || typeof record !== 'object') return null;
  const val = firstDefined(
    record.average,
    record.spo2_percentage,
    record.percentage,
    record.average_spo2,
    record.SpO2Percentage,
    record.spo2Percentage
  );
  const num = Number(val);
  return Number.isFinite(num) && num >= 85 && num <= 100 ? Math.round(num) : null;
}

/**
 * Convert activity time to minutes (Oura may return seconds)
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
function toActivityMinutes(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // If > 300, likely seconds (e.g. 3600 = 1 hour)
  const minutes = n > 300 ? Math.round(n / 60) : Math.round(n);
  return minutes;
}

/**
 * Downsample points to max count while keeping shape
 * @param {Array<{timestamp: string, bpm: number}>} points
 * @param {number} maxPoints
 * @returns {Array<{timestamp: string, bpm: number}>}
 */
function downsampleSeries(points, maxPoints = HR_TIMELINE_MAX_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points;
  }
  const step = Math.ceil(points.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

/**
 * Main execution
 */
async function main() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const directAccessToken = loadDirectAccessToken();
  let refreshToken = loadRefreshToken();

  // Validate environment variables
  if (!directAccessToken && (!clientId || !clientSecret || !refreshToken)) {
    console.error('Error: Missing required credentials');
    console.error('Either set OURA_ACCESS_TOKEN directly, OR provide:');
    console.error('- OURA_CLIENT_ID');
    console.error('- OURA_CLIENT_SECRET');
    console.error('- OURA_REFRESH_TOKEN (or local .oura_token file)');
    process.exit(1);
  }

  console.log('Fetching Oura Ring data...');

  // Load existing data for fallback
  const existingData = loadExistingData();

  try {
    // Step 1: Resolve access token
    let accessToken;
    if (directAccessToken) {
      accessToken = directAccessToken;
      console.log('Using direct OURA_ACCESS_TOKEN from environment');
    } else {
      console.log('Refreshing OAuth token...');
      try {
        const { accessToken: refreshedAccessToken, newRefreshToken } = await refreshAccessToken(
          clientId,
          clientSecret,
          refreshToken
        );
        accessToken = refreshedAccessToken;
        console.log('Token refreshed successfully');

        // Save new refresh token locally when it rotates; never write secrets in CI.
        if (newRefreshToken && newRefreshToken !== refreshToken) {
          refreshToken = newRefreshToken;
          if (IS_GITHUB_ACTIONS) {
            saveRotatedTokenForWorkflow(newRefreshToken);
          } else {
            saveRefreshToken(newRefreshToken);
          }
        }
      } catch (refreshError) {
        if (!canRunInteractiveReauth() || !isRecoverableRefreshError(refreshError)) {
          throw refreshError;
        }

        const recoveredTokens = await recoverCredentialsInteractively(clientId, clientSecret);
        accessToken = recoveredTokens.accessToken;
        refreshToken = recoveredTokens.refreshToken;
        saveRefreshToken(recoveredTokens.refreshToken);
        console.log('Local OAuth credentials recovered successfully');
      }
    }

    // Step 2: Fetch last 7 days of data
    const { startDate, endDate } = getLast7DaysRange();
    console.log(`Fetching last 7 days (${startDate} → ${endDate})...`);

    const [sleepList, readinessList, activityList, heartRateRaw, spo2List, workoutList, sleepPeriodList] =
      await Promise.all([
        fetchSleepDataRange(accessToken, startDate, endDate).catch(e => {
          console.warn('Sleep fetch failed:', e.message);
          return [];
        }),
        fetchReadinessDataRange(accessToken, startDate, endDate).catch(e => {
          console.warn('Readiness fetch failed:', e.message);
          return [];
        }),
        fetchActivityDataRange(accessToken, startDate, endDate).catch(e => {
          console.warn('Activity fetch failed:', e.message);
          return [];
        }),
        fetchHeartRateSeries(accessToken, startDate, endDate).catch(() => []),
        fetchSpo2DataRange(accessToken, startDate, endDate).catch(() => []),
        fetchWorkoutsRange(accessToken, startDate, endDate).catch(() => []),
        fetchSleepPeriodsRange(accessToken, startDate, endDate).catch(e => {
          console.warn('Sleep periods fetch failed:', e.message);
          return [];
        }),
      ]);

    // Build lookup maps by date
    const sleepByDate = new Map();
    for (const r of sleepList) {
      const d = getDateFromRecord(r);
      if (d) sleepByDate.set(d, r);
    }
    const readinessByDate = new Map();
    for (const r of readinessList) {
      const d = getDateFromRecord(r);
      if (d) readinessByDate.set(d, r);
    }
    const activityByDate = new Map();
    for (const r of activityList) {
      const d = getDateFromRecord(r);
      if (d) activityByDate.set(d, r);
    }
    const spo2ByDate = new Map();
    for (const r of spo2List) {
      const d = getDateFromRecord(r);
      if (d) spo2ByDate.set(d, r);
    }
    const workoutsByDate = new Map();
    for (const w of workoutList) {
      const d =
        getDateFromRecord(w) ||
        (w.start ? String(w.start).split('T')[0] : null) ||
        (w.start_datetime ? String(w.start_datetime).split('T')[0] : null);
      if (d) {
        if (!workoutsByDate.has(d)) workoutsByDate.set(d, []);
        workoutsByDate.get(d).push(w);
      }
    }
    // Sleep periods: pick the "long_sleep" type per day (primary sleep session).
    // Use wake date (bedtime_end) so "last night's sleep" appears under today's column.
    const sleepPeriodByDate = new Map();
    for (const sp of sleepPeriodList) {
      const d = getDateFromSleepPeriod(sp);
      if (!d) continue;
      const existing = sleepPeriodByDate.get(d);
      const isLong = sp.type === 'long_sleep';
      const existingIsLong = existing?.type === 'long_sleep';
      if (
        !existing ||
        (isLong && !existingIsLong) ||
        (isLong === existingIsLong && (sp.total_sleep_duration || 0) > (existing.total_sleep_duration || 0))
      ) {
        sleepPeriodByDate.set(d, sp);
      }
    }

    // Generate ordered list of dates (oldest → newest)
    const allDates = [];
    for (let i = 6; i >= 0; i--) {
      allDates.push(getDateDaysAgoPT(i));
    }

    // Build byDay array for 7-day display
    const byDay = [];
    for (const day of allDates) {
      const sleepData = sleepByDate.get(day);
      const readinessData = readinessByDate.get(day);
      const activityData = activityByDate.get(day);
      const spo2Rec = spo2ByDate.get(day);
      const dayWorkouts = workoutsByDate.get(day) || [];
      const sleepPeriod = sleepPeriodByDate.get(day);

      const sleepContributors = sleepData?.contributors || {};
      const readinessContributors = readinessData?.contributors || {};
      const activityContributors = activityData?.contributors || {};

      byDay.push({
        day,
        sleepScore: roundOrNull(sleepData?.score),
        readinessScore: roundOrNull(readinessData?.score),
        activityScore: roundOrNull(activityData?.score),
        restingHrBpm: roundOrNull(
          firstDefined(
            readinessData?.resting_heart_rate,
            sleepData?.heart_rate?.resting,
            sleepData?.heart_rate?.resting_heart_rate
          )
        ),
        hrvMs: roundOrNull(
          firstDefined(readinessData?.hrv_average_milli, readinessData?.hrv_average, sleepData?.average_hrv)
        ),
        steps: roundOrNull(activityData?.steps),
        activeCalories: roundOrNull(activityData?.active_calories),
        spo2Average: roundOrNull(extractSpo2Percent(spo2Rec)),
        workoutCount: dayWorkouts.length,
        // Sleep duration fields (in seconds from Oura API)
        totalSleepDuration: roundOrNull(sleepPeriod?.total_sleep_duration),
        deepSleepDuration: roundOrNull(sleepPeriod?.deep_sleep_duration),
        remSleepDuration: roundOrNull(sleepPeriod?.rem_sleep_duration),
        lightSleepDuration: roundOrNull(sleepPeriod?.light_sleep_duration),
        sleepEfficiency: roundOrNull(sleepPeriod?.efficiency),
      });
    }

    // Pick primary day: most recent with sleep or readiness
    let dataDay = endDate;
    for (let i = allDates.length - 1; i >= 0; i--) {
      if (sleepByDate.has(allDates[i]) || readinessByDate.has(allDates[i])) {
        dataDay = allDates[i];
        break;
      }
    }

    const sleepData = sleepByDate.get(dataDay);
    const readinessData = readinessByDate.get(dataDay);
    const activityData = activityByDate.get(dataDay);
    const spo2Data = spo2ByDate.get(dataDay) || spo2List[spo2List.length - 1];
    const workouts = workoutList.filter(w => {
      const d =
        getDateFromRecord(w) ||
        (w.start ? String(w.start).split('T')[0] : null) ||
        (w.start_datetime ? String(w.start_datetime).split('T')[0] : null);
      return d === dataDay;
    });

    const sleepContributors = sleepData?.contributors || {};
    const readinessContributors = readinessData?.contributors || {};
    const activityContributors = activityData?.contributors || {};

    // Heart rate: timeline for primary day only (PT), capped for public JSON size.
    const hrNormalized = heartRateRaw
      .map(normalizeHeartRatePoint)
      .filter(Boolean)
      .filter(p => getPtYmdFromTimestamp(p.timestamp) === dataDay);
    const heartRateSeries = downsampleSeries(hrNormalized, HR_TIMELINE_MAX_POINTS);
    const heartRateStats =
      heartRateSeries.length > 0
        ? {
            min: Math.min(...heartRateSeries.map(p => p.bpm)),
            max: Math.max(...heartRateSeries.map(p => p.bpm)),
            avg: roundOrNull(heartRateSeries.reduce((sum, point) => sum + point.bpm, 0) / heartRateSeries.length),
            latest: heartRateSeries[heartRateSeries.length - 1].bpm,
          }
        : null;

    const now = new Date();
    const output = {
      lastUpdatedIso: now.toISOString(),
      day: dataDay,
      byDay,

      // Sleep score (0-100)
      sleepScore: roundOrNull(sleepData?.score),
      sleepDeep: roundOrNull(sleepContributors.deep_sleep),
      sleepEfficiency: roundOrNull(sleepContributors.efficiency),
      sleepLatency: roundOrNull(sleepContributors.latency),
      sleepRem: roundOrNull(sleepContributors.rem_sleep),
      sleepRestfulness: roundOrNull(sleepContributors.restfulness),
      sleepTiming: roundOrNull(sleepContributors.timing),
      sleepTotal: roundOrNull(sleepContributors.total_sleep),

      readinessScore: roundOrNull(readinessData?.score),
      readinessActivityBalance: roundOrNull(readinessContributors.activity_balance),
      readinessBodyTemp: roundOrNull(readinessContributors.body_temperature),
      readinessHrvBalance: roundOrNull(readinessContributors.hrv_balance),
      readinessPreviousDay: roundOrNull(readinessContributors.previous_day_activity),
      readinessPreviousNight: roundOrNull(readinessContributors.previous_night),
      readinessRecoveryIndex: roundOrNull(readinessContributors.recovery_index),
      readinessRestingHr: roundOrNull(readinessContributors.resting_heart_rate),
      readinessSleepBalance: roundOrNull(readinessContributors.sleep_balance),
      readinessSleepRegularity: roundOrNull(readinessContributors.sleep_regularity),
      tempDeviation:
        readinessData?.temperature_deviation != null
          ? Math.round(readinessData.temperature_deviation * 100) / 100
          : null,

      restingHrBpm: roundOrNull(
        firstDefined(
          readinessData?.resting_heart_rate,
          sleepData?.heart_rate?.resting,
          sleepData?.heart_rate?.resting_heart_rate
        )
      ),
      hrvMs: roundOrNull(
        firstDefined(readinessData?.hrv_average_milli, readinessData?.hrv_average, sleepData?.average_hrv)
      ),
      heartRateSeriesDay: heartRateSeries.length > 0 ? dataDay : null,
      heartRateSeries: heartRateSeries.map(point => ({ t: point.timestamp, bpm: point.bpm })),
      heartRateMinBpm: heartRateStats?.min ?? null,
      heartRateMaxBpm: heartRateStats?.max ?? null,
      heartRateAvgBpm: heartRateStats?.avg ?? null,
      heartRateLatestBpm: heartRateStats?.latest ?? null,

      activityScore: roundOrNull(activityData?.score),
      activityMeetTargets: roundOrNull(activityContributors.meet_daily_targets),
      activityMoveHour: roundOrNull(activityContributors.move_every_hour),
      activityRecoveryTime: roundOrNull(activityContributors.recovery_time),
      activityStayActive: roundOrNull(activityContributors.stay_active),
      activityTrainingFreq: roundOrNull(activityContributors.training_frequency),
      activityTrainingVol: roundOrNull(activityContributors.training_volume),
      steps: roundOrNull(activityData?.steps),
      activeCalories: roundOrNull(activityData?.active_calories),
      totalCalories: roundOrNull(activityData?.total_calories),
      targetCalories: roundOrNull(activityData?.target_calories),
      metersToTarget: roundOrNull(activityData?.meters_to_target),
      highActivityMinutes: roundOrNull(toActivityMinutes(activityData?.high_activity_time)),
      mediumActivityMinutes: roundOrNull(toActivityMinutes(activityData?.medium_activity_time)),
      lowActivityMinutes: roundOrNull(toActivityMinutes(activityData?.low_activity_time)),

      spo2Average: roundOrNull(extractSpo2Percent(spo2Data)),
      spo2BreathingDisturbance: roundOrNull(
        firstDefined(spo2Data?.breathing_disturbance_index, spo2Data?.breathing_disturbance)
      ),
      workoutCount: workouts.length,
      workoutMinutes: roundOrNull(workouts.reduce((sum, w) => sum + Number(firstDefined(w.duration, 0)), 0)),
      workoutCalories: roundOrNull(workouts.reduce((sum, w) => sum + Number(firstDefined(w.calories, 0)), 0)),
    };

    // Step 5: Check if we got any data (from 7-day window)
    const hasAnyData =
      output.sleepScore !== null ||
      output.readinessScore !== null ||
      output.restingHrBpm !== null ||
      output.hrvMs !== null ||
      output.steps !== null ||
      output.activeCalories !== null ||
      byDay.some(d => d.sleepScore !== null || d.readinessScore !== null || d.steps !== null);

    if (!hasAnyData) {
      console.warn('Warning: No data available from Oura API for the last 7 days');

      if (existingData) {
        console.log('Preserving existing data from', existingData.day);
        process.exit(0);
      }

      console.error('Error: No data available and no prior JSON exists');
      writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
      process.exit(1);
    }

    // Step 6: Write JSON file
    const jsonContent = JSON.stringify(output, null, 2);
    writeFileSync(OUTPUT_PATH, jsonContent);

    // Step 7: Check if data actually changed (for CI commit decision)
    if (existingData) {
      const existingJson = JSON.stringify(existingData, null, 2);
      // Compare data content (excluding lastUpdatedIso which changes every run)
      const existingDataOnly = { ...existingData, lastUpdatedIso: undefined };
      const newDataOnly = { ...output, lastUpdatedIso: undefined };

      if (JSON.stringify(existingDataOnly) === JSON.stringify(newDataOnly)) {
        console.log('No changes detected in data');
        // Write a marker file for the workflow to check
        writeFileSync(resolve(process.cwd(), '.oura_no_change'), '');
      } else {
        console.log('Data updated successfully');
      }
    } else {
      console.log('Initial data file created');
    }

    // Log summary (no sensitive data)
    console.log('\n--- Summary ---');
    console.log(`Day: ${output.day}`);
    console.log(`Sleep Score: ${output.sleepScore ?? 'N/A'}`);
    console.log(
      `  Contributors - Deep: ${output.sleepDeep ?? 'N/A'}, REM: ${output.sleepRem ?? 'N/A'}, Efficiency: ${output.sleepEfficiency ?? 'N/A'}, Latency: ${output.sleepLatency ?? 'N/A'}`
    );
    console.log(`Readiness Score: ${output.readinessScore ?? 'N/A'}`);
    console.log(
      `  Contributors - Activity Balance: ${output.readinessActivityBalance ?? 'N/A'}, Body Temp: ${output.readinessBodyTemp ?? 'N/A'}, HRV Balance: ${output.readinessHrvBalance ?? 'N/A'}`
    );
    console.log(`Resting HR: ${output.restingHrBpm ?? 'N/A'} BPM`);
    console.log(`HRV: ${output.hrvMs ?? 'N/A'} ms`);
    console.log(`Activity Score: ${output.activityScore ?? 'N/A'}`);
    console.log(`Steps: ${output.steps ?? 'N/A'}`);
    console.log(`Active Calories: ${output.activeCalories ?? 'N/A'}`);
    console.log(`HR Timeline Points: ${output.heartRateSeries.length}`);
    console.log(
      `7-Day History: ${byDay.filter(d => d.sleepScore !== null || d.readinessScore !== null || d.steps !== null).length} days with data`
    );
    console.log(`SpO2 Average: ${output.spo2Average ?? 'N/A'}`);
    console.log(`Workouts: ${output.workoutCount ?? 0}`);
    console.log('---------------');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);

    // Local runs can preserve the last good snapshot, but CI must fail loudly so
    // stale production data does not look healthy in the Actions UI.
    if (existingData && !SHOULD_FAIL_ON_API_ERROR) {
      console.log('API error occurred, but existing data preserved');
      process.exit(0);
    }

    if (existingData) {
      console.error(`Existing data remains at ${existingData.lastUpdatedIso || existingData.day || 'unknown time'}`);
    }

    process.exit(1);
  }
}

main();
