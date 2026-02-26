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
        'Accept': 'application/json',
        'Content-Type': contentType,
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
            const apiMessage =
              parsed.error_description ||
              parsed.detail ||
              parsed.title ||
              parsed.error ||
              parsed.message ||
              data;
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

  const response = await httpsRequest(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, params.toString());

  if (!response.access_token) {
    throw new Error('No access_token in OAuth response');
  }

  return {
    accessToken: response.access_token,
    newRefreshToken: response.refresh_token // Oura may rotate refresh tokens
  };
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
 * Get yesterday's date in YYYY-MM-DD format in PT timezone
 * @returns {string}
 */
function getYesterdayPT() {
  const now = new Date();
  const ptOffset = -7 * 60; // PDT offset
  const ptTime = new Date(now.getTime() + (now.getTimezoneOffset() + ptOffset) * 60000);
  ptTime.setDate(ptTime.getDate() - 1);
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

    // Step 2: Determine dates to try (today first, then yesterday as fallback)
    const todayPT = getTodayPT();
    const yesterdayPT = getYesterdayPT();

    // Step 3: Fetch today's data first
    console.log(`Fetching data for today (${todayPT})...`);
    let [sleepData, readinessData, activityData] = await Promise.all([
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

    // Check if we got any data for today
    const hasTodayData =
      sleepData?.score !== null && sleepData?.score !== undefined ||
      readinessData?.score !== null && readinessData?.score !== undefined ||
      activityData?.steps !== null && activityData?.steps !== undefined;

    // If no data for today, try yesterday as fallback
    let usingFallbackDate = false;
    if (!hasTodayData) {
      console.log(`No data for today, trying yesterday (${yesterdayPT})...`);
      [sleepData, readinessData, activityData] = await Promise.all([
        fetchSleepData(accessToken, yesterdayPT).catch(() => null),
        fetchReadinessData(accessToken, yesterdayPT).catch(() => null),
        fetchActivityData(accessToken, yesterdayPT).catch(() => null),
      ]);
      usingFallbackDate = true;
    }

    // Step 4: Determine which date we're using and build output
    const now = new Date();

    // Use yesterday's date if we fell back to it
    const dataDay = usingFallbackDate ? yesterdayPT : todayPT;

    // Extract contributor data with safe defaults
    const sleepContributors = sleepData?.contributors || {};
    const readinessContributors = readinessData?.contributors || {};
    const activityContributors = activityData?.contributors || {};

    const output = {
      lastUpdatedIso: now.toISOString(),
      day: dataDay,

      // Sleep score (0-100)
      sleepScore: roundOrNull(sleepData?.score),
      // Sleep contributors (0-100 each)
      sleepDeep: roundOrNull(sleepContributors.deep_sleep),
      sleepEfficiency: roundOrNull(sleepContributors.efficiency),
      sleepLatency: roundOrNull(sleepContributors.latency),
      sleepRem: roundOrNull(sleepContributors.rem_sleep),
      sleepRestfulness: roundOrNull(sleepContributors.restfulness),
      sleepTiming: roundOrNull(sleepContributors.timing),
      sleepTotal: roundOrNull(sleepContributors.total_sleep),

      // Readiness score (0-100)
      readinessScore: roundOrNull(readinessData?.score),
      // Readiness contributors (0-100 each)
      readinessActivityBalance: roundOrNull(readinessContributors.activity_balance),
      readinessBodyTemp: roundOrNull(readinessContributors.body_temperature),
      readinessHrvBalance: roundOrNull(readinessContributors.hrv_balance),
      readinessPreviousDay: roundOrNull(readinessContributors.previous_day_activity),
      readinessPreviousNight: roundOrNull(readinessContributors.previous_night),
      readinessRecoveryIndex: roundOrNull(readinessContributors.recovery_index),
      readinessRestingHr: roundOrNull(readinessContributors.resting_heart_rate),
      readinessSleepBalance: roundOrNull(readinessContributors.sleep_balance),
      readinessSleepRegularity: roundOrNull(readinessContributors.sleep_regularity),
      // Temperature data
      tempDeviation: readinessData?.temperature_deviation
        ? Math.round(readinessData.temperature_deviation * 100) / 100
        : null,

      // Resting heart rate in BPM
      restingHrBpm: roundOrNull(readinessData?.resting_heart_rate ?? sleepData?.heart_rate?.resting),
      // HRV in milliseconds
      hrvMs: roundOrNull(readinessData?.hrv_average_milli ?? sleepData?.average_hrv),

      // Activity score (0-100)
      activityScore: roundOrNull(activityData?.score),
      // Activity contributors (0-100 each)
      activityMeetTargets: roundOrNull(activityContributors.meet_daily_targets),
      activityMoveHour: roundOrNull(activityContributors.move_every_hour),
      activityRecoveryTime: roundOrNull(activityContributors.recovery_time),
      activityStayActive: roundOrNull(activityContributors.stay_active),
      activityTrainingFreq: roundOrNull(activityContributors.training_frequency),
      activityTrainingVol: roundOrNull(activityContributors.training_volume),
      // Activity metrics
      steps: roundOrNull(activityData?.steps),
      activeCalories: roundOrNull(activityData?.active_calories),
      totalCalories: roundOrNull(activityData?.total_calories),
      targetCalories: roundOrNull(activityData?.target_calories),
      metersToTarget: roundOrNull(activityData?.meters_to_target),
      highActivityMinutes: roundOrNull(activityData?.high_activity_time),
      mediumActivityMinutes: roundOrNull(activityData?.medium_activity_time),
      lowActivityMinutes: roundOrNull(activityData?.low_activity_time),
    };

    // Step 5: Check if we got any data (today or yesterday)
    const hasAnyData =
      output.sleepScore !== null ||
      output.readinessScore !== null ||
      output.restingHrBpm !== null ||
      output.hrvMs !== null ||
      output.steps !== null ||
      output.activeCalories !== null;

    if (!hasAnyData) {
      console.warn('Warning: No data available from Oura API for today or yesterday');

      // If we have existing data, preserve it (don't overwrite with all nulls)
      if (existingData) {
        console.log('Preserving existing data from', existingData.day);
        process.exit(0);
      }

      // If there's no prior JSON at all, write placeholder and exit error
      console.error('Error: No data available and no prior JSON exists');
      writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
      process.exit(1);
    }

    // Log if we're showing yesterday's data
    if (output.day === yesterdayPT) {
      console.log('Note: Showing yesterday\'s data (today not yet synced)');
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
    console.log(`  Contributors - Deep: ${output.sleepDeep ?? 'N/A'}, REM: ${output.sleepRem ?? 'N/A'}, Efficiency: ${output.sleepEfficiency ?? 'N/A'}, Latency: ${output.sleepLatency ?? 'N/A'}`);
    console.log(`Readiness Score: ${output.readinessScore ?? 'N/A'}`);
    console.log(`  Contributors - Activity Balance: ${output.readinessActivityBalance ?? 'N/A'}, Body Temp: ${output.readinessBodyTemp ?? 'N/A'}, HRV Balance: ${output.readinessHrvBalance ?? 'N/A'}`);
    console.log(`Resting HR: ${output.restingHrBpm ?? 'N/A'} BPM`);
    console.log(`HRV: ${output.hrvMs ?? 'N/A'} ms`);
    console.log(`Activity Score: ${output.activityScore ?? 'N/A'}`);
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
