import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signArtifact, verifyArtifact } from '../src/artifact.mjs';

const sizeMiB = Number(process.argv[2] ?? 64);
if (!Number.isSafeInteger(sizeMiB) || sizeMiB < 1 || sizeMiB > 4096) {
  throw new Error('Provide an integer size from 1 to 4096 MiB');
}
const directory = await mkdtemp(join(tmpdir(), 'omabridge-benchmark-'));
try {
  const artifact = join(directory, 'artifact.bin');
  const envelope = join(directory, 'artifact.manifest');
  const privatePath = join(directory, 'private.pem');
  const publicPath = join(directory, 'public.pem');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const file = await open(artifact, 'wx');
  try {
    await file.truncate(sizeMiB * 1024 * 1024);
  } finally {
    await file.close();
  }
  await writeFile(privatePath, privateKey, { mode: 0o600 });
  await writeFile(publicPath, publicKey);
  const inputs = { artifact, envelope, release: 'benchmark-1' };
  const start = performance.now();
  await signArtifact({ ...inputs, keyPath: privatePath });
  const signed = performance.now();
  await verifyArtifact({ ...inputs, keyPath: publicPath });
  const verified = performance.now();
  console.log(JSON.stringify({
    fixture: 'zero-filled sparse file',
    sizeMiB,
    signMs: signed - start,
    verifyMs: verified - signed,
    signMiBPerSecond: sizeMiB * 1000 / (signed - start),
    verifyMiBPerSecond: sizeMiB * 1000 / (verified - signed),
    processMaxRssKiB: process.resourceUsage().maxRSS,
  }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
