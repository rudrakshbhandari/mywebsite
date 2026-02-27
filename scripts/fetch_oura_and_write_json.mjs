#!/usr/bin/env node
/**
 * Oura Ring Data Fetcher
 * Fetches daily health metrics from Oura API and writes to public JSON.
 * Zero external dependencies - uses only Node.js built-in modules.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

// Configuration
const OUTPUT_PATH = resolve(process.cwd(), 'oura_public.json');
const TOKEN_PATH = resolve(process.cwd(), '.oura_token');
const ROTATED_TOKEN_PATH = resolve(process.cwd(), '.oura_rotated_token');
const OAUTH_ENDPOINT = 'https://api.ouraring.com/oauth/token';
const API_BASE = 'api.ouraring.com';
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const PT_TIME_ZONE = 'America/Los_Angeles';

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
function downsampleSeries(points, maxPoints = 96) {
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
  const refreshToken = loadRefreshToken();

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
      const { accessToken: refreshedAccessToken, newRefreshToken } = await refreshAccessToken(
        clientId,
        clientSecret,
        refreshToken
      );
      accessToken = refreshedAccessToken;
      console.log('Token refreshed successfully');

      // Save new refresh token locally when it rotates; never write secrets in CI.
      if (newRefreshToken && newRefreshToken !== refreshToken) {
        if (IS_GITHUB_ACTIONS) {
          saveRotatedTokenForWorkflow(newRefreshToken);
        } else {
          saveRefreshToken(newRefreshToken);
        }
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
        bedtimeStart: sleepPeriod?.bedtime_start || null,
        bedtimeEnd: sleepPeriod?.bedtime_end || null,
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

    // Heart rate: normalize and use most recent day with data
    const hrNormalized = heartRateRaw.map(normalizeHeartRatePoint).filter(Boolean);
    const heartRateSeries = downsampleSeries(hrNormalized, 96);
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

    // If API fails but we have existing data, don't exit error
    // This prevents CI failures for temporary API issues
    if (existingData) {
      console.log('API error occurred, but existing data preserved');
      process.exit(0);
    }

    process.exit(1);
  }
}

main();
