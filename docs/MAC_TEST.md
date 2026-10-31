# Gerçek Mac test listesi

Bu liste otomatik testlerin yerini tutmadığı gerçek ağ davranışlarını doğrular. Sağlayıcının geçerli WireGuard profili gerekir. Profil dosyasını veya anahtarlarını GitHub'a yükleme.

1. Mac modeli, işlemci ve macOS sürümünü kaydet. M serisi için arm64, Intel için x64 paketini aç.
2. Başka VPN uygulamaları kapalıyken Discord erişimini, normal web erişimini ve oyunun pingini birkaç dakika kaydet. Sağlayıcı bölgesi ve ağ türünü (Wi-Fi/kablo) not al.
3. PocketSocket'e profili aktar. Yönetici iznini bir kez iptal et: uygulama hata göstermeli ve normal ağ devam etmeli. Tekrar bağlan ve izni onayla.
4. Discord'u Cmd+Q ile kapat/aç. Metin, görsel, indirme, ses kanalı, mikrofon, ekran paylaşımını ayrı ayrı dene. Canlı bağlantılarda TCP ve UDP için `Tünel` doğrula.
5. Oyun/tarayıcı bağlantılarının `Doğrudan` olduğunu kontrol et. LoL açıkken aynı sunucuda ping örneklerini karşılaştır. DNS ve yerel işlem yükü nedeniyle tam aynı değer beklenmez.
6. Discord PTB/Canary kullanıyorsan doğru seçimi aç. Tarayıcıdaki Discord bu sürümde tünellenmez.
7. Bağlantıyı kes; yeni Discord bağlantılarının başlangıç davranışına dönmesini ve normal web erişiminin sürmesini kontrol et.
8. Yeniden bağlan; uygulamadan normal çık. Activity Monitor'da oturumun `mihomo` süreci kapanmalı. Ardından yeniden bağlanıp GUI'yi zorla kapat: yaklaşık 15–22 saniye içinde motor kapanmalı, normal ağ çalışmalı.
9. Uyku/uyanma, Wi-Fi değişimi ve geçersiz/ulaşılamayan sunucu dene. “Yönlendirme etkin” yazısı tek başına sunucu erişim testi değildir; ulaşılamayan sunucuda Discord başarısız olurken doğrudan uygulamalar çalışmalı.
10. IPv4 profilinde daha önce önbelleğe alınmış IPv6 Discord bağlantısının doğrudan kaçmadığını kontrol et. Dual-stack profilin varsa IPv6 trafiğini de dene.

Sorun bildirirken: mimari, macOS sürümü, PocketSocket sürümü, hangi adım ve görünen hata. Profil dosyası, IP adresleri veya tam hedef bağlantı listesini göndermeden önce ayıkla.

## Otomatik kontroller neyi doğrular?

- WireGuard ayrıştırması, hatalı/kötücül profil reddi, süreç seçimi ve varsayılan DIRECT kuralları.
- Gerçek Electron uygulamasının yüklenmesi, renderer izolasyonu, platform uyarısı ve başlangıç durumu.
- Sabitlenmiş Mihomo'nun üretim config'ini kabul etmesi; TUN kapalı motorun çalışması, controller kimlik doğrulaması ve yüklenen kurallar.
- macOS CI üzerinde yetkilendirme AppleScript'inin derlenmesi ve supervisor shell sözdizimi.
- arm64/x64 uygulama paketlerinin üretilmesi.

Yönetici izniyle TUN açma, WireGuard el sıkışması, gerçek Discord süreç eşlemesi/ses ve ağ cleanup davranışı için yukarıdaki gerçek cihaz testi gerekir.
