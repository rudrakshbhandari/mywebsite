#!/usr/bin/env node
/**
 * Test Oura OAuth credentials
 * Usage: OURA_CLIENT_ID=xxx OURA_CLIENT_SECRET=yyy OURA_REFRESH_TOKEN=zzz node test-oura-credentials.mjs
 */

import https from 'https';

const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.OURA_REFRESH_TOKEN;

console.log('Testing Oura credentials...\n');

// Validate inputs
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('❌ Missing required environment variables:');
  if (!CLIENT_ID) console.error('  - OURA_CLIENT_ID');
  if (!CLIENT_SECRET) console.error('  - OURA_CLIENT_SECRET');
  if (!REFRESH_TOKEN) console.error('  - OURA_REFRESH_TOKEN');
  console.error('\nUsage: OURA_CLIENT_ID=xxx OURA_CLIENT_SECRET=yyy OURA_REFRESH_TOKEN=zzz node test-oura-credentials.mjs');
  process.exit(1);
}

console.log('✅ All environment variables present');
console.log(`  Client ID: ${CLIENT_ID.substring(0, 8)}...`);
console.log(`  Client Secret: ${CLIENT_SECRET.substring(0, 8)}...`);
console.log(`  Refresh Token: ${REFRESH_TOKEN.substring(0, 20)}...\n`);

// Test OAuth token refresh
const params = new URLSearchParams({
  grant_type: 'refresh_token',
  refresh_token: REFRESH_TOKEN,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
});

console.log('Testing OAuth token refresh...');

const req = https.request({
  hostname: 'api.ouraring.com',
  path: '/oauth/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  },
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`\nHTTP Status: ${res.statusCode}`);
    
    try {
      const parsed = JSON.parse(data);
      console.log('Response:', JSON.stringify(parsed, null, 2));
      
      if (parsed.access_token) {
        console.log('\n✅ SUCCESS! Credentials are valid.');
        console.log('   Access token received.');
        console.log('\n📋 These credentials will work in GitHub Actions.');
      } else if (parsed.error) {
        console.log(`\n❌ OAuth Error: ${parsed.error}`);
        if (parsed.error_description) {
          console.log(`   Details: ${parsed.error_description}`);
        }
        console.log('\n🔧 Fix: Check that your refresh token is correct.');
      }
    } catch (e) {
      console.log('\n❌ Invalid JSON response:', data);
    }
  });
});

req.on('error', err => {
  console.error('\n❌ Request failed:', err.message);
});

req.write(params.toString());
req.end();
