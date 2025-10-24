const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs-extra');
const os = require('os');
const MinecraftLauncher = require('./minecraft/launcher');
const ModManager = require('./managers/ModManager');
const AdManager = require('./utils/ads');
const LocalModpacksManager = require('./utils/localModpacks');
const updater = require('./utils/updater');
const analytics = require('./utils/analytics');
const discordRPC = require('./utils/discord-rpc');

// Ana pencere referansı
let mainWindow;
let profileWindow;

// Minecraft Launcher instance
let minecraftLauncher;

// Get icon path (works in both dev and production)
function getIconPath() {
    // In production, icon is in resources folder
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'favicon.ico');
    }
    // In development, icon is in project root
    return path.join(__dirname, '..', 'favicon.ico');
}

// Uygulama verileri dizini - app.whenReady() sonrasında çağırılacak
let userDataPath;
let profilesPath;
let settingsPath;

// Varsayılan ayarlar
const defaultSettings = {
    theme: '#FC942D',
    language: 'tr',
    autoLogin: false,
    showAds: true,
    gameDirectory: null, // Will be set when app is ready
    minMemoryGB: 2,
    maxMemoryGB: 4,
    featuredCreatorsUrl: null
};

// Varsayılan profiller
const defaultProfiles = {
    selectedProfile: null,
    profiles: []
};

// Ayarları yükle
async function loadSettings() {
    try {
        if (await fs.pathExists(settingsPath)) {
            const settings = await fs.readJson(settingsPath);
            return { ...defaultSettings, ...settings };
        }
        return defaultSettings;
    } catch (error) {
        console.error('Ayarlar yüklenirken hata:', error);
        return defaultSettings;
    }
}

// Profilleri yükle
async function loadProfiles() {
    try {
        if (await fs.pathExists(profilesPath)) {
            const profiles = await fs.readJson(profilesPath);
            return { ...defaultProfiles, ...profiles };
        }
        return defaultProfiles;
    } catch (error) {
        console.error('Profiller yüklenirken hata:', error);
        return defaultProfiles;
    }
}

// Profil seçim penceresini oluştur
function createProfileWindow() {
    profileWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        icon: getIconPath(),
        show: false
    });

    // Set app user model id for Windows
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.blocksmiths.launcher');
        // Set overlay icon
        profileWindow.setOverlayIcon(getIconPath(), 'Blocksmiths Launcher');
    }

    profileWindow.loadFile(path.join(__dirname, '../renderer/profile-selector.html'));

    profileWindow.once('ready-to-show', () => {
        profileWindow.show();
    });

    profileWindow.on('closed', () => {
        profileWindow = null;
    });
}

