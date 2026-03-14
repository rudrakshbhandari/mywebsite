/**
 * Cloudflare Worker GitHub OAuth proxy for Decap CMS.
 * Adapted from sterlingwes/decap-proxy (MIT).
 * @see https://github.com/sterlingwes/decap-proxy
 */

import { OAuthClient } from './oauth';

interface Env {
  GITHUB_OAUTH_ID: string;
  GITHUB_OAUTH_SECRET: string;
  GITHUB_REPO_PRIVATE?: string;
  /** Comma-separated GitHub usernames allowed to log in. Empty = allow all. */
  ALLOWED_GITHUB_USERS?: string;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const createOAuth = (env: Env) => {
  return new OAuthClient({
    id: env.GITHUB_OAUTH_ID,
    secret: env.GITHUB_OAUTH_SECRET,
    target: {
      tokenHost: 'https://github.com',
      tokenPath: '/login/oauth/access_token',
      authorizePath: '/login/oauth/authorize',
    },
  });
};

const handleAuth = async (url: URL, env: Env) => {
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return new Response(
      `OAuth secrets not configured. Run from the repo root:\n\n  cd workers/decap-proxy\n  npx wrangler secret put GITHUB_OAUTH_ID\n  npx wrangler secret put GITHUB_OAUTH_SECRET\n\nThen retry logging in.`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }
    );
  }

  const provider = url.searchParams.get('provider');
  if (provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }

  const repoIsPrivate = env.GITHUB_REPO_PRIVATE != undefined && env.GITHUB_REPO_PRIVATE !== '0';
  const repoScope = repoIsPrivate ? 'repo,user' : 'public_repo,user';

  const oauth2 = createOAuth(env);
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: `https://${url.hostname}/callback?provider=github`,
    scope: repoScope,
    state: randomHex(4),
  });

  return new Response(null, {
    headers: { location: authorizationUri },
    status: 301,
  });
};

const callbackScriptResponse = (status: string, token: string) => {
  return new Response(
    `<!DOCTYPE html>
<html>
<head><title>Authorizing Decap...</title></head>
<body>
  <p>Authorizing Decap...</p>
  <script>
    const receiveMessage = (message) => {
      window.opener.postMessage(
        'authorization:github:${status}:${JSON.stringify({ token })}',
        '*'
      );
      window.removeEventListener("message", receiveMessage, false);
    };
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
  </script>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
};

const handleCallback = async (url: URL, env: Env) => {
  const provider = url.searchParams.get('provider');
  if (provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  const oauth2 = createOAuth(env);
  const accessToken = await oauth2.getToken({
    code,
    redirect_uri: `https://${url.hostname}/callback?provider=github`,
  });

  // Enforce allowlist: only specified GitHub users get a token.
  const allowed = env.ALLOWED_GITHUB_USERS?.trim();
  if (allowed) {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return new Response('Failed to verify user', { status: 502 });
    }
    const user = (await res.json()) as { login: string };
    const allowlist = allowed.split(',').map((u) => u.trim().toLowerCase());
    if (!allowlist.includes((user.login || '').toLowerCase())) {
      return new Response(
        `<!DOCTYPE html><html><head><title>Access denied</title></head><body><p>Access denied. Only the site owner can use this CMS.</p></body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html' } }
      );
    }
  }

  return callbackScriptResponse('success', accessToken);
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/auth') {
      return handleAuth(url, env);
    }
    if (url.pathname === '/callback') {
      return handleCallback(url, env);
    }
    return new Response('Hello 👋');
  },
};
