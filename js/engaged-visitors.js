(function () {
  'use strict';

  const ENDPOINT = '/api/engaged-visitor';
  const COUNT_SELECTOR = '[data-engaged-visitor-count]';
  const QUALIFICATION_DELAY = 10000;
  const SESSION_KEY = 'engaged-visitor-counted-v1';
  let interacted = false;
  let qualified = false;
  let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  let visibleMilliseconds = 0;

  function updateCount(count) {
    if (!Number.isFinite(count)) return;
    document.querySelectorAll(COUNT_SELECTOR).forEach(node => {
      node.textContent = count.toLocaleString('en-US');
      node.closest('.visitor-counter')?.removeAttribute('hidden');
    });
  }

  async function qualify() {
    if (qualified || !interacted || document.visibilityState !== 'visible') return;
    const elapsed = visibleMilliseconds + (visibleSince ? Date.now() - visibleSince : 0);
    if (elapsed < QUALIFICATION_DELAY) return;
    qualified = true;
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionStorage.getItem(SESSION_KEY) || null }),
        keepalive: true,
      });
      if (!response.ok) return;
      const result = await response.json();
      if (result.sessionId) sessionStorage.setItem(SESSION_KEY, result.sessionId);
      updateCount(result.count);
    } catch (_) {}
  }

  function markInteraction() {
    interacted = true;
    qualify();
  }

  function updateVisibility() {
    if (document.visibilityState === 'visible') {
      visibleSince = Date.now();
      qualify();
    } else if (visibleSince) {
      visibleMilliseconds += Date.now() - visibleSince;
      visibleSince = null;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(eventName => {
      window.addEventListener(eventName, markInteraction, { once: true, passive: true });
    });
    document.addEventListener('visibilitychange', updateVisibility);
    window.setInterval(qualify, 1000);
  });
})();
