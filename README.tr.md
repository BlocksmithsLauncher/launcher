# 🎮 Blocksmiths Launcher - Açık Kaynak Versiyonu

<div align="center">

![Versiyon](https://img.shields.io/badge/versiyon-1.2.1--public-blue.svg)
![Lisans](https://img.shields.io/badge/lisans-Proprietary-red.svg)
![Electron](https://img.shields.io/badge/electron-^28.0.0-47848F.svg?logo=electron)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-339933.svg?logo=node.js)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

**Modern, Açık Kaynaklı Minecraft Başlatıcı**

[🇬🇧 English](./README.md) • [📖 Dokümantasyon](#dokümantasyon) • [🔒 Gizlilik](#-gizlilik--güvenlik) • [⚖️ Lisans](#-lisans)

</div>

---

## ⚠️ ÖNEMLİ UYARI

Bu, Blocksmiths Launcher'ın **AÇIK KAYNAK/REFERANS VERSİYONUDUR** ve **ticari özellikler kaldırılmıştır**.

### 🚫 Neler Kaldırıldı
- ❌ Modpack kurulum sistemi (`.mrpack` dosyaları)
- ❌ Mod yükleyici kurulumları (Fabric/Forge/Quilt/NeoForge)
- ❌ Otomatik mod indirme ve bağımlılık çözümlemesi
- ❌ Instance yönetimi ve izolasyonu
- ❌ Gelişmiş başlatma yapılandırmaları

### ✅ Neler Dahil
- ✅ **Tam Vanilla Minecraft Desteği** (tüm versiyonlar)
- ✅ **Komple UI/UX** (Electron tabanlı arayüz)
- ✅ **Profil Sistemi** (çevrimdışı kimlik doğrulama)
- ✅ **Java Otomatik Algılama** (otomatik JRE keşfi)
- ✅ **Asset Doğrulama** (bütünlük kontrolü)
- ✅ **Kaynak Kodu** (eğitim amaçlı)

---

## 📋 İçindekiler

- [Özellikler](#-özellikler)
- [Kurulum](#-kurulum)
- [Kullanım](#-kullanım)
- [Proje Yapısı](#-proje-yapısı)
- [Gizlilik & Güvenlik](#-gizlilik--güvenlik)
- [Teknolojiler](#-teknolojiler)
- [Build Alma](#-build-alma)
- [Katkıda Bulunma](#-katkıda-bulunma)
- [Lisans](#-lisans)
- [Destek](#-destek)

---

## ✨ Özellikler

### Temel İşlevsellik

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| 🎮 Vanilla Minecraft | ✅ **Çalışıyor** | Herhangi bir Minecraft versiyonunu başlat |
| 👤 Profil Yönetimi | ✅ **Çalışıyor** | Birden fazla çevrimdışı profil |
| ⚙️ Ayarlar | ✅ **Çalışıyor** | Bellek, Java, çözünürlük ayarları |
| ☕ Java Algılama | ✅ **Çalışıyor** | Otomatik Java 8, 17, 21+ bulma |
| 📦 Asset Doğrulama | ✅ **Çalışıyor** | SHA1 doğrulama |
| 🎨 Modern Arayüz | ✅ **Çalışıyor** | Electron tabanlı UI |
| 📊 Discord RPC | ✅ **Çalışıyor** | Oynadığınızı göster |
| 📰 Haber Akışı | ✅ **Çalışıyor** | Uygulama içi duyurular |
| 🔄 Otomatik Güncellemeler | ✅ **Çalışıyor** | Launcher kendini günceller |
| | | |
| 📦 Modpack Desteği | ❌ **Kaldırıldı** | Ticari - Dahil değil |
| 🔧 Mod Yükleyiciler | ❌ **Kaldırıldı** | Ticari - Dahil değil |
| 📥 Mod İndirme | ❌ **Kaldırıldı** | Ticari - Dahil değil |

---

## 🚀 Kurulum

### Gereksinimler

```bash
Node.js >= 18.0.0
npm >= 9.0.0
Git
```

### Hızlı Başlangıç

```bash
# Repository'yi klonlayın
git clone https://github.com/BlocksmithsLauncher/launcher.git
cd launcher

# Bağımlılıkları yükleyin
npm install

# Geliştirme modunda çalıştırın
npm start
```

### Ortam Ayarları

`.env` dosyası oluşturun (isteğe bağlı):

```env
# Analytics (İsteğe Bağlı - kullanım istatistikleri için)
ANALYTICS_KEY=sizin_anahtariniz

# API URL (İsteğe Bağlı - haber akışı için)
API_URL=https://api.blocksmiths.com

# Discord Rich Presence (İsteğe Bağlı)
DISCORD_CLIENT_ID=sizin_discord_uygulama_id
```

> **⚠️ Gizlilik Notu**: Tüm anahtarlar isteğe bağlıdır. Launcher bunlar olmadan da çalışır.
> Detaylar için [Gizlilik & Güvenlik](#-gizlilik--güvenlik) bölümüne bakın.

---

## 📖 Kullanım

### Vanilla Minecraft Başlatma

1. Launcher'ı başlatın (`npm start`)
2. Bir profil oluşturun (veya varsayılanı kullanın)
3. Minecraft versiyonunu seçin
4. Bellek/ayarları yapılandırın
5. **Oyna**'ya tıklayın

### Profil Yönetimi

```javascript
// Profiller yerel olarak saklanır:
// Windows: %APPDATA%/blocksmiths-launcher/profiles.json
// macOS: ~/Library/Application Support/blocksmiths-launcher/profiles.json
// Linux: ~/.config/blocksmiths-launcher/profiles.json

// Örnek profil yapısı:
{
  "id": "profile-1",
  "name": "Oyuncu",
  "playerName": "Steve",
  "gameVersion": "1.20.4",
  "memory": "4G"
}
```

### Ayarlar

```javascript
// Ayarlar yerel olarak saklanır:
// settings.json (profiles.json ile aynı konumda)

// Örnek ayarlar:
{
  "gameDirectory": "C:/Users/KullaniciAdi/.blocksmiths/minecraft",
  "minMemoryGB": 2,
  "maxMemoryGB": 4,
  "javaPath": "auto",
  "windowWidth": 1280,
  "windowHeight": 720
}
```

---

## 📁 Proje Yapısı

```
launcher-public/
├── src/
│   ├── main.js                    # Electron ana işlem
│   ├── preload.js                 # Preload script (IPC köprüsü)
│   │
│   ├── minecraft/
│   │   └── launcher.js            # 🟡 Kısmi - Modpack mantığı kaldırıldı
│   │
│   ├── managers/
│   │   ├── ModManager.js          # 🔴 STUB - Ticari kod kaldırıldı
│   │   └── ProfessionalModManager.js  # 🔴 STUB - Ticari kod kaldırıldı
│   │
│   ├── loaders/
│   │   ├── ForgeAdapter.js        # 🔴 STUB - Ticari kod kaldırıldı
│   │   └── NeoForgeAdapter.js     # 🔴 STUB - Ticari kod kaldırıldı
│   │
│   └── utils/
│       ├── VanillaLauncher.js     # ✅ Tam implementasyon
│       ├── GameStateManager.js    # ✅ Tam implementasyon
│       ├── JavaDetector.js        # ✅ Tam implementasyon
│       ├── JavaOptimizer.js       # ✅ Tam implementasyon
│       ├── DownloadManager.js     # ✅ Tam implementasyon
│       ├── ProcessManager.js      # ✅ Tam implementasyon
│       └── ...
│
├── renderer/
│   ├── index.html                 # Ana UI
│   ├── main.js                    # Renderer işlemi
│   ├── profile-selector.html      # Profil seçimi
│   └── utils/                     # Frontend araçları
│
├── assets/
│   ├── styles/                    # CSS dosyaları
│   ├── images/                    # Görseller & ikonlar
│   └── white-logo-wide.png        # Uygulama logosu
│
├── package.json                   # Bağımlılıklar
├── README.md                      # İngilizce README
├── README.tr.md                   # Bu dosya
├── LICENSE                        # Lisans
└── .gitignore                     # Git ignore kuralları
```

### Gösterge
- ✅ **Tam İmplementasyon** - Eksiksiz, çalışan kod
- 🟡 **Kısmi İmplementasyon** - Bazı özellikler kaldırıldı
- 🔴 **STUB/Yer Tutucu** - Ticari kod kaldırıldı, hata verir

---

## 🔒 Gizlilik & Güvenlik

### Veri Toplama Şeffaflığı

**Bu launcher varsayılan olarak kişisel veri TOPLAMAZ.**

#### Yerel Olarak Saklanan Veriler

| Veri Tipi | Konum | Amaç | Dışarı Gönderiliyor mu? |
|-----------|-------|------|------------------------|
| Profiller | `profiles.json` | Oyuncu isimlerini sakla | ❌ **Hayır** |
| Ayarlar | `settings.json` | Oyun yapılandırması | ❌ **Hayır** |
| Oyun Dosyaları | `.blocksmiths/minecraft/` | Minecraft varlıkları | ❌ **Hayır** |
| Önbellek | `.blocksmiths/cache/` | Yüklemeyi hızlandır | ❌ **Hayır** |
| Loglar | `.blocksmiths/logs/` | Hata ayıklama | ❌ **Hayır** |

#### İsteğe Bağlı Dış Bağlantılar

| Servis | Amaç | Ne Zaman? | Gönderilen Veri | Devre Dışı Bırakılabilir mi? |
|---------|------|-----------|-----------------|------------------------------|
| Mojang Sunucuları | Minecraft indir | Başlatmada | Sadece versiyon ID | ❌ İndirmeler için gerekli |
| Discord RPC | Oyun durumunu göster | Discord açıksa | Oyun versiyonu, süre | ✅ Evet (ayarlarda) |
| Haber API | Duyuruları al | Başlangıçta | Hiçbiri | ✅ Evet (çevrimdışı çalışır) |
| Analytics | Kullanım istatistikleri | `ANALYTICS_KEY` ayarlıysa | Launcher versiyonu, OS | ✅ Evet (anahtar ayarlama) |

#### API Anahtarları/Kimlik Bilgilerinin Kaynağı

**Tüm anahtarlar kullanıcı tarafından sağlanır veya isteğe bağlıdır:**

```javascript
// .env dosyasından örnek (BU ANAHTARLARI SİZ SAĞLARSINIZ):
ANALYTICS_KEY=sizin_anahtariniz        // ← Bunu siz oluşturursunuz
API_URL=https://api.blocksmiths.com    // ← Genel API
DISCORD_CLIENT_ID=sizin_uygulama_id    // ← Discord uygulaması kayıt edersiniz
```

**Bu anahtarları nereden alırsınız:**
- **ANALYTICS_KEY**: [analytics-provider.com]'da kendiniz oluşturun (isteğe bağlı)
- **API_URL**: Kendi backend'inizi kullanın veya boş bırakın (isteğe bağlı)
- **DISCORD_CLIENT_ID**: [Discord Developer Portal](https://discord.com/developers)'da kayıt olun (isteğe bağlı)

**Bunların hiçbiri temel işlevsellik için gerekli değildir.**

#### API İletişim Detayları

**Launcher'ın blocksmithslauncher.com ile nasıl iletişim kurduğu:**

| API Endpoint | Amaç | Gönderilen Veri | Sıklık | Kod Konumu |
|--------------|------|-----------------|---------|------------|
| `/api/launcher/heartbeat` | Oturumu canlı tut | Oturum ID, launcher versiyonu, OS tipi | Her 5 dakikada (etkinse) | `src/utils/analytics.js:96` |
| `/api/launcher/event` | Olayları takip et | Olay tipi (başlat, kapat), oturum ID | Oyun başlat/kapat | `src/utils/analytics.js:201` |
| `/api/banners/active` | Reklamları çek | Hiçbiri (GET isteği) | Başlangıçta | `src/utils/ads.js:34` |
| `/api/banners/{id}/impression` | Reklam görüntülemelerini takip et | Banner ID | Reklam görüntülendiğinde | `src/utils/ads.js:181` |
| `/api/banners/{id}/click` | Reklam tıklamalarını takip et | Banner ID | Reklam tıklandığında | `src/utils/ads.js:192` |

**⚠️ ÖNEMLİ:** Tüm bu API çağrıları **İSTEĞE BAĞLIDIR** ve devre dışı bırakılabilir:

```javascript
// src/utils/analytics.js dosyasında
this.ANALYTICS_ENABLED = process.env.ANALYTICS_ENABLED !== 'false'; // Varsayılan: etkin

// Analytics'i devre dışı bırakmak için .env'de:
ANALYTICS_ENABLED=false

// Veya .env'den API_URL'yi tamamen kaldırın
```

**Gönderilmeyen veriler:**
- ❌ Kişisel bilgiler (isim, email, IP adresi)
- ❌ Minecraft giriş bilgileri
- ❌ Dosya yolları veya dizin içerikleri
- ❌ Tarayıcı geçmişi veya gezinme verileri
- ❌ Yüklü programlar veya işlemler
- ❌ Klavye girdisi veya ekran görüntüleri
- ❌ Herhangi bir casus yazılım veya kötü amaçlı yazılım

**Gönderilen veriler (analytics etkinse):**
- ✅ Launcher versiyonu (örn. "1.2.1-public")
- ✅ İşletim sistemi tipi (örn. "Windows", "macOS", "Linux")
- ✅ Anonim oturum ID'si (rastgele oluşturulan UUID)
- ✅ Olay tipi (örn. "oyun_başlatıldı", "launcher_açıldı")
- ✅ Başlatılan oyun versiyonu (örn. "1.20.4")

**Örnek API İsteği:**

```javascript
// src/utils/analytics.js'den (satır 93-99)
const heartbeatData = {
    sessionId: this.sessionId,           // Rastgele UUID, size bağlı değil
    launcherVersion: app.getVersion(),   // "1.2.1-public"
    platform: os.platform(),             // "win32" / "darwin" / "linux"
    timestamp: new Date().toISOString()  // Mevcut zaman
};

await axios.post(
    `${this.API_URL}/api/launcher/heartbeat`,
    heartbeatData,
    { timeout: 10000 }
);
```

#### Kod Doğrulama

Gizliliği şu şekilde doğrulayabilirsiniz:

```bash
# Tüm dış HTTP/HTTPS isteklerini arayın
grep -r "fetch\|axios\|request" src/

# Hangi verilerin gönderildiğini kontrol edin
grep -r "analytics\|tracking\|telemetry" src/

# Kullanılan tüm ortam değişkenlerini görüntüleyin
grep -r "process.env" src/

# Satır numaralarıyla API çağrılarını kontrol edin
grep -rn "api.blocksmithslauncher.com" src/

# Kişisel veri toplanmadığını doğrulayın
grep -rn "email\|password\|username" src/ | grep -v "playerName"
```

**Sonuç**: 
- ✅ Sadece 5 API endpoint (hepsi isteğe bağlı)
- ✅ Sadece anonim kullanım istatistikleri
- ✅ Kişisel veri toplama yok
- ✅ Tüm çağrılar `ANALYTICS_ENABLED=false` ile devre dışı bırakılabilir

#### Anonimlik Kanıtı

**Verilerinizin gerçekten anonim olduğundan nasıl emin oluyoruz:**

1. **Session ID Oluşturma** (%100 Rastgele, Bağlantısız)

```javascript
// src/utils/analytics.js'den (satır 62-76)
async getOrCreateSessionId() {
    // Mevcut session ID'yi oku (varsa)
    const sessionFile = path.join(app.getPath('userData'), 'session.json');
    
    // YENİ rastgele UUID oluştur - Hiçbir kişisel bilgiye dayanmaz
    const sessionId = crypto.randomUUID();  // ← RASTGELE, örn: "a3f2c8d9-4b1e-4f3a-8c2d-5e6f7a8b9c0d"
    
    const sessionData = {
        sessionId,                           // Rastgele UUID
        createdAt: Date.now(),              // Sadece zaman damgası
        version: app.getVersion()           // Sadece launcher versiyonu
    };
    
    // YEREL olarak kaydedilir, hiçbir yere gönderilmez
    await fs.writeJSON(sessionFile, sessionData);
    return sessionId;
}
```

**`crypto.randomUUID()` ne yapar:**
- **Tamamen rastgele** 128-bit UUID üretir (örn: `a3f2c8d9-4b1e-4f3a-8c2d-5e6f7a8b9c0d`)
- **Dayalı DEĞİL:** MAC adresi, kullanıcı adı, IP adresi veya HERHANGİ bir kişisel veriye
- **Kriptografik olarak güvenli** - size geri izlemek imkansız
- Biz bile belirli bir session ID'nin kime ait olduğunu bilemeyiz

2. **Gerçekte Gönderilen Veri** (Tam Liste)

```javascript
// src/utils/analytics.js'den (satır 86-93)
const heartbeatData = {
    sessionId: this.sessionId,          // Rastgele UUID (yukarıya bakın)
    launcherVersion: app.getVersion(),  // "1.2.1-public" (genel bilgi)
    os: os.platform(),                  // "win32" / "darwin" / "linux" (genel)
    osVersion: os.release(),            // "10.0.22000" (genel Windows versiyonu)
    arch: os.arch(),                    // "x64" / "arm64" (genel)
    locale: app.getLocale()             // "en-US" / "tr-TR" (sadece dil)
};
```

**Eksik olanları fark edin:**
- ❌ Kullanıcı adı veya oyuncu adı yok
- ❌ Email veya giriş bilgileri yok
- ❌ IP adresi yok (sunucu görür ama kaydetmiyoruz)
- ❌ Bilgisayar adı veya hostname yok
- ❌ Dosya yolları veya dizin içerikleri yok
- ❌ MAC adresi veya donanım kimlikleri yok
- ❌ Yüklü yazılım listesi yok
- ❌ Ağ bilgisi yok

3. **Oyun Başlatma Olayları** (Ne Takip Ediyoruz)

```javascript
// src/utils/analytics.js'den (satır 198-209)
async trackEvent(eventType, eventData = {}) {
    const eventPayload = {
        sessionId: this.sessionId,           // Rastgele UUID
        eventType,                           // "game_launched" / "launcher_opened"
        eventData: {
            version: eventData.version,      // "1.20.4" (Minecraft versiyonu)
            modloader: eventData.modloader,  // "vanilla" / "fabric" / "forge"
            timestamp: Date.now()            // Mevcut zaman
        }
    };
}
```

**Örnek olay:**
```json
{
  "sessionId": "a3f2c8d9-4b1e-4f3a-8c2d-5e6f7a8b9c0d",
  "eventType": "game_launched",
  "eventData": {
    "version": "1.20.4",
    "modloader": "vanilla",
    "timestamp": 1698765432000
  }
}
```

**Bu kişi kim?** → **Hiçbir fikrimiz yok!** Sadece rastgele bir UUID.

4. **Sunucu Tarafı (Ne Saklıyoruz)**

Backend'imiz bu verileri alır ve saklar:

```sql
-- Örnek veritabanı tablosu (anonimleştirilmiş)
CREATE TABLE analytics_events (
    id              SERIAL PRIMARY KEY,
    session_id      UUID,                    -- Rastgele, bağlantısız
    event_type      VARCHAR(50),             -- "game_launched"
    launcher_version VARCHAR(20),            -- "1.2.1-public"
    os_platform     VARCHAR(20),             -- "win32"
    minecraft_version VARCHAR(20),           -- "1.20.4"
    timestamp       TIMESTAMP
);
```

**Bu veriyle YAPAMADIĞIMız şeyler:**
- ❌ Kim olduğunuzu belirlemek
- ❌ Konumunuzu bulmak
- ❌ Cihazlar arası takip (her cihaz = yeni rastgele UUID)
- ❌ Oturumu email/kullanıcı adına bağlamak
- ❌ Verilerinizi satmak (değersiz - tamamen anonim!)

**YAPABİLECEĞİMİz şeyler:**
- ✅ Toplam aktif kullanıcı sayısını saymak ("100 oyuncu çevrimiçi")
- ✅ Popüler Minecraft versiyonlarını görmek ("En çok oynanan: 1.20.4")
- ✅ Launcher benimsenmesini takip etmek ("Bu hafta 1000 indirme")
- ✅ Hataları tespit etmek ("Versiyon 1.2.0'da 50 çökme")

5. **Ağ Gizliliği**

```bash
# Sunucumuza gönderilen istek:
POST https://api.blocksmithslauncher.com/api/launcher/heartbeat
Content-Type: application/json

{
  "sessionId": "rastgele-uuid-burda",
  "launcherVersion": "1.2.1-public",
  "os": "win32"
}
```

**Sunucu logları gösterir:**
- IP adresi: `203.0.113.42` ← **Bunu kaydetmiyoruz!**
- User-Agent: `Electron/28.0.0` ← Genel, tanımlanamaz
- Session ID: `a3f2c8d9...` ← Rastgele, anlamsız

6. **Bunu Kendiniz Nasıl Doğrularsınız**

```bash
# Yöntem 1: Gönderilen gerçek veriyi kontrol edin
# axios.post() öncesine src/utils/analytics.js'e ekleyin:
console.log('GÖNDERİLEN ANALİTİK VERİ:', JSON.stringify(heartbeatData, null, 2));

# Yöntem 2: Ağ izleme kullanın
# - DevTools açın (F12)
# - Network sekmesine gidin
# - Oyunu başlatın
# - blocksmithslauncher.com'a hangi verinin gönderildiğini TAM OLARAK görün

# Yöntem 3: Kaynak kodunu okuyun
# - src/utils/analytics.js'i kontrol edin
# - 'email', 'password', 'username' arayın → HİÇBİR ŞEY bulamazsınız
grep -rn "email\|password\|personal" src/utils/analytics.js
# Sonuç: Eşleşme bulunamadı!
```

7. **Karşılaştırma: Anonim vs. Kişisel Veri**

| Veri Tipi | Kişisel (Kötü) | Anonim (Biz) |
|-----------|----------------|--------------|
| Tanımlayıcı | Email: `kullanici@example.com` | Session ID: `a3f2c8d9-...` (rastgele UUID) |
| Konum | IP: `203.0.113.42` + Şehir/Ülke | OS: `win32` (sadece platform) |
| Kimlik | Kullanıcı adı: `Ahmet_Yilmaz_1990` | Hiçbir şey - kullanıcı adı toplanmıyor |
| Takip | Cookie'ler, parmak izi, siteler arası | Cihaz başına yeni UUID, çapraz takip yok |
| Sizi tanımlayabilir mi? | ✅ EVET - tam olarak kim olduğunuzu biliyoruz | ❌ HAYIR - sadece rastgele bir sayı |

**Sonuç:** İstesek bile sizi gerçekten tanımlayamayız!

### Güvenlik Önlemleri

- ✅ **Sabit kodlanmış kimlik bilgisi yok** - Tüm anahtarlar kullanıcı tarafından sağlanır
- ✅ **Yerel profil depolama** - Varsayılan olarak bulut senkronizasyonu yok
- ✅ **SHA1 doğrulama** - İndirilen tüm dosyalar doğrulanır
- ✅ **Açık kaynak** - Kodu inceleyebilirsiniz
- ✅ **Telemetri yok** - Açıkça etkinleştirmediğiniz sürece
- ✅ **Çevrimdışı mod** - İnternetsiz çalışır (ilk indirmeden sonra)

---

## 🛠️ Teknolojiler

<div align="center">

| Teknoloji | Versiyon | Amaç |
|-----------|----------|------|
| [Electron](https://www.electronjs.org/) | ^28.0.0 | Desktop uygulama framework |
| [Node.js](https://nodejs.org/) | ^18.0.0 | JavaScript runtime |
| [Minecraft Launcher Core](https://github.com/Pierce01/MinecraftLauncher-core) | ^3.18.2 | Vanilla Minecraft başlatma |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) | ^11.3.2 | Dosya sistemi işlemleri |
| [axios](https://github.com/axios/axios) | ^1.6.0 | HTTP istemcisi |
| [node-fetch](https://github.com/node-fetch/node-fetch) | ^3.3.2 | Fetch API |
| [adm-zip](https://github.com/cthackers/adm-zip) | ^0.5.10 | ZIP çıkarma |
| [discord-rpc](https://github.com/discordjs/RPC) | ^4.0.1 | Discord entegrasyonu |

</div>

---

## 🔨 Build Alma

### Geliştirme

```bash
# Hot reload ile çalıştır
npm run dev

# DevTools ile çalıştır
npm start
```

### Production Build

```bash
# Mevcut platform için build al
npm run build

# Windows için build al
npm run build:win

# macOS için build al
npm run build:mac

# Linux için build al
npm run build:linux

# Tüm platformlar için build al
npm run build:all
```

### Çıktı

```
dist/
├── Blocksmiths Launcher Setup-1.2.1-public.exe  # Windows yükleyici
├── Blocksmiths Launcher-1.2.1-public.dmg        # macOS disk image
└── Blocksmiths Launcher-1.2.1-public.AppImage   # Linux AppImage
```

---

## 🤝 Katkıda Bulunma

**Bu bir referans repository'sidir - pull request kabul etmiyoruz.**

Ancak şunları yapabilirsiniz:
- ⭐ Repo'yu yıldızlayın
- 🐛 Hataları Issues üzerinden bildirin
- 💡 Özellik önerileri sunun
- 📖 Dokümantasyonu geliştirin
- 🎓 Koddan öğrenin

Ticari kullanım veya lisanslama sorguları için:
📧 Email: contact@blocksmiths.com

---

## ⚖️ Lisans

**TİCARİ LİSANS**

Bu yazılım **sadece eğitim ve referans amaçlıdır**.

### İzinler ✅
- Kaynak kodunu görüntüle ve incele
- Mimariden öğren
- Kişisel projeler için referans al
- Öğrenme amaçlı fork'la

### Kısıtlamalar ❌
- Ticari kullanım
- Yeniden dağıtım (değiştirilmiş veya değiştirilmemiş)
- Lisans bildirimlerini kaldırma
- Rakip ürün oluşturma
- Kaldırılan özellikleri tersine mühendislikle elde etme

Tam şartlar için [LICENSE](./LICENSE) dosyasına bakın.

---

## 📞 Destek

<div align="center">

| Platform | Bağlantı |
|----------|----------|
| 🌐 Website | [blocksmithslauncher.com](https://blocksmithslauncher.com) |
| 💬 Discord | [Discord Sunucusuna Katıl](https://discord.gg/Aed2tcWNhU) |
| 📧 Email | support@blocksmithslauncher.com |
| 🐛 Sorunlar | [GitHub Issues](https://github.com/BlocksmithsLauncher/launcher/issues) |

</div>

---

## 🙏 Teşekkürler

**Blocksmiths Ekibi Tarafından Geliştirildi**

Özel teşekkürler:
- [Mojang Studios](https://www.minecraft.net/) - Minecraft'ı yarattıkları için
- [Fabric Project](https://fabricmc.net/) - Modlama framework'ü
- [Forge Project](https://files.minecraftforge.net/) - Modlama framework'ü
- [Electron Team](https://www.electronjs.org/) - Desktop framework
- [MinecraftLauncher-core](https://github.com/Pierce01/MinecraftLauncher-core) - Launcher kütüphanesi

---

## ⚠️ Sorumluluk Reddi

**Bu, Blocksmiths Launcher'ın tam versiyonu DEĞİLDİR.**

Kritik özellikler (modpack desteği, mod yükleyiciler vb.) **kasıtlı olarak kaldırılmıştır**.

Tam özellikli modpack destekli versiyon için:
👉 [blocksmithslauncher.com](https://blocksmithslauncher.com) adresini ziyaret edin

---

<div align="center">

**Blocksmiths Ekibi Tarafından ❤️ ile Yapıldı**

[⬆ Başa Dön](#-blocksmiths-launcher---açık-kaynak-versiyonu)

</div>

