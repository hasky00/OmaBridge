import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const release = 'build-123';

function keys() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'omabridge-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'download'));
  const original = join(dir, 'build.bin');
  const downloaded = join(dir, 'download', 'build.bin');
  const manifest = join(dir, 'build.manifest');
  const privateKey = join(dir, 'signer.pem');
  const publicKey = join(dir, 'trust.pem');
  const pair = keys();
  await Promise.all([
    writeFile(original, 'build release content'),
    writeFile(downloaded, 'build release content'),
    writeFile(privateKey, pair.privateKey, { mode: 0o600 }),
    writeFile(publicKey, pair.publicKey),
  ]);
  const invoke = (...args) => run(process.execPath, [cli, ...args]);
  return {
    manifest, downloaded, publicKey, invoke,
    sign: () => invoke('sign', original, manifest, privateKey, release),
    verify: (expected = release, artifact = downloaded) =>
      invoke('verify', artifact, manifest, publicKey, expected),
  };
}

test('signs and verifies a copy through the CLI', async t => {
  const f = await fixture(t);
  const signed = JSON.parse((await f.sign()).stdout);
  const verified = JSON.parse((await f.verify()).stdout);
  assert.deepEqual(verified, signed);
  assert.equal(verified.release, release);
  assert.equal(verified.size, 21);
});

test('rejects a same-length modified copy and a truncated copy', async t => {
  const f = await fixture(t);
  await f.sign();
  await writeFile(f.downloaded, 'build release contenT');
  await assert.rejects(f.verify(), { code: 1, stderr: /integrity check failed/ });
  await writeFile(f.downloaded, 'build');
  await assert.rejects(f.verify(), { code: 1, stderr: /integrity check failed/ });
});

test('rejects a valid manifest for a different release or filename', async t => {
  const f = await fixture(t);
  await f.sign();
  await assert.rejects(f.verify('build-124'), { code: 1, stderr: /Unexpected release/ });
  await assert.rejects(f.verify(release, 'other.bin'), { code: 1, stderr: /Unexpected artifact filename/ });
});

test('rejects a substituted public key and modified signed fields', async t => {
  const f = await fixture(t);
  await f.sign();
  const trusted = await readFile(f.publicKey);
  await writeFile(f.publicKey, keys().publicKey);
  await assert.rejects(f.verify(), { code: 1, stderr: /Invalid manifest signature/ });
  await writeFile(f.publicKey, trusted);
  const envelope = JSON.parse(await readFile(f.manifest, 'utf8'));
  envelope.manifest.size++;
  await writeFile(f.manifest, JSON.stringify(envelope) + '\n');
  await assert.rejects(f.verify(), { code: 1, stderr: /Invalid manifest signature/ });
});

test('rejects ambiguous encoding, malformed JSON and oversized envelopes', async t => {
  const f = await fixture(t);
  await f.sign();
  const original = await readFile(f.manifest, 'utf8');
  await writeFile(f.manifest, original.replace('"version":1', '"version":1,"version":1'));
  await assert.rejects(f.verify(), { code: 1, stderr: /Invalid artifact envelope encoding/ });
  await writeFile(f.manifest, 'sensitive-invalid-content');
  await assert.rejects(f.verify(), { code: 1, stderr: 'Invalid artifact envelope JSON\n' });
  await writeFile(f.manifest, Buffer.alloc(8193));
  await assert.rejects(f.verify(), { code: 1, stderr: /allowed size/ });
});

test('concurrent signing publishes only one complete manifest', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.sign(), f.sign()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.stderr, /EEXIST/);
  await f.verify();
});
