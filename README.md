# OmaBridge

OmaBridge integrates OmarchyRemote's mobile workspace with device-authenticated HTTPS and verifiable build downloads. Run the [host gateway](docs/gateway.md) with the pinned OmarchyRemote services, then use Safari to open the workspace. [Validation results](docs/validation.md) describe the tested boundary and physical-device work still pending.

## Verify a downloaded build

Requires Node.js 24 or later. From a checkout, run `./scripts/install.sh` using an npm prefix you own, or run `node src/cli.mjs` in place of `omabridge`. To remove an installed copy, run `./scripts/uninstall.sh` with the same npm prefix.

Obtain the Ed25519 public key and the expected release identifier through a trusted channel independent of the download. Save the artifact under the original filename, then run:

```sh
omabridge verify build.tar.gz build.manifest.json trusted-public.pem build-123
```

Exit code 0 confirms that the signature, release identifier, filename, size and digest matched. A failed check exits with code 1. Keep the verified file in a directory writable only by your account.

## Sign a build

On a trusted signing machine with OpenSSL available, generate the signing key once. Keep the private key outside the remotely accessible workspace and any directory served for downloads.

```sh
(umask 077 && openssl genpkey -algorithm ED25519 -out signing-private.pem)
openssl pkey -in signing-private.pem -pubout -out trusted-public.pem
omabridge sign build.tar.gz build.manifest.json signing-private.pem build-123
```

Publish the artifact and the manifest together. Assign a unique release identifier to each build and communicate the expected identifier separately. The signer creates a new manifest and refuses to replace an existing file.

## Development

Run `npm test` and `npm run benchmark -- 64`. The benchmark measures local artifact signing and verification against a zero-filled sparse file. Mobile transfer and reconnect measurements belong to the host qualification run.

See the [competitive audit](docs/competitive-audit.md), [architecture decisions](docs/architecture.md), [manifest protocol](docs/manifest-v1.md), [threat model](docs/threat-model.md), [contribution guide](CONTRIBUTING.md), and [dependency inventory](sbom.cdx.json).
