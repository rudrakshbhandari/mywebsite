#!/usr/bin/env node
/**
 * Oura OAuth with built-in callback server
 * Run: node scripts/oauth-server.mjs
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

console.log('=== Oura OAuth Auto-Capture ===\n');

// Create local server to capture callback
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
    
    if (code) {
      console.log('✅ Got authorization code!\n');
      res.end('<h1>Success!</h1><p>You can close this tab.</p>');
      server.close();
      exchangeCode(code);
      return;
    }
  }
  
  res.end('Waiting for OAuth callback...');
});

server.listen(PORT, () => {
  const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(SCOPES)}`;
  
  console.log('Server running on http://localhost:3000');
  console.log('\n👉 Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nWaiting for callback...\n');
});

function exchangeCode(code) {
  console.log('Exchanging code for tokens...\n');
  
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
      console.log('Status:', res.statusCode);
      
      try {
        const response = JSON.parse(data);
        
        if (response.error || !response.refresh_token) {
          console.error('\n❌ Error:', response.error || 'No token');
          if (response.error_description) console.error('Details:', response.error_description);
          process.exit(1);
        }

        console.log('\n✅ SUCCESS!\n');
        console.log('=== REFRESH TOKEN ===');
        console.log(response.refresh_token);
        console.log('=====================\n');
        
        writeFileSync('.oura_token', response.refresh_token);
        console.log('✅ Saved to .oura_token\n');
        console.log('NEXT: Update GitHub Secret OURA_REFRESH_TOKEN');
        console.log('At: https://github.com/rudrakshbhandari/mywebsite/settings/secrets/actions');
        
      } catch (e) {
        console.error('\n❌ Parse error:', e.message);
        console.log('Raw:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
  });

  req.write(params.toString());
  req.end();
}
