#!/usr/bin/env node
/**
 * Check whether the public health dashboard payload is stale.
 * Writes GitHub Actions outputs when GITHUB_OUTPUT is available.
 */

import { existsSync, readFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';

const DATA_PATH = resolve(process.cwd(), 'oura_public.json');
const GITHUB_OUTPUT_PATH = process.env.GITHUB_OUTPUT;
const MAX_STALENESS_HOURS = Number(process.env.OURA_MAX_STALENESS_HOURS || 36);

function setOutput(name, value) {
  if (!GITHUB_OUTPUT_PATH) {
    return;
  }
  appendFileSync(GITHUB_OUTPUT_PATH, `${name}=${String(value)}\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(DATA_PATH)) {
  fail(`Missing ${DATA_PATH}`);
}

let payload;
try {
  payload = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
} catch (error) {
  fail(`Failed to parse oura_public.json: ${error.message}`);
}

if (!payload.lastUpdatedIso) {
  fail('oura_public.json is missing lastUpdatedIso');
}

const lastUpdated = new Date(payload.lastUpdatedIso);
if (Number.isNaN(lastUpdated.getTime())) {
  fail(`Invalid lastUpdatedIso: ${payload.lastUpdatedIso}`);
}

const ageHours = ((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60)).toFixed(1);
const isStale = Number(ageHours) > MAX_STALENESS_HOURS;

setOutput('is_stale', isStale);
setOutput('age_hours', ageHours);
setOutput('last_updated_iso', payload.lastUpdatedIso);
setOutput('data_day', payload.day || 'unknown');
setOutput('max_staleness_hours', MAX_STALENESS_HOURS);

console.log(`Last updated: ${payload.lastUpdatedIso}`);
console.log(`Data day: ${payload.day || 'unknown'}`);
console.log(`Age: ${ageHours} hours`);
console.log(`Threshold: ${MAX_STALENESS_HOURS} hours`);

if (isStale) {
  console.log('Status: stale');
} else {
  console.log('Status: fresh');
}
