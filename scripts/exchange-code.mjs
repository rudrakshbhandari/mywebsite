#!/usr/bin/env node
/**
 * Exchange Oura auth code for refresh token
 */

import https from 'https';
import { writeFileSync, readFileSync } from 'fs';

const CODE = '9AbRihk99lhhE4VbgqlfrNHGdLtgnJUE';

// Load credentials from .env
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const CLIENT_ID = envVars.OURA_CLIENT_ID;
const CLIENT_SECRET = envVars.OURA_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';

console.log('Exchanging code for tokens...\n');

const postData = JSON.stringify({
  grant_type: 'authorization_code',
  code: CODE,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  redirect_uri: REDIRECT_URI,
});

const options = {
  hostname: 'api.ouraring.com',
  path: '/oauth/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => (data += chunk));
  res.on('end', () => {
    console.log('Response status:', res.statusCode);
    console.log('Response:', data.substring(0, 500));

    try {
      const response = JSON.parse(data);

      if (response.error) {
        console.error('\n❌ Error:', response.error);
        console.error(response.error_description || '');
        process.exit(1);
      }

      console.log('\n✅ SUCCESS!\n');
      console.log('=== NEW REFRESH TOKEN ===');
      console.log(response.refresh_token);
      console.log('=========================\n');

      // Save to file
      writeFileSync('.oura_token', response.refresh_token);
      console.log('✅ Saved to .oura_token file\n');

      // Test the token
      testToken(response.access_token, response.refresh_token);
    } catch (e) {
      console.error('\n❌ Failed to parse response:', e.message);
      process.exit(1);
    }
  });
});

req.on('error', e => {
  console.error('❌ Request failed:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();

function testToken(accessToken, refreshToken) {
  const testOptions = {
    hostname: 'api.ouraring.com',
    path: '/v2/usercollection/daily_sleep?start_date=2026-02-25&end_date=2026-02-25',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  };

  const testReq = https.request(testOptions, res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      console.log('Token test (sleep endpoint):', res.statusCode);
      if (res.statusCode === 200) {
        const parsed = JSON.parse(data);
        console.log('Data available:', parsed.data ? 'Yes' : 'No');
        if (parsed.data && parsed.data[0]) {
          console.log('Sleep score:', parsed.data[0].score);
          console.log('Contributors:', Object.keys(parsed.data[0].contributors || {}).join(', '));
        }
        console.log('\n✅ Token works!\n');
        console.log('=== NEXT STEP ===');
        console.log('Update GitHub Secret OURA_REFRESH_TOKEN with the token above');
      } else {
        console.log('Response:', data.substring(0, 200));
      }
    });
  });

  testReq.on('error', e => {
    console.error('Token test failed:', e.message);
  });

  testReq.end();
}
