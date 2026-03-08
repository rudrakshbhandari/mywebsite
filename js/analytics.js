// Lightweight analytics wrapper. No provider lock-in:
// - Cloudflare Web Analytics (pageview + RUM via beacon script)
// - Plausible (`window.plausible`)
// - Google Analytics (`window.gtag`)
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const siteConfig = window.SITE_CONFIG || {};

  function appendScriptIfMissing(src, options = {}) {
    const existingScript = document.head.querySelector(`script[src="${src}"]`);
    if (existingScript) return existingScript;

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;

    if (options.async) {
      script.async = true;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        script.setAttribute(key, value);
      });
    }

    document.head.appendChild(script);
    return script;
  }

  function bootstrapCloudflareAnalytics() {
    const token = siteConfig.cloudflareAnalyticsToken;
    if (!token) return;

    appendScriptIfMissing('https://static.cloudflareinsights.com/beacon.min.js', {
      attributes: {
        'data-cf-beacon': JSON.stringify({ token }),
      },
    });
  }

  function bootstrapGa4() {
    const measurementId = siteConfig.ga4MeasurementId;
    if (!measurementId) return;

    appendScriptIfMissing(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`, {
      async: true,
    });

    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }

    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      anonymize_ip: true,
      send_page_view: false,
    });
  }

  bootstrapCloudflareAnalytics();
  bootstrapGa4();

  function toPayload(extra) {
    if (!extra || typeof extra !== 'object') return {};
    return extra;
  }

  function emit(name, extra) {
    const payload = toPayload(extra);

    if (typeof window.va === 'function') {
      try {
        window.va('event', { name, data: payload });
      } catch (_) {}
    }

    if (typeof window.plausible === 'function') {
      try {
        window.plausible(name, { props: payload });
      } catch (_) {}
    }

    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', name, payload);
      } catch (_) {}
    }
  }

  window.trackEvent = emit;

  function bindClickTracking(selector, eventName, payloadBuilder) {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('click', () => {
        const payload = typeof payloadBuilder === 'function' ? payloadBuilder(el) : {};
        emit(eventName, payload);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindClickTracking('a[href*="Resume"], a[href$=".pdf"], .nav-resume', 'resume_click');
    bindClickTracking('a[href^="mailto:"]', 'contact_email_click');
    bindClickTracking('.social-link', 'social_click', el => ({ network: el.getAttribute('title') || 'unknown' }));
    bindClickTracking('a[href="/health"], a[href="/health/"], a[href="health/"]', 'health_nav_click');

    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      emit('portfolio_page_view');
    }
  });
})();
