# PocketSocket · Teknik notlar

[← Görsel kurulum rehberine dön](../README.md)

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

Windows'ta arayüz ve profil/çekirdek doğrulama testleri çalışır; tünel başlatılmaz. `npm run core:check` gerçek motoru **TUN kapalı** çalıştırır; geliştirici/CI makinesinin yönlendirmesini değiştirmez. Yetkili TUN oturumunun gerçek cihaz testi için [Mac test rehberi](MAC_TEST.md) kullanılır.

## Mimari

Electron arayüzü → sınırlı IPC → doğrulanan WireGuard profili → sabit sürümlü Mihomo → macOS TUN + süreç kuralları. Arayüzde Node erişimi kapalı, sandbox/context isolation etkin; controller yalnızca loopback'te rastgele port ve oturuma özel bearer ile dinler. Genel bir proxy portu açılmaz.

Yönetici izni yalnızca oturumluk motoru çalıştırmak içindir. Motor/config özel root dizinine kopyalanır; kopya motorun hash'i kontrol edilir. Root supervisor, GUI kimliğini ve 15 saniyelik heartbeat'i izler. Kapanış/çöküşte kendi alt sürecini durdurur; oturum dizini temizlenir. Kalıcı launch daemon veya açılış servisi kurulmaz; sistem DNS tercihleri değiştirilmez. GUI zorla kapatılırsa cleanup için yaklaşık 15–22 saniye gerekebilir.

Mihomo indirmeleri sürüm ve SHA-256 ile sabitlenir. Lisans: GPL-3.0-only. Bileşenler ve kaynak için [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
