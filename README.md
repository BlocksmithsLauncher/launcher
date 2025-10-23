# 🎮 Blocksmiths Launcher - Public Version

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.1--public-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Electron](https://img.shields.io/badge/electron-^28.0.0-47848F.svg?logo=electron)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-339933.svg?logo=node.js)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

**A Modern, Open-Source Minecraft Launcher**

[🇹🇷 Türkçe](./README.tr.md) • [📖 Documentation](#documentation) • [🔒 Privacy](#privacy--security) • [⚖️ License](#license)

</div>

---

## ⚠️ IMPORTANT NOTICE

This is a **PUBLIC/REFERENCE VERSION** of Blocksmiths Launcher with **proprietary features removed**.

### 🚫 What's Been Removed
- ❌ Modpack installation system (`.mrpack` files)
- ❌ Mod loader installers (Fabric/Forge/Quilt/NeoForge)
- ❌ Automatic mod downloading and dependency resolution
- ❌ Instance management and isolation
- ❌ Advanced launch configurations

### ✅ What's Included
- ✅ **Full Vanilla Minecraft Support** (all versions)
- ✅ **Complete UI/UX** (Electron-based interface)
- ✅ **Profile System** (offline authentication)
- ✅ **Java Auto-Detection** (automatic JRE discovery)
- ✅ **Asset Validation** (integrity checking)
- ✅ **Source Code** (educational purposes)

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Privacy & Security](#-privacy--security)
- [Technologies](#-technologies)
- [Building](#-building)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)

---

## ✨ Features

### Core Functionality

| Feature | Status | Description |
|---------|--------|-------------|
| 🎮 Vanilla Minecraft | ✅ **Working** | Launch any Minecraft version |
| 👤 Profile Management | ✅ **Working** | Multiple offline profiles |
| ⚙️ Settings | ✅ **Working** | Memory, Java, resolution config |
| ☕ Java Detection | ✅ **Working** | Auto-find Java 8, 17, 21+ |
| 📦 Asset Validation | ✅ **Working** | SHA1 verification |
| 🎨 Modern UI | ✅ **Working** | Electron-based interface |
| 📊 Discord RPC | ✅ **Working** | Show what you're playing |
| 📰 News Feed | ✅ **Working** | In-app announcements |
| 🔄 Auto-Updates | ✅ **Working** | Launcher self-update |
| | | |
| 📦 Modpack Support | ❌ **Removed** | Proprietary - Not included |
| 🔧 Mod Loaders | ❌ **Removed** | Proprietary - Not included |
| 📥 Mod Downloads | ❌ **Removed** | Proprietary - Not included |

---

## 🚀 Installation

### Prerequisites

```bash
Node.js >= 18.0.0
npm >= 9.0.0
Git
```

### Quick Start

```bash
# Clone the repository
git clone https://github.com/blocksmiths/launcher-public.git
cd launcher-public

# Install dependencies
npm install

# Run in development mode
npm start
```

### Environment Setup

Create a `.env` file (optional):

```env
# Analytics (Optional - for usage statistics)
ANALYTICS_KEY=your_key_here

# API URL (Optional - for news feed)
API_URL=https://api.blocksmithslauncher.com

# Discord Rich Presence (Optional)
DISCORD_CLIENT_ID=your_discord_app_id
```

> **⚠️ Privacy Note**: All keys are optional. The launcher works without them.
> See [Privacy & Security](#privacy--security) for details.

---

## 📖 Usage

### Launching Vanilla Minecraft

1. Start the launcher (`npm start`)
2. Create a profile (or use default)
3. Select Minecraft version
4. Configure memory/settings
5. Click **Play**

### Profile Management

```javascript
// Profiles are stored locally at:
// Windows: %APPDATA%/blocksmiths-launcher/profiles.json
// macOS: ~/Library/Application Support/blocksmiths-launcher/profiles.json
// Linux: ~/.config/blocksmiths-launcher/profiles.json

// Example profile structure:
{
  "id": "profile-1",
  "name": "Player",
  "playerName": "Steve",
  "gameVersion": "1.20.4",
  "memory": "4G"
}
```

### Settings

```javascript
// Settings are stored locally at:
// settings.json (same location as profiles.json)

// Example settings:
{
  "gameDirectory": "C:/Users/YourName/.blocksmiths/minecraft",
  "minMemoryGB": 2,
  "maxMemoryGB": 4,
  "javaPath": "auto",
  "windowWidth": 1280,
  "windowHeight": 720
}
```

---

## 📁 Project Structure

```
launcher-public/
├── src/
│   ├── main.js                    # Electron main process
│   ├── preload.js                 # Preload script (IPC bridge)
│   │
│   ├── minecraft/
│   │   └── launcher.js            # 🟡 Partial - Modpack logic removed
│   │
│   ├── managers/
│   │   ├── ModManager.js          # 🔴 STUB - Proprietary removed
│   │   └── ProfessionalModManager.js  # 🔴 STUB - Proprietary removed
│   │
│   ├── loaders/
│   │   ├── ForgeAdapter.js        # 🔴 STUB - Proprietary removed
│   │   └── NeoForgeAdapter.js     # 🔴 STUB - Proprietary removed
│   │
│   └── utils/
│       ├── VanillaLauncher.js     # ✅ Full implementation
│       ├── GameStateManager.js    # ✅ Full implementation
│       ├── JavaDetector.js        # ✅ Full implementation
│       ├── JavaOptimizer.js       # ✅ Full implementation
│       ├── DownloadManager.js     # ✅ Full implementation
│       ├── ProcessManager.js      # ✅ Full implementation
│       └── ...
│
├── renderer/
│   ├── index.html                 # Main UI
│   ├── main.js                    # Renderer process
│   ├── profile-selector.html      # Profile selection
│   └── utils/                     # Frontend utilities
│
├── assets/
│   ├── styles/                    # CSS files
│   ├── images/                    # Images & icons
│   └── white-logo-wide.png        # App logo
│
├── package.json                   # Dependencies
├── README.md                      # This file
├── README.tr.md                   # Turkish version
├── LICENSE                        # Proprietary license
└── .gitignore                     # Git ignore rules
```

### Legend
- ✅ **Full Implementation** - Complete, working code
- 🟡 **Partial Implementation** - Some features removed
- 🔴 **STUB/Placeholder** - Proprietary code removed, throws errors

---

## 🔒 Privacy & Security

### Data Collection Transparency

**This launcher does NOT collect personal data by default.**

#### What's Stored Locally

| Data Type | Location | Purpose | Sent Externally? |
|-----------|----------|---------|------------------|
| Profiles | `profiles.json` | Store player names | ❌ **No** |
| Settings | `settings.json` | Game configuration | ❌ **No** |
| Game Files | `.blocksmiths/minecraft/` | Minecraft assets | ❌ **No** |
| Cache | `.blocksmiths/cache/` | Speed up loading | ❌ **No** |
| Logs | `.blocksmiths/logs/` | Debugging | ❌ **No** |

#### Optional External Connections

| Service | Purpose | When? | Data Sent | Can Disable? |
|---------|---------|-------|-----------|--------------|
| Mojang Servers | Download Minecraft | On launch | Version ID only | ❌ Required for downloads |
| Discord RPC | Show game status | If Discord running | Game version, playtime | ✅ Yes (in settings) |
| News API | Fetch announcements | On startup | None | ✅ Yes (works offline) |
| Analytics | Usage statistics | If `ANALYTICS_KEY` set | Launcher version, OS | ✅ Yes (don't set key) |

#### Source of API Keys/Credentials

**All keys are user-provided or optional:**

```javascript
// Example from .env (YOU provide these):
ANALYTICS_KEY=your_key_here        // ← You create this
API_URL=https://api.blocksmithslauncher.com // ← Public API
DISCORD_CLIENT_ID=your_app_id      // ← You register Discord app
```

**Where to get these:**
- **ANALYTICS_KEY**: Create your own at [analytics-provider.com] (optional)
- **API_URL**: Use your own backend or leave empty (optional)
- **DISCORD_CLIENT_ID**: Register at [Discord Developer Portal](https://discord.com/developers) (optional)

**None of these are required for basic functionality.**

#### Code Verification

You can verify privacy by checking:

```bash
# Search for all external HTTP/HTTPS requests
grep -r "fetch\|axios\|request" src/

# Check what data is sent
grep -r "analytics\|tracking\|telemetry" src/

# View all environment variables used
grep -r "process.env" src/
```

**Result**: Only Mojang servers (for Minecraft downloads) and optional user-configured services.

### Security Measures

- ✅ **No hardcoded credentials** - All keys are user-provided
- ✅ **Local profile storage** - No cloud sync by default
- ✅ **SHA1 verification** - All downloaded files verified
- ✅ **Open source** - You can audit the code
- ✅ **No telemetry** - Unless you explicitly enable it
- ✅ **Offline mode** - Works without internet (after first download)

---

## 🛠️ Technologies

<div align="center">

| Technology | Version | Purpose |
|------------|---------|---------|
| [Electron](https://www.electronjs.org/) | ^28.0.0 | Desktop app framework |
| [Node.js](https://nodejs.org/) | ^18.0.0 | JavaScript runtime |
| [Minecraft Launcher Core](https://github.com/Pierce01/MinecraftLauncher-core) | ^3.18.2 | Vanilla Minecraft launching |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) | ^11.3.2 | File system operations |
| [axios](https://github.com/axios/axios) | ^1.6.0 | HTTP client |
| [node-fetch](https://github.com/node-fetch/node-fetch) | ^3.3.2 | Fetch API |
| [adm-zip](https://github.com/cthackers/adm-zip) | ^0.5.10 | ZIP extraction |
| [discord-rpc](https://github.com/discordjs/RPC) | ^4.0.1 | Discord integration |

</div>

---

## 🔨 Building

### Development

```bash
# Run with hot reload
npm run dev

# Run with DevTools
npm start
```

### Production Build

```bash
# Build for current platform
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux

# Build for all platforms
npm run build:all
```

### Output

```
dist/
├── Blocksmiths Launcher Setup-1.2.1-public.exe  # Windows installer
├── Blocksmiths Launcher-1.2.1-public.dmg        # macOS disk image
└── Blocksmiths Launcher-1.2.1-public.AppImage   # Linux AppImage
```

---

## 🤝 Contributing

**This is a reference repository - we do not accept pull requests.**

However, you can:
- ⭐ Star the repo if you find it useful
- 🐛 Report bugs via Issues
- 💡 Suggest features via Issues
- 📖 Improve documentation
- 🎓 Learn from the code

For commercial use or licensing inquiries:
📧 Email: contact@blocksmithslauncher.com

---

## ⚖️ License

**PROPRIETARY LICENSE**

This software is provided for **educational and reference purposes only**.

### Permissions ✅
- View and study the source code
- Learn from the architecture
- Use as reference for personal projects
- Fork for learning purposes

### Restrictions ❌
- Commercial use
- Redistribution (modified or unmodified)
- Removing license notices
- Creating competing products
- Reverse engineering removed features

See [LICENSE](./LICENSE) for full terms.

---

## 📞 Support

<div align="center">

| Platform | Link |
|----------|------|
| 🌐 Website | [blocksmithslauncher.com](https://blocksmithslauncher.com) |
| 💬 Discord | [discord.gg/blocksmiths](https://discord.gg/blocksmiths) |
| 📧 Email | support@blocksmithslauncher.com |
| 🐛 Issues | [GitHub Issues](https://github.com/blocksmiths/launcher-public/issues) |

</div>

---

## 🙏 Acknowledgments

**Developed by the Blocksmiths Team**

Special thanks to:
- [Mojang Studios](https://www.minecraft.net/) - For creating Minecraft
- [Fabric Project](https://fabricmc.net/) - Modding framework
- [Forge Project](https://files.minecraftforge.net/) - Modding framework
- [Electron Team](https://www.electronjs.org/) - Desktop framework
- [MinecraftLauncher-core](https://github.com/Pierce01/MinecraftLauncher-core) - Launcher library

---

## ⚠️ Disclaimer

**This is NOT the full version of Blocksmiths Launcher.**

Critical features (modpack support, mod loaders, etc.) have been **intentionally removed** to protect proprietary systems.

For the full-featured version with modpack support:
👉 Visit [blocksmithslauncher.com](https://blocksmithslauncher.com)

---

<div align="center">

**Made with ❤️ by the Blocksmiths Team**

[⬆ Back to Top](#-blocksmiths-launcher---public-version)

</div>
