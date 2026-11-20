const ALLOWED_ORIGINS = new Set(['https://rudrakshbhandari.com', 'https://www.rudrakshbhandari.com']);

function corsHeaders(origin) {
  const headers = new Headers({
    'Cache-Control': 'public, max-age=60',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });

  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (url.pathname !== '/oura_public.json') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Max-Age', '86400');
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } });
    }

    const body = await env.OURA_DATA.get('oura_public.json');
    if (!body) {
      return new Response('Health data is not available yet', { status: 503, headers });
    }

    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
  },
};
