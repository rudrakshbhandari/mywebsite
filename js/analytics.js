// Lightweight analytics wrapper. No provider lock-in:
// - Vercel Web Analytics (`window.va`)
// - Plausible (`window.plausible`)
// - Google Analytics (`window.gtag`)
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

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
    bindClickTracking('a[href="/health"]', 'health_nav_click');

    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      emit('portfolio_page_view');
    }
  });
})();
