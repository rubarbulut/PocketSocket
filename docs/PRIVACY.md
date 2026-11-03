# Privacy / Gizlilik

PocketSocket has no analytics backend, advertising SDK, account system or browsing-history collection. Your VPN provider, proxy provider, DNS resolver, GitHub and contacted services have their own privacy policies.

**Profiles:** kept on your device. When remembering profiles is enabled and an OS-backed encryption provider is available, sensitive configuration is encrypted before storage. macOS and Windows protection semantics differ; this does not protect against every program running as your user or an administrator. Linux plaintext fallback is refused. Without a protected store, profiles are session-only.

**Temporary routing configuration:** an active session needs a temporary configuration containing credentials. User-session directories are restricted to the user and administrators; the privileged copy is restricted to administrators/root. Normal shutdown removes session files. A machine crash or power loss can leave restricted files behind; no forensic erasure is promised.

**Network checks:** on connection and while recovery checks are enabled, the selected outbound is tested against `www.gstatic.com/generate_204` and `discord.com/api/v10/gateway`. Direct-path checks are separately labeled. Smart detection also queries Cloudflare’s DNS-over-HTTPS endpoint. These services and your network/provider receive normal network metadata. No check result is uploaded to a PocketSocket backend.

**Updates:** only a user-requested update check contacts GitHub Releases. A pinned Ed25519 public key verifies the release manifest; SHA-256 checks the downloaded installer. This is not an Apple/Microsoft publisher certificate. Installation is manual.

**Reports:** support exports use an explicit field allowlist: app/platform version, architecture, mode, resolver choice, profile count, protected-store availability, status codes, check results, and main-process memory. They exclude profile contents/names, passwords, private keys, user paths, IPs, and live connection destinations. Reports are saved locally. You choose whether and where to share them.

**Local UI:** the live connection list may display destination names and application names on your screen. These are not included in reports. Installed-app discovery scans normal application/Start Menu locations only when you request it; shortcuts are inspected, not executed.

## Türkçe

Analiz sunucusu, reklam SDK’sı, hesap sistemi veya gezinme geçmişi toplama yoktur. Profiller cihazında kalır; güvenli işletim sistemi deposu varsa şifrelenir, yoksa yalnızca oturumda tutulur. Etkin bağlantı için gereken geçici yapılandırmalar sınırlı izinlerle saklanır. Normal kapanışta temizlenir; elektrik kesintisinde dosya kalabilir.

Bağlantı testleri Discord ve Google bağlantı test adresine, akıllı algılama ayrıca Cloudflare DNS’e ulaşır. Güncelleme kontrolü GitHub’a yapılır. Bu hizmetlerin ve VPN sağlayıcının kendi gizlilik koşulları geçerlidir. Sonuçlar PocketSocket sunucusuna gönderilmez.

Destek raporları yerel kaydedilir ve hassas alanları içermez. Paylaşıp paylaşmamak sana bağlıdır; önce incele. Ekrandaki canlı hedef listesi rapora eklenmez. Uygulama keşfi yalnız sen istediğinde yapılır ve bulunan kısayollar çalıştırılmaz.
