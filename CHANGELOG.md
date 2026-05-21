# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project uses date-based releases.

## [Unreleased]

### Added

- Separate `/notes/` page for personal writing, linked from the main navigation.
- Private `/notes-admin/` writing portal powered by Decap CMS.
- Markdown-backed notes pipeline that builds public notes data during GitHub Pages deploys.
- Health dashboard watchdog automation that alerts on failed Oura updates and stale public data.

### Changed

- Updated documentation to match the current health pipeline behavior (15-minute workflow cadence, exposed downsampled heart-rate series, and token/secret guidance).
- Replaced Vercel hosting/analytics hooks with GitHub Pages deployment scaffolding plus Cloudflare and GA4 configuration.
- Removed the lingering Vercel custom-domain aliases and Git integration for `mywebsite` so production is unambiguously GitHub Pages + Cloudflare.

## [2026-05-20]

### Added

- Per-sample dots on the intraday Heart Rate Timeline so gaps in Oura's recording are visible. Long flat segments between two far-apart dots now read as "no data here," not as interpolated truth.

### Changed

- Tightened NomNom and Outfitr project card copy to plainer descriptions; dropped the cute one-liners.
- Prettier line-wrap pass on `index.html` (no behavior change).

## [2026-02-27]

### Added

- Case Studies section to the portfolio homepage.
- CI workflow for formatting and JavaScript syntax checks.
- Lightweight analytics event instrumentation hooks.
- Security and cache headers in Vercel configuration.
- Responsive compressed hero/about image variants.

### Changed

- Moved health dashboard inline JavaScript into `js/health.js`.
- Tightened deployment policies with CSP and related security headers.
