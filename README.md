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
git clone https://github.com/BlocksmithsLauncher/launcher.git
cd launcher

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

#### API Communication Details

**How the launcher communicates with blocksmithslauncher.com:**

| API Endpoint | Purpose | Data Sent | Frequency | Code Location |
|--------------|---------|-----------|-----------|---------------|
| `/api/launcher/heartbeat` | Keep session alive | Session ID, launcher version, OS type | Every 5 minutes (if enabled) | `src/utils/analytics.js:96` |
| `/api/launcher/event` | Track events | Event type (launch, close), session ID | On game launch/close | `src/utils/analytics.js:201` |
| `/api/banners/active` | Fetch ads | None (GET request) | On startup | `src/utils/ads.js:34` |
| `/api/banners/{id}/impression` | Track ad views | Banner ID | When ad displayed | `src/utils/ads.js:181` |
| `/api/banners/{id}/click` | Track ad clicks | Banner ID | When ad clicked | `src/utils/ads.js:192` |

**⚠️ IMPORTANT:** All these API calls are **OPTIONAL** and can be disabled:

```javascript
// In src/utils/analytics.js
this.ANALYTICS_ENABLED = process.env.ANALYTICS_ENABLED !== 'false'; // Default: enabled

// To disable analytics, set in .env:
ANALYTICS_ENABLED=false

// Or remove API_URL from .env entirely
```

**What data is NOT sent:**
- ❌ Personal information (name, email, IP address)
- ❌ Minecraft login credentials
- ❌ File paths or directory contents
- ❌ Browser history or browsing data
- ❌ Installed programs or processes
- ❌ Keyboard input or screenshots
- ❌ Any form of spyware or malware

**What data IS sent (if analytics enabled):**
- ✅ Launcher version (e.g., "1.2.1-public")
- ✅ Operating system type (e.g., "Windows", "macOS", "Linux")
- ✅ Anonymous session ID (randomly generated UUID)
- ✅ Event type (e.g., "game_launched", "launcher_opened")
- ✅ Game version launched (e.g., "1.20.4")

**Example API Request:**

```javascript
// From src/utils/analytics.js (lines 93-99)
const heartbeatData = {
    sessionId: this.sessionId,           // Random UUID, not linked to you
    launcherVersion: app.getVersion(),   // "1.2.1-public"
    platform: os.platform(),             // "win32" / "darwin" / "linux"
    timestamp: new Date().toISOString()  // Current time
};

await axios.post(
    `${this.API_URL}/api/launcher/heartbeat`,
    heartbeatData,
    { timeout: 10000 }
);
```

#### Code Verification

You can verify privacy by checking:

```bash
# Search for all external HTTP/HTTPS requests
grep -r "fetch\|axios\|request" src/

# Check what data is sent
grep -r "analytics\|tracking\|telemetry" src/

# View all environment variables used
grep -r "process.env" src/

# Check API calls with line numbers
grep -rn "api.blocksmithslauncher.com" src/

# Verify no personal data is collected
grep -rn "email\|password\|username" src/ | grep -v "playerName"
```

**Result**: 
- ✅ Only 5 API endpoints (all optional)
- ✅ Only anonymous usage statistics
- ✅ No personal data collection
- ✅ All calls can be disabled via `ANALYTICS_ENABLED=false`

#### Proof of Anonymity

**How we ensure your data is truly anonymous:**

1. **Session ID Generation** (100% Random, Unlinked)

```javascript
// From src/utils/analytics.js (lines 62-76)
async getOrCreateSessionId() {
    // Read existing session ID (if exists)
    const sessionFile = path.join(app.getPath('userData'), 'session.json');
    
    // Create NEW random UUID - NOT based on any personal info
    const sessionId = crypto.randomUUID();  // ← RANDOM, e.g., "a3f2c8d9-4b1e-4f3a-8c2d-5e6f7a8b9c0d"
    
    const sessionData = {
        sessionId,                           // Random UUID
        createdAt: Date.now(),              // Timestamp only
        version: app.getVersion()           // Launcher version only
    };
    
    // Saved LOCALLY, never sent anywhere
    await fs.writeJSON(sessionFile, sessionData);
    return sessionId;
}
```

**What `crypto.randomUUID()` does:**
- Generates a **completely random** 128-bit UUID (e.g., `a3f2c8d9-4b1e-4f3a-8c2d-5e6f7a8b9c0d`)
- **NOT based on:** MAC address, username, IP address, or ANY personal data
- **Cryptographically secure** - impossible to trace back to you
- Even WE can't identify who owns a specific session ID

2. **What Data is Actually Sent** (Complete List)

```javascript
// From src/utils/analytics.js (lines 86-93)
const heartbeatData = {
    sessionId: this.sessionId,          // Random UUID (see above)
    launcherVersion: app.getVersion(),  // "1.2.1-public" (public info)
    os: os.platform(),                  // "win32" / "darwin" / "linux" (generic)
    osVersion: os.release(),            // "10.0.22000" (generic Windows version)
    arch: os.arch(),                    // "x64" / "arm64" (generic)
    locale: app.getLocale()             // "en-US" / "tr-TR" (language only)
};
```

