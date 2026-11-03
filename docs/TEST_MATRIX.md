# Test coverage

The public beta targets macOS 13+ (Apple Silicon, including MacBook Neo/A18 Pro, and Intel), Windows 11 x64, and desktop Linux x64 with PolicyKit. CI uses hosted Mac, Windows Server and Ubuntu runners; passing CI is not equivalent to testing every end-user OS build or ISP.

| Layer | What is checked |
| --- | --- |
| Unit | Profile parser, encrypted persistence, session-only fallback, bounded settings, app rule injection resistance, DNS-only rules, localhost proxy validation, both language dictionaries, support redaction, forged-update rejection, failure policy, selected-flow-only closure, disconnect order and elevation data transport. |
| Real engine without TUN | Production config validation, controller authentication and loaded rules. Safe for development hosts. |
| UI | Actual Electron/preload/IPC, EN/TR changes, theme, DNS-mode controls, profile import/delete, invalid replacement, local proxy, browser-wide warning, redacted report export. |
| Disposable privileged CI | Real TUN startup, controller readiness, TUN disable, lease cancellation and core shutdown. Uses a synthetic profile; does not authenticate with a real VPN provider. Never run on a developer’s gaming/network session. |
| Packaged app | Real helper files outside ASAR, executable core, Mac ad-hoc signature integrity, and actual packaged UI launch. |

## Real-world release checks

- Windows 11 standard/admin accounts, clean downloaded installer, SmartScreen/Smart App Control, install/uninstall, portable startup path and firewall behavior.
- macOS downloaded/quarantined DMG on a second machine, Apple Silicon/Neo and Intel, keychain available/locked, administrator permission cancellation and normal/forced quit.
- Linux desktop PolicyKit authentication, AppImage/FUSE and tar.gz, system keyring available/unavailable.
- WireGuard and local SOCKS5 providers, valid/invalid credentials, UDP support, dual-stack and IPv4-only configurations.
- Discord text, voice, microphone, screen sharing and reconnection; browser-wide routing and custom app helpers.
- Concurrent games/movies, real in-game latency, packet loss, CPU/RAM and battery, not just HTTP checks.
- Wi-Fi/Ethernet/hotspot changes, suspend/resume, another VPN active and abrupt termination/power loss.

Specific Türkiye access restrictions, Discord voice quality, game latency, and process recognition for all supported apps are **not established by CI**. Record them separately with provider/ISP/device details; do not attach private profiles or keys.

[Detailed initial Mac checklist](MAC_TEST.md) · [Privacy](PRIVACY.md)
