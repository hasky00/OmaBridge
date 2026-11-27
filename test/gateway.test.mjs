import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { signArtifact, verifyArtifact } from '../src/artifact.mjs';
import { createGateway } from '../src/gateway.mjs';

const hostCli = fileURLToPath(new URL('../src/host.mjs', import.meta.url));

test('mTLS registration, same-origin HTTP and WebSocket, resume and active revocation', { timeout: 15_000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'omabridge-gateway-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const registry = join(dir, 'devices');
  mkdirSync(registry);
  const openssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  openssl('req', '-x509', '-newkey', 'ed25519', '-nodes', '-subj', '/CN=Test CA',
    '-days', '2', '-keyout', 'ca.key', '-out', 'ca.pem');
  for (const [name, extensions] of [
    ['server', 'extendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\n'],
    ['phone', 'extendedKeyUsage=clientAuth\n'],
    ['tablet', 'extendedKeyUsage=clientAuth\n'],
  ]) {
    writeFileSync(join(dir, 'extensions'), extensions);
    openssl('req', '-new', '-newkey', 'ed25519', '-nodes', '-subj', '/CN=' + name,
      '-keyout', name + '.key', '-out', name + '.csr');
    openssl('x509', '-req', '-in', name + '.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key',
      '-CAcreateserial', '-days', '1', '-extfile', 'extensions', '-out', name + '.pem');
  }
  const keys = name => Object.fromEntries(Object.entries({
    ca: 'ca.pem', key: name + '.key', cert: name + '.pem',
  }).map(([field, path]) => [field, readFileSync(join(dir, path))]));
  const administer = (action, name) => execFileSync(process.execPath,
    [hostCli, action, registry, join(dir, name + '.pem')]);
  const processFixture = spawn(process.execPath, ['-e',
    'let count = 0; setInterval(() => console.log(process.pid + ":" + ++count), 10)'],
  { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => processFixture.kill());
  let latest = '';
  processFixture.stdout.on('data', chunk => { latest = chunk.toString().trim().split('\n').at(-1); });
  await once(processFixture.stdout, 'data');
  const build = join(dir, 'build.txt');
  const envelope = join(dir, 'build.manifest');
  const signingKey = join(dir, 'signing.pem');
  const trustedKey = join(dir, 'trusted.pem');
  const signer = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  writeFileSync(build, 'fixture build');
  writeFileSync(signingKey, signer.privateKey, { mode: 0o600 });
  writeFileSync(trustedKey, signer.publicKey);
  await signArtifact({ artifact: build, envelope, keyPath: signingKey, release: 'fixture-1' });
  const downloads = new Map([
    ['/build.txt', readFileSync(build)],
    ['/build.manifest', readFileSync(envelope)],
  ]);
  const upstream = createServer((req, res) => res.end(downloads.get(req.url) ?? 'workspace'));
  upstream.on('upgrade', (req, socket) => {
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] +
      '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const bytes = Buffer.from(latest);
    socket.on('end', () => socket.destroy());
    socket.write(Buffer.concat([Buffer.from(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'), Buffer.from([0x81, bytes.length]), bytes]));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => upstream.close());
  // Use the external origin independently of the test's ephemeral listen port.
  const origin = 'https://127.0.0.1:8443';
  const gateway = createGateway({
    origin, registry, upstreamPort: upstream.address().port, tls: keys('server'),
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(() => gateway.close());
  function call(device, { headers = {}, method = 'GET', path = '/', ws = false } = {}) {
    return new Promise((resolve, reject) => {
      const tls = device ? keys(device) : { ca: keys('server').ca };
      const req = request({
        ...tls, agent: false, checkServerIdentity: (_host, cert) => checkServerIdentity('127.0.0.1', cert),
        hostname: '127.0.0.1', port: gateway.address().port,
        path, method, headers: { host: '127.0.0.1:8443', ...headers },
      }, async res => {
        try {
          const chunks = [];
          for await (const chunk of res) chunks.push(chunk);
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
        } catch (error) { reject(error); }
      });
      req.on('error', reject);
      if (ws) req.on('upgrade', (_res, socket, head) => {
        socket.on('error', reject);
        t.after(() => socket.destroy());
        resolve({ socket, head });
      });
      req.end();
    });
  }
  const socketRequest = (device, headerOrigin = origin) => call(device, {
    ws: true, headers: {
      origin: headerOrigin, connection: 'Upgrade', upgrade: 'websocket',
      'sec-websocket-version': '13', 'sec-websocket-key': randomBytes(16).toString('base64'),
    },
  });
  async function session(device) {
    const { socket, head } = await socketRequest(device);
    let frame = head;
    while (frame.length < 2 || frame.length < frame[1] + 2) {
      const [bytes] = await once(socket, 'data');
      frame = Buffer.concat([frame, bytes]);
    }
    assert.equal(frame[0], 0x81);
    const [pid, count] = frame.subarray(2, 2 + frame[1]).toString().split(':').map(Number);
    return { socket, pid, count };
  }
  await assert.rejects(call(null));
  assert.equal((await call('phone')).status, 403);
  administer('register', 'phone');
  administer('register', 'tablet');
  assert.equal((await call('phone')).body, 'workspace');
  assert.equal((await call('phone', { headers: { host: 'other.invalid' } })).status, 403);
  assert.equal((await call('phone', { headers: { 'sec-fetch-site': 'same-site' } })).status, 403);
  assert.equal((await call('phone', { method: 'POST' })).status, 403);
  assert.equal((await socketRequest('phone', 'https://other.invalid')).status, 403);
  const original = await session('phone');
  original.socket.destroy();
  await once(processFixture.stdout, 'data');
  const resumed = await session('phone');
  assert.equal(original.pid, processFixture.pid);
  assert.equal(resumed.pid, original.pid);
  assert.ok(resumed.count > original.count);
  const received = join(dir, 'received');
  mkdirSync(received);
  for (const path of downloads.keys()) {
    const result = await call('phone', { path });
    assert.equal(result.status, 200);
    writeFileSync(join(received, path), result.body);
  }
  const verification = {
    artifact: join(received, 'build.txt'), envelope: join(received, 'build.manifest'),
    keyPath: trustedKey, release: 'fixture-1',
  };
  assert.equal((await verifyArtifact(verification)).size, 13);
  writeFileSync(verification.artifact, 'changed build');
  await assert.rejects(verifyArtifact(verification), /integrity check failed/);
  const closed = once(resumed.socket, 'close');
  administer('revoke', 'phone');
  await closed;
  assert.equal((await call('phone')).status, 403);
  assert.equal((await socketRequest('phone')).status, 403);
  assert.equal((await call('tablet')).status, 200);
});
