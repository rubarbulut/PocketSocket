# PocketSocket 0.2 · Technical notes

[English guide](../README.en.md) · [Türkçe rehber](../README.md) · [Test matrix](TEST_MATRIX.md)

## Architecture

Electron renderer → fixed IPC methods → validated settings/profiles → pinned Mihomo → session-limited platform supervisor → TUN and selected-process/path routing.

The renderer is sandboxed with context isolation and no Node integration. Navigation/new windows and permissions are denied. IPC verifies the sender and exact main frame URL. Imported configuration text is never shell code. Custom app rules reject commas/control characters and use validated executable/bundle paths. Shared system helpers may require additional matching; unrecognized traffic is direct.

Mihomo listens for controller requests on a random loopback port with a random bearer token. No general-purpose inbound proxy port is opened. Selected traffic goes to `PocketRoute`, whose options are the imported outbound, REJECT and (only if explicitly chosen) DIRECT. Other traffic ends in `MATCH,DIRECT`.

Health changes close only connections whose chain contains `PocketRoute`; they must never issue a global connection-delete request. Selected-outbound HTTP tests bypass the selected group so an unhealthy/blocked route can be tested and recovered. Discord HTTPS, generic HTTP access and observed UDP flows are different signals; none alone proves voice quality.

## Platform helpers

- **macOS:** OS administrator dialog launches a session shell; the engine/config/supervisor are copied into a root-only temporary directory, the copied binary is hashed, and a parent identity + lease watchdog owns the child. The bundle uses a free ad-hoc code signature. Paid Developer ID and notarization are not configured.
- **Windows:** a hidden PowerShell launcher asks for UAC only on a user-started connection (or explicitly enabled startup connection). Data and bundled script source travel as base64 arguments, not interpolated profile fields. The elevated helper creates an administrator/SYSTEM-owned ProgramData session directory, verifies the binary hash, tracks the GUI creation time/lease and owns only its child process. User staging has explicit private ACLs. The GUI first requests TUN disable before ending the lease. The application is not a permanent Windows routing service and has no paid publisher certificate.
- **Linux:** PolicyKit `/usr/bin/pkexec` launches a root-only temporary session with the same hash, parent and heartbeat checks. A working desktop authentication agent is required. AppImage and tar.gz are offered. Optional login launch is currently exposed on Mac/Windows only.

Helpers must be actual files in `resources/helpers`, not hidden in ASAR. No helper installs a permanent boot daemon. Normal cleanup removes session files; power loss may leave restricted directories. Heartbeat expiry can take roughly 15–22 seconds. Selected-app rejection applies only while the engine runs; this is not an OS-persistent crash-proof kill switch.

## Modes and DNS

Tunnel mode supports standard single-peer WireGuard internet profiles and localhost SOCKS5 (UDP opt-in). `PostUp`, `PreDown` and nonstandard protocol fields are rejected. `ListenPort` is validated but not applied. WireGuard DNS fields are validated; configured encrypted resolvers are used for the local DNS engine. IPv4-only tunnel profiles suppress AAAA resolution and reject cached selected-app IPv6 connections rather than sending them direct.

DNS mode contains no VPN outbound and ends every flow in DIRECT; it changes how intercepted device DNS is resolved. DNS interception is not app-isolated. Existing DNS-over-HTTPS applications can use their own method. Windows strict routing is used for the core’s DNS behavior and can conflict with other virtual-network software.

Smart detection tests Discord HTTPS using the system path, then a Cloudflare-resolved address with proper TLS hostname verification, before selecting DNS mode or the imported profile. These probes are not voice tests and do not defeat every network restriction.

## Profiles, privacy and updates

Profile material is encrypted with Electron OS-backed safeStorage before persistence. Plaintext Linux fallback is refused. Protected-store unavailability means session-only profiles. Native encryption semantics differ on Mac and Windows; this is not protection against a fully compromised user/admin account. See [PRIVACY.md](PRIVACY.md).

Updates are checked on user request against public GitHub Releases. An Ed25519 public key is pinned in the app; the matching private key is an ignored local file and a GitHub Actions secret. Verified manifests list exact installer size and SHA-256. Downloaded installers are checked before being renamed to the user-selected final path. No unsigned/forged update is offered, and no automatic installer execution occurs. This release signature is independent from OS publisher signing. Earlier signed releases provide a manual rollback path.

The publish workflow accepts only a successful Desktop packages run at the exact checked-out commit. It merges matching artifacts, includes corresponding app/core source, signs the manifest and publishes a public beta. The static GitHub Pages download page has no build/runtime backend or analytics.

## Development

Node.js 24:

```sh
npm ci
npm run core:fetch
npm run test:unit
npm run core:check
npm start
```

`npm test` also launches actual Electron UI tests in hidden windows with an isolated settings directory. On Linux a graphical session/Xvfb is needed. `npm run test:headless` uses an installed Chrome/Chromium (or Playwright browser) and a clearly mocked backend to validate the renderer and capture initial-state previews; it does not establish IPC, privilege or network behavior.

```sh
npm run build:mac -- --arm64
npm run build:win -- --x64
npm run build:linux -- --x64
```

Fetch the matching target core first (`darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`). The fetcher checks a pinned compressed-asset SHA-256, applies an ad-hoc Mac signature and prepares the correct bundle directory. ARM Windows/Linux core entries exist, but native packaged releases for those targets are not in the current tested matrix.

The privileged `check-supervisor.cjs` test refuses to run outside disposable GitHub Actions runners. It alters only that runner’s temporary routing. Do not remove this guard to test on a machine with an active game/network session.

## Boundaries

- Provider links are setup guides; there is no universal VPN-client control API or provider login integration.
- No bundled free account, owned VPN server, browser-tab-only routing, iOS/Android client or OS-persistent kill switch.
- No paid signing/notarization, paid hosting or mandatory backend. Standard public-repository CI and GitHub Pages/Releases are used; service quotas still apply.
- No anonymity, guaranteed unblock, stable ping or verified voice claim. Real-world provider/ISP/device checks remain necessary.
- Core/source notices remain included under the project’s GPL-3.0 license; free distribution does not remove those obligations.

## Additional-platform feasibility

Browser-tab isolation needs a browser-specific design and separate WebRTC/UDP validation. Android/iOS require their native VPN frameworks and their platform-specific app-routing/distribution restrictions. They are separate engineering work, not desktop build flags. This desktop release does not present those as working features.
