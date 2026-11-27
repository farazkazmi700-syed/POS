import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.mjs';

const env = { API_ORIGIN: 'https://origin.example.invalid' };

test('preserves API identity, body and query while disabling caching', async (t) => {
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    assert.equal(request.url, `${env.API_ORIGIN}/api/sales?page=2`);
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), '{"fixture":true}');
    assert.equal(options.headers.get('Authorization'), 'Bearer fixture');
    assert.equal(options.headers.has('X-Forwarded-For'), false);
    assert.equal(options.cache, 'no-store');
    return new Response('created', { status: 201, headers: { 'CDN-Cache-Control': 'public' } });
  });
  const request = new Request('https://app.example.invalid/api/sales?page=2', {
    method: 'POST', body: '{"fixture":true}',
    headers: { Authorization: 'Bearer fixture', 'X-Forwarded-For': '192.0.2.1' },
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'created');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
});

test('rejects insecure origins and upstream redirects', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.redirect('https://elsewhere.example.invalid'));
  const request = new Request('https://app.example.invalid/api/health');
  assert.equal((await worker.fetch(request, { API_ORIGIN: 'http://origin.example.invalid' })).status, 502);
  assert.equal(fetch.mock.callCount(), 0);
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 502);
  assert.equal(response.headers.has('Location'), false);
});

test('serves SPA navigation through the assets binding', async () => {
  const request = new Request('https://app.example.invalid/recover');
  const response = await worker.fetch(request, { ASSETS: { fetch: async (incoming) => new Response(new URL(incoming.url).pathname) } });
  assert.equal(await response.text(), '/recover');
});

test('rewrites a same-origin API redirect without exposing the upstream hostname', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.redirect(`${env.API_ORIGIN}/api/docs/`));
  const response = await worker.fetch(new Request('https://app.example.invalid/api/docs'), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/api/docs/');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
