import { constants } from 'node:crypto';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function proxyHeaders(headers) {
  const blocked = new Set([
    'connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
    'forwarded', 'x-real-ip',
    ...(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim()),
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) =>
    !blocked.has(name) && !name.startsWith('x-forwarded-')));
}

export function createGateway({ origin, upstreamPort, registry, tls }) {
  const host = new URL(origin).host;
  const clients = new Map();

  function authorized(peer) {
    return peer && peer.expires > Date.now() && existsSync(join(registry, peer.id));
  }

  function permitted(req, websocket = false) {
    if (!authorized(clients.get(req.socket))) return false;
    const { headers } = req;
    if (headers.host !== host || !req.url.startsWith('/') ||
        req.url.startsWith('//') || req.url.includes('\\')) return false;
    if (headers['sec-fetch-site'] && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return false;
    if (headers.origin && headers.origin !== origin) return false;
    if (websocket || !['GET', 'HEAD'].includes(req.method)) return headers.origin === origin;
    return true;
  }

  function connect(req, headers) {
    return request({
      hostname: '127.0.0.1', port: upstreamPort, method: req.method,
      path: req.url, headers, agent: false,
    });
  }

  const server = createServer({
    ...tls, minVersion: 'TLSv1.3', requestCert: true, rejectUnauthorized: true,
    // A fresh client certificate is required after every new handshake.
    secureOptions: constants.SSL_OP_NO_TICKET,
  }, (req, res) => {
    if (!permitted(req)) {
      res.writeHead(403, { 'cache-control': 'no-store', connection: 'close' });
      res.end();
      return;
    }
    const upstream = connect(req, proxyHeaders(req.headers));
    upstream.on('response', incoming => {
      const headers = proxyHeaders(incoming.headers);
      headers['cache-control'] = 'no-store';
      headers['cross-origin-resource-policy'] = 'same-origin';
      headers['x-frame-options'] = 'DENY';
      res.writeHead(incoming.statusCode, headers);
      incoming.on('error', () => res.destroy());
      incoming.pipe(res);
    });
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502).end();
    });
    upstream.setTimeout(120_000, () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });

  server.on('resumeSession', (_id, callback) => callback(null, null));
  server.on('secureConnection', socket => {
    const cert = socket.getPeerCertificate();
    if (cert.fingerprint256) {
      clients.set(socket, {
        id: cert.fingerprint256.replaceAll(':', '').toLowerCase(),
        expires: Date.parse(cert.valid_to),
      });
      socket.once('close', () => clients.delete(socket));
    }
  });

  server.on('upgrade', (req, socket, clientHead) => {
    socket.on('error', () => socket.destroy());
    if (!permitted(req, true) || req.method !== 'GET' ||
        req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const headers = { ...proxyHeaders(req.headers), connection: 'Upgrade', upgrade: 'websocket' };
    const upstream = connect(req, headers);
    upstream.setTimeout(10_000, () => upstream.destroy());
    upstream.on('response', incoming => {
      incoming.destroy();
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
    upstream.on('error', () => socket.destroy());
    upstream.on('upgrade', (response, peer, upstreamHead) => {
      peer.on('error', () => socket.destroy());
      peer.once('close', () => socket.destroy());
      socket.once('close', () => peer.destroy());
      if (socket.destroyed || !authorized(clients.get(socket))) {
        peer.destroy();
        socket.destroy();
        return;
      }
      peer.setTimeout(0);
      const handshake = ['HTTP/1.1 101 Switching Protocols', 'Connection: Upgrade', 'Upgrade: websocket'];
      for (const name of ['sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
        if (response.headers[name]) handshake.push(`${name}: ${response.headers[name]}`);
      }
      socket.write(handshake.join('\r\n') + '\r\n\r\n');
      if (upstreamHead.length) socket.write(upstreamHead);
      if (clientHead.length) peer.write(clientHead);
      peer.pipe(socket);
      socket.pipe(peer);
    });
    socket.once('close', () => upstream.destroy());
    upstream.end();
  });

  const timer = setInterval(() => {
    for (const [socket, peer] of clients) {
      if (!authorized(peer)) socket.destroy();
    }
  }, 500);
  timer.unref();
  server.once('close', () => clearInterval(timer));
  return server;
}

export function loadGateway(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const { origin, upstreamPort = 4187, registry, bind = '127.0.0.1' } = config;
  const url = new URL(origin);
  if (url.protocol !== 'https:' || origin !== url.origin ||
      !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
    throw new Error('Expected an HTTPS origin and a valid loopback upstream port');
  }
  const tls = Object.fromEntries(['key', 'cert', 'ca'].map(name => [name, readFileSync(config[name])]));
  return { server: createGateway({ origin, upstreamPort, registry, tls }), bind, port: Number(url.port || 443) };
}
