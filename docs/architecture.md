# Architecture decisions

## ADR 001 · Integrate the mobile workspace

Status: implemented at the gateway boundary; physical-device qualification pending.

OmarchyRemote already provides the touch workspace, Git access via terminal, editing, file transfer and reconnectable PTYs. Use the upstream Rust and browser services under a dedicated unprivileged Linux account if host qualification succeeds. TLS and device admission use the OmaBridge mTLS gateway. Evaluate the ingress against actual policy enforcement before using a terminal. A separate tmux server under that account can preserve a job across a client or gateway failure when the host remains up. SSH remains useful for operator maintenance through existing access controls.

A new Rust daemon, TypeScript frontend, Swift client, or Omarchy plugin would duplicate functions required for qualification. The artifact protocol can be implemented later in TypeScript and WebCrypto if physical-device compatibility and public-key provisioning are proven. The first CLI uses Node's built-in crypto and streaming APIs and has no npm dependencies.

## ADR 002 · Authenticate a release manifest

Status: implemented.

Sign a versioned, domain-separated manifest using Ed25519 through the platform crypto library. The manifest binds the released bytes to a build identifier and filename. A verifier gets its trust key and expected identifier independently. Stream SHA-256 over the file with bounded memory. The verifier can work offline after download. The artifact CLI is local. The gateway forwards the upstream browser endpoints.

## ADR 003 · Upstream boundaries

Status: implemented at the gateway boundary; physical-device qualification pending.

The upstream session and WebSocket protocols are owned by the chosen gateway. Pin and record its revision, the private ingress version, and the Linux distribution used in each qualification run. The OmaBridge manifest protocol is v1. OmaAudit interoperability requires a mutually agreed versioned contract before implementation. Software in this checkout uses the MIT license already present in the linked repository.
