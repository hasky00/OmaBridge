#!/usr/bin/env node
import { X509Certificate } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGateway } from './gateway.mjs';

const [command, path, certificate, ...extra] = process.argv.slice(2);
const usage = 'Usage: omabridge-host serve <config.json> | register|revoke <registry> <device-cert.pem>';

try {
  if (extra.length || !path) throw new Error(usage);
  if (command === 'serve' && !certificate) {
    const { server, bind, port } = loadGateway(path);
    server.on('error', error => {
      console.error(`Host listener failed (${error.code ?? 'unknown'})`);
      process.exitCode = 1;
    });
    server.listen(port, bind, () => console.log('OmaBridge TLS gateway ready'));
  } else if (['register', 'revoke'].includes(command) && certificate) {
    const cert = new X509Certificate(readFileSync(certificate));
    if (cert.ca) throw new Error('Expected a device leaf certificate');
    const id = cert.fingerprint256.replaceAll(':', '').toLowerCase();
    const record = join(path, id);
    if (command === 'register') writeFileSync(record, '', { flag: 'wx', mode: 0o600 });
    else unlinkSync(record);
    console.log(id);
  } else {
    throw new Error(usage);
  }
} catch (error) {
  console.error(error.code ? `Host operation failed (${error.code})` : error.message);
  process.exitCode = 1;
}
