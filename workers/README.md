# Decap CMS OAuth Proxy (Cloudflare Worker)

This Worker provides GitHub OAuth for Decap CMS so `/notes-admin/` can authenticate in production without Netlify.

## Prerequisites

- Cloudflare account (you already use it for DNS)
- GitHub account with push access to `rudrakshbhandari/mywebsite`

## Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub OAuth Apps](https://github.com/settings/applications/new)
2. **Application name**: `Notes Admin` (or any name)
3. **Homepage URL**: `https://decap.rudrakshbhandari.com` (or your `*.workers.dev` URL)
4. **Authorization callback URL**: `https://decap.rudrakshbhandari.com/callback` (or `https://<worker-name>.<account>.workers.dev/callback`)
5. Save the **Client ID** and generate a **Client Secret**

### 2. Deploy the Worker

```bash
cd workers/decap-proxy
npm install
npx wrangler login   # authenticate to Cloudflare
npx wrangler secret put GITHUB_OAUTH_ID      # paste Client ID
npx wrangler secret put GITHUB_OAUTH_SECRET # paste Client Secret
npx wrangler deploy
```

**First-time setup**: If you see "register a workers.dev subdomain", go to [Cloudflare Workers onboarding](https://dash.cloudflare.com/workers/onboarding) and register a free `*.workers.dev` subdomain.

After deploy, note the URL (e.g. `https://decap-proxy.<account>.workers.dev`).

### 3. Optional: Custom Domain

To use `decap.rudrakshbhandari.com`:

1. In Cloudflare Dashboard → Workers & Pages → decap-proxy → Settings → Domains & Routes
2. Add custom domain: `decap.rudrakshbhandari.com`
3. Uncomment the `route` and `workers_dev` lines in `wrangler.toml`
4. Redeploy: `npx wrangler deploy`

### 4. Update Decap Config

Ensure `notes-admin/config.yml` has `base_url` pointing to your proxy:

- **Custom domain**: `https://decap.rudrakshbhandari.com` (after step 3)
- **workers.dev**: `https://decap-proxy.<your-subdomain>.workers.dev`

```yaml
backend:
  name: github
  repo: rudrakshbhandari/mywebsite
  branch: main
  base_url: https://decap.rudrakshbhandari.com # or your workers.dev URL
  auth_endpoint: /auth
```

## Custom Domain DNS

If you get `DNS_PROBE_FINISHED_NXDOMAIN` when opening `decap.rudrakshbhandari.com`, the DNS record is missing. Add it via one of these methods:

**Option A: Script (recommended)**

```bash
# Create a token at https://dash.cloudflare.com/profile/api-tokens
# Use template "Edit zone DNS" with Zone:DNS:Edit for rudrakshbhandari.com
export CLOUDFLARE_API_TOKEN=your_token
node scripts/add-decap-dns.mjs
```

**Option B: Dashboard**

1. Cloudflare Dashboard → **rudrakshbhandari.com** → **DNS** → **Records**
2. **Add record**: Type `CNAME`, Name `decap`, Target `rudrakshbhandari.com`, Proxy status **Proxied** (orange cloud)
3. Save

## Local Development

For local writing, use `npm run notes:admin` in the repo root. That runs the local proxy and bypasses this Worker.
