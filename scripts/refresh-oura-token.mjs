#!/usr/bin/env node
/**
 * Oura OAuth Token Refresher
 * Generates authorization URL and exchanges code for refresh token
 */

import https from 'https';
import { writeFileSync, readFileSync } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Load credentials from .env file
try {
  const envContent = readFileSync('.env', 'utf-8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });
  process.env.OURA_CLIENT_ID = envVars.OURA_CLIENT_ID;
  process.env.OURA_CLIENT_SECRET = envVars.OURA_CLIENT_SECRET;
} catch (e) {
  // Continue with existing env vars
}

const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: OURA_CLIENT_ID and OURA_CLIENT_SECRET must be set');
  console.error('Add them to your .env file or environment variables');
  process.exit(1);
}

// All scopes for maximum data access
const SCOPES = ['daily', 'heartrate', 'spo2Daily', 'workout', 'personal', 'email', 'session', 'stress'];
const REDIRECT_URI = 'http://localhost:3000/callback';

// Step 1: Print authorization URL
console.log('=== Oura Token Refresh ===\n');

const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES.join(' '))}`;

console.log('STEP 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nThen:');
console.log('1. Log in with your Oura account');
console.log('2. Click "Allow" to authorize');
console.log('3. You\'ll be redirected to localhost (browser will show "can\'t connect") - COPY THE URL');
console.log('4. Paste the full redirect URL (or just the code parameter) below\n');

// Step 2: Wait for code
rl.question('Paste the redirect URL or code here: ', async (input) => {
  // Extract code from input (full URL or just code)
  let code = input.trim();
  if (code.includes('?code=')) {
    const match = code.match(/[?&]code=([^&]+)/);
    if (match) code = match[1];
  }
  if (code.includes('&')) {
    code = code.split('&')[0];
  }

  console.log('\nSTEP 2: Exchanging code for tokens...\n');

  // Make token request
  const postData = JSON.stringify({
    grant_type: 'authorization_code',
    code: code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI
  });

  const options = {
    hostname: 'api.ouraring.com',
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const response = JSON.parse(data);

        if (response.error) {
          console.error('❌ Error:', response.error);
          console.error(response.error_description || '');
          process.exit(1);
        }

        console.log('✅ SUCCESS!\n');
        console.log('=== NEW REFRESH TOKEN ===');
        console.log(response.refresh_token);
        console.log('=========================\n');

        // Save to file
        writeFileSync('.oura_token', response.refresh_token);
        console.log('✅ Saved to .oura_token file\n');

        // Test the token immediately
        console.log('Testing the new token...');
        testToken(response.access_token);

      } catch (e) {
        console.error('❌ Failed to parse response:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error('❌ Request failed:', e.message);
    process.exit(1);
  });

  req.write(postData);
  req.end();
});

function testToken(accessToken) {
  const testOptions = {
    hostname: 'api.ouraring.com',
    path: '/v2/usercollection/personal_info',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  };

  const testReq = https.request(testOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ Token test successful! API is accessible.\n');
        console.log('=== NEXT STEPS ===');
        console.log('1. Copy the refresh token above');
        console.log('2. Go to GitHub repo Settings -> Secrets and variables -> Actions');
        console.log('3. Update OURA_REFRESH_TOKEN with the new token above');
        console.log('4. The GitHub Actions automation will now work!\n');
      } else {
        console.log('⚠️ Token test returned:', res.statusCode);
        console.log('Response:', data);
      }
      rl.close();
    });
  });

  testReq.on('error', (e) => {
    console.error('⚠️ Token test failed:', e.message);
    rl.close();
  });

  testReq.end();
}
