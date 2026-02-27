// Vercel Speed Insights integration for vanilla JavaScript
// This file should be imported as a module to access the injectSpeedInsights function
// For static HTML, we'll load the script manually

(function () {
  'use strict';

  // Check if we're in a browser environment
  if (typeof window === 'undefined') return;

  function appendScriptIfMissing(src, attrs = {}) {
    const existingScript = document.head.querySelector(`script[src="${src}"]`);
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    Object.entries(attrs).forEach(([key, value]) => {
      script.dataset[key] = value;
    });

    script.onerror = function () {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(`[Vercel] ${src} not available locally. This is normal.`);
      } else {
        console.warn(`[Vercel] Failed to load ${src}`);
      }
    };

    document.head.appendChild(script);
  }

  // Vercel Speed Insights + Web Analytics
  appendScriptIfMissing('/_vercel/speed-insights/script.js', { sdkn: '@vercel/speed-insights' });
  appendScriptIfMissing('/_vercel/insights/script.js', { sdkn: '@vercel/analytics' });
})();