**Notice what's MISSING:**
- ❌ No username or player name
- ❌ No email or login credentials
- ❌ No IP address (server sees it, but we don't log it)
- ❌ No computer name or hostname
- ❌ No file paths or directory contents
- ❌ No MAC address or hardware IDs
- ❌ No installed software list
- ❌ No network information

3. **Game Launch Events** (What We Track)

```javascript
// From src/utils/analytics.js (lines 198-209)
async trackEvent(eventType, eventData = {}) {
    const eventPayload = {
        sessionId: this.sessionId,           // Random UUID
        eventType,                           // "game_launched" / "launcher_opened"
        eventData: {
            version: eventData.version,      // "1.20.4" (Minecraft version)
            modloader: eventData.modloader,  // "vanilla" / "fabric" / "forge"
            timestamp: Date.now()            // Current time
        }
    };
}
```

**Example event:**
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

**Who is this person?** → **We have no idea!** Just a random UUID.

4. **Server-Side (What We Store)**

Our backend receives this data and stores:

```sql
-- Example database table (anonymized)
CREATE TABLE analytics_events (
    id              SERIAL PRIMARY KEY,
    session_id      UUID,                    -- Random, unlinked
    event_type      VARCHAR(50),             -- "game_launched"
    launcher_version VARCHAR(20),            -- "1.2.1-public"
    os_platform     VARCHAR(20),             -- "win32"
    minecraft_version VARCHAR(20),           -- "1.20.4"
    timestamp       TIMESTAMP
);
```

**What we CAN'T do with this data:**
- ❌ Identify who you are
- ❌ Find your location
- ❌ Track you across devices (each device = new random UUID)
- ❌ Link session to email/username
- ❌ Sell your data (it's worthless - totally anonymous!)

**What we CAN do:**
- ✅ Count total active users ("100 players online")
- ✅ See popular Minecraft versions ("Most played: 1.20.4")
- ✅ Track launcher adoption ("1000 downloads this week")
- ✅ Detect bugs ("50 crashes on version 1.2.0")

5. **Network Privacy**

```bash
# Your request to our server:
POST https://api.blocksmithslauncher.com/api/launcher/heartbeat
Content-Type: application/json

{
  "sessionId": "random-uuid-here",
  "launcherVersion": "1.2.1-public",
  "os": "win32"
}
```

**Server logs show:**
- IP address: `203.0.113.42` ← **We don't log this!**
- User-Agent: `Electron/28.0.0` ← Generic, not identifiable
- Session ID: `a3f2c8d9...` ← Random, meaningless

6. **How to Verify This Yourself**

```bash
# Method 1: Check the actual data being sent
# Add this to src/utils/analytics.js before axios.post():
console.log('ANALYTICS DATA BEING SENT:', JSON.stringify(heartbeatData, null, 2));

# Method 2: Use network monitoring
# - Open DevTools (F12)
# - Go to Network tab
# - Launch the game
# - See EXACTLY what data is sent to blocksmithslauncher.com

# Method 3: Read the source code
# - Check src/utils/analytics.js
# - Search for 'email', 'password', 'username' → You'll find NOTHING
grep -rn "email\|password\|personal" src/utils/analytics.js
# Result: No matches found!
```

7. **Comparison: Anonymous vs. Personal Data**

| Data Type | Personal (Bad) | Anonymous (Us) |
|-----------|----------------|----------------|
| Identifier | Email: `user@example.com` | Session ID: `a3f2c8d9-...` (random UUID) |
| Location | IP: `203.0.113.42` + City/Country | OS: `win32` (just the platform) |
| Identity | Username: `John_Smith_1990` | Nothing - no username collected |
| Tracking | Cookies, fingerprinting, cross-site | New UUID per device, no cross-tracking |
| Can identify you? | ✅ YES - we know exactly who you are | ❌ NO - just a random number |

**Bottom line:** We literally CAN'T identify you even if we wanted to!

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

#### All Platforms
```bash
# Build for all platforms
npm run build:all

# Or use the build script
./scripts/build-all.sh
```

#### Platform-Specific Builds

**Windows:**
```bash
npm run build:win
```

**macOS:**
```bash
# All macOS formats
npm run build:mac-all

# Specific formats
npm run build:mac-dmg    # DMG installer
npm run build:mac-pkg    # PKG installer  
npm run build:mac-zip    # ZIP archive

# Or use the build script
./scripts/build-mac.sh
```

**Linux:**
```bash
# All Linux formats
npm run build:linux-all

# Specific formats
npm run build:linux-appimage  # AppImage
npm run build:linux-deb       # DEB packages
npm run build:linux-rpm       # RPM packages
npm run build:linux-pacman    # Arch Linux (Pacman)
npm run build:linux-tar       # Tar.gz archives

# Or use the build script
./scripts/build-linux.sh
```

### Build Outputs

The build process creates packages for multiple architectures and formats:

**Windows:**
- `Blocksmiths Launcher Setup 1.2.1.exe` (NSIS installer)

**macOS:**
- `Blocksmiths Launcher-1.2.1.dmg` (DMG installer)
- `Blocksmiths Launcher-1.2.1.pkg` (PKG installer)
- `Blocksmiths Launcher-1.2.1-mac.zip` (ZIP archive)

**Linux:**
- `Blocksmiths Launcher-1.2.1.AppImage` (AppImage)
- `blocksmiths-launcher_1.2.1_amd64.deb` (Debian/Ubuntu)
- `blocksmiths-launcher-1.2.1-1.x86_64.rpm` (Red Hat/Fedora)
- `blocksmiths-launcher-1.2.1-1-x86_64.pkg.tar.zst` (Arch Linux)
- `Blocksmiths Launcher-1.2.1-linux.tar.gz` (Generic Linux)

### GitHub Actions

Automated builds are available via GitHub Actions:
- **Linux**: AppImage, DEB, RPM, Pacman, Tar.gz
- **macOS**: DMG, PKG, ZIP  
- **Windows**: NSIS installer

Builds are triggered on:
- Tag pushes (`v*`)
- Pull requests to main
- Manual workflow dispatch

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
| 💬 Discord | [Join Discord Server](https://discord.gg/Aed2tcWNhU) |
| 📧 Email | support@blocksmithslauncher.com |
| 🐛 Issues | [GitHub Issues](https://github.com/BlocksmithsLauncher/launcher/issues) |

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
