# Oura Ring Health Page Setup

This guide walks you through setting up the Oura Ring health metrics integration for your portfolio website.

## Overview

The health page (`/health`) displays selected daily metrics from your Oura Ring 4:

- Sleep Score
- Readiness Score
- Resting Heart Rate
- Heart Rate Variability (HRV)
- Steps
- Active Calories

Data is fetched every 5 minutes via GitHub Actions and stored as a public JSON file. No database required.

---

## Step 1: Create Oura Developer App

1. Go to [Oura Developer Portal](https://cloud.ouraring.com/docs/)
2. Log in with your Oura account
3. Navigate to **"OAuth2 Applications"** → **"Create New Application"**
4. Fill in the details:
   - **Application Name**: `Portfolio Health Display`
   - **Redirect URI**: `https://localhost:3000/callback` (any valid URL works for personal tokens)
   - **Description**: `Personal website health metrics display`
5. Click **"Create"**
6. Note down the **Client ID** and **Client Secret**

---

## Step 2: Obtain OAuth Refresh Token

Oura uses OAuth 2.0. You need a refresh token (long-lived, but can be rotated or revoked).

### Option A: Repository Script (Recommended)

Use the built-in helper script:

```bash
npm run oura:token
```

The script opens the browser flow, listens for the OAuth callback locally, and saves the refresh token to `.oura_token`.

### Option B: Quick CLI Method

Create a temporary Node.js script to get your refresh token:

```bash
# Save this as get_token.mjs and run with: node get_token.mjs

import https from 'https';
import readline from 'readline';

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/callback';

// Step 1: Print the authorization URL
const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=daily_readiness+daily_sleep+daily_activity`;

console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Log in and authorize the app');
console.log('3. You\'ll be redirected to localhost (will fail, that\'s OK)');
console.log('4. Copy the "code" parameter from the URL\n');

// Step 2: Exchange code for tokens
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code here: ', (code) => {
  const data = JSON.stringify({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    redirect_uri: REDIRECT_URI
  });

  const options = {
    hostname: 'api.ouraring.com',
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const response = JSON.parse(body);
      console.log('\n✅ SUCCESS!\n');
      console.log('Refresh Token (save this!):', response.refresh_token);
      console.log('\nThis token never expires. Keep it secret.\n');
      rl.close();
    });
  });

  req.write(data);
  req.end();
});
```

### Option C: Manual Browser Flow

1. Visit (replace `YOUR_CLIENT_ID`):
   ```
   https://cloud.ouraring.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&response_type=code&scope=daily_readiness+daily_sleep+daily_activity
   ```
2. Authorize the app
3. You'll be redirected to localhost (browser will show "can't connect") — this is expected
4. Copy the `code` parameter from the URL
5. Exchange it for tokens using curl or Postman:
   ```bash
   curl -X POST https://api.ouraring.com/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "grant_type": "authorization_code",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "code": "PASTE_CODE_HERE",
       "redirect_uri": "http://localhost:3000/callback"
     }'
   ```
6. Save the `refresh_token` from the response

---

## Step 3: Add GitHub Secrets

In your repository, add these secrets (Settings → Secrets and variables → Actions):

| Secret Name                | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `OURA_ACCESS_TOKEN`        | Optional long-lived access token                              |
| `OURA_CLIENT_ID`           | Your Oura app's Client ID                                     |
| `OURA_CLIENT_SECRET`       | Your Oura app's Client Secret                                 |
| `OURA_REFRESH_TOKEN`       | The refresh token from Step 2                                 |
| `OURA_SECRET_UPDATE_TOKEN` | Optional token to auto-rotate `OURA_REFRESH_TOKEN` in Actions |

**Security notes:**

- Secrets are never exposed in logs or to the client
- The refresh token allows the workflow to get short-lived access tokens automatically
- If compromised, revoke the token in the Oura developer portal

---

## Step 4: Test Locally (Optional)

You can test the script locally before committing:

```bash
# Set environment variables
export OURA_CLIENT_ID="your_client_id"
export OURA_CLIENT_SECRET="your_client_secret"
export OURA_REFRESH_TOKEN="your_refresh_token"

