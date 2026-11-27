import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { constants } from 'node:fs';
import { link, mkdtemp, open, unlink, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const maxEnvelopeSize = 8192;
const maxKeySize = 16384;
const releasePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;

async function readSmall(path, limit) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Expected a regular file');
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const result = await file.read(buffer, bytes, buffer.length - bytes);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
    }
    if (bytes > limit) throw new Error('Input exceeds the allowed size');
    return buffer.subarray(0, bytes);
  } finally {
    await file.close();
  }
}

async function hashArtifact(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new Error('Expected a regular artifact file');
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      size += chunk.length;
      if (BigInt(size) > before.size) throw new Error('Artifact changed while hashing');
    }
    const after = await file.stat({ bigint: true });
    if (!Number.isSafeInteger(size) || BigInt(size) !== before.size ||
        after.size !== before.size || after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs) {
      throw new Error('Artifact changed while hashing');
    }
    return { size, sha256: hash.digest('hex') };
  } finally {
    await file.close();
  }
}

function validateRelease(value) {
  if (typeof value !== 'string' || !releasePattern.test(value) || value.trim() !== value) {
    throw new Error('Invalid release identifier');
  }
}

function validateName(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' ||
      Buffer.byteLength(value) > 255 || /[/\\\p{Cc}]/u.test(value)) {
    throw new Error('Invalid artifact filename');
  }
}

function canonicalManifest({ release, name, size, sha256 }) {
  return { version: 1, release, name, size, sha256 };
}

function signingBytes(manifest) {
  return Buffer.from('OmaBridge artifact manifest v1\n' + JSON.stringify(manifest));
}

function decodeEnvelope(bytes) {
  let envelope;
  try {
    envelope = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid artifact envelope JSON');
  }
  const fields = envelope?.manifest;
  if (fields?.version !== 1 || !Number.isSafeInteger(fields.size) || fields.size < 0 ||
      typeof fields.sha256 !== 'string' || fields.sha256.length !== 64 ||
      !digestPattern.test(fields.sha256) || typeof envelope.signature !== 'string') {
    throw new Error('Invalid artifact manifest');
  }
  validateRelease(fields.release);
  validateName(fields.name);
  const manifest = canonicalManifest(fields);
  const signature = Buffer.from(envelope.signature, 'base64');
  // Exact bytes reject duplicate fields, unknown fields and ambiguous encodings.
  if (signature.length !== 64 ||
      !bytes.equals(encodeEnvelope(manifest, signature))) {
    throw new Error('Invalid artifact envelope encoding');
  }
  return { manifest, signature };
}

function encodeEnvelope(manifest, signature) {
  return Buffer.from(JSON.stringify({ manifest, signature: signature.toString('base64') }) + '\n');
}

function requireEd25519(key) {
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 key');
  return key;
}

async function writeNewManifest(path, data) {
  const directory = await mkdtemp(join(dirname(path), '.omabridge-'));
  const temporary = join(directory, 'manifest');
  try {
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    await rmdir(directory);
  }
}

export async function signArtifact({ artifact, envelope, keyPath, release }) {
  validateRelease(release);
  const name = basename(artifact);
  validateName(name);
  const key = requireEd25519(createPrivateKey(await readSmall(keyPath, maxKeySize)));
  const manifest = canonicalManifest({ release, name, ...await hashArtifact(artifact) });
  await writeNewManifest(envelope, encodeEnvelope(manifest, sign(null, signingBytes(manifest), key)));
  return manifest;
}

export async function verifyArtifact({ artifact, envelope, keyPath, release }) {
  validateRelease(release);
  const { manifest, signature } = decodeEnvelope(await readSmall(envelope, maxEnvelopeSize));
  const keyBytes = await readSmall(keyPath, maxKeySize);
  if (!keyBytes.toString('ascii').startsWith('-----BEGIN PUBLIC KEY-----')) {
    throw new Error('Expected an SPKI public key');
  }
  const key = requireEd25519(createPublicKey(keyBytes));
  if (!verify(null, signingBytes(manifest), key, signature)) throw new Error('Invalid manifest signature');
  if (manifest.release !== release) throw new Error('Unexpected release identifier');
  if (manifest.name !== basename(artifact)) throw new Error('Unexpected artifact filename');
  const { size, sha256 } = await hashArtifact(artifact);
  if (manifest.size !== size || manifest.sha256 !== sha256) throw new Error('Artifact integrity check failed');
  return manifest;
}
