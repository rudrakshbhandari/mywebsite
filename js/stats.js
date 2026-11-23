/**
 * Portfolio stats loader.
 *
 * Reads stats_public.json from the public data Worker (refreshed daily) and
 * updates any element with a data-stat attribute. Falls back to the bundled
 * snapshot for missing data, then retains the baked-in HTML if neither works.
 *
 * Supported data-stat keys:
 *   - "app-downloads"           total across all shipped apps (iOS + Android)
 *   - "shareallbooks-downloads" ShareAllBooks iOS + Android total
 *   - "monthly-visitors"        aggregate visits across tracked sites, last 30d
 *
 * Supported data-stat-format values:
 *   - "compact-plus"   e.g. 2047 -> "2K+"
 *   - "thousands-plus" e.g. 2047 -> "2,000+"
 *   - "exact"          raw number with thousands separators
 */
(function () {
  'use strict';

  const SNAPSHOT_URL = '/stats_public.json';
  const STATS_URL = 'https://oura-health-data.rudrakshbhandari99.workers.dev/stats_public.json';

  function floorToNiceNumber(value) {
    if (value < 1000) return Math.floor(value / 10) * 10;
    if (value < 10000) return Math.floor(value / 100) * 100;
    return Math.floor(value / 1000) * 1000;
  }

  function formatValue(value, format) {
    if (!Number.isFinite(value) || value < 0) return null;
    if (format === 'exact') return value.toLocaleString('en-US');

    if (format === 'thousands-plus') {
      const rounded = floorToNiceNumber(value);
      return rounded.toLocaleString('en-US') + '+';
    }

    // default: compact-plus — ceiling to nearest 0.1K (e.g. 1921 -> "2.0K+", 2140 -> "2.2K+")
    if (value >= 1000) {
      return (Math.ceil(value / 100) / 10).toFixed(1) + 'K+';
    }
    const rounded = Math.floor(value / 10) * 10;
    return rounded.toLocaleString('en-US') + '+';
  }

  function resolveValue(stats, key) {
    if (!stats) return null;
    const apps = stats.apps || {};
    if (key === 'shareallbooks-downloads') {
      return apps.shareallbooks?.total ?? null;
    }
    if (key === 'app-downloads') {
      let total = 0;
      let any = false;
      for (const app of Object.values(apps)) {
        if (Number.isFinite(app?.total) && app.total >= 0) {
          total += app.total;
          any = true;
        }
      }
      return any ? total : null;
    }
    if (key === 'monthly-visitors') {
      return stats.websiteVisitors?.totalVisits ?? null;
    }
    return null;
  }

  function applyStats(stats) {
    const nodes = document.querySelectorAll('[data-stat]:not([data-counter-authoritative])');
    let missing = false;
    nodes.forEach(node => {
      const key = node.getAttribute('data-stat');
      const format = node.getAttribute('data-stat-format') || 'compact-plus';
      const value = resolveValue(stats, key);
      const formatted = formatValue(value, format);
      if (formatted) {
        node.setAttribute('data-counter-authoritative', 'true');
        node.textContent = formatted;
        // Keep GSAP counter animations in sync with the authoritative value.
        if (node.hasAttribute('data-target')) {
          node.setAttribute('data-target', formatted);
        }
      } else {
        missing = true;
      }
    });
    return missing;
  }

  async function fetchStats(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Stats endpoint returned HTTP ${response.status}`);
    return response.json();
  }

  async function loadStats() {
    try {
      const liveStats = await fetchStats(STATS_URL);
      if (!applyStats(liveStats)) return;
    } catch (err) {
      if (window.console && console.debug) console.debug('Live stats fetch failed', err);
    }

    try {
      applyStats(await fetchStats(SNAPSHOT_URL));
    } catch (err) {
      // Keep the baked-in HTML visible if both sources fail.
      if (window.console && console.debug) console.debug('Bundled stats fetch failed', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStats);
  } else {
    loadStats();
  }
})();
