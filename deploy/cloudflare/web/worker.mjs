const privateCache = 'private, no-store';

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function unavailable() {
  return Response.json({ message: 'POS API unavailable' }, {
    status: 502,
    headers: { 'Cache-Control': privateCache },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    try {
      const origin = new URL(env.API_ORIGIN);
      if (origin.protocol !== 'https:' || origin.href !== `${origin.origin}/` || origin.origin === url.origin) {
        return unavailable();
      }
      origin.pathname = url.pathname;
      origin.search = url.search;

      const headers = new Headers(request.headers);
      for (const name of ['Host', 'Forwarded', 'X-Forwarded-For', 'X-Forwarded-Host', 'X-Forwarded-Proto']) {
        headers.delete(name);
      }
      const response = await fetch(new Request(origin, request), { headers, redirect: 'manual', cache: 'no-store' });
      const outgoing = new Headers(response.headers);
      const location = outgoing.get('Location');
      if (response.status >= 300 && response.status < 400 && location) {
        const target = new URL(location, origin);
        if (target.origin !== origin.origin || !isApiPath(target.pathname)) return unavailable();
        outgoing.set('Location', `${target.pathname}${target.search}${target.hash}`);
      }
      outgoing.set('Cache-Control', privateCache);
      outgoing.set('CDN-Cache-Control', 'no-store');
      outgoing.set('Cloudflare-CDN-Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch {
      return unavailable();
    }
  },
};
