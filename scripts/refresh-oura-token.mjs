#!/usr/bin/env node
/**
 * Refresh an existing Oura refresh token and save rotation result.
 * Usage:
 *   OURA_CLIENT_ID=... OURA_CLIENT_SECRET=... OURA_REFRESH_TOKEN=... node scripts/refresh-oura-token.mjs
 */

import https from 'https';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const ENV_REFRESH_TOKEN = process.env.OURA_REFRESH_TOKEN?.trim();

if (!CLIENT_ID || !CLIENT_SECRET || !loadRefreshToken()) {
  console.error('Missing required credentials.');
  console.error('Provide OURA_CLIENT_ID, OURA_CLIENT_SECRET, and OURA_REFRESH_TOKEN (or .oura_token).');
  process.exit(1);
}

function loadRefreshToken() {
  if (ENV_REFRESH_TOKEN) {
    return ENV_REFRESH_TOKEN;
  }
  if (!existsSync('.oura_token')) {
    return null;
  }
  return readFileSync('.oura_token', 'utf-8').trim() || null;
}

async function refreshToken() {
  const refreshTokenValue = loadRefreshToken();
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const req = https.request(
    'https://api.ouraring.com/oauth/token',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode < 200 || res.statusCode >= 300 || !parsed.access_token) {
            console.error(`Refresh failed (${res.statusCode}):`, parsed.error_description || parsed.error || parsed.title || body);
            process.exit(1);
          }

          if (parsed.refresh_token && parsed.refresh_token !== refreshTokenValue) {
            writeFileSync('.oura_token', parsed.refresh_token);
            console.log('Refresh token rotated. Saved new token to .oura_token');
          } else {
            console.log('Refresh token did not rotate.');
          }
          console.log('Access token refresh succeeded.');
        } catch {
          console.error('Invalid response from token endpoint:', body);
          process.exit(1);
        }
      });
    }
  );

  req.on('error', (error) => {
    console.error('Request failed:', error.message);
    process.exit(1);
  });

  req.write(params.toString());
  req.end();
}

refreshToken();