// Ana pencereyi oluştur
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        icon: getIconPath(),
        show: false
    });

    // Set app user model id for Windows
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.blocksmiths.launcher');
        // Set overlay icon
        mainWindow.setOverlayIcon(getIconPath(), 'Blocksmiths Launcher');
    }

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Start automatic update check
        updater.startAutoUpdateCheck(mainWindow);
        
        // Initialize ads after window is shown
        setTimeout(() => {
            AdManager.initializeAds(mainWindow);
        }, 3000);
    });

    mainWindow.on('close', async (event) => {
        if (minecraftLauncher && minecraftLauncher.isGameRunning) {
            // Prevent window close
            event.preventDefault();
            
            const { dialog } = require('electron');
            const choice = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                buttons: ['Minecraft\'ı Kapat ve Çık', 'İptal'],
                title: 'Oyun Çalışıyor',
                message: 'Minecraft hala çalışıyor. Launcher\'ı kapatırsanız oyun da kapanacak.',
                defaultId: 0,
                cancelId: 1
            });
            
            if (choice.response === 0) {
                // Stop game and quit
                await minecraftLauncher.stopGame();
                mainWindow.destroy();
                app.quit();
            }
        }
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Geliştirici araçlarını aç (geliştirme modunda)
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// Simple file logger to persist all console output
const logDir = path.join(os.homedir(), '.blocksmiths', 'logs');
const logFile = path.join(logDir, `launcher-${new Date().toISOString().slice(0,10)}.log`);
fs.ensureDirSync(logDir);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function writeLog(prefix, args) {
    const line = `[${new Date().toISOString()}] ${prefix} ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
    logStream.write(line);
}
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
console.log = (...args) => { writeLog('LOG', args); origLog(...args); };
console.error = (...args) => { writeLog('ERR', args); origErr(...args); };
console.warn = (...args) => { writeLog('WRN', args); origWarn(...args); };

// Uygulama hazır olduğunda
app.whenReady().then(async () => {
    try {
        console.log('[APP] Starting initialization...');
        
        // Initialize Discord RPC
        try {
            await discordRPC.connect();
            console.log('[APP] Discord RPC connected');
        } catch (error) {
            console.error('[APP] Discord RPC failed (non-critical):', error.message);
        }
        
        // Set Windows taskbar icon early
        if (process.platform === 'win32') {
            const iconPath = getIconPath();
            app.setAppUserModelId('com.blocksmiths.launcher');
            // Try to set icon for app
            if (await fs.pathExists(iconPath)) {
                console.log('[APP] Icon found at:', iconPath);
            } else {
                console.error('[APP] Icon not found at:', iconPath);
            }
        }
        
        // Initialize paths after app is ready
        userDataPath = app.getPath('userData');
        profilesPath = path.join(userDataPath, 'profiles.json');
        settingsPath = path.join(userDataPath, 'settings.json');
        console.log('[APP] Paths initialized:', { userDataPath, profilesPath, settingsPath });
        
        // Update default settings with correct game directory
        defaultSettings.gameDirectory = path.join(userDataPath, 'minecraft');
        
        // Initialize analytics
        try {
            await analytics.initialize();
            console.log('[APP] Analytics initialized');
        } catch (error) {
            console.error('[APP] Analytics failed (non-critical):', error.message);
        }
        
        // Initialize Minecraft Launcher
        try {
            minecraftLauncher = new MinecraftLauncher();
            global.mainWindow = null; // Will be set when main window is created
            console.log('[APP] Minecraft Launcher initialized');
        } catch (error) {
            console.error('[APP] CRITICAL: Minecraft Launcher failed:', error);
            throw error; // Re-throw critical errors
        }
        
        // Start preload optimizer (background)
        const preloadOptimizer = require('./utils/PreloadOptimizer');
        const gameDirectory = path.join(userDataPath, 'minecraft');
        preloadOptimizer.startPreload(gameDirectory).catch(err => {
            console.error('[PRELOAD] Background preload failed:', err.message);
        });
        
        // Preload common Java runtimes (background)
        const javaRuntimeManager = require('./utils/JavaRuntimeManager');
        javaRuntimeManager.preloadCommonVersions().catch(err => {
            console.error('[JAVA-RUNTIME] Background preload failed:', err.message);
        });
        
        // Gerekli dizinleri oluştur
        await fs.ensureDir(path.dirname(profilesPath));
        await fs.ensureDir(path.dirname(settingsPath));
        console.log('[APP] Directories created');

        // Profilleri yükle ve kontrol et
        const profiles = await loadProfiles();
        console.log('[APP] Profiles loaded:', profiles.length);
        
        // Her zaman profil seçim penceresini aç (zorunlu profil seçimi)
        createProfileWindow();
        console.log('[APP] Profile window created');

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                // Her zaman profil seçim penceresini aç
                createProfileWindow();
            }
        });
        
        console.log('[APP] ✅ Initialization complete!');
    } catch (error) {
        console.error('[APP] ❌ FATAL ERROR during initialization:', error);
        console.error('[APP] Stack trace:', error.stack);
        
        // Show error dialog
        const { dialog } = require('electron');
        dialog.showErrorBox(
            'Launcher Başlatma Hatası',
            `Launcher başlatılırken kritik bir hata oluştu:\n\n${error.message}\n\nLütfen uygulamayı yeniden başlatın veya destek ekibiyle iletişime geçin.`
        );
        
        // Exit app
        app.quit();
    }
});

// Tüm pencereler kapatıldığında
// Cleanup on app quit
app.on('before-quit', async (event) => {
    console.log('[APP] Before quit - cleaning up processes...');
    
    // Cleanup Discord RPC
    discordRPC.disconnect();
    
    // Cleanup analytics
    await analytics.cleanup();
    
    // Cleanup intervals and timers
    if (global.versionRefreshInterval) {
        clearInterval(global.versionRefreshInterval);
        global.versionRefreshInterval = null;
    }
    
    if (minecraftLauncher && minecraftLauncher.isGameRunning) {
        try {
            console.log('[APP] Stopping Minecraft before quit...');
            await minecraftLauncher.stopGame();
        } catch (error) {
            console.error('[APP] Error stopping game on quit:', error);
        }
    }
    
    // Cleanup launcher
    if (minecraftLauncher) {
        try {
            minecraftLauncher.destroy();
        } catch (error) {
            console.error('[APP] Error destroying launcher:', error);
        }
    }
});

app.on('window-all-closed', () => {
    // Cleanup before quitting
    if (minecraftLauncher && minecraftLauncher.isGameRunning) {
        minecraftLauncher.stopGame().catch(console.error);
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Event Handlers

// Ayarları al
ipcMain.handle('get-settings', async () => {
    return await loadSettings();
});

// Get launcher version from package.json
ipcMain.handle('get-launcher-version', async () => {
    try {
        const packageJson = require('../package.json');
        return {
            version: packageJson.version,
            name: packageJson.name,
            description: packageJson.description
        };
    } catch (error) {
        console.error('[VERSION] Failed to read version:', error);
        return { version: '0.0.0', name: 'blocksmiths-launcher', description: '' };
    }
});

// Ayarları kaydet
ipcMain.handle('save-settings', async (event, settings) => {
    try {
        // Always ensure ads are enabled (user cannot disable them)
        settings.showAds = true;
        await fs.writeJson(settingsPath, settings, { spaces: 2 });
        
        return { success: true };
    } catch (error) {
        console.error('Ayarlar kaydedilirken hata:', error);
        return { success: false, error: error.message };
    }
});

// Profilleri al
ipcMain.handle('get-profiles', async () => {
    return await loadProfiles();
});

// Profil kaydet
ipcMain.handle('save-profile', async (event, profile) => {
    try {
        const profiles = await loadProfiles();
        
        // Maksimum 3 profil kontrolü
        if (profiles.profiles.length >= 3 && !profiles.profiles.find(p => p.id === profile.id)) {
            return { success: false, error: 'Maksimum 3 profil oluşturabilirsiniz' };
        }

        const existingIndex = profiles.profiles.findIndex(p => p.id === profile.id);
        if (existingIndex >= 0) {
            profiles.profiles[existingIndex] = profile;
        } else {
            profiles.profiles.push(profile);
        }

        await fs.writeJson(profilesPath, profiles, { spaces: 2 });
        return { success: true };
    } catch (error) {
        console.error('Profil kaydedilirken hata:', error);
        return { success: false, error: error.message };
    }
});

// Profil oluştur
ipcMain.handle('create-profile', async (event, profileData) => {
    try {
        const profiles = await loadProfiles();
        
        // Maksimum 3 profil kontrolü
        if (profiles.profiles.length >= 3) {
            return { success: false, error: 'Maksimum 3 profil oluşturabilirsiniz' };
        }
        
        // Aynı isimde profil var mı kontrol et
        if (profiles.profiles.find(p => p.playerName === profileData.playerName)) {
            return { success: false, error: 'Bu oyuncu adı ile zaten bir profil mevcut' };
        }
        
        // Yeni profil oluştur
        const newProfile = {
            id: Date.now().toString(),
            name: profileData.name,
            playerName: profileData.playerName,
            avatar: profileData.avatar || 'steve',
            authType: profileData.authType || 'offline',
            gameVersion: '1.20.4',
            createdAt: new Date().toISOString(),
            lastPlayed: null
        };
        
        profiles.profiles.push(newProfile);
        await fs.writeJson(profilesPath, profiles, { spaces: 2 });
        
        return { success: true, profile: newProfile };
    } catch (error) {
        console.error('Profil oluşturulurken hata:', error);
        return { success: false, error: error.message };
    }
});

// Profil sil
ipcMain.handle('delete-profile', async (event, profileId) => {
    try {
        const profiles = await loadProfiles();
        
        // Profili bul ve sil
        const profileIndex = profiles.profiles.findIndex(p => p.id === profileId);
        if (profileIndex === -1) {
            return { success: false, error: 'Profil bulunamadı' };
        }
        
        profiles.profiles.splice(profileIndex, 1);
        
        // Eğer silinen profil seçili profil ise, seçimi temizle
        if (profiles.selectedProfile === profileId) {
            profiles.selectedProfile = null;
        }
        
        await fs.writeJson(profilesPath, profiles, { spaces: 2 });
        
        return { success: true };
    } catch (error) {
        console.error('Profil silinirken hata:', error);
        return { success: false, error: error.message };
    }
});

// Profil seç
ipcMain.handle('select-profile', async (event, profileId) => {
    try {
        const profiles = await loadProfiles();
        profiles.selectedProfile = profileId;
        await fs.writeJson(profilesPath, profiles, { spaces: 2 });
        
        // Profil penceresi varsa kapat
        if (profileWindow) {
            profileWindow.close();
            profileWindow = null;
        }
        
        // Ana pencere zaten varsa yeni açma, sadece profil bilgisini güncelle
        // Renderer window.location.replace ile index.html'e geçecek
        if (!mainWindow || mainWindow.isDestroyed()) {
            // Ana pencere yoksa oluştur
            createMainWindow();
        } else {
            // Ana pencere varsa banner'ları yeniden yükle
            setTimeout(() => {
                AdManager.initializeAds(mainWindow);
            }, 2000);
        }
        
        return { success: true };
    } catch (error) {
        console.error('Profil seçilirken hata:', error);
        return { success: false, error: error.message };
    }
});

// Switch profile (just clear selected profile, don't create new window)
ipcMain.handle('switch-profile', async (event) => {
    try {
        // Just acknowledge, the renderer will handle navigation
        return { success: true };
    } catch (error) {
        console.error('Profile switch error:', error);
        return { success: false, error: error.message };
    }
});

// Minecraft başlat
ipcMain.handle('launch-minecraft', async (event, options) => {
    try {
        const launcher = new Client();
        
        const launchOptions = {
            authorization: options.auth,
            root: options.gameDirectory || defaultSettings.gameDirectory,
            version: {
                number: options.version,
                type: 'release'
            },
            memory: {
                max: options.memory || '2G',
                min: '1G'
            }
        };

        if (options.mods && options.mods.length > 0) {
            launchOptions.forge = options.forge;
            launchOptions.mods = options.mods;
        }

        launcher.launch(launchOptions);

        launcher.on('debug', (e) => {
            mainWindow.webContents.send('launch-debug', e);
        });

        launcher.on('data', (e) => {
            mainWindow.webContents.send('launch-data', e.toString());
        });

        launcher.on('progress', (e) => {
            mainWindow.webContents.send('launch-progress', e);
        });

        launcher.on('close', (e) => {
            mainWindow.webContents.send('launch-close', e);
        });

        return { success: true };
    } catch (error) {
        console.error('Minecraft başlatılırken hata:', error);
        return { success: false, error: error.message };
    }
});

// Pencere kontrolleri
ipcMain.handle('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.minimize();
});

ipcMain.handle('minimize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.minimize();
});

ipcMain.handle('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        if (window.isMaximized()) {
            window.unmaximize();
        } else {
            window.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.close();
});

ipcMain.handle('close-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.close();
});

// Dış bağlantı aç
ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
});

// Launcher Update Handlers
ipcMain.handle('check-for-updates', async () => {
    try {
        const update = await updater.checkForUpdates(false); // Not silent
        return { success: true, update };
    } catch (error) {
        console.error('Update check failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('download-update', async (event, versionInfo) => {
    try {
        await updater.downloadAndInstall(versionInfo, mainWindow);
        return { success: true };
    } catch (error) {
        console.error('Update download failed:', error);
        return { success: false, error: error.message };
    }
});

// Dizin seç
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    
    return null;
});

// Get launcher directory
ipcMain.handle('get-launcher-directory', async () => {
    const { app } = require('electron');
    return path.join(app.getPath('appData'), '.blocksmiths');
});

// Open folder in file explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
        const { shell } = require('electron');
        const fs = require('fs-extra');
        
        // Ensure folder exists before trying to open it
        console.log('[OPEN-FOLDER] Checking folder:', folderPath);
        
        if (!await fs.pathExists(folderPath)) {
            console.log('[OPEN-FOLDER] Folder does not exist, creating:', folderPath);
            await fs.ensureDir(folderPath);
            console.log('[OPEN-FOLDER] Folder created successfully');
        }
        
        console.log('[OPEN-FOLDER] Opening folder in explorer:', folderPath);
        const result = await shell.openPath(folderPath);
        
        // shell.openPath returns empty string on success, error message on failure
        if (result) {
            console.error('[OPEN-FOLDER] Failed to open folder:', result);
            return { success: false, error: result };
        }
        
        console.log('[OPEN-FOLDER] Folder opened successfully');
        return { success: true };
    } catch (error) {
        console.error('[OPEN-FOLDER] Error opening folder:', error);
        return { success: false, error: error.message };
    }
});

// Discord RPC handler
ipcMain.handle('update-discord-rpc', async (event, type, data) => {
    try {
        discordRPC.updateActivity(type, data);
        return { success: true };
    } catch (error) {
        console.error('[DISCORD RPC] Update error:', error);
        return { success: false, error: error.message };
    }
});

// Minecraft Launcher IPC Handlers
ipcMain.handle('launch-game', async (event, options) => {
    try {
        global.mainWindow = mainWindow; // Set global reference for progress updates
        const result = await minecraftLauncher.launchGame(options);
        
        // Track modpack launch if it's a modpack
        if (result && options.isModpack && options.instanceId) {
            try {
                await analytics.trackModpackLaunch(
                    options.instanceId,
                    options.instanceName || 'Unknown Modpack'
                );
            } catch (analyticsError) {
                console.error('[ANALYTICS] Failed to track launch:', analyticsError.message);
            }
        }
        
        return { success: true, result };
    } catch (error) {
        console.error('Game launch failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-game', async () => {
    try {
        const result = await minecraftLauncher.stopGame();
        return { success: true };
    } catch (error) {
        console.error('Failed to stop game:', error);
        return { success: false, error: error.message };
    }
});

// Get game state (is game running?)
ipcMain.handle('get-game-state', async () => {
    try {
        const state = minecraftLauncher.getGameState();
        return state;
    } catch (error) {
        console.error('Failed to get game state:', error);
        return { isRunning: false, state: 'IDLE', pid: null };
    }
});

// Force kill game
ipcMain.handle('force-kill-game', async () => {
    try {
        const result = await minecraftLauncher.forceKillGame();
        return result;
    } catch (error) {
        console.error('Failed to force kill game:', error);
        return { success: false, error: error.message };
    }
});

// Get all active operations (progress tracking)
ipcMain.handle('get-active-operations', async () => {
    try {
        const progressTracker = require('./utils/ProgressTracker');
        const operations = progressTracker.getActiveOperations();
        return { success: true, operations };
    } catch (error) {
        console.error('Failed to get active operations:', error);
        return { success: false, error: error.message, operations: [] };
    }
});

ipcMain.handle('get-available-versions', async (event, forceRefresh = false) => {
    try {
        console.log('[MAIN] get-available-versions called, forceRefresh:', forceRefresh);
        const versions = await minecraftLauncher.getAvailableVersions(forceRefresh);
        
        // Debug log
        console.log('[MAIN] Versions fetched:', {
            totalVersions: versions.versions?.length || 0,
            latest: versions.latest,
            categorizedCounts: {
                release: versions.categorized?.release?.length || 0,
                snapshot: versions.categorized?.snapshot?.length || 0,
                old_beta: versions.categorized?.old_beta?.length || 0,
                old_alpha: versions.categorized?.old_alpha?.length || 0
            }
        });
        
        return { success: true, versions };
    } catch (error) {
        console.error('[MAIN] Failed to get versions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-installed-versions', async () => {
    try {
        const versions = await minecraftLauncher.getInstalledVersions();
        return { success: true, versions };
    } catch (error) {
        console.error('Failed to get installed versions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('install-version', async (event, version) => {
    try {
        const result = await minecraftLauncher.installVersion(version);
        return { success: true, result };
    } catch (error) {
        console.error('Version installation failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-system-info', async () => {
    try {
        const info = await minecraftLauncher.getSystemInfo();
        return { success: true, info };
    } catch (error) {
        console.error('Failed to get system info:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('authenticate-microsoft', async () => {
    try {
        const auth = await minecraftLauncher.authenticateMicrosoft();
        return { success: true, auth };
    } catch (error) {
        console.error('Microsoft authentication failed:', error);
        return { success: false, error: error.message };
    }
});

// Mod Management IPC Handlers
ipcMain.handle('search-mods', async (event, query, gameVersion, modLoader, limit) => {
    try {
        const mods = await minecraftLauncher.modManager.searchMods(query, gameVersion, modLoader, limit);
        return { success: true, mods };
    } catch (error) {
        console.error('Mod search failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('download-mod', async (event, modId, version, gameVersion, modLoader) => {
    try {
        const result = await minecraftLauncher.modManager.downloadMod(modId, version, gameVersion, modLoader);
        return result;
    } catch (error) {
        console.error('Mod download failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-installed-mods', async () => {
    try {
        const mods = await minecraftLauncher.modManager.getInstalledMods();
        return { success: true, mods };
    } catch (error) {
        console.error('Failed to get installed mods:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-mod', async (event, modPath) => {
    try {
        const result = await minecraftLauncher.modManager.deleteMod(modPath);
        return result;
    } catch (error) {
        console.error('Mod deletion failed:', error);
        return { success: false, error: error.message };
    }
});

// Get popular modpacks - UPDATED FOR NEW SYSTEM
ipcMain.handle('get-popular-modpacks', async (event, gameVersion, limit) => {
    try {
        const modpacks = await minecraftLauncher.modManager.getPopularModpacks(gameVersion, limit);
        return { success: true, modpacks };
    } catch (error) {
        console.error('Failed to get popular modpacks:', error);
        return { success: false, error: error.message };
    }
});

// Search modpacks - UPDATED FOR NEW SYSTEM
ipcMain.handle('search-modpacks', async (event, searchParams) => {
    try {
        console.log('[SEARCH] IPC search params:', searchParams);
        const modpacks = await minecraftLauncher.modManager.searchModpacks(
            searchParams.query || '', 
            searchParams.gameVersion || null, 
            searchParams.limit || 20,
            searchParams.filters || {}
        );
        return { success: true, modpacks };
    } catch (error) {
        console.error('Failed to search modpacks:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-modpack-versions', async (event, modpackId) => {
    try {
        console.log(`[DEBUG] Getting modpack versions for: ${modpackId}`);
        const versions = await minecraftLauncher.modManager.getModpackVersions(modpackId);
        console.log(`[DEBUG] Found ${versions ? versions.length : 0} versions`);
        return { success: true, versions };
    } catch (error) {
        console.error('Failed to get modpack versions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('install-mod-loader', async (event, version, gameVersion, loaderType) => {
    try {
        const result = await minecraftLauncher.modManager.installModLoader(version, gameVersion, loaderType);
        return result;
    } catch (error) {
        console.error('Mod loader installation failed:', error);
        return { success: false, error: error.message };
    }
});

// ==================== LIBRARY IPC HANDLERS ====================

// Get installed modpacks
ipcMain.handle('get-installed-modpacks', async () => {
    try {
        // Use the same ModManager instance as MinecraftLauncher
        const modpacks = await minecraftLauncher.modManager.getInstalledModpacks();
        return { success: true, modpacks: modpacks };
    } catch (error) {
        console.error('Error getting installed modpacks:', error);
        return { success: false, error: error.message };
    }
});

// Install modpack - NEW PROFESSIONAL SYSTEM
ipcMain.handle('install-modpack', async (event, modpackId, versionId = null, customName = null) => {
    try {
        console.log(`[IPC] Installing modpack: ${modpackId}`);
        global.mainWindow = mainWindow; // Set global reference for progress updates
        const result = await minecraftLauncher.modManager.installModpack(modpackId, versionId, customName);
        return result;
    } catch (error) {
        console.error('Error installing modpack:', error);
        return { success: false, error: error.message };
    }
});

// Launch instance - NEW PROFESSIONAL SYSTEM
ipcMain.handle('launch-instance', async (event, instanceId) => {
    try {
        console.log(`[IPC] Launching instance: ${instanceId}`);
        global.mainWindow = mainWindow; // Set global reference for progress updates
        const result = await minecraftLauncher.modManager.launchInstance(instanceId);
        
        if (result.success) {
            const launchConfig = result.launchConfig;
            
            // Get current profile for player name
            const profiles = await loadProfiles();
            const currentProfile = profiles.profiles.find(p => p.id === profiles.selectedProfile);
            const playerName = currentProfile ? currentProfile.playerName : 'Player';
            
            console.log(`[LAUNCH-DEBUG] Selected profile: ${profiles.selectedProfile}`);
            console.log(`[LAUNCH-DEBUG] Current profile:`, currentProfile);
            console.log(`[LAUNCH-DEBUG] Player name: ${playerName}`);
            
            // Count mods for Java optimization
            const modsDir = path.join(launchConfig.instanceDirectory, 'mods');
            let modCount = 0;
            if (await fs.pathExists(modsDir)) {
                const modFiles = await fs.readdir(modsDir);
                modCount = modFiles.filter(f => f.endsWith('.jar')).length;
            }
            
            console.log(`[LAUNCH-DEBUG] Mod count: ${modCount}`);
            
            // Create launch profile
            const profile = {
                id: `instance_${instanceId}`,
                playerName: playerName,
                username: playerName, // CRITICAL FIX: launcher.js expects 'username' not 'playerName'
                gameDirectory: launchConfig.instanceDirectory,
                version: launchConfig.versionId,
                modLoader: launchConfig.modloader.type,
                modLoaderVersion: launchConfig.modloader.version,
                isModpack: true,
                instanceId: instanceId,
                modCount: modCount // For Java optimization
            };
            
            // Launch with the instance profile
            await minecraftLauncher.launchGame(profile);
            
            return { success: true };
        } else {
            return result;
        }
    } catch (error) {
        console.error('Error launching instance:', error);
        return { success: false, error: error.message };
    }
});

// Get instances - NEW PROFESSIONAL SYSTEM
ipcMain.handle('get-instances', async (event) => {
    try {
        const instances = await minecraftLauncher.modManager.getInstances();
        return { success: true, instances: instances };
    } catch (error) {
        console.error('Error getting instances:', error);
        return { success: false, error: error.message };
    }
});

// Delete instance - NEW PROFESSIONAL SYSTEM
ipcMain.handle('delete-instance', async (event, instanceId) => {
    try {
        console.log(`[IPC] Deleting instance: ${instanceId}`);
        const result = await minecraftLauncher.modManager.deleteInstance(instanceId);
        return result;
    } catch (error) {
        console.error('Error deleting instance:', error);
        return { success: false, error: error.message };
    }
});

// Update modpack
ipcMain.handle('update-modpack', async (event, modpackId) => {
    try {
        const result = await minecraftLauncher.modManager.updateModpack(modpackId);
        return result;
    } catch (error) {
        console.error('Error updating modpack:', error);
        return { success: false, error: error.message };
    }
});

// Update modpack playtime
ipcMain.handle('update-modpack-playtime', async (event, modpackId, playTimeMinutes) => {
    try {
        const instancesDir = path.join(os.homedir(), '.blocksmiths', 'instances');
        const instancePath = path.join(instancesDir, modpackId, 'instance.json');
        
        if (await fs.pathExists(instancePath)) {
            const instanceData = await fs.readJSON(instancePath);
            instanceData.totalPlayTime = (instanceData.totalPlayTime || 0) + playTimeMinutes;
            instanceData.lastPlayed = new Date().toISOString();
            await fs.writeJSON(instancePath, instanceData, { spaces: 2 });
            console.log(`[PLAYTIME] Updated ${modpackId}: +${playTimeMinutes} minutes (total: ${instanceData.totalPlayTime})`);
            return { success: true };
        }
        
        return { success: false, error: 'Instance not found' };
    } catch (error) {
        console.error('Error updating playtime:', error);
        return { success: false, error: error.message };
    }
});

// Delete modpack
ipcMain.handle('delete-modpack', async (event, modpackId) => {
    try {
        const result = await minecraftLauncher.modManager.deleteModpack(modpackId);
        return result;
    } catch (error) {
        console.error('Error deleting modpack:', error);
        return { success: false, error: error.message };
    }
});

// Import modpack dialog
ipcMain.handle('import-modpack-dialog', async () => {
    try {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Modpack Dosyası Seç',
            filters: [
                { name: 'Modpack Files', extensions: ['mrpack', 'zip'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            return { success: true, filePath: result.filePaths[0] };
        } else {
            return { success: false, error: 'No file selected' };
        }
    } catch (error) {
        console.error('Error showing import dialog:', error);
        return { success: false, error: error.message };
    }
});

// Import modpack from file
ipcMain.handle('import-modpack', async (event, filePath) => {
    try {
        const result = await minecraftLauncher.modManager.importModpackFromFile(filePath);
        return result;
    } catch (error) {
        console.error('Error importing modpack:', error);
        return { success: false, error: error.message };
    }
});

// Get local featured creator modpacks
ipcMain.handle('get-local-featured-modpacks', async () => {
    try {
        const creators = await LocalModpacksManager.getCreatorModpacks();
        return { success: true, creators };
    } catch (error) {
        console.error('Error getting local featured modpacks:', error);
        return { success: false, error: error.message, creators: [] };
    }
});

// Handle banner click
ipcMain.on('banner-click', (event, data) => {
    console.log('[BANNER] Click:', data);
    AdManager.handleBannerClick(data.id, data.url);
});

// Import modpack from URL (.mrpack hosted on website)
ipcMain.handle('import-modpack-url', async (event, url, modpackInfo = null) => {
    try {
        console.log('[IMPORT-URL] Downloading from:', url);
        console.log('[IMPORT-URL] Modpack info:', modpackInfo);
        
        const os = require('os');
        const path = require('path');
        const fs = require('fs-extra');
        const axios = require('axios');
        
        // Validate URL
        if (!url || typeof url !== 'string' || url.trim() === '') {
            throw new Error('Geçersiz URL');
        }
        
        // Ensure URL is complete (has protocol)
        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            fullUrl = 'https://api.blocksmithslauncher.com' + url;
        }
        
        console.log('[IMPORT-URL] Full URL:', fullUrl);
        
        const tmpDir = path.join(os.tmpdir(), 'blocksmiths-mrpack');
        await fs.ensureDir(tmpDir);
        const filename = 'modpack_' + Date.now() + '.mrpack';
        const destPath = path.join(tmpDir, filename);

        console.log('[IMPORT-URL] Downloading to:', destPath);
        
        // Retry mechanism for API modpack downloads (often timeout)
        let downloadSuccess = false;
        let lastError = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[IMPORT-URL] Download attempt ${attempt}/${maxRetries}...`);
                
                // Notify user about retry
                if (attempt > 1 && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('launch-progress', {
                        task: 'Modpack İndiriliyor',
                        message: `Tekrar deneniyor... (${attempt}/${maxRetries})`
                    });
                }
                
                // Track download progress for better UX
                let downloadedBytes = 0;
                let totalBytes = 0;
                let lastProgressUpdate = Date.now();
                
                const response = await axios({ 
                    url: fullUrl, 
                    method: 'GET', 
                    responseType: 'stream',
                    timeout: 180000, // 3 minutes timeout (modpacks can be large!)
                    maxRedirects: 5,
                    onDownloadProgress: (progressEvent) => {
                        downloadedBytes = progressEvent.loaded;
                        totalBytes = progressEvent.total || progressEvent.loaded;
                        
                        // Update UI every 500ms to avoid flooding
                        const now = Date.now();
                        if (now - lastProgressUpdate > 500) {
                            const percent = Math.round((downloadedBytes / totalBytes) * 100);
                            const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                            const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                            
                            console.log(`[IMPORT-URL] Download progress: ${percent}% (${downloadedMB}/${totalMB} MB)`);
                            
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('launch-progress', {
                                    task: 'Modpack İndiriliyor',
                                    message: `${downloadedMB}MB / ${totalMB}MB (${percent}%)`,
                                    current: downloadedBytes,
                                    total: totalBytes
                                });
                            }
                            
                            lastProgressUpdate = now;
                        }
                    }
                });
                
                await new Promise((resolve, reject) => {
                    const stream = response.data.pipe(require('fs').createWriteStream(destPath));
                    stream.on('finish', resolve);
                    stream.on('error', reject);
                    response.data.on('error', reject);
                });
                
                downloadSuccess = true;
                console.log('[IMPORT-URL] ✅ Download complete!');
                break;
                
            } catch (error) {
                lastError = error;
                console.error(`[IMPORT-URL] Attempt ${attempt} failed:`, error.message);
                
                // Clean up partial file
                if (await fs.pathExists(destPath)) {
                    await fs.remove(destPath).catch(() => {});
                }
                
                if (attempt < maxRetries) {
                    const backoffTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.log(`[IMPORT-URL] Waiting ${backoffTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                }
            }
        }
        
        if (!downloadSuccess) {
            throw new Error(`Modpack indirme başarısız (${maxRetries} deneme): ${lastError.message}`);
        }

        console.log('[IMPORT-URL] Download complete, importing...');
        const result = await minecraftLauncher.modManager.importModpackFromFile(destPath, modpackInfo);
        
        // Track modpack installation
        if (result.success && modpackInfo) {
            await analytics.trackModpackInstall(
                modpackInfo.id || modpackInfo.slug,
                modpackInfo.name,
                modpackInfo.source || 'blocksmiths'
            );
        }
        
        console.log('[IMPORT-URL] Import result:', result.success ? 'Success' : 'Failed');
        return result;
    } catch (error) {
        console.error('[IMPORT-URL] Error:', error.message);
        return { success: false, error: error.message };
    }
});

// Open modpack folder
ipcMain.handle('open-modpack-folder', async (event, modpackId) => {
    try {
        const result = await minecraftLauncher.modManager.openModpackFolder(modpackId);
        return result;
    } catch (error) {
        console.error('Error opening modpack folder:', error);
        return { success: false, error: error.message };
    }
});

console.log('BlockSmiths Launcher başlatılıyor...');
