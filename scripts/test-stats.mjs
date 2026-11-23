import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../js/stats.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const liveUrl = 'https://oura-health-data.rudrakshbhandari99.workers.dev/stats_public.json';
const snapshotUrl = '/stats_public.json';

function createStat(key, text) {
  const attrs = new Map([
    ['data-stat', key],
    ['data-stat-format', 'exact'],
    ['data-target', text],
  ]);
  return {
    getAttribute: name => attrs.get(name),
    hasAttribute: name => attrs.has(name),
    setAttribute: (name, value) => attrs.set(name, value),
    textContent: text,
  };
}

const jsonResponse = data => ({ ok: true, json: async () => data });
const snapshot = jsonResponse({
  websiteVisitors: { totalVisits: 3900 },
  apps: { shareallbooks: { total: 2100 } },
});

async function load(loadLive, loadSnapshot = () => snapshot) {
  const visits = createStat('monthly-visitors', '—');
  const downloads = createStat('app-downloads', '2K+');
  const calls = [];
  let initialize;
  const document = {
    readyState: 'loading',
    addEventListener: (event, callback) => {
      assert.equal(event, 'DOMContentLoaded');
      initialize = callback;
    },
    querySelectorAll: selector => {
      assert.equal(selector, '[data-stat]:not([data-counter-authoritative])');
      return [visits, downloads].filter(node => !node.hasAttribute('data-counter-authoritative'));
    },
  };

  runInNewContext(script, {
    document,
    window: {},
    fetch: async (url, options) => {
      calls.push(url);
      assert.equal(options.cache, 'no-store');
      assert.ok(url === liveUrl || url === snapshotUrl);
      return url === liveUrl ? loadLive() : loadSnapshot();
    },
  });
  await initialize();
  return { calls, visits, downloads };
}

test('homepage CSP allows the exact live stats origin', () => {
  const connectSrc = html.match(/(?:^|; )connect-src ([^;"]+)/)?.[1];
  assert.ok(connectSrc?.split(/\s+/).includes(new URL(liveUrl).origin));
});

test('live values render without falling back', async () => {
  const { calls, visits, downloads } = await load(() =>
    jsonResponse({
      websiteVisitors: { totalVisits: 4002 },
      apps: { shareallbooks: { total: 2200 } },
    })
  );
  assert.deepEqual(calls, [liveUrl]);
  assert.equal(visits.textContent, '4,002');
  assert.equal(visits.getAttribute('data-target'), '4,002');
  assert.equal(visits.getAttribute('data-counter-authoritative'), 'true');
  assert.equal(downloads.textContent, '2,200');
});

for (const [label, unavailable] of [
  [
    'fetch rejects',
    () => {
      throw new TypeError('Failed to fetch');
    },
  ],
  ['HTTP error', () => ({ ok: false, status: 503 })],
  [
    'invalid JSON',
    () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected response body');
      },
    }),
  ],
]) {
  test(`uses the bundled snapshot when the live endpoint has ${label}`, async () => {
    const { calls, visits } = await load(unavailable);
    assert.deepEqual(calls, [liveUrl, snapshotUrl]);
    assert.equal(visits.textContent, '3,900');
  });
}

test('falls back for missing or invalid fields without replacing live fields', async () => {
  const { calls, visits, downloads } = await load(() =>
    jsonResponse({
      websiteVisitors: { totalVisits: 'unknown' },
      apps: { shareallbooks: { total: 2200 } },
    })
  );
  assert.deepEqual(calls, [liveUrl, snapshotUrl]);
  assert.equal(visits.textContent, '3,900');
  assert.equal(downloads.textContent, '2,200');
});

test('retains placeholders if both sources fail', async () => {
  const fail = () => ({ ok: false, status: 503 });
  const { calls, visits, downloads } = await load(fail, fail);
  assert.deepEqual(calls, [liveUrl, snapshotUrl]);
  assert.equal(visits.textContent, '—');
  assert.equal(visits.hasAttribute('data-counter-authoritative'), false);
  assert.equal(downloads.textContent, '2K+');
});
