# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project uses date-based releases.

## [Unreleased]

### Added

- Shared typography token layer (`css/tokens.css`) — a single source of truth for font families, weights, line-heights, and a rem-based type scale. Every page links it first, so type is defined once instead of redefined across five separate stylesheets.
- Separate `/notes/` page for personal writing, linked from the main navigation.
- Private `/notes-admin/` writing portal powered by Decap CMS.
- Markdown-backed notes pipeline that builds public notes data during GitHub Pages deploys.
- Health dashboard watchdog automation that alerts on failed Oura updates and stale public data.

### Changed

- Unified site typography onto the shared token layer: removed per-page font redefinitions, fixed case-studies reading copy (bullet points were sans while summaries were serif — both serif now), routed the Health/notes-admin dashboard pairing (Inter + Space Grotesk) through documented tokens, and converted px-locked base sizes to rem so they honor browser font-size settings. Dropped two unused web-font loads (Inter 300 on Health, Space Grotesk on notes-admin).
- Collapsed ~28 distinct font-size literals across styles.css, notes, and health onto the 9-step `--fs-*` token scale — eliminating the 0.7–0.92rem near-duplicate cluster (previously 8 visually-indistinguishable sizes) and mapping all body text, card copy, and UI labels to clear scale steps.
- Raised all sub-12px text to the `--fs-2xs` floor across main, work, and health pages: `.proj-card__badge` (0.65rem → 12px), tech tag spans (0.7rem → 12px), meta labels (0.68–0.72rem → 12px), and SVG chart axis/inline labels (10–11px → 12px). All text is now WCAG 2.1 SC 1.4.4 compliant.
- Swapped `/notes` body font from Libre Baskerville (a display serif) to Lora (purpose-built text serif optimised for screen reading at body sizes). Documented as `--font-reading` token in `css/tokens.css`. Display headings on the same page remain Plus Jakarta Sans.
- Updated documentation to match the current health pipeline behavior (15-minute workflow cadence, exposed downsampled heart-rate series, and token/secret guidance).
- Replaced Vercel hosting/analytics hooks with GitHub Pages deployment scaffolding plus Cloudflare and GA4 configuration.
- Removed the lingering Vercel custom-domain aliases and Git integration for `mywebsite` so production is unambiguously GitHub Pages + Cloudflare.

## [2026-05-20]

### Added

- Per-sample dots on the intraday Heart Rate Timeline so gaps in Oura's recording are visible. Long flat segments between two far-apart dots now read as "no data here," not as interpolated truth.

### Changed

- Heart Rate Timeline now shows a **rolling 24h window ending at the latest sample** instead of a PT calendar day. The latest data point anchors the right edge; the chart extends 24h to the left. At 3 PM PT that means last night's sleep + today's awake hours so far — always-full chart, no waiting for the day to fill in. Fetch pipeline filters samples to the same rolling window so the JSON payload matches the chart's range. All chart time labels render in Pacific time regardless of viewer timezone so axis labels match data positions.

### Fixed

- Heart Rate Timeline now covers the full day instead of just the first sleep window. The Oura `/heartrate` endpoint requires `start_datetime`/`end_datetime` (not `start_date`/`end_date` like the daily-summary endpoints) and paginates via `next_token`. The previous fetch passed date-only params (silently ignored) and didn't follow pagination, so we were only seeing the first page (~600 dense sleep samples) and never the daytime data.

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
