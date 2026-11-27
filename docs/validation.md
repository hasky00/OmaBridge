# Phase 1 validation

Validated 27 November 2026 on arm64 macOS with Node.js 26.8.1. All seven tests passed. The integration test used real loopback TLS 1.3, certificates, HTTP and WebSocket upgrades. Its upstream was a fixture server and an independent Node process.

| Check | Result |
| --- | --- |
| Device admission | TLS denied a client without an identity. HTTPS denied a valid CA-issued identity before registration and served it afterward. |
| Browser boundary | The gateway rejected an unexpected Host, cross-site Fetch Metadata, a mutation without Origin, and a WebSocket from a foreign Origin. |
| Persistent execution and reconnect | A second WebSocket reached the same fixture PID and observed later output after the first disconnected. |
| File transfer | The test downloaded a file and signed v1 manifest through authenticated HTTPS, verified the received file, then rejected an equal-length alteration. |
| Active revocation | Removing one registered fingerprint closed its live WebSocket. Its later HTTP and WebSocket requests failed. A registered second identity still connected. |
| Artifact protocol | Six CLI tests cover successful verification, same-length tampering, truncation, release and filename mismatch, key substitution, signature tampering, malformed encoding and concurrent signing. |

The Phase 0 documents were reviewed against the pinned upstream source and implementation. The source checks the configured Host and Origin and its own internal proxy token. The added mTLS boundary supplies independent device identity and revocation. The compact v1 artifact format and offline trust inputs are unchanged. The existing upstream client owns terminal behavior, including reconnect. The architecture uses operator-provisioned X.509 identities instead of QR pairing or an application login.

Still pending: running upstream plus gateway together on Omarchy, installing the systemd unit, verifying Safari certificate selection on physical iPhone and iPad, testing automatic client recovery after device lock and network changes, profiling resource use and reconnect latency, and qualifying both Omarchy architectures. The fixture cannot establish how the actual mobile client behaves. No on-device artifact verifier is included. Follow the [qualification runbook](host-qualification.md) before relying on this installation with a real workspace.
