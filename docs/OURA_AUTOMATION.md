# Oura Automation Guardrails

This note exists to keep future maintenance work on the Oura health pipeline from re-breaking local auth or publishing noisy data updates.

## Mental Model

- `oura_public.json` is the public payload for `/health`; GitHub Actions publishes it to Cloudflare Workers KV instead of committing updates to Git. The same Worker serves `stats_public.json` and `github_contributions.json` for the other data driven site widgets.
- `.github/workflows/oura-update.yml` is the scheduled production path.
- `.github/workflows/health-dashboard-watchdog.yml` is the hourly freshness alert path and must fail when data is more than 12 hours old.
- `scripts/fetch_oura_and_write_json.mjs` is the single source of truth for local and CI fetch behavior.
- CI and local runs intentionally behave differently when auth breaks.

## Auth Model

- Local runs read Oura credentials from `.env` plus `.oura_token` unless `OURA_ACCESS_TOKEN` or `OURA_REFRESH_TOKEN` is explicitly set in the environment.
- GitHub Actions reads `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_REFRESH_TOKEN`, and optional `OURA_ACCESS_TOKEN` from repo secrets.
- Scheduled runs prefer a cached `OURA_ACCESS_TOKEN` and only refresh (rotating `OURA_REFRESH_TOKEN`) when that access token is missing or returns 401. This avoids rotating the refresh token every 15 minutes.
- After a refresh, CI must persist both `OURA_REFRESH_TOKEN` and `OURA_ACCESS_TOKEN`. Oura refresh tokens are rotated on use — if secret update fails after refresh, the old secret is permanently dead until manual reauth.
- CI retries secret updates aggressively (~15 minutes) because GitHub Secrets can return transient 503s.
- Local `.oura_token` does not magically sync with GitHub secrets, so it can become stale over time.

## Publishing health data

The scheduled workflows compare each generated payload with its current Worker endpoint and write to KV only when data changes. They do not create Git commits or PRs. The `oura-health-data` KV namespace and repository variable `OURA_KV_NAMESPACE_ID` are configured. The Worker serves `/oura_public.json`, `/stats_public.json`, and `/github_contributions.json` as read-only JSON and permits browser requests from the portfolio domains. Repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` provide deployment and write access.

**Do not use `secrets` in step `if:`** in Actions YAML — GitHub rejects the workflow (schedule and `workflow_dispatch` stop entirely). Use `env:` with an expression and check in the shell instead.

## Current Recovery Behavior

- If a local refresh token is stale, `scripts/fetch_oura_and_write_json.mjs` now starts a browser OAuth recovery flow automatically.
- The browser recovery flow uses the registered local callback `http://localhost:3000/callback` by default. Override with `OURA_OAUTH_REDIRECT_URI` or `OURA_OAUTH_CALLBACK_PORT` only if the Oura app registration changes.
- After successful browser auth, the new refresh token is saved back to `.oura_token`.
- CI does **not** use this fallback. In GitHub Actions, auth failures should still fail loudly so the workflow alerting remains trustworthy.

## Alerting Model

- The health dashboard freshness threshold is 12 hours.
- The watchdog opens or updates the `Health dashboard automation alert` issue when data is stale.
- After writing the issue, the watchdog fails the workflow so GitHub Actions failure notifications are a second alert path.

## Agent Rules

- Do not remove the local browser reauth fallback unless the replacement is equally automatic and fully verified.
- Do not make CI silently preserve stale data on auth failure. Production automation must fail loudly.
- Do not switch local browser reauth back to a random callback port unless the Oura app is registered for that exact redirect URI; Oura rejects unregistered callback ports before approval.
- Do not commit `.oura_token`, `.env`, or rotated token artifacts.
- Prefer updating `scripts/fetch_oura_and_write_json.mjs` over creating parallel auth logic in new scripts.

## Safe Local Workflow

1. Load local env vars.
2. Run `node scripts/fetch_oura_and_write_json.mjs`.
3. If browser auth opens, complete it and let the script update `.oura_token`.
4. Check whether `oura_public.json` meaningfully changed before publishing.

Example:

```bash
set -a && source .env && set +a
node scripts/fetch_oura_and_write_json.mjs
git diff -- oura_public.json
```

## Noise To Avoid

- The fetch script may write `.oura_no_change` for local no-op runs. Treat it as temporary and do not commit it.
- A rerun can update only `lastUpdatedIso` in `oura_public.json` even when the health payload is otherwise unchanged. The publisher ignores that field and skips unchanged payloads.
- If the run reports `No changes detected in data`, the scheduled workflow compares with KV and skips the write when the public payload is unchanged.

## HR Timeline Notes

- The public HR chart is intentionally capped, but the cap is now `1440` points, not `96`.
- HR points are filtered to the primary `dataDay` in Pacific time before being written to `oura_public.json`.
- Hover on `/health` uses the same stored `heartRateSeries` points that are written into the JSON.

## When Something Breaks

Check these in order:

1. Run `set -a && source .env && set +a && node scripts/fetch_oura_and_write_json.mjs`.
2. If local auth fails, confirm the script attempted browser reauth before changing code.
3. If CI fails but local works, inspect GitHub secrets and `.github/workflows/oura-update.yml`.
4. If the only diff is `lastUpdatedIso`, do not treat it as a real data update.
5. If the HR chart looks sparse, inspect `heartRateSeries.length` in `oura_public.json` before changing chart code.

## Related Files

- `scripts/fetch_oura_and_write_json.mjs`
- `scripts/get-oura-token.mjs`
- `.github/workflows/oura-update.yml`
- `docs/SETUP.md`
