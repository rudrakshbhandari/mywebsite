#!/usr/bin/env node
/** Compare a generated public snapshot with its published Worker KV copy. */

import { appendFileSync, readFileSync } from 'node:fs';

const [filePath, ...ignoredFields] = process.argv.slice(2);
const publicUrl = process.env.PUBLIC_SNAPSHOT_URL;

if (!filePath || !publicUrl || !process.env.GITHUB_OUTPUT) {
  throw new Error('Usage: PUBLIC_SNAPSHOT_URL=... node scripts/compare-public-snapshot.mjs <file> [ignored-field ...]');
}

function canonicalize(value, ignored = new Set()) {
  if (Array.isArray(value)) return value.map(item => canonicalize(item, ignored));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter(key => !ignored.has(key))
        .sort()
        .map(key => [key, canonicalize(value[key], ignored)])
    );
  }
  return value;
}

const generated = JSON.parse(readFileSync(filePath, 'utf8'));
const response = await fetch(publicUrl, { cache: 'no-store' });

if (response.status === 503 || response.status === 404) {
  appendFileSync(process.env.GITHUB_OUTPUT, 'changed=true\n');
  console.log('No published snapshot exists yet; this run will publish it.');
  process.exit(0);
}

if (!response.ok) {
  throw new Error(`Snapshot endpoint returned HTTP ${response.status}`);
}

const published = await response.json();
const ignored = new Set(ignoredFields);
const changed = JSON.stringify(canonicalize(generated, ignored)) !== JSON.stringify(canonicalize(published, ignored));
appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(changed ? 'Public snapshot changed; it will be published.' : 'Public snapshot is unchanged; skipping publish.');