# Run the script
node scripts/fetch_oura_and_write_json.mjs

# Check the output
cat oura_public.json
```

---

## Step 5: Deploy

1. Push the branch to GitHub:

   ```bash
   git add .
   git commit -m "feat(health): add Oura Ring metrics page"
   git push origin feat/oura-health-page
   ```

2. Create a Pull Request to `main`

3. Merge the PR — GitHub Pages will auto-deploy via the Pages workflow

---

## Step 6: Manually Trigger Workflow

To test the GitHub Actions workflow immediately:

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Select **"Oura Health Data Update"** workflow
4. Click **"Run workflow"** → **"Run workflow"**
5. Wait ~30 seconds for completion

---

## Step 7: Verify Deployment

1. Visit `https://yourdomain.com/health`
2. Check that data loads (may show "No data" until first Oura sync)
3. Inspect `https://yourdomain.com/oura_public.json` to verify JSON structure
4. Check that the workflow runs successfully in GitHub Actions

---

## Troubleshooting

### Workflow fails with "Invalid refresh token"

- The refresh token may have been revoked
- Re-run the OAuth flow (Step 2) to get a new token
- Update the `OURA_REFRESH_TOKEN` secret
- Local runs may also fail if `.oura_token` is stale relative to GitHub secrets; `scripts/fetch_oura_and_write_json.mjs` now attempts browser reauthorization automatically and saves the refreshed token back to `.oura_token`

### Local run opens browser auth unexpectedly

- This usually means the local `.oura_token` is stale or revoked
- Complete the browser OAuth flow and let the script finish updating `.oura_token`
- Do not replace the dynamic localhost callback logic with a hardcoded port; the script intentionally uses a fresh loopback port per recovery attempt
- See `docs/OURA_AUTOMATION.md` before changing the auth flow

### "No data" showing on health page

- Normal for the first day — data appears after your first night's sleep with the ring
- Check the Oura app to confirm data exists for today
- Verify the workflow ran successfully (Actions tab)

### Data is stale / not updating

- Check the Actions tab for recent runs
- Look for "No changes detected" in the logs (means no new data from Oura)
- Confirm your ring is syncing with the Oura app

### Local rerun changed only `lastUpdatedIso`

- Treat this as a no-op unless other fields in `oura_public.json` changed
- Do not commit `.oura_no_change`
- Inspect the diff before opening a PR

### Rate limiting

- Oura API has generous limits (1000 requests/day)
- Current schedule uses ~96 runs/day × ~9 API calls ≈ 864 requests/day, still within limits

---

## Architecture Notes

### Privacy & Security

- ✅ Only aggregated daily scores are published
- ✅ No raw minute-level heart rate, sleep stages, or location data
- ✅ All metrics are rounded to integers
- ✅ Exact sleep start/end timestamps are excluded from the public JSON
- ✅ A downsampled intraday heart-rate series is published for visualization
- ✅ Secrets stored in GitHub Secrets (never in code)

### Cost Optimization

- ✅ Zero-cost: No database, no paid infrastructure
- ✅ GitHub Actions: ~7 seconds per run × 96 runs/day ≈ 672 sec/day (free for public repos)
- ✅ GitHub Pages + Cloudflare free tier: Static site, no paid infrastructure

### Data Freshness

- Updates run every 5 minutes (UTC)
- Cron: `*/5 * * * *`
- Client auto-refreshes every 5 minutes while page is open

---

## File Reference

| File                                    | Purpose                           |
| --------------------------------------- | --------------------------------- |
| `health/index.html`                     | Public health metrics page        |
| `oura_public.json`                      | Public data file (auto-generated) |
| `scripts/fetch_oura_and_write_json.mjs` | Data fetcher script               |
| `.github/workflows/oura-update.yml`     | GitHub Actions schedule           |
| `SETUP.md`                              | This file                         |

---

## Useful Links

- [Oura API Documentation](https://cloud.ouraring.com/docs/)
- [Oura OAuth Guide](https://cloud.ouraring.com/docs/authentication)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/)
