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

#### Kod Doğrulama

Gizliliği şu şekilde doğrulayabilirsiniz:

```bash
# Tüm dış HTTP/HTTPS isteklerini arayın
grep -r "fetch\|axios\|request" src/

# Hangi verilerin gönderildiğini kontrol edin
grep -r "analytics\|tracking\|telemetry" src/

# Kullanılan tüm ortam değişkenlerini görüntüleyin
grep -r "process.env" src/
```

**Sonuç**: Sadece Mojang sunucuları (Minecraft indirmeleri için) ve kullanıcı tarafından yapılandırılan isteğe bağlı servisler.

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

