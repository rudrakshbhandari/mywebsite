// Vercel Speed Insights integration for vanilla JavaScript
// This file should be imported as a module to access the injectSpeedInsights function
// For static HTML, we'll load the script manually

(function () {
  'use strict';

  // Check if we're in a browser environment
  if (typeof window === 'undefined') return;

  // For static sites on Vercel, load the script directly
  // Vercel will automatically serve this script when deployed
  const script = document.createElement('script');
  script.src = '/_vercel/speed-insights/script.js';
  script.defer = true;
  script.dataset.sdkn = '@vercel/speed-insights';

  // Add error handling for local development
  script.onerror = function () {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('[Vercel Speed Insights] Script not available locally. This is normal. Deploy to Vercel to enable.');
    } else {
      console.warn('[Vercel Speed Insights] Failed to load script.');
    }
  };

  // Only add if not already present
  const existingScript = document.head.querySelector(`script[src="${script.src}"]`);
  if (!existingScript) {
    document.head.appendChild(script);
  }
})();
