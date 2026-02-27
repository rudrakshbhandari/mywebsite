#!/usr/bin/env node
/**
 * Get Oura OAuth refresh token (form-encoded flow).
 * Usage:
 *   OURA_CLIENT_ID=... OURA_CLIENT_SECRET=... node scripts/get-oura-token.mjs
 */

import https from 'https';
import http from 'http';
import { writeFileSync } from 'fs';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const OAUTH_AUTHORIZE_ENDPOINT = 'https://cloud.ouraring.com/oauth/authorize';
const OAUTH_TOKEN_ENDPOINT = 'https://api.ouraring.com/oauth/token';
const SCOPES = ['daily', 'heartrate', 'spo2Daily', 'workout', 'personal', 'email', 'session', 'stress'];

function ensureCredentials() {
  const clientId = process.env.OURA_CLIENT_ID?.trim();
  const clientSecret = process.env.OURA_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.error('Missing credentials.');
    console.error('Set OURA_CLIENT_ID and OURA_CLIENT_SECRET before running this script.');
    process.exit(1);
  }

  return { clientId, clientSecret };
}

function buildAuthorizationUrl(clientId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state: `oura_${Date.now()}`,
  });
  return `${OAUTH_AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  return import('child_process').then(({ exec }) => {
    exec(cmd, error => {
      if (error) {
        console.log('Could not auto-open browser. Open this URL manually:');
        console.log(url);
      }
    });
  });
}

function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Authorization failed: ${error}`);
        server.close();
        reject(new Error(`OAuth authorize error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Authorization successful. You can close this tab.');
      server.close();
      resolve(code);
    });

    server.listen(PORT, () => {
      console.log(`Listening for OAuth callback on ${REDIRECT_URI}`);
    });

    server.on('error', error => reject(error));
  });
}

function exchangeCodeForTokens(clientId, clientSecret, code) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    });

    const req = https.request(
      OAUTH_TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode < 200 || res.statusCode >= 300 || !parsed.refresh_token) {
              const msg = parsed.error_description || parsed.error || parsed.title || body;
              reject(new Error(`Token exchange failed (${res.statusCode}): ${msg}`));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Invalid token response: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

async function main() {
  const { clientId, clientSecret } = ensureCredentials();
  const authUrl = buildAuthorizationUrl(clientId);

  console.log('Open authorization URL and approve access:');
  console.log(authUrl);
  await openBrowser(authUrl);

  const code = await startCallbackServer();
  const tokens = await exchangeCodeForTokens(clientId, clientSecret, code);

  writeFileSync('.oura_token', tokens.refresh_token);
  console.log('\nNew refresh token saved to .oura_token');
  console.log('Update your GitHub Action secret OURA_REFRESH_TOKEN with this value.');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
