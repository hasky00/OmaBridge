#!/usr/bin/env node
import { signArtifact, verifyArtifact } from './artifact.mjs';

const usage = 'Usage: omabridge sign|verify <artifact> <manifest> <key.pem> <expected-release>';
const [command, artifact, envelope, keyPath, release, ...extra] = process.argv.slice(2);

if (command === '--help' && artifact === undefined) {
  console.log(usage);
} else if (!['sign', 'verify'].includes(command) || !release || extra.length) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const action = command === 'sign' ? signArtifact : verifyArtifact;
    const result = await action({ artifact, envelope, keyPath, release });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Filesystem errors include paths that can disclose local account details.
    console.error(error.code ? `Operation failed (${error.code})` : error.message);
    process.exitCode = 1;
  }
}
