#!/usr/bin/env node
/**
 * Oura OAuth Token Helper
 * Interactive script to obtain refresh token for GitHub Actions
 * Usage: node scripts/get-oura-token.mjs
 */

import https from 'https';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(`${colors.cyan}${question}${colors.reset} `);
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

/**
 * Make HTTPS request
 */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Start local server to catch OAuth callback
 */
function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      // Send response to browser
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Oura Authorization</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #0f172a;
              color: #f1f5f9;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .success { color: #4ade80; }
            .error { color: #f87171; }
            h1 { font-size: 2rem; margin-bottom: 1rem; }
            p { color: #94a3b8; font-size: 1.125rem; }
            .code {
              background: #1e293b;
              padding: 1rem 2rem;
              border-radius: 0.5rem;
              font-family: monospace;
              font-size: 1.25rem;
              margin: 1rem 0;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${code ? `
              <h1 class="success">✅ Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <div class="code">${code}</div>
            ` : error ? `
              <h1 class="error">❌ Authorization Failed</h1>
              <p>Error: ${error}</p>
            ` : `
              <h1>Processing...</h1>
            `}
          </div>
        </body>
        </html>
      `);

      if (code) {
        server.close();
        resolve(code);
      } else if (error) {
        server.close();
        reject(new Error(`OAuth error: ${error}`));
      }
    });

    server.listen(PORT, () => {
      log(`\n🚀 Server listening on http://localhost:${PORT}`, 'green');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is already in use. Try: lsof -ti:${PORT} | xargs kill`));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Open browser (cross-platform)
 */
async function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${url}"` :
              platform === 'win32' ? `start "" "${url}"` :
              `xdg-open "${url}"`;
  
  try {
    await execAsync(cmd);
  } catch (e) {
    log(`\n⚠️  Could not open browser automatically. Please visit:`, 'yellow');
    log(url, 'cyan');
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: REDIRECT_URI,
  });

  return httpsRequest(
    'https://api.ouraring.com/oauth/token',
    { method: 'POST' },
    params.toString()
  );
}

/**
 * Main flow
 */
async function main() {
  log('\n═══════════════════════════════════════════', 'cyan');
  log('       🔗 Oura OAuth Token Helper', 'bright');
  log('═══════════════════════════════════════════\n', 'cyan');

  // Step 1: Get credentials
  log('Step 1: Enter your Oura app credentials', 'yellow');
  log('(Find these at https://cloud.ouraring.com/oauth/applications)\n');
  
  const clientId = await prompt('Client ID:');
  const clientSecret = await prompt('Client Secret:');

  if (!clientId || !clientSecret) {
    log('\n❌ Error: Both Client ID and Client Secret are required', 'red');
    process.exit(1);
  }

  // Step 2: Build auth URL and start server
  log('\n───────────────────────────────────────────', 'cyan');
  log('Step 2: Starting local server and opening browser...', 'yellow');
  log('───────────────────────────────────────────\n', 'cyan');

  const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${encodeURIComponent('daily')}&` +
    `state=portfolio_${Date.now()}`;

  // Start server (waits for callback)
  const codePromise = startCallbackServer();
  
  // Open browser
  await openBrowser(authUrl);

  log('\n⏳ Waiting for you to authorize in the browser...', 'yellow');
  log('(The browser will redirect to localhost:3000 when done)\n');

  // Wait for the callback
  let code;
  try {
    code = await codePromise;
    log(`\n✅ Got authorization code!`, 'green');
  } catch (error) {
    log(`\n❌ Authorization failed: ${error.message}`, 'red');
    process.exit(1);
  }

  // Step 3: Exchange for tokens
  log('\n───────────────────────────────────────────', 'cyan');
  log('Step 3: Exchanging code for refresh token...', 'yellow');
  log('───────────────────────────────────────────\n', 'cyan');

  try {
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);

    if (!tokens.refresh_token) {
      throw new Error('No refresh_token in response. Got: ' + JSON.stringify(tokens));
    }

    // Success!
    log('\n═══════════════════════════════════════════', 'green');
    log('       ✅ SUCCESS!', 'bright');
    log('═══════════════════════════════════════════\n', 'green');

    log('📋 REFRESH TOKEN (save this for GitHub Secrets):', 'yellow');
    log('───────────────────────────────────────────', 'cyan');
    log(tokens.refresh_token, 'bright');
    log('───────────────────────────────────────────\n', 'cyan');

    log('Next steps:', 'yellow');
    log('1. Copy the refresh token above', 'reset');
    log('2. Go to https://github.com/rudrakshbhandari/mywebsite/settings/secrets/actions', 'reset');
    log('3. Add these 3 secrets:', 'reset');
    log('   - OURA_CLIENT_ID: ' + clientId, 'cyan');
    log('   - OURA_CLIENT_SECRET: ' + clientSecret, 'cyan');
    log('   - OURA_REFRESH_TOKEN: ' + tokens.refresh_token, 'cyan');
    log('\n4. Merge the PR and your health page will be live!\n', 'green');

    process.exit(0);
  } catch (error) {
    log(`\n❌ Token exchange failed: ${error.message}`, 'red');
    log('\nFull error:', 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
