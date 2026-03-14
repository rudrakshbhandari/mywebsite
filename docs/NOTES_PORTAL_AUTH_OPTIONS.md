# Notes Portal Auth Options Comparison

Decap CMS's GitHub backend requires a server for OAuth. Since this site is hosted on **GitHub Pages** (not Netlify), you must provide an external auth flow. Below is a comparison of the main options.

## Current Hosting

- **Site**: GitHub Pages (via Actions)
- **DNS / CDN**: Cloudflare
- **Domain**: rudrakshbhandari.com

---

## Option 1: Netlify Identity + Git Gateway

| Aspect | Details |
|--------|---------|
| **How it works** | Netlify hosts the OAuth flow and Git Gateway proxies Git operations. |
| **Hosting requirement** | Netlify (or Netlify-hosted site). |
| **Fit for this repo** | ❌ Poor. Site is on GitHub Pages. Would require either migrating to Netlify or running a separate Netlify site just for auth. |
| **Pros** | Official, well-supported, zero config if already on Netlify. |
| **Cons** | Adds Netlify as a dependency; migration or dual-hosting complexity. |
| **Effort** | Medium–high (hosting change or extra setup). |

---

## Option 2: decap-proxy (Cloudflare Worker)

| Aspect | Details |
|--------|---------|
| **How it works** | Standalone Cloudflare Worker acts as GitHub OAuth proxy. Decap CMS points `base_url` and `auth_endpoint` at the Worker. |
| **Hosting requirement** | Cloudflare Workers (free tier sufficient). |
| **Fit for this repo** | ✅ **Best fit.** You already use Cloudflare. No hosting migration. Worker runs independently. |
| **Pros** | Uses existing Cloudflare account; no new platform; custom domain (e.g. `decap.rudrakshbhandari.com`) or `*.workers.dev`; clear docs. |
| **Cons** | One-time setup: GitHub OAuth App, Worker deploy, secrets. |
| **Effort** | Low–medium. |
| **Repo** | [sterlingwes/decap-proxy](https://github.com/sterlingwes/decap-proxy) |

---

## Option 3: netlify-cms-cloudflare-pages (Cloudflare Pages Functions)

| Aspect | Details |
|--------|---------|
| **How it works** | Cloudflare Pages Functions (serverless) provide OAuth endpoints. |
| **Hosting requirement** | **Cloudflare Pages** (not Workers, not GitHub Pages). |
| **Fit for this repo** | ❌ Poor. Site is on GitHub Pages. Would require migrating to Cloudflare Pages. |
| **Pros** | OAuth lives on the same domain as the site; no separate subdomain. |
| **Cons** | Requires moving from GitHub Pages to Cloudflare Pages. |
| **Effort** | High (hosting migration). |
| **Repo** | [i40west/netlify-cms-cloudflare-pages](https://github.com/i40west/netlify-cms-cloudflare-pages) |

---

## Option 4: Other Self-Hosted OAuth Proxies

| Aspect | Details |
|--------|---------|
| **Examples** | Vercel Serverless, AWS Lambda, Firebase, Google Cloud Functions, etc. |
| **Fit for this repo** | ⚠️ Viable but adds a new platform. |
| **Pros** | Many choices; some free tiers. |
| **Cons** | New accounts, env vars, deploy pipelines. |
| **Effort** | Medium. |

---

## Recommendation

**Use decap-proxy (Option 2).** It aligns with your existing Cloudflare setup, keeps GitHub Pages as the host, and requires only a Worker deploy plus a GitHub OAuth App.

Implementation steps:

1. Create a GitHub OAuth App (callback: `https://<proxy-domain>/callback`).
2. Clone and deploy decap-proxy to a Cloudflare Worker.
3. Add `base_url` and `auth_endpoint` to `notes-admin/config.yml`.
4. Remove or keep `local_backend: true` for local dev (Decap uses proxy in production, local backend when `npm run notes:admin` is running).
