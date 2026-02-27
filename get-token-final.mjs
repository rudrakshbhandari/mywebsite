#!/usr/bin/env node
/**
 * Final Oura OAuth Token Generator
 * Run: node get-token-final.mjs
 */

import https from 'https';
import http from 'http';
import { writeFileSync } from 'fs';

const CLIENT_ID = process.env.OURA_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET?.trim();
const REDIRECT_URI = 'http://localhost:3000/callback';
const PORT = 3000;
const SCOPES = 'daily heartrate spo2Daily workout personal email session stress';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing credentials. Set OURA_CLIENT_ID and OURA_CLIENT_SECRET first.');
  process.exit(1);
}

console.log('=== Oura OAuth Token Generator ===\n');
console.log('Starting local server on port 3000...\n');

let codeReceived = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      console.log('❌ OAuth error:', error);
      res.end('Error: ' + error);
      server.close();
      return;
    }

    if (code && !codeReceived) {
      codeReceived = true;
      console.log('✅ Got authorization code!');
      console.log('Code:', code.substring(0, 20) + '...\n');
      res.end('<h1>Success!</h1><p>You can close this tab. Check the terminal.</p>');
      server.close();
      exchangeCode(code);
      return;
    }
  }

  res.end('Waiting for OAuth callback...');
});

server.listen(PORT, () => {
  const authUrl =
    `https://cloud.ouraring.com/oauth/authorize?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(SCOPES)}`;

  console.log('👉 Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nThen click "Allow" and wait...\n');
});

function exchangeCode(code) {
  console.log('Exchanging code for tokens...\n');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });

  const options = {
    hostname: 'api.ouraring.com',
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  };

  const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      console.log('Server response:', res.statusCode);

      try {
        const response = JSON.parse(data);

        if (response.error || !response.refresh_token) {
          console.error('\n❌ Error:', response.error || 'No token received');
          if (response.error_description) console.error('Details:', response.error_description);
          console.log('\nRaw response:', data);
          return;
        }

        console.log('\n✅ SUCCESS!\n');
        console.log('=== REFRESH TOKEN (COPY THIS) ===');
        console.log(response.refresh_token);
        console.log('=================================\n');

        writeFileSync('.oura_token', response.refresh_token);
        console.log('✅ Saved to .oura_token file\n');
        console.log('NEXT: Update GitHub Secret OURA_REFRESH_TOKEN at');
        console.log('https://github.com/rudrakshbhandari/mywebsite/settings/secrets/actions');
      } catch (e) {
        console.error('\n❌ Parse error:', e.message);
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', e => {
    console.error('Request error:', e.message);
  });

  req.write(params.toString());
  req.end();
}
