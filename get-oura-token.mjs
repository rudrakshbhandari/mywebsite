#!/usr/bin/env node
/**
 * Oura OAuth Token Generator
 * Run this directly: node get-oura-token.mjs
 */

import https from 'https';
import readline from 'readline';
import { writeFileSync } from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// CREDENTIALS - UPDATE THESE
const CLIENT_ID = 'dabfab14-4862-4e92-aed4-b04620d9c658';
const CLIENT_SECRET = 'WrHK9KwKWjgVtPdEaAlmEFwwDJzSFlXfiQQmcwlfr8o';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = ['daily', 'heartrate', 'spo2Daily', 'workout', 'personal', 'email', 'session', 'stress'];

console.log('=== Oura Token Generator ===\n');

const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES.join(' '))}`;

console.log('STEP 1: Copy and open this URL in your browser:\n');
console.log(authUrl);
console.log('\nSTEP 2:');
console.log('- Log in to Oura');
console.log('- Click "Allow"');
console.log('- Copy the full URL you\'re redirected to (starts with localhost)');
console.log('- PASTE IT HERE immediately\n');

rl.question('Paste the redirect URL: ', (url) => {
  // Extract code
  let code = url;
  const codeMatch = url.match(/[?&]code=([^&]+)/);
  if (codeMatch) code = codeMatch[1];
  code = code.trim();

  console.log('\nExchanging code for token...\n');

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
          console.error('❌ Error:', response.error, response.error_description);
          rl.close();
          return;
        }

        console.log('✅ SUCCESS!\n');
        console.log('=== REFRESH TOKEN (COPY THIS) ===');
        console.log(response.refresh_token);
        console.log('=================================\n');

        writeFileSync('.oura_token', response.refresh_token);
        console.log('✅ Saved to .oura_token\n');
        console.log('NEXT: Update GitHub Secret OURA_REFRESH_TOKEN with the token above');

      } catch (e) {
        console.error('Error:', e.message);
        console.log('Raw response:', data);
      }
      rl.close();
    });
  });

  req.on('error', (e) => {
    console.error('Request failed:', e.message);
    rl.close();
  });

  req.write(postData);
  req.end();
});
