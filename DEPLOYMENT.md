# Deployment Migration Notes

## GitHub Pages

1. In GitHub repository settings, set **Pages** to use **GitHub Actions**.
2. Keep [`CNAME`](CNAME) committed so the custom domain stays attached to the Pages deployment.
3. Production deploys run from `.github/workflows/pages.yml` whenever `main` changes.

## Analytics Configuration

Set the production values in [`js/config.js`](js/config.js):

- `ga4MeasurementId`: your GA4 Measurement ID (`G-...`)
- `cloudflareAnalyticsToken`: your Cloudflare Web Analytics token

If either value is blank, that provider stays disabled.

## Cloudflare DNS and Rules

Keep the domain at GoDaddy and point the authoritative nameservers to Cloudflare.

Create these Cloudflare rules after cutover:

1. URL Rewrite Rule
   - If hostname is `rudrakshbhandari.com` and path equals `/health`
   - Rewrite path to `/health/`

2. Response Header Transform Rules
   - `Content-Security-Policy`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

3. Cache Rules
   - HTML and `oura_public.json`: bypass long cache / revalidate
   - CSS and JS: short cache
   - images and icons: long immutable cache

Use a CSP based on the current asset set:

```text
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com;
font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com;
img-src 'self' data: https:;
connect-src 'self' https://cloudflareinsights.com https://www.google-analytics.com https://region1.google-analytics.com;
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests
```

## Validation

- `https://rudrakshbhandari.com/` returns `200`
- `https://rudrakshbhandari.com/health` returns `200`
- `https://rudrakshbhandari.com/health/` returns `200`
- `https://rudrakshbhandari.com/oura_public.json` returns `200`
- Cloudflare Web Analytics shows page traffic
- GA4 Realtime shows portfolio and health events
