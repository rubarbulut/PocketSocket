# Security

Never attach WireGuard profiles, passwords, private keys, local routing configuration, or unredacted connection lists to a public issue.

Report a vulnerability using [GitHub private vulnerability reporting](https://github.com/rubarbulut/PocketSocket/security/advisories/new). Ordinary bugs belong in [Issues](https://github.com/rubarbulut/PocketSocket/issues) with a reviewed, redacted support report.

The application runs without administrator rights; a session-limited helper runs only the pinned routing engine with elevated rights. The helper validates the copied engine hash and monitors the GUI identity/heartbeat. It does not install a permanent routing daemon. Imported scripts are not executed. The controller listens on loopback with a random session bearer. The renderer has no Node access; IPC channels and the calling frame are checked.

The free distribution has no paid OS publisher certificate. Ad-hoc Mac signatures and pinned-key release-manifest verification serve different purposes from Apple notarization or Windows publisher signing. Never disable device-wide security controls to install PocketSocket.

There is no persistent OS kill switch. If the routing engine stops, system routing returns. Selected-app rejection on server failure applies while the engine runs. Process matching can miss shared system helpers; verify the actual route and do not rely on this beta for high-risk anonymity.

Source/core licenses and notices remain included. Keep the ignored release-signing private key secret; only the public verification key belongs in source. Rotating that pinned key requires a deliberate trusted distribution/update migration.
