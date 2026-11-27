# Competitive audit

Reviewed 27 November 2026. For public GitHub repositories the maintenance column records the last push returned by the GitHub REST API. All listed repositories were unarchived. An upstream push indicates activity, with review and support status still to be assessed. Capabilities are source and documentation observations.

| Candidate | Mobile development capabilities | License and maintenance evidence |
| --- | --- | --- |
| [OmarchyRemote](https://github.com/gigq/OmarchyRemote/tree/573d40722d227d3067ae98d8f4c93e67d4380b6c) | Safari touch shell, resumable host PTYs, file editing, and an app build dashboard. The private network controls shell access. The dashboard covers signed mobile packages and SHA-256 identities. | MIT, 2026-10-30 |
| [Omodachi core](https://github.com/omodachi/omodachi-core), [plugin](https://github.com/omodachi/omodachi-plugin) | iPhone and iPad companion, pairing, terminal, remote screen, and host integration. The registry carries the [host plugin](https://plugins.omarchy.org/plugin.html?id=com.omodachi.host). Safari workflow and artifact verification remain unverified. | Both MIT, 2026-10-19 |
| [Flux](https://github.com/bjarneo/flux) | Device integration across clipboard, files, notifications, and media. Its documented feature set centers on device integration. | MIT, 2026-11-25 |
| [Omarchy Apple Dev](https://github.com/joshuaswarren/omarchy-apple-dev) | Builds and deploys SwiftUI apps from Omarchy. It can supply build outputs to a mobile workflow. | MIT, 2026-11-26 |
| [Blink Shell](https://github.com/blinksh/blink) | Native SSH and Mosh, with [browser editor integration](https://docs.blink.sh/advanced/code). A host multiplexer can keep the development session alive. | GPL-3.0 per GitHub metadata, 2026-11-09 |
| [Termius](https://www.termius.com/pricing) | Native SSH and SFTP across mobile and desktop. Host-side session persistence can be provided separately. | Vendor [terms](https://www.termius.com/terms-of-use) and active product offering; source push history unavailable |
| [iSH](https://github.com/ish-app/ish) | Local userspace emulation on iOS. A different execution model from a persistent Omarchy host. | [GPLv3 and iOS terms](https://github.com/ish-app/ish/blob/master/LICENSE.md), 2026-11-07 |
| [code-server](https://github.com/coder/code-server) | Browser editor, integrated terminal, and host workspaces. A good integration candidate when editor capability is the priority. | MIT, 2026-11-25 |
| [ttyd](https://github.com/tsl0922/ttyd) | Browser terminal, TLS and WebSockets. An operator supplies workspace editing, identity and persistence around the terminal. | MIT, 2026-11-24 |

## Omarchy and WebKit

Omarchy source was active on 2026-11-27 and licensed MIT. Its [Quattro shell plugin manual](https://github.com/omacom/omarchy/blob/quattro/manual/32-shell-plugins.md) documents a manifest-based interface and a limited interface for third-party shell plugins. The [registry client specification](https://github.com/omacom/omarchy-plugin-registry/blob/main/docs/client-spec.md) specifies signed metadata. The [community marketplace](https://github.com/omacom/omarchy-plugin-marketplace) is a separate catalog with its own review process. The MVP can run outside the desktop shell.

[WebKit documents](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) Home Screen web apps on iOS and iPadOS 26. Foreground recovery is a functional requirement. Acceptance includes locking the device and changing networks with a host job running, then proving that the same job remains accessible. Workload execution and session ownership stay on Linux.

## MVP decision

Integrate an existing touch terminal and editor. Qualify OmarchyRemote first under a dedicated account over a private network with device-level access policy. Its documentation explicitly gives shell access to every client able to reach the endpoint. Do not expose it until policy is proven for the specific enrolled phone, an unrelated peer, and a revoked phone with an existing connection. Investigate Omodachi or a separately authenticated front end if this gate fails.

The first OmaBridge-owned slice is transport-independent signing and verification of arbitrary build files. A recipient verifies a locally downloaded file using a public key and expected build identifier obtained independently of the download. This adds a release trust check to existing transport and covers build formats beyond the upstream mobile package dashboard. The first verifier is a CLI for a trusted machine. An on-device verifier and end-to-end physical device qualification remain required for a fully mobile release.

The adjacent OmaAudit workspace contains its engineering brief. It has no comparison evidence or shared JSON contract to consume yet. There is no OmaAudit dependency in this increment.
