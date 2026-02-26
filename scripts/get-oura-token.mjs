#!/usr/bin/env node
/**
 * Get Oura OAuth Refresh Token
 * Interactive script to obtain a fresh refresh token with all scopes
 */

import https from 'https';
import readline from 'readline';
import { writeFileSync } from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
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
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Oura OAuth Token Generator ===\n');

  const clientId = await question('Enter your Oura Client ID: ');
  const clientSecret = await question('Enter your Oura Client Secret: ');

  // Scopes for full access
  const scopes = [
    'daily',
    'heartrate',
    'spo2Daily',
    'workout',
    'personal',
    'email',
    'session',
    'stress'
  ];

  const redirectUri = 'http://localhost:3000/callback';

  // Step 1: Generate authorization URL
  const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes.join(' '))}`;

  console.log('\n=== STEP 1: Authorize ===');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n1. Log in with your Oura account');
  console.log('2. Click "Allow" to authorize the app');
  console.log('3. You will be redirected to localhost (which will fail - this is OK)');
  console.log('4. Copy the "code" parameter from the URL\n');

  const code = await question('Paste the authorization code here: ');

  // Step 2: Exchange code for tokens
  console.log('\n=== STEP 2: Getting tokens... ===');

  try {
    const response = await httpsRequest('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });

    if (response.error) {
      console.error('\n❌ Error:', response.error);
      console.error(response.error_description || '');
      process.exit(1);
    }

    console.log('\n✅ SUCCESS!\n');
    console.log('Access Token (short-lived):', response.access_token?.substring(0, 30) + '...');
    console.log('\n📝 REFRESH TOKEN (save this!):');
    console.log(response.refresh_token);
    console.log('\nThis refresh token never expires (unless revoked).');
    console.log('It will be used to get new access tokens automatically.\n');

    // Save to file
    writeFileSync('.oura_token', response.refresh_token);
    console.log('✅ Refresh token saved to .oura_token file');

    // Also show scopes
    console.log('\nAuthorized Scopes:');
    scopes.forEach(s => console.log(`  ✓ ${s}`));

    console.log('\n=== Next Steps ===');
    console.log('1. Copy the refresh token above');
    console.log('2. Add it as OURA_REFRESH_TOKEN in GitHub Secrets');
    console.log('   (Settings -> Secrets and variables -> Actions)');
    console.log('3. The GitHub Actions workflow will now work automatically!');

  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
    process.exit(1);
  }

  rl.close();
}

main();
