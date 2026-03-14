# Notes Portal Setup

This repository now includes a private writing portal at `/notes-admin/` powered by Decap CMS and a content-driven public notes page at `/notes/`.

## Content Flow

1. Write or edit a note in `notes-admin/`
2. Decap CMS commits a Markdown file into `content/notes/`
3. GitHub Pages workflow builds `notes/notes-data.json` during deploy
4. The public `notes/index.html` page fetches that data and renders the updated note automatically

## Local Writing Setup

For local development, Decap CMS supports a local proxy backend.

1. Install dependencies:

   ```bash
   npm install
   ```

2. In one terminal, run the local CMS proxy:

   ```bash
   npm run notes:admin
   ```

3. In another terminal, build the public notes data whenever content changes:

   ```bash
   npm run notes:build
   ```

4. Serve the site locally with any static server and open:
   - `http://localhost:3000/notes/`
   - `http://localhost:3000/notes-admin/`

## Production Auth Setup

Decap's GitHub backend requires an authentication provider in production. This repo uses **decap-proxy** (a Cloudflare Worker) for GitHub OAuth.

### Quick Start

1. Create a [GitHub OAuth App](https://github.com/settings/applications/new) with callback `https://decap.rudrakshbhandari.com/callback` (or your Worker URL + `/callback`).
2. Deploy the OAuth proxy: see [`workers/README.md`](../workers/README.md).
3. Set `base_url` in `notes-admin/config.yml` to your proxy URL (default: `https://decap.rudrakshbhandari.com`).

For an options comparison, see [`docs/NOTES_PORTAL_AUTH_OPTIONS.md`](NOTES_PORTAL_AUTH_OPTIONS.md).

### References

- [Decap GitHub backend](https://decapcms.org/docs/github-backend/)
- [External OAuth clients](https://decapcms.org/docs/external-oauth-clients/)

## Content Model

Each note lives as one Markdown file in `content/notes/` with front matter:

```md
---
title: Example note
slug: example-note
date: 2026-03-13
tags:
  - AI
  - Philosophy
summary: One-sentence summary for cards and previews.
featured: false
published: true
---

Markdown body goes here.
```
