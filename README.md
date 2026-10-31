# PocketSocket

**Bir uygulamaya tünel. Geri kalanına özgürlük.**

macOS 13+ için deneysel bir uygulama yönlendiricisi. Kendi VPN sağlayıcından aldığın standart WireGuard `.conf` dosyasını içe aktar; Discord, Discord PTB veya Discord Canary'yi seç; bağlan. Sunucu veya VPN hesabı sağlamaz. Mevcut VPN uygulamalarını otomatik kontrol etmez; bu ilk sürüm sağlayıcının WireGuard profilini kullanır.

## Arkadaşa gönderilecek sürüm

GitHub → **Actions → macOS beta → son başarılı çalışma → Artifacts**:

- **PocketSocket-mac-arm64**: Apple Silicon (M1/M2/M3/M4/M5 vb.).
- **PocketSocket-mac-x64**: Intel Mac.

Artifact arşivini indirip aç; içindeki `.dmg` dosyasından PocketSocket'i Applications'a taşı. Alternatif olarak uygulama `.zip` paketini aç. Node.js, Homebrew veya ayrı WireGuard uygulaması gerekmez. Private repodaki Actions indirmeleri için repo erişimi gerekir; indirdiğin paketi arkadaşına ayrıca gönderebilirsin.

Beta Apple Developer sertifikasıyla imzalı/noter onaylı değildir. Kaynağını doğruladığın bu paketi macOS engellerse Sistem Ayarları → Gizlilik ve Güvenlik → Yine de Aç yolunu kullan. İşletim sistemi korumalarını genel olarak kapatma. Apple hesabı/sertifikası gerektirmeyen test dağıtımıdır.

## İlk bağlantı

1. VPN sağlayıcından **standart WireGuard yapılandırma dosyasını** al. Her sağlayıcı veya ücretsiz plan bunu sunmaz; PocketSocket bu sınırları kaldırmaz.
2. Başka VPN/TUN uygulamalarını kapat. Arkada çalışan başka VPN, oyunu da kendi tüneline alabilir veya yönlendirmeyle çakışabilir.
3. Dosyayı PocketSocket'e aktar ve Discord'u seç.
4. **Bağlan** düğmesine bas, macOS yönetici iznini onayla. Yönetici parolanı PocketSocket almaz; sistem penceresine girersin.
5. Discord'u **Cmd+Q ile tamamen kapatıp** yeniden aç; ses kanalına gir.
6. **Canlı bağlantılar** bölümünde Discord TCP/UDP bağlantılarının `Tünel`, diğer uygulamaların `Doğrudan` olduğunu kontrol et.
7. **Bağlantıyı kes** ile kapat. Uygulamadan çıkış da tüneli durdurur.

**“Yönlendirme etkin” yalnızca yerel motorun ve TUN yapılandırmasının etkin olduğunu belirtir.** Sunucuyla WireGuard el sıkışmasının, Discord erişiminin veya sesin çalıştığı anlamına gelmez. Bunları gerçek sağlayıcı ve bağlantıyla test etmek gerekir. Türkiye'deki erişim, ses ve eşzamanlı oyun gecikmesi henüz doğrulanmamıştır.

## Sınırlar

- Varsayılan kural `DIRECT`; yalnızca seçilen Discord süreçleri VPN çıkışına yönlendirilir. Tarayıcıdaki Discord, tarayıcıyı seçmediğimiz için kapsanmaz.
- macOS'ta trafik önce yerel TUN motoruna girer, ardından uygulama kuralına göre doğrudan veya WireGuard üzerinden çıkar. Oyun VPN sunucusundan geçirilmez; yerel motorun işlem yükü ve ortak internet hattının yoğunluğu yine gecikmeyi etkileyebilir. **Sıfır ping değişimi garantisi yoktur.**
- DNS sorguları bağlantı süresince yerel motor tarafından yakalanır. Normal uygulamaların DNS çözümlemesi de etkilenebilir. IPv4 profillerinde AAAA yanıtları kapatılır; seçilen Discord süreçlerinin önbellekteki IPv6 bağlantıları doğrudan kaçmak yerine reddedilir. DNS-over-HTTPS kullanan diğer uygulamalar kendi yöntemlerini sürdürebilir.
- Uygulama tanıma başarısızsa varsayılan doğrudan bağlantı kullanılır. Bu beta gizlilik amaçlı bir kill switch değildir. Bağlantı ekranında Discord'un gerçekten `Tünel` göründüğünü doğrula.
- Standart, tek peer ve IPv4 internet çıkışı olan profiller desteklenir. Çift yığın profilleri de desteklenir. `PostUp`, `PreDown` gibi komutlar ve AmneziaWG'ye özgü alanlar reddedilir. `ListenPort` doğrulanır ama uygulanmaz; DNS alanı doğrulanır, çözümleyici olarak yerel motorun DoH ayarları kullanılır. Bu sürüm özel ağ/split AllowedIPs profilleri için değildir.
- Profil kalıcı kaydedilmez; her açılışta yeniden aktarılır. Anahtarlar yalnızca ana süreç belleğinde ve oturumun geçici 0600 dosyalarında tutulur. Canlı hedef adresleri yalnızca yerel arayüzde gösterilir, dışarı gönderilmez.

## Geliştirme

Node.js 24 ve macOS 13+:

```sh
npm ci
npm run core:fetch
npm test
npm run core:check
npm start
```

Paketlemek için `npm run build:mac -- --arm64` veya `--x64`. Çekirdek mimarisi hedefle eşleşmeli: `npm run core:fetch -- darwin-arm64` veya `darwin-x64`. GitHub Actions her iki mimaride test edip `.dmg` ve `.zip` üretir. İlk yükleme için gerçek Apple sertifikası/noter onayı ayrı bir sonraki adımdır.

Windows'ta arayüz ve profil/çekirdek doğrulama testleri çalışır; tünel başlatılmaz. `npm run core:check` gerçek motoru **TUN kapalı** çalıştırır; geliştirici/CI makinesinin yönlendirmesini değiştirmez. Yetkili TUN oturumunun gerçek cihaz testi için [Mac test rehberi](docs/MAC_TEST.md) kullanılır.

## Mimari

Electron arayüzü → sınırlı IPC → doğrulanan WireGuard profili → sabit sürümlü Mihomo → macOS TUN + süreç kuralları. Arayüzde Node erişimi kapalı, sandbox/context isolation etkin; controller yalnızca loopback'te rastgele port ve oturuma özel bearer ile dinler. Genel bir proxy portu açılmaz.

Yönetici izni yalnızca oturumluk motoru çalıştırmak içindir. Motor/config özel root dizinine kopyalanır; kopya motorun hash'i kontrol edilir. Root supervisor, GUI kimliğini ve 15 saniyelik heartbeat'i izler. Kapanış/çöküşte kendi alt sürecini durdurur; oturum dizini temizlenir. Kalıcı launch daemon veya açılış servisi kurulmaz; sistem DNS tercihleri değiştirilmez. GUI zorla kapatılırsa cleanup için yaklaşık 15–22 saniye gerekebilir.

Mihomo indirmeleri sürüm ve SHA-256 ile sabitlenir. Lisans: GPL-3.0-only. Bileşenler ve kaynak için [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
