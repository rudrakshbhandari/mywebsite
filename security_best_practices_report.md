# Security Best Practices Report

## Executive Summary

This repository is a mostly static public portfolio with a client-side health dashboard and several local/CI Oura OAuth helper scripts. The highest-risk issues are in the OAuth tooling and in the amount of health telemetry deliberately published to a public JSON file. I found 3 actionable findings and 1 lower-severity hygiene issue.

## High Severity

### SBP-001: OAuth callback handlers do not validate `state`

- Severity: High
- Location:
  - [scripts/get-oura-token.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/get-oura-token.mjs#L31)
  - [scripts/get-oura-token.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/get-oura-token.mjs#L66)
  - [scripts/oauth-server.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/oauth-server.mjs#L26)
  - [get-token-final.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/get-token-final.mjs#L27)

- Evidence:

```js
state: `oura_${Date.now()}`,
```

```js
const code = url.searchParams.get('code');
// no state verification before exchanging the code
```

- Impact: A local attacker, malicious browser extension, or malicious page able to hit `http://localhost:3000/callback` can inject or race an OAuth response and cause the script to exchange an attacker-controlled authorization code. In practice that can bind the workflow to the wrong Oura account or overwrite the locally stored refresh token.
- Fix: Generate a cryptographically random `state`, persist it in memory for the lifetime of the script, and reject any callback whose `state` does not match exactly before exchanging the code.
- Mitigation: Prefer PKCE in addition to `state` if Oura supports it. If not, still enforce `state`, bind the listener to `127.0.0.1`, and stop logging partial auth codes.
- False positive notes: This is local-only tooling, so exploitability is lower than a public web callback. It is still a real OAuth CSRF/mix-up weakness.

## Medium Severity

### SBP-002: The public site publishes highly sensitive health telemetry with precise timestamps

- Severity: Medium
- Location:
  - [scripts/fetch_oura_and_write_json.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/fetch_oura_and_write_json.mjs#L626)
  - [scripts/fetch_oura_and_write_json.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/fetch_oura_and_write_json.mjs#L735)
  - [oura_public.json](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/oura_public.json#L21)
  - [oura_public.json](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/oura_public.json#L160)

- Evidence:

```js
bedtimeStart: sleepPeriod?.bedtime_start || null,
bedtimeEnd: sleepPeriod?.bedtime_end || null,
heartRateSeries: heartRateSeries.map(point => ({ t: point.timestamp, bpm: point.bpm })),
```

- Impact: The repo and deployed site expose sleeping hours, intraday heart-rate patterns, workout counts, and related biometrics in a machine-readable public file. That makes it trivial to profile daily routines and health patterns over time, which is a privacy and personal-safety risk for a public personal website.
- Fix: Publish only coarse aggregates unless precise telemetry is intentionally public. For example: remove `bedtimeStart`/`bedtimeEnd`, avoid timestamped heart-rate series, round metrics to daily summaries, and strip fields not needed by the UI.
- Mitigation: If the detailed feed is intentional, document that decision explicitly and move the raw data behind authenticated access or generate a separate privacy-preserving public projection for the website.
- False positive notes: This may be a conscious product choice, but from a security/privacy audit standpoint it is still sensitive-data exposure.

### SBP-003: Third-party scripts/styles are loaded from CDNs without SRI, and no CSP is enforced in repo-visible deployment code

- Severity: Medium
- Location:
  - [index.html](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/index.html#L55)
  - [index.html](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/index.html#L943)
  - [health/index.html](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/health/index.html#L37)
  - [pages.yml](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/.github/workflows/pages.yml#L33)

- Evidence:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```

The Pages deployment workflow only copies static files into `_site`; there is no repo-visible header configuration or meta CSP:

```yaml
rsync -av \
  --delete \
  ...
  ./ _site/
```

- Impact: If a CDN asset is compromised or replaced in transit by a trusted-but-breached provider path, the site executes arbitrary JavaScript with first-party origin privileges. Without a visible CSP, there is also little defense-in-depth against XSS or third-party script compromise.
- Fix: Self-host critical assets where practical. Otherwise add SRI hashes and `crossorigin` for CDN assets. Also enforce a CSP at the CDN/edge layer or with an early meta tag if header control is unavailable.
- Mitigation: Runtime verification is needed here because headers may be injected outside the repo. Confirm the live site returns a real `Content-Security-Policy` header and not just documentation.
- False positive notes: I did not inspect live response headers, only the repository. If Cloudflare injects CSP at the edge, that part of the finding may be partially mitigated.

## Low Severity

### SBP-004: Legacy helper script bakes in an auth code and loads secrets from `.env` manually

- Severity: Low
- Location:
  - [scripts/exchange-code.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/exchange-code.mjs#L9)
  - [scripts/exchange-code.mjs](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/scripts/exchange-code.mjs#L12)

- Evidence:

```js
const CODE = '9AbRihk99lhhE4VbgqlfrNHGdLtgnJUE';
const envContent = readFileSync('.env', 'utf-8');
```

- Impact: This script normalizes unsafe secret-handling practices and creates a path for accidental disclosure if someone copies it forward or commits a real `.env`. The hard-coded auth code is likely expired, but keeping it in a public repo is still poor security hygiene.
- Fix: Remove the script or rewrite it to consume environment variables only, without any checked-in OAuth code or manual `.env` parsing.
- Mitigation: Consolidate on the maintained `scripts/get-oura-token.mjs` flow and delete obsolete helpers to reduce attack surface and confusion.
- False positive notes: The embedded code may already be invalid. The issue is operational hygiene, not a confirmed active credential leak.

## Notes

- I did not find any committed `.env` or `.oura_token` file. The repo-level ignore rules cover both:
  - [.gitignore](/Users/rudrakshbhandari/.codex/worktrees/da15/mywebsite/.gitignore#L9)
- I did not find any npm dependency vulnerabilities from `npm audit --omit=dev` in the current lockfile.

## Recommended Next Steps

1. Fix OAuth `state` validation in all callback-based token scripts first.
2. Decide whether the detailed Oura dataset is intentionally public. If not, reduce the schema before the next publish.
3. Add SRI for CDN assets and verify a real CSP is present on the deployed site.
4. Delete or rewrite obsolete OAuth helper scripts.
