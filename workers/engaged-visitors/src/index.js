function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = origin === 'https://rudrakshbhandari.com' || origin.endsWith('.rudrakshbhandari-portfolio.pages.dev');
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

export class VisitorCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400, headers });
    }

    const suppliedSession = typeof body.sessionId === 'string' ? body.sessionId : null;
    const sessionId = suppliedSession || crypto.randomUUID();
    const now = Date.now();
    const seen = await this.state.storage.get(`session:${sessionId}`);
    let count = (await this.state.storage.get('count')) || 0;

    if (!seen || seen.expiresAt <= now) {
      count += 1;
      await this.state.storage.put('count', count);
      await this.state.storage.put(`session:${sessionId}`, { expiresAt: now + 60 * 60 * 24 * 30 });
    }

    return Response.json({ count, sessionId }, { headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/engaged-visitor') return new Response('Not Found', { status: 404 });
    const id = env.VISITOR_COUNTER.idFromName('portfolio');
    return env.VISITOR_COUNTER.get(id).fetch(request);
  },
};
