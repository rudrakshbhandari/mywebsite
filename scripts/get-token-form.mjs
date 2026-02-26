#!/usr/bin/env node
/**
 * Oura OAuth - Using form-urlencoded (preferred by Oura)
 */

import https from 'https';
import readline from 'readline';
import { writeFileSync } from 'fs';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const CLIENT_ID = 'dabfab14-4862-4e92-aed4-b04620d9c658';
const CLIENT_SECRET = 'WrHK9KwKWjgVtPdEaAlmEFwwDJzSFlXfiQQmcwlfr8o';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'daily heartrate spo2Daily workout personal email session stress';

console.log('=== Oura OAuth Token Generator (Form URL-Encoded) ===\n');

const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES)}`;

console.log('Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('Steps:');
console.log('1. Log in to Oura');
console.log('2. Click "Allow"');
console.log('3. Copy the FULL redirect URL immediately');
console.log('4. Paste it below\n');

rl.question('Redirect URL: ', (url) => {
  // Extract code
  const match = url.match(/[?&]code=([^&]+)/);
  if (!match) {
    console.error('❌ No code found in URL');
    rl.close();
    return;
  }
  const code = match[1];
  console.log('\nExtracted code:', code.substring(0, 20) + '...');
  console.log('Exchanging for token...\n');

  // Use form-urlencoded as per Oura docs
  const params = new URLSearchParams({
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
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      console.log('Response:', data, '\n');
      
      try {
        const response = JSON.parse(data);
        
        if (response.error || !response.refresh_token) {
          console.error('❌ Error:', response.error || 'No refresh_token in response');
          if (response.error_description) console.error('Description:', response.error_description);
          rl.close();
          return;
        }

        console.log('✅ SUCCESS!\n');
        console.log('=== REFRESH TOKEN ===');
        console.log(response.refresh_token);
        console.log('=====================\n');
        
        writeFileSync('.oura_token', response.refresh_token);
        console.log('✅ Saved to .oura_token\n');
        console.log('NEXT: Update GitHub Secret OURA_REFRESH_TOKEN with the token above');
        console.log('URL: https://github.com/rudrakshbhandari/mywebsite/settings/secrets/actions');
        
      } catch (e) {
        console.error('❌ Parse error:', e.message);
      }
      rl.close();
    });
  });

  req.on('error', (e) => {
    console.error('❌ Request error:', e.message);
    rl.close();
  });

  req.write(params.toString());
  req.end();
});
