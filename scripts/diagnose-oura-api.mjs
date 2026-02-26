#!/usr/bin/env node
/**
 * Diagnose Oura API - Check what fields are actually returned
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

const TOKEN_PATH = resolve(process.cwd(), '.oura_token');

function loadRefreshToken() {
  if (existsSync(TOKEN_PATH)) {
    try {
      return readFileSync(TOKEN_PATH, 'utf-8').trim();
    } catch (e) {}
  }
  return process.env.OURA_REFRESH_TOKEN;
}

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await httpsRequest('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, params.toString());

  return response.access_token;
}

async function fetchEndpoint(token, endpoint, date) {
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}?start_date=${date}&end_date=${date}`;
  try {
    const response = await httpsRequest(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data?.[0] || null;
  } catch (e) {
    console.error(`  Error fetching ${endpoint}: ${e.message}`);
    return null;
  }
}

async function main() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const refreshToken = loadRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing credentials. Set OURA_CLIENT_ID, OURA_CLIENT_SECRET, and have .oura_token file');
    process.exit(1);
  }

  console.log('Getting access token...');
  const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
  console.log('✅ Got access token\n');

  // Get today's date in PT
  const now = new Date();
  const ptOffset = -7 * 60;
  const ptTime = new Date(now.getTime() + (now.getTimezoneOffset() + ptOffset) * 60000);
  const todayPT = ptTime.toISOString().split('T')[0];

  console.log(`Fetching data for: ${todayPT}\n`);
  console.log('='.repeat(60));

  // Check sleep
  console.log('\n🌙 SLEEP DATA:');
  const sleep = await fetchEndpoint(accessToken, 'daily_sleep', todayPT);
  if (sleep) {
    console.log('  score:', sleep.score);
    console.log('  All fields:', Object.keys(sleep).join(', '));
    console.log('  heart_rate:', JSON.stringify(sleep.heart_rate));
    console.log('  average_hrv:', sleep.average_hrv);
  } else {
    console.log('  No sleep data');
  }

  // Check readiness
  console.log('\n🔋 READINESS DATA:');
  const readiness = await fetchEndpoint(accessToken, 'daily_readiness', todayPT);
  if (readiness) {
    console.log('  score:', readiness.score);
    console.log('  All fields:', Object.keys(readiness).join(', '));
    console.log('  resting_heart_rate:', readiness.resting_heart_rate);
    console.log('  hrv_average_milli:', readiness.hrv_average_milli);
  } else {
    console.log('  No readiness data');
  }

  // Check activity
  console.log('\n🏃 ACTIVITY DATA:');
  const activity = await fetchEndpoint(accessToken, 'daily_activity', todayPT);
  if (activity) {
    console.log('  All fields:', Object.keys(activity).join(', '));
    console.log('  steps:', activity.steps);
    console.log('  active_calories:', activity.active_calories);
  } else {
    console.log('  No activity data');
  }

  // Check previous day (in case today's data isn't ready)
  const yesterdayPT = new Date(ptTime.getTime() - 86400000).toISOString().split('T')[0];
  console.log(`\n\nFetching YESTERDAY (${yesterdayPT}) for comparison:\n`);

  const sleep2 = await fetchEndpoint(accessToken, 'daily_sleep', yesterdayPT);
  const readiness2 = await fetchEndpoint(accessToken, 'daily_readiness', yesterdayPT);
  const activity2 = await fetchEndpoint(accessToken, 'daily_activity', yesterdayPT);

  console.log('Sleep:', sleep2 ? { score: sleep2.score, hrv: sleep2.average_hrv } : 'No data');
  console.log('Readiness:', readiness2 ? { score: readiness2.score, hr: readiness2.resting_heart_rate, hrv: readiness2.hrv_average_milli } : 'No data');
  console.log('Activity:', activity2 ? { steps: activity2.steps, calories: activity2.active_calories } : 'No data');
}

main().catch(console.error);
