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
const OAUTH_ENDPOINT = 'https://api.ouraring.com/oauth/token';
const API_BASE = 'api.ouraring.com';

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
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || data}`));
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
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Refresh Oura OAuth access token using refresh token
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} refreshToken
 * @returns {Promise<string>} - New access token
 */
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  };

  const response = await httpsRequest(OAUTH_ENDPOINT, { method: 'POST' }, body);

  if (!response.access_token) {
    throw new Error('No access_token in OAuth response');
  }

  return response.access_token;
}

/**
 * Get today's date in YYYY-MM-DD format in PT timezone
 * @returns {string}
 */
function getTodayPT() {
  const now = new Date();
  // Convert to PT (UTC-7 or UTC-8 depending on DST)
  const ptOffset = -7 * 60; // PDT offset (use -8 for PST)
  const ptTime = new Date(now.getTime() + (now.getTimezoneOffset() + ptOffset) * 60000);
  return ptTime.toISOString().split('T')[0];
}

/**
 * Fetch daily sleep data from Oura API
 * @param {string} token - Access token
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>}
 */
async function fetchSleepData(token, date) {
  const url = `https://${API_BASE}/v2/usercollection/daily_sleep?start_date=${date}&end_date=${date}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data?.[0] || null;
}

/**
 * Fetch daily readiness data from Oura API
 * @param {string} token - Access token
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>}
 */
async function fetchReadinessData(token, date) {
  const url = `https://${API_BASE}/v2/usercollection/daily_readiness?start_date=${date}&end_date=${date}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data?.[0] || null;
}

/**
 * Fetch daily activity data from Oura API
 * @param {string} token - Access token
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>}
 */
async function fetchActivityData(token, date) {
  const url = `https://${API_BASE}/v2/usercollection/daily_activity?start_date=${date}&end_date=${date}`;
  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data?.[0] || null;
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
 * Main execution
 */
async function main() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const refreshToken = process.env.OURA_REFRESH_TOKEN;

  // Validate environment variables
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Error: Missing required environment variables');
    console.error('Required: OURA_CLIENT_ID, OURA_CLIENT_SECRET, OURA_REFRESH_TOKEN');
    process.exit(1);
  }

  console.log('Fetching Oura Ring data...');

  // Load existing data for fallback
  const existingData = loadExistingData();

  try {
    // Step 1: Refresh access token
    console.log('Refreshing OAuth token...');
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
    console.log('Token refreshed successfully');

    // Step 2: Determine date to fetch (today in PT)
    const todayPT = getTodayPT();
    console.log(`Fetching data for date: ${todayPT}`);

    // Step 3: Fetch all data types in parallel
    const [sleepData, readinessData, activityData] = await Promise.all([
      fetchSleepData(accessToken, todayPT).catch((e) => {
        console.warn('Sleep fetch failed:', e.message);
        return null;
      }),
      fetchReadinessData(accessToken, todayPT).catch((e) => {
        console.warn('Readiness fetch failed:', e.message);
        return null;
      }),
      fetchActivityData(accessToken, todayPT).catch((e) => {
        console.warn('Activity fetch failed:', e.message);
        return null;
      }),
    ]);

    // Step 4: Build output data
    const now = new Date();
    const output = {
      lastUpdatedIso: now.toISOString(),
      day: todayPT,
      // Sleep score (0-100)
      sleepScore: roundOrNull(sleepData?.score),
      // Readiness score (0-100)
      readinessScore: roundOrNull(readinessData?.score),
      // Resting heart rate in BPM
      restingHrBpm: roundOrNull(readinessData?.resting_heart_rate ?? sleepData?.heart_rate?.resting),
      // HRV in milliseconds
      hrvMs: roundOrNull(readinessData?.hrv_average_milli ?? sleepData?.average_hrv),
      // Steps count
      steps: roundOrNull(activityData?.steps),
      // Active calories burned
      activeCalories: roundOrNull(activityData?.active_calories),
    };

    // Step 5: Check if we got any data
    const hasAnyData =
      output.sleepScore !== null ||
      output.readinessScore !== null ||
      output.restingHrBpm !== null ||
      output.hrvMs !== null ||
      output.steps !== null ||
      output.activeCalories !== null;

    if (!hasAnyData) {
      console.warn('Warning: No data available from Oura API for today');

      // If we have existing data, preserve it (don't overwrite with all nulls)
      if (existingData && existingData.day === todayPT) {
        console.log('Preserving existing data for today');
        process.exit(0);
      }

      // If this is a new day with no data yet, write the placeholder
      // but exit with error only if there's no prior JSON at all
      if (!existingData) {
        console.error('Error: No data available and no prior JSON exists');
        writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
        process.exit(1);
      }
    }

    // Step 6: Write JSON file
    const jsonContent = JSON.stringify(output, null, 2);
    writeFileSync(OUTPUT_PATH, jsonContent);

    // Step 7: Check if data actually changed (for CI commit decision)
    if (existingData) {
      const existingJson = JSON.stringify(existingData, null, 2);
      if (jsonContent === existingJson) {
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
    console.log(`Readiness Score: ${output.readinessScore ?? 'N/A'}`);
    console.log(`Resting HR: ${output.restingHrBpm ?? 'N/A'} BPM`);
    console.log(`HRV: ${output.hrvMs ?? 'N/A'} ms`);
    console.log(`Steps: ${output.steps ?? 'N/A'}`);
    console.log(`Active Calories: ${output.activeCalories ?? 'N/A'}`);
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
