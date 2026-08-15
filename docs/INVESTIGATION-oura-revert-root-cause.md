# Root Cause Investigation: Oura Updates & Perceived Content Reversion

**Date:** 2026-03-08  
**Issue:** Amazon return content and navbar changes appear "reverted" after Oura Ring autoscheduled health commits. Production (rudrakshbhandari.com) shows older content than expected.

> Historical note: this investigation predates the GitHub Pages migration. Current production runs through GitHub Pages behind Cloudflare, so the Vercel-specific sections below are retained only as historical context and no longer describe the active deploy path.

---

## Executive Summary

**The Oura workflow does NOT revert or modify content outside `oura_public.json`.** It only commits health data. The perceived "reversion" is explained by one of:

1. **Deployment/cache lag** – Production may be serving an older deployment
2. **Merge/deploy timing** – Content merged but not yet deployed when observed
3. **Vercel configuration** – Production branch or build settings

---

## 1. Oura Workflow Behavior (Verified)

**File:** `.github/workflows/oura-update.yml`

- **Trigger:** Every 5 minutes (`*/5 * * * *`) + manual
- **Checkout:** `actions/checkout@v4` — no `ref`, so uses default branch `main`
- **Modifies:** Only `scripts/fetch_oura_and_write_json.mjs` output
- **Commits:** Only `oura_public.json`
- **Push:** `git push` (no force)

```yaml
git add oura_public.json
git commit -m "feat(health): update Oura Ring metrics [$(date -u +%Y-%m-%d)]"
git push
```

**Conclusion:** The workflow cannot touch `index.html`, navbar, or any non-health files. It only appends commits to `main` with changes limited to `oura_public.json`.

---

## 2. Git History (origin/main)

```
16aad15 feat(health): update Oura Ring metrics [2026-03-08]  ← current tip
5b8626d feat(health): update Oura Ring metrics [2026-03-08]
81d5fc5 feat(health): update Oura Ring metrics [2026-03-08]
030ce1e feat(health): update Oura Ring metrics [2026-03-08]
b7a1710 feat(content): restore Amazon return and 2x SDE updates (#75)  ← MERGED
2ae00b8 feat(health): update Oura Ring metrics [2026-03-08]
...
```

- PR #75 (Amazon return) was merged as `b7a1710`
- Four Oura commits (`030ce1e` → `16aad15`) were pushed afterward
- Each Oura commit has the previous commit (including `b7a1710`) as parent, so the content from the merge is retained

**Verification:** `git show origin/main:index.html` includes:

- "Returning to AWS Hyperplane Summer 2026"
- "2x Software Development Engineer Intern"
- Updated currently card

---

## 3. Live Site vs. main

**Live site (rudrakshbhandari.com):**

- "SWE opportunities for Summer 2026" (older)
- "former Software Development Engineer Intern"
- No Amazon return offer in the currently section

**origin/main (16aad15):**

- "Returning to AWS Hyperplane Summer 2026"
- "2x Software Development Engineer Intern"
- Amazon return content present

So the live site is serving content from an older state than `main`.

---

## 4. Root Cause: Deployment / Cache, Not Oura

### A. Oura workflow is not reverting content

- It only stages and commits `oura_public.json`
- It does not use force push
- History shows Oura commits are built on top of the merge, not before it
- It does not run Prettier or other formatters on `index.html`

### B. Why production looks reverted

1. **Vercel production is on an older deployment**
   - From your screenshot, Production Current was at `2ae00b8` (before the merge)
   - If production is still tied to `2ae00b8` or another pre-merge deploy, it will show old content

2. **Build/deploy failures**
   - Builds for `b7a1710`, `030ce1e`, etc., could have failed
   - Production would stay on the last successful deployment

3. **Caching**
   - HTML uses `Cache-Control: public, max-age=0, must-revalidate`
   - CDN or browser cache might still serve old HTML
   - JS/CSS have `max-age=3600` (vercel.json), which could delay UI updates

4. **Navbar behavior**
   - The Oura workflow does not touch the navbar
   - Navbar changes (e.g., `style/navbar-logo-spacing`) live in separate merges
   - If production is on an older commit, it will show the old navbar as well

---

## 5. Recommended Actions

1. **Check Vercel deployments**
   - In Vercel → Project → Deployments
   - Confirm which commit is marked as "Production"
   - If it’s `2ae00b8` or earlier, the merge may never have gone live

2. **Trigger a production redeploy**
   - Vercel → Latest deployment → ⋮ → Promote to Production
   - Or push an empty commit to `main` to trigger a fresh deploy:
     ```bash
     git commit --allow-empty -m "chore: trigger production redeploy"
     git push origin main
     ```

3. **Hard refresh / test in incognito**
   - Ensure you’re not seeing cached HTML (Ctrl+Shift+R or Cmd+Shift+R)

4. **Reduce Oura noise (optional)**
   - Oura runs every 5 minutes and often yields no meaningful changes
   - Consider changing the cron to `*/15` or `*/30` to cut down on commits and deploy churn while keeping data fresh

---

## 6. Summary

| Claim                          | Finding                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| "Oura update reverted content" | Incorrect – Oura only changes `oura_public.json`                     |
| "Oura changed navbar"          | Incorrect – Oura never touches navbar or other HTML/CSS              |
| "Production shows old content" | Confirmed – live site does not match current `main`                  |
| Root cause                     | Deployment/cache; production likely on an older deployment or cached |
| Repo state                     | `main` has Amazon return + 2x SDE content as expected                |
