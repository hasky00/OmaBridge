# Artifact manifest v1

An envelope is UTF-8 JSON followed by one LF, at most 8,192 bytes. It uses compact ECMAScript JSON.stringify serialization, with exactly these properties in this order:

```text
{"manifest":{"version":1,"release":"build-123","name":"build.tar.gz","size":123,"sha256":"<64 lowercase hex digits>"},"signature":"<standard padded base64>"}
```

The signature is Ed25519 over the UTF-8 bytes of `OmaBridge artifact manifest v1`, one LF, and the compact JSON serialization of the inner manifest, with no trailing LF. It is encoded as standard padded base64 for a 64-byte signature. Keys are PEM PKCS#8 for signing and PEM SPKI for verification. The release matches an ASCII alphanumeric leading character followed by up to 127 ASCII alphanumerics, dots, underscores or hyphens. The name is a UTF-8 basename of at most 255 bytes, excluding control characters, slashes, backslashes, the empty name, and the names `.` and `..`. The size is a nonnegative JavaScript safe integer counting bytes. The digest is SHA-256 of the raw file.

Verification requires the canonical byte encoding, a valid signature under the trusted key, the independently supplied expected release identifier and the artifact's actual basename, size and digest. Field names, order, and serialization are part of v1. There is no timestamp or revocation mechanism for signer keys in the envelope. Provision an updated trusted key out of band when replacing a key.
