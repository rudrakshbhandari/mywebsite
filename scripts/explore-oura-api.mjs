#!/usr/bin/env node
/**
 * Comprehensive Oura API Explorer
 * Discovers all available data for your account
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

const TOKEN_PATH = resolve(process.cwd(), '.oura_token');
const PT_TIME_ZONE = 'America/Los_Angeles';

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
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...options.headers,
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${data.substring(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
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

  const response = await httpsRequest(
    'https://api.ouraring.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    params.toString()
  );

  return response.access_token;
}

async function fetchEndpoint(token, endpoint, date = null) {
  let url = `https://api.ouraring.com/v2/usercollection/${endpoint}`;
  if (date) {
    url += `?start_date=${date}&end_date=${date}`;
  } else {
    url += '?limit=1'; // Just get latest
  }

  try {
    const response = await httpsRequest(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, data: response.data, error: null };
  } catch (e) {
    return { success: false, data: null, error: e.message };
  }
}

function formatValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val).substring(0, 60);
  return String(val);
}

function printSection(title, emoji) {
  console.log('\n' + '='.repeat(70));
  console.log(`${emoji} ${title}`);
  console.log('='.repeat(70));
}

function formatYmd(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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

async function main() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const refreshToken = loadRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing credentials. Set OURA_CLIENT_ID, OURA_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('🔐 Getting access token...');
  const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
  console.log('✅ Connected to Oura API\n');

  // Get dates
  const { year, month, day } = getPtDateParts(new Date());
  const utcPtDate = new Date(Date.UTC(year, month - 1, day));
  const todayPT = formatYmd(utcPtDate.getUTCFullYear(), utcPtDate.getUTCMonth() + 1, utcPtDate.getUTCDate());
  utcPtDate.setUTCDate(utcPtDate.getUTCDate() - 1);
  const yesterdayPT = formatYmd(utcPtDate.getUTCFullYear(), utcPtDate.getUTCMonth() + 1, utcPtDate.getUTCDate());

  console.log(`📅 Today (PT): ${todayPT}`);
  console.log(`📅 Yesterday (PT): ${yesterdayPT}\n`);

  // ========== DAILY SLEEP ==========
  printSection('DAILY SLEEP', '🌙');
  const sleep = await fetchEndpoint(accessToken, 'daily_sleep', yesterdayPT);
  if (sleep.success && sleep.data?.[0]) {
    const s = sleep.data[0];
    console.log('Available fields:');
    Object.entries(s).forEach(([key, val]) => {
      console.log(`  ${key}: ${formatValue(val)}`);
    });
  } else {
    console.log('❌ No sleep data:', sleep.error);
  }

  // ========== DAILY READINESS ==========
  printSection('DAILY READINESS', '🔋');
  const readiness = await fetchEndpoint(accessToken, 'daily_readiness', yesterdayPT);
  if (readiness.success && readiness.data?.[0]) {
    const r = readiness.data[0];
    console.log('Available fields:');
    Object.entries(r).forEach(([key, val]) => {
      console.log(`  ${key}: ${formatValue(val)}`);
    });
  } else {
    console.log('❌ No readiness data:', readiness.error);
  }

  // ========== DAILY ACTIVITY ==========
  printSection('DAILY ACTIVITY', '🏃');
  const activity = await fetchEndpoint(accessToken, 'daily_activity', yesterdayPT);
  if (activity.success && activity.data?.[0]) {
    const a = activity.data[0];
    console.log('Available fields:');
    Object.entries(a).forEach(([key, val]) => {
      console.log(`  ${key}: ${formatValue(val)}`);
    });
  } else {
    console.log('❌ No activity data:', activity.error);
  }

  // ========== SLEEP TIME SERIES (Hypnogram) ==========
  printSection('SLEEP TIME SERIES (Sleep Stages)', '📊');
  const sleepSeries = await fetchEndpoint(accessToken, 'sleep', yesterdayPT);
  if (sleepSeries.success && sleepSeries.data?.[0]) {
    const ss = sleepSeries.data[0];
    console.log('Available fields:');
    Object.keys(ss).forEach(key => {
      const val = ss[key];
      if (Array.isArray(val)) {
        console.log(`  ${key}: [Array with ${val.length} items]`);
      } else {
        console.log(`  ${key}: ${formatValue(val)}`);
      }
    });
    if (ss.hypnogram_5min) {
      console.log('\n  Sample hypnogram data (sleep stages every 5 min):');
      console.log(`    ${ss.hypnogram_5min.substring(0, 50)}...`);
    }
  } else {
    console.log('❌ No sleep time series:', sleepSeries.error);
  }

  // ========== HEART RATE TIME SERIES ==========
  printSection('HEART RATE TIME SERIES', '❤️');
  const hrSeries = await fetchEndpoint(accessToken, 'heartrate', yesterdayPT);
  if (hrSeries.success && hrSeries.data) {
    console.log(`✅ Heart rate data available!`);
    console.log(`   Records: ${hrSeries.data.length}`);
    if (hrSeries.data.length > 0) {
      console.log('\n   Sample record:', JSON.stringify(hrSeries.data[0], null, 2));
    }
  } else {
    console.log('❌ No heart rate time series:', hrSeries.error);
    console.log('   (Requires Gen 3 ring + heartrate scope)');
  }

  // ========== WORKOUTS ==========
  printSection('WORKOUTS', '💪');
  const workouts = await fetchEndpoint(accessToken, 'workout', yesterdayPT);
  if (workouts.success && workouts.data?.length > 0) {
    console.log(`✅ ${workouts.data.length} workout(s) found`);
    workouts.data.forEach((w, i) => {
      console.log(`\n  Workout ${i + 1}:`);
      console.log(`    Type: ${w.activity}`);
      console.log(`    Duration: ${w.duration} min`);
      console.log(`    Calories: ${w.calories}`);
    });
  } else {
    console.log('❌ No workouts:', workouts.error || 'No data');
  }

  // ========== SpO2 ==========
  printSection('BLOOD OXYGEN (SpO2)', '🫁');
  const spo2 = await fetchEndpoint(accessToken, 'spo2', yesterdayPT);
  if (spo2.success && spo2.data?.[0]) {
    console.log('Available fields:');
    Object.entries(spo2.data[0]).forEach(([key, val]) => {
      console.log(`  ${key}: ${formatValue(val)}`);
    });
  } else {
    console.log('❌ No SpO2 data:', spo2.error);
    console.log('   (Requires Gen 3 ring + spo2 scope)');
  }

  // ========== PERSONAL INFO ==========
  printSection('PERSONAL INFO', '👤');
  const personal = await fetchEndpoint(accessToken, 'personal_info');
  if (personal.success && personal.data) {
    const p = personal.data;
    console.log(`  Age: ${p.age}`);
    console.log(`  Weight: ${p.weight} kg`);
    console.log(`  Height: ${p.height} cm`);
    console.log(`  Sex: ${p.biological_sex}`);
  } else {
    console.log('❌ No personal info:', personal.error);
  }

  // ========== SUMMARY ==========
  printSection('AVAILABLE FOR YOUR HEALTH PAGE', '✅');
  console.log('\nDaily Metrics (always available):');
  if (sleep.success) console.log('  ✓ Sleep score, duration, stages, efficiency');
  if (readiness.success) console.log('  ✓ Readiness score, resting HR, HRV');
  if (activity.success) console.log('  ✓ Steps, calories, activity score');

  console.log('\nTime-Series Data (Gen 3 only):');
  if (hrSeries.success && hrSeries.data?.length > 0) {
    console.log('  ✓ Heart rate (minute-by-minute) - CAN MAKE TIME SERIES CHART!');
  } else {
    console.log('  ✗ Heart rate time series not available');
  }
  if (sleepSeries.success) {
    console.log('  ✓ Sleep hypnogram (stages every 5 min)');
  }
  if (spo2.success) {
    console.log('  ✓ Blood oxygen (SpO2)');
  }

  console.log('\nEvents:');
  if (workouts.success) console.log('  ✓ Workouts detected');

  console.log('\n' + '='.repeat(70));
  console.log('💡 RECOMMENDATION:');
  console.log('   For time-series HR chart: Simple SVG/CSS visualization');
  console.log('   (No heavy chart libraries needed!)');
  console.log('='.repeat(70));
}

main().catch(console.error);
