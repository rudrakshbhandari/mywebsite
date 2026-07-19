#!/usr/bin/env node
/**
 * Fetch GitHub contribution calendar for a calendar year and write
 * github_contributions.json for the portfolio contribution graph.
 *
 * Uses the public github-contributions-api (no auth required).
 * Zero external deps — Node.js built-ins only.
 *
 * Usage:
 *   node scripts/fetch_github_contributions.mjs
 *   YEAR=2026 GITHUB_USERNAME=rudrakshbhandari node scripts/fetch_github_contributions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import https from 'node:https';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'rudrakshbhandari';
const YEAR = Number(process.env.YEAR || new Date().getUTCFullYear());
const OUTPUT_PATH = resolve(process.cwd(), 'github_contributions.json');
const API_HOST = 'github-contributions-api.jogruber.de';

function httpsGetJson(path) {
  return new Promise((resolvePromise, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path,
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'rudraksh-portfolio' },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolvePromise(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function materialPayloadChanged(prev, next) {
  if (!prev) return true;
  if (prev.total !== next.total) return true;
  if (!Array.isArray(prev.contributions) || prev.contributions.length !== next.contributions.length) {
    return true;
  }
  for (let i = 0; i < next.contributions.length; i++) {
    const a = prev.contributions[i];
    const b = next.contributions[i];
    if (
      !a ||
      a.date !== b.date ||
      a.count !== b.count ||
      a.level !== b.level ||
      Boolean(a.future) !== Boolean(b.future)
    ) {
      return true;
    }
  }
  return false;
}

async function main() {
  const data = await httpsGetJson(`/v4/${encodeURIComponent(GITHUB_USERNAME)}?y=${YEAR}`);
  const yearKey = String(YEAR);
  const today = todayUtcDate();
  const contributions = (data.contributions || []).map(({ date, count, level }) => {
    // Keep full-year calendar shape, but mark dates after today so the UI
    // does not claim "No contributions" on days that have not happened yet.
    if (date > today) {
      return { date, count: 0, level: 0, future: true };
    }
    return { date, count, level };
  });
  const total =
    data.total?.[yearKey] ??
    contributions.reduce((sum, day) => sum + (day.future ? 0 : day.count || 0), 0);

  const payload = {
    username: GITHUB_USERNAME,
    year: YEAR,
    total,
    lastUpdatedIso: new Date().toISOString(),
    source: API_HOST,
    contributions,
  };

  let previous = null;
  if (existsSync(OUTPUT_PATH)) {
    try {
      previous = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    } catch {
      previous = null;
    }
  }

  if (!materialPayloadChanged(previous, payload)) {
    console.log(`No material changes to github_contributions.json for ${YEAR}; skipping write.`);
    writeFileSync(resolve(process.cwd(), '.github_contributions_no_change'), '');
    return;
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(
    `Wrote ${OUTPUT_PATH}: ${total.toLocaleString('en-US')} contributions in ${YEAR} (${contributions.length} days).`
  );
}

main().catch(err => {
  console.error('fetch_github_contributions failed:', err);
  process.exit(1);
});
