#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

const TOKEN_PATH = resolve(process.cwd(), '.oura_token');
function loadToken() {
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

async function main() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const refreshToken = loadToken();

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing credentials');
    process.exit(1);
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const auth = await httpsRequest(
    'https://api.ouraring.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    params.toString()
  );

  const token = auth.access_token;
  console.log('✅ Connected to Oura API\\n');

  const endpoints = [
    { name: 'Daily Sleep', endpoint: 'daily_sleep', emoji: '🌙' },
    { name: 'Daily Readiness', endpoint: 'daily_readiness', emoji: '🔋' },
    { name: 'Daily Activity', endpoint: 'daily_activity', emoji: '🏃' },
    { name: 'Heart Rate (time series)', endpoint: 'heartrate', emoji: '❤️' },
    { name: 'Sleep Stages', endpoint: 'sleep', emoji: '📊' },
    { name: 'SpO2', endpoint: 'spo2', emoji: '🫁' },
    { name: 'Workouts', endpoint: 'workout', emoji: '💪' },
    { name: 'Personal Info', endpoint: 'personal_info', emoji: '👤' },
  ];

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (const { name, endpoint, emoji } of endpoints) {
    console.log(`${emoji} ${name}`);
    console.log('-'.repeat(50));

    try {
      let url = 'https://api.ouraring.com/v2/usercollection/' + endpoint;
      if (endpoint !== 'personal_info') {
        url += '?start_date=' + yesterday;
      } else {
        url += '?limit=1';
      }

      const response = await httpsRequest(url, {
        headers: { Authorization: 'Bearer ' + token },
      });

      if (response.data && (Array.isArray(response.data) ? response.data.length > 0 : response.data)) {
        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        console.log('✅ AVAILABLE');
        console.log('Fields:', Object.keys(data).join(', '));
      } else {
        console.log('⚠️  No data');
      }
    } catch (e) {
      console.log('❌ Error:', e.message);
    }
    console.log('');
  }
}

main().catch(console.error);
