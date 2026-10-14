/**
 * Portfolio stats loader.
 *
 * Reads stats_public.json (refreshed daily by the stats-update GH Action) and
 * updates any element with a data-stat attribute. Falls back silently to the
 * baked-in HTML text if the JSON is missing or a value is null.
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

  const STATS_URL = '/stats_public.json';

  function shouldShowAboutStats() {
    return window.SITE_CONFIG?.showAboutStats !== false;
  }

  function applyStatsVisibility() {
    const statsSection = document.querySelector('[data-stats-section]');
    if (!statsSection) return;
    statsSection.hidden = !shouldShowAboutStats();
  }

  function floorToNiceNumber(value) {
    if (value < 1000) return Math.floor(value / 10) * 10;
    if (value < 10000) return Math.floor(value / 100) * 100;
    return Math.floor(value / 1000) * 1000;
  }

  function formatValue(value, format) {
    if (value == null || Number.isNaN(value)) return null;
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
        if (app?.total != null) {
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
    const nodes = document.querySelectorAll('[data-stat]');
    nodes.forEach(node => {
      const key = node.getAttribute('data-stat');
      const format = node.getAttribute('data-stat-format') || 'compact-plus';
      const value = resolveValue(stats, key);
      const formatted = formatValue(value, format);
      if (formatted) {
        node.textContent = formatted;
        // Keep GSAP counter animations in sync with the authoritative value.
        if (node.hasAttribute('data-target')) {
          node.setAttribute('data-target', formatted);
        }
      }
    });
  }

  async function loadStats() {
    applyStatsVisibility();
    if (!shouldShowAboutStats()) return;

    try {
      const response = await fetch(STATS_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const stats = await response.json();
      applyStats(stats);
    } catch (err) {
      // Silent failure — fallback HTML remains visible.
      if (window.console && console.debug) console.debug('stats fetch failed', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStats);
  } else {
    loadStats();
  }
})();
