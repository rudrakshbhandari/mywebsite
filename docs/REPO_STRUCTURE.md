# Repository Structure

This repository is intentionally small and mostly static. Use this guide to keep changes in the right place and avoid piling unrelated files into the root.

## Core Site Files

- `index.html`: main portfolio page
- `health/index.html`: health dashboard page
- `notes/index.html`: notes landing page
- `css/styles.css`: shared site styles
- `js/`: shared client-side JavaScript
- `img/`: portfolio, project, and favicon assets

## Project Docs

- `README.md`: quick start, scripts, and high-level overview
- `docs/SETUP.md`: setup and local workflow notes
- `docs/DEPLOYMENT.md`: deployment notes
- `docs/INVESTIGATION-oura-revert-root-cause.md`: one-off investigation write-up
- `CHANGELOG.md`: user-facing release history

## Automation And Data

- `.github/workflows/`: CI, Pages deploy, and Oura refresh automation
- `scripts/`: Oura-related scripts and repository utilities
- `oura_public.json`: generated public health data consumed by `/health`

## Root-Level Files That Should Stay At Root

- `CNAME`, `robots.txt`, `sitemap.xml`, `.nojekyll`: hosting and SEO configuration
- `package.json`, `package-lock.json`: development tooling
- `.prettierrc`, `.prettierignore`, `.gitignore`: repository tooling
- `Rudraksh_Bhandari_Resume.pdf`: public resume download

## Cleanup Rules

- Do not commit local-only files such as `.env`, `.oura_token`, `.DS_Store`, `.vercel/`, `.playwright-cli/`, or `node_modules/`.
- Prefer adding internal notes to `docs/` instead of the repository root.
- Prefer adding automation or data helpers to `scripts/` instead of the repository root.
- Keep public-facing content edits tightly scoped, especially in `index.html`.
