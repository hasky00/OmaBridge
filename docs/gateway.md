# Host gateway v1

OmaBridge forwards authenticated HTTPS and WebSocket traffic to the pinned OmarchyRemote browser service on IPv4 loopback. HTTP Host and browser Origin are preserved and checked. Cross-site Fetch Metadata is rejected when supplied. WebSocket and non-GET/HEAD requests require an exact Origin match. TLS 1.3 verifies the server's certificate and the client certificate chain using the respective trust stores. Admission additionally requires a locally registered SHA-256 certificate fingerprint. No OmaBridge login cookie or bearer token is issued.

## Install on an isolated Omarchy host

1. Review the [pinned OmarchyRemote installation](https://github.com/gigq/OmarchyRemote/tree/573d40722d227d3067ae98d8f4c93e67d4380b6c#run-it). Run the upstream services under a dedicated workspace account without sudo or privileged sockets. Set `OMARCHY_ORIGINS` for both upstream services to the exact OmaBridge HTTPS origin, including the port. Leave 4187 and 4188 on loopback. Keep untrusted local users off this host or isolate the gateway and workspace in a dedicated VM. Other local users could otherwise reach the upstream HTTP service directly.
2. Install Node.js 24 or later and copy this checkout to a root-owned `/opt/omabridge`. Create a separate system account and group named `omabridge-gateway`. Place the HTTPS server certificate, key and dedicated device CA public certificate under `/etc/omabridge`. The server certificate must match the hostname and chain to a CA trusted by the phone. Restrict access to the server private key to root and the gateway group. The workspace account must have no write access to gateway code, registry or config.
3. Create the registry as a root-owned directory traversable by the gateway group. Copy [gateway.example.json](../deploy/gateway.example.json) to `/etc/omabridge/gateway.json`. Set the real HTTPS origin and explicitly set `bind` to the host's private-network IP for physical device access. Keep the gateway restricted to the private network. Install [the systemd unit](../deploy/omabridge-gateway.service) and start it. The unit expects Node at `/usr/bin/node`. Use a port above 1023 with the unprivileged account.
4. Through a dedicated client CA, issue each device a distinct certificate with the TLS client authentication extended key usage. Use an OS-compatible identity such as P-256 and deliver the password-protected PKCS#12 identity and its password through trusted channels, or provision it with managed enrollment. Keep the CA signing key off the workspace and gateway hosts. With administrative privileges on the host register the corresponding public certificate:

   ```sh
   node /opt/omabridge/src/host.mjs register /etc/omabridge/devices device.pem
   ```

5. Install the identity on the device and open the expected HTTPS URL in Safari. Select that identity if prompted. Open the existing Terminal and Files apps. The upstream client owns reconnect attempts and the workspace process. The gateway follows the original WebSocket protocol and does not buffer or replay terminal messages.
6. Publish the signed artifact and its v1 manifest in an approved workspace directory and download both through Files. Verify them using the CLI and independently supplied trust inputs. Verification currently occurs on a trusted machine with Node. It is separate from Safari download.
7. Revoke a device from the host console:

   ```sh
   node /opt/omabridge/src/host.mjs revoke /etc/omabridge/devices device.pem
   ```

   New HTTP requests and upgrades are denied as soon as the record is removed. Every 500 ms the gateway checks established sockets and destroys the revoked device's connections. Scheduling pressure can delay that check. Revocation leaves upstream processes running and cannot undo commands that were already sent. Other devices keep their access.

For shutdown, disable the gateway unit and stop the upstream user units. Remove the gateway unit and configuration under normal administrative control. Keep certificates, registry and workspace state according to the host's retention policy.

## Scope

Each enrolled identity can use the same single-user workspace, including the functions exposed by the upstream shell. Certificate registration is operator-driven and there is no remote enrollment endpoint. Possession of the device private key is the authentication factor. Provisioning with exportable identities allows copies to authenticate until the corresponding certificate is revoked. The gateway cannot distinguish such copies. Existing sessions are not expected to survive an upstream service restart or a host reboot.
