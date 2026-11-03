# PocketSocket 0.2.0 — public beta

Free selected-app routing for Windows 11 x64, macOS Apple Silicon/Intel and desktop Linux x64. Bring your own WireGuard profile or compatible localhost SOCKS5 proxy; no VPN accounts or servers are provided.

- English/Turkish interface, system/light/dark appearance and visual onboarding.
- OS-encrypted saved profiles, multiple profiles and session-only fallback when protected storage is unavailable.
- Installed-app discovery, manual app selection, browser-wide routing warning and saved app selections.
- Selected-app tunnel, device-wide encrypted DNS and smart direct/DNS detection.
- Real outbound and Discord HTTPS checks through the selected profile; direct-vs-profile HTTP latency; UDP-flow observation, not a voice-quality guarantee.
- Selected-app block/direct fallback policies while the engine runs; no crash-proof OS kill switch.
- Tray/menu bar controls, optional login startup, optional startup connection and network recovery checks without background administrator prompts.
- Redacted support export, in-app free-distribution help and release-manifest verification with a pinned Ed25519 public key.
- A real TUN startup/cleanup check and packaged Electron UI tests run on disposable CI machines.

## Download and install

https://rubarbulut.github.io/PocketSocket/

MacBook Neo (A18 Pro) and M-series Macs use **mac-arm64**. Intel Macs use **mac-x64**. Windows installer is **win-x64.exe**; a portable EXE is also included. Linux offers AppImage and tar.gz; routing needs PolicyKit.

This free distribution has no paid Apple Developer ID/notarization or Windows publisher certificate. Mac bundles have an ad-hoc integrity signature. OS trust warnings may still appear. Read the in-app Help or the illustrated README; do not disable device-wide security protection. The update-manifest signature is independent of OS publisher signing.

Discord access, voice, screen sharing, game latency and compatibility with particular ISPs/providers still need real-world testing. CI does not establish those results. Profiles with custom scripts or nonstandard WireGuard fields are rejected. Selecting a browser affects the whole browser.

Checks contact Discord, Google's connectivity endpoint and (for smart DNS detection) Cloudflare. No PocketSocket analytics service exists. Review support exports before sharing them.

The release includes application/core source archives, third-party notices, SHA256SUMS and the signed update manifest. Keep corresponding source and notices when redistributing.
