const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { isIPv4 } = require('node:net');

const PORT = 8080;
const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};
const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

function privateIPv4(value) {
  if (!isIPv4(value)) return false;
  const [a, b] = value.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function cleanedHeaders(headers) {
  const result = { ...headers };
  const connectionTokens = String(headers.connection ?? '').split(',').map(value => value.trim().toLowerCase());
  for (const name of [...hopHeaders, ...connectionTokens]) delete result[name];
  for (const name of Object.keys(result)) {
    if (name === 'forwarded' || name === 'x-real-ip' || name.startsWith('x-forwarded-')) delete result[name];
  }
  return result;
}

function createLanGateway({ key, cert, authority, allowedClients, upstreamPort = PORT }) {
  const allowed = new Set(allowedClients);
  return https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (request, response) => {
    const address = request.socket.remoteAddress;
    if (!allowed.has(address) || request.headers.host?.toLowerCase() !== authority.toLowerCase()) {
      response.writeHead(403, { ...securityHeaders, 'Cache-Control': 'no-store' }).end();
      return;
    }
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
      response.writeHead(400, securityHeaders).end();
      return;
    }
    const proxy = http.request({
      hostname: '127.0.0.1', port: upstreamPort, method: request.method, path: request.url,
      headers: { ...cleanedHeaders(request.headers), 'x-forwarded-proto': 'https', 'x-forwarded-for': address },
      timeout: 120_000,
    }, upstream => {
      const headers = { ...cleanedHeaders(upstream.headers), ...securityHeaders };
      if (request.url.startsWith('/api/')) headers['cache-control'] = 'no-store';
      response.writeHead(upstream.statusCode, headers);
      upstream.on('error', () => response.destroy());
      upstream.pipe(response);
    });
    proxy.on('timeout', () => proxy.destroy(new Error('Upstream timeout')));
    proxy.on('error', () => {
      if (response.headersSent) response.destroy();
      else response.writeHead(502, securityHeaders).end();
    });
    request.on('aborted', () => proxy.destroy());
    response.on('close', () => { if (!response.writableEnded) proxy.destroy(); });
    request.pipe(proxy);
  });
}

function main() {
  const { POS_LAN_BIND_IP, POS_LAN_HOST = POS_LAN_BIND_IP, POS_LAN_CLIENTS, POS_LAN_TLS_KEY, POS_LAN_TLS_CERT } = process.env;
  const clients = POS_LAN_CLIENTS?.split(',').map(item => item.trim()) ?? [];
  if (!privateIPv4(POS_LAN_BIND_IP) || !clients.length || !clients.every(privateIPv4)
    || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(POS_LAN_HOST ?? '') || !POS_LAN_TLS_KEY || !POS_LAN_TLS_CERT) {
    throw new Error('Configure a private IPv4 address, exact private client IPs, and TLS certificate and key files.');
  }
  const server = createLanGateway({
    key: fs.readFileSync(POS_LAN_TLS_KEY), cert: fs.readFileSync(POS_LAN_TLS_CERT),
    authority: `${POS_LAN_HOST}:${PORT}`, allowedClients: clients,
  });
  server.on('error', error => { console.error('LAN gateway failed (' + (error.code ?? error.name) + ').'); process.exitCode = 1; });
  server.listen(PORT, POS_LAN_BIND_IP, () => console.log(`LAN POS ready at https://${POS_LAN_HOST}:${PORT}`));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createLanGateway, privateIPv4 };
