const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const fetch = require('node-fetch'); // CRITICAL: For version manifest fetching
const ProfessionalModManager = require('../managers/ProfessionalModManager');
const VanillaLauncher = require('../utils/VanillaLauncher');
const EventManager = require('../utils/EventManager');
const processManager = require('../utils/ProcessManager');
const downloadManager = require('../utils/DownloadManager');
const JavaOptimizer = require('../utils/JavaOptimizer');
const javaOptimizer = JavaOptimizer.instance; // Use singleton instance
const diskSpaceChecker = require('../utils/DiskSpaceChecker');
const javaDetector = require('../utils/JavaDetector');
const progressTracker = require('../utils/ProgressTracker');
const gameStateManager = require('../utils/GameStateManager');

class MinecraftLauncher {
    constructor() {
        this.client = new Client();
        this.gameDirectory = path.join(os.homedir(), '.blocksmiths', 'minecraft');
        this.assetsDirectory = path.join(this.gameDirectory, 'assets');
        this.librariesDirectory = path.join(this.gameDirectory, 'libraries');
        this.versionsDirectory = path.join(this.gameDirectory, 'versions');
        
        // Professional Mod Manager'ı initialize et
        this.modManager = new ProfessionalModManager(this.gameDirectory);
        
        // Vanilla Launcher for pure Minecraft (performant and reliable)
        this.vanillaLauncher = new VanillaLauncher(this.gameDirectory);
        
        // Event Manager for memory leak prevention
        this.eventManager = new EventManager();
        
        // Process Manager reference
        this.processManager = processManager;
        
        // NEW: Modern Progress & State Management
        this.progressTracker = progressTracker;
        this.gameStateManager = gameStateManager;
        
        // Setup progress forwarding to renderer
        this.setupProgressForwarding();
        
        // Setup game state forwarding
        this.setupGameStateForwarding();
        
        // Start orphan check
        this.processManager.startOrphanCheck(30000);
        
        this.ensureDirectories();
    }
    
    /**
     * Setup progress forwarding to renderer
     */
    setupProgressForwarding() {
        this.progressTracker.on('progress', (progressData) => {
            this.emitProgress(progressData);
        });
        
        this.progressTracker.on('operation-stale', (data) => {
            console.warn('[LAUNCHER] Stale operation detected:', data.operationId);
            this.emitProgress({
                operationId: data.operationId,
                state: 'warning',
                message: 'İşlem yanıt vermiyor, lütfen bekleyin...'
            });
        });
    }
    
    /**
     * Setup game state forwarding to renderer
     */
    setupGameStateForwarding() {
        this.gameStateManager.on('state-changed', (state) => {
            console.log('[LAUNCHER] Game state changed:', state.state);
            this.emitGameState(state);
        });
        
        this.gameStateManager.on('game-started', (data) => {
            console.log('[LAUNCHER] ✅ Game fully started:', data);
            this.emitGameState({
                event: 'game-started',
                ...data
            });
        });
        
        this.gameStateManager.on('game-stopped', (data) => {
            console.log('[LAUNCHER] 🛑 Game stopped:', data);
            
            // CRITICAL: Release mutex when game stops
            this.launchMutex = false;
            console.log('[LAUNCHER] 🔓 Launch mutex released (game-stopped event)');
            
            this.emitGameState({
                event: 'game-stopped',
                ...data
            });
        });
        
        this.gameStateManager.on('game-crashed', (data) => {
            console.error('[LAUNCHER] 💥 Game crashed:', data);
            
            // CRITICAL: Release mutex when game crashes
            this.launchMutex = false;
            console.log('[LAUNCHER] 🔓 Launch mutex released (game-crashed event)');
            
            this.emitGameState({
                event: 'game-crashed',
                ...data
            });
        });
        
        this.gameStateManager.on('launch-step', (step) => {
            console.log('[LAUNCHER] Launch step:', step);
            this.emitProgress({
                operationId: 'game-launch',
                message: `Oyun başlatılıyor: ${step.step}`,
                metadata: { step: step.step }
            });
        });
    }

    async ensureDirectories() {
        try {
            await fs.ensureDir(this.gameDirectory);
            await fs.ensureDir(this.assetsDirectory);
            await fs.ensureDir(this.librariesDirectory);
            await fs.ensureDir(this.versionsDirectory);
        } catch (error) {
            console.error('Error creating directories:', error);
        }
    }

    async authenticateOffline(username) {
        try {
            // Offline authentication
            const auth = {
                access_token: 'offline',
                client_token: 'offline',
                uuid: this.generateOfflineUUID(username),
                name: username,
                user_properties: '{}',
                meta: {
                    type: 'offline',
                    offline: true
                }
            };
            
            return auth;
        } catch (error) {
            console.error('Offline authentication failed:', error);
            throw error;
        }
    }

    async authenticateMicrosoft() {
        try {
            // Microsoft authentication using MSMC
            const msmc = require('msmc');
            const authManager = new msmc.Auth('select_account');
            
            const xboxManager = await authManager.launch('electron');
            const token = await xboxManager.getMinecraft();
            
            if (!token.mclc()) {
                throw new Error('Failed to get Minecraft token');
            }

            return token.mclc();
        } catch (error) {
            console.error('Microsoft authentication failed:', error);
            throw error;
        }
    }

    generateOfflineUUID(username) {
        // Generate a consistent UUID for offline users
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest('hex');
        return [
            hash.substr(0, 8),
            hash.substr(8, 4),
            '3' + hash.substr(12, 3), // Version 3 UUID
            ((parseInt(hash.substr(16, 1), 16) & 0x3) | 0x8).toString(16) + hash.substr(17, 3),
            hash.substr(20, 12)
        ].join('-');
    }

    async getAvailableVersions() {
        try {
            console.log('[LAUNCHER] Fetching Minecraft versions from Mojang...');
            const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`[LAUNCHER] ✅ Fetched ${data.versions.length} Minecraft versions`);
            
            // CRITICAL: Filter versions to only include 1.8.9 and later
            const minVersion = '1.8.9';
            const filteredVersions = data.versions.filter(version => {
                // Only include release and snapshot versions
                if (version.type !== 'release' && version.type !== 'snapshot') {
                    return false;
                }
                
                // Parse version number for comparison
                const versionParts = version.id.split('.').map(Number);
                const minVersionParts = minVersion.split('.').map(Number);
                
                // Compare major.minor.patch
                for (let i = 0; i < Math.max(versionParts.length, minVersionParts.length); i++) {
                    const v = versionParts[i] || 0;
                    const m = minVersionParts[i] || 0;
                    
                    if (v > m) return true;
                    if (v < m) return false;
                }
                
                return true; // Equal versions are included
            });
            
            console.log(`[LAUNCHER] ✅ Filtered to ${filteredVersions.length} versions (1.8.9+)`);
            
            // Versiyonları kategorilere ayır (sadece 1.8.9+)
            const categorizedVersions = {
                release: filteredVersions.filter(v => v.type === 'release'),
                snapshot: filteredVersions.filter(v => v.type === 'snapshot'),
                old_beta: [], // Disabled - no old beta versions
                old_alpha: [] // Disabled - no old alpha versions
            };
            
            console.log(`[LAUNCHER] Releases: ${categorizedVersions.release.length}, Snapshots: ${categorizedVersions.snapshot.length}`);
            
            return {
                latest: data.latest,
                versions: filteredVersions,
                categorized: categorizedVersions
            };
        } catch (error) {
            console.error('[LAUNCHER] ❌ Error fetching versions from Mojang:', error.message);
            console.error('[LAUNCHER] Using fallback versions...');
            
            // Fallback: Only 1.8.9+ versions if fetch fails
            const fallbackVersions = [
                { id: '1.21.4', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/d6c94fef3c7dfa7b905e8c44d83f5e840c89b6c8/1.21.4.json' },
                { id: '1.21.3', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/5f84f3720e8bd0a42d4f3f1f3e4e5e740c4b5e84/1.21.3.json' },
                { id: '1.21.1', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/7a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.21.1.json' },
                { id: '1.20.6', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/6a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.20.6.json' },
                { id: '1.20.4', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/5a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.20.4.json' },
                { id: '1.20.1', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/4a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.20.1.json' },
                { id: '1.19.4', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/3a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.19.4.json' },
                { id: '1.19.2', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/2a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.19.2.json' },
                { id: '1.18.2', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/1a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.18.2.json' },
                { id: '1.16.5', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/0a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.16.5.json' },
                { id: '1.12.2', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/9a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.12.2.json' },
                { id: '1.8.9', type: 'release', url: 'https://piston-meta.mojang.com/v1/packages/8a3b0e0e0b0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e/1.8.9.json' }
            ];
            
            return {
                latest: { release: '1.21.4', snapshot: '24w44a' },
                versions: fallbackVersions,
                categorized: { 
                    release: fallbackVersions,
                    snapshot: [], 
                    old_beta: [], 
                    old_alpha: [] 
                }
            };
        }
    }

    async getVersionManifest(versionId) {
        try {
            const versions = await this.getAvailableVersions();
            const version = versions.versions.find(v => v.id === versionId);
            
            if (!version) {
                throw new Error(`Version ${versionId} not found`);
            }
            
            const response = await fetch(version.url);
            const manifest = await response.json();
            
            return manifest;
        } catch (error) {
            console.error('Error fetching version manifest:', error);
            throw error;
        }
    }

    async launchGame(options) {
        // CRITICAL: Check GameStateManager state first
        const currentState = this.gameStateManager.getState();
        if (currentState.state !== 'IDLE') {
            console.warn(`[LAUNCHER] ⚠️ Cannot launch: GameStateManager is in ${currentState.state} state`);
            this.emitError(new Error(`Oyun zaten ${currentState.state === 'RUNNING' ? 'çalışıyor' : 'başlatılıyor'}`));
            return { success: false, error: `Oyun zaten ${currentState.state === 'RUNNING' ? 'çalışıyor' : 'başlatılıyor'}` };
        }

        // MUTEX: Prevent concurrent launches
        if (this.launchMutex) {
            console.warn('[LAUNCHER] ⚠️ Launch already in progress (mutex)');
            this.emitError(new Error('Zaten başlatılıyor, lütfen bekleyin'));
            return { success: false, error: 'Zaten başlatılıyor' };
        }

        // DISK SPACE CHECK: Ensure enough space before launching
        try {
            const requiredSpace = 2 * 1024 * 1024 * 1024; // 2GB minimum
            const spaceCheck = await diskSpaceChecker.checkSpace(this.gameDirectory, requiredSpace);
            
            if (!spaceCheck.hasSpace) {
                const errorMsg = `Yetersiz disk alanı! En az 2GB boş alan gerekli. Mevcut: ${spaceCheck.freeGB.toFixed(1)}GB`;
                console.error('[LAUNCHER]', errorMsg);
                this.emitError(new Error(errorMsg));
                return { success: false, error: errorMsg };
            }
            
            console.log(`[LAUNCHER] ✅ Disk space check OK: ${spaceCheck.freeGB.toFixed(1)}GB available`);
        } catch (error) {
            console.error('[LAUNCHER] Disk space check failed:', error);
            // Non-critical error, continue launch but log warning
            console.warn('[LAUNCHER] ⚠️ Continuing launch despite disk space check failure');
        }

        // DECIDE: Vanilla or Modpack launch?
        const isVanilla = !options.isModpack && !options.modLoader;
        
        if (isVanilla) {
            console.log('[LAUNCHER] 🎮 Launching VANILLA Minecraft (optimized path)');
            return await this.launchVanillaMinecraft(options);
        } else {
            console.log('[LAUNCHER] 🎮 Launching MODDED Minecraft (modpack path)');
            return await this.launchModdedMinecraft(options);
        }
    }

    /**
     * Launch vanilla Minecraft using optimized VanillaLauncher
     */
    async launchVanillaMinecraft(options) {
        // MUTEX: Prevent concurrent launches
        if (this.launchMutex) {
            console.warn('[LAUNCHER] ⚠️ Launch already in progress (mutex)');
            return { success: false, error: 'Zaten başlatılıyor' };
        }

        try {
            // Acquire mutex
            this.launchMutex = true;
            console.log('[VANILLA-LAUNCHER] 🔒 Launch mutex acquired');
            console.log('[VANILLA-LAUNCHER] Options received:', JSON.stringify(options, null, 2));

            // CRITICAL: Extract and validate all parameters
            const version = options.version || options.gameVersion || '1.20.4';
            const username = options.username || options.playerName || 'Player';
            const javaPath = options.javaPath || null;
            const maxMemory = options.maxMemory || options.memory || null;
            const minMemory = options.minMemory || null;
            const windowWidth = options.windowWidth || 1280;
            const windowHeight = options.windowHeight || 720;
            const fullscreen = options.fullscreen || false;
            const gameDirectory = options.gameDirectory || this.gameDirectory;

            console.log('[VANILLA-LAUNCHER] Extracted parameters:', {
                version,
                username,
                gameDirectory,
                maxMemory,
                minMemory
            });

            // Get current profile from options or create one
            const profile = options.profile || {
                name: username,
                username: username,
                uuid: this.generateOfflineUUID(username)
            };

            // AUTO-OPTIMIZE JAVA ARGUMENTS
            const javaOpts = javaOptimizer.getOptimalArgs({
                minecraftVersion: version,
                modloader: 'vanilla',
                modCount: 0
            });

            // CRITICAL: Parse memory correctly (handle '4G', '4096M', or raw numbers)
            const parseMemory = (memStr) => {
                if (!memStr) return null;
                if (typeof memStr === 'number') return memStr;
                
                const str = memStr.toString().toUpperCase().trim();
                if (str.endsWith('G')) {
                    return parseInt(str.replace('G', '')) * 1024; // GB to MB
                } else if (str.endsWith('M')) {
                    return parseInt(str.replace('M', '')); // Already in MB
                } else {
                    return parseInt(str); // Assume raw number is MB
                }
            };

            const optimizedMaxMemory = parseMemory(maxMemory) || parseInt(javaOpts.maxMemory.replace('G', '')) * 1024;
            const optimizedMinMemory = parseMemory(minMemory) || parseInt(javaOpts.minMemory.replace('G', '')) * 1024;

            console.log(`[VANILLA-LAUNCHER] Raw memory input: maxMemory='${maxMemory}', minMemory='${minMemory}'`);
            console.log(`[VANILLA-LAUNCHER] Parsed memory: ${optimizedMinMemory}MB - ${optimizedMaxMemory}MB`);

            // Initialize GameStateManager
            await this.gameStateManager.startLaunch({
                version: version,
                username: username,
                modLoader: 'vanilla',
                isModpack: false
            });

            // Create progress callback
            const sendProgress = (stage, message, current, total) => {
                this.emitProgress({
                    task: stage,
                    message: message,
                    current: current,
                    total: total
                });
            };

            // CRITICAL: Validate VanillaLauncher before launch
            if (!this.vanillaLauncher) {
                throw new Error('VanillaLauncher not initialized');
            }

            console.log('[VANILLA-LAUNCHER] Preparing launch options...');
            const vanillaOptions = {
                profile: profile,
                version: version,
                memory: optimizedMaxMemory,
                minMemory: optimizedMinMemory,
                javaPath: javaPath,
                javaArgs: javaOpts.jvmArgs,
                windowWidth: windowWidth,
                windowHeight: windowHeight,
                fullscreen: fullscreen,
                server: null // Can be added later
            };

            console.log('[VANILLA-LAUNCHER] Launch options:', JSON.stringify(vanillaOptions, null, 2));

            // Launch using VanillaLauncher
            const result = await this.vanillaLauncher.launch(vanillaOptions, sendProgress);

            if (result.success && result.process) {
                // Store process
                this.currentLauncher = result.process;
                this.gameProcess = result.process;

                // CRITICAL: Register process with GameStateManager FIRST
                console.log('[VANILLA-LAUNCHER] Registering process with GameStateManager...');
                this.gameStateManager.registerProcess(result.process, result.process.pid);

                // Setup process listeners
                result.process.on('close', (code) => {
                    console.log('[VANILLA-LAUNCHER] Minecraft closed with code:', code);
                    this.resetGameState();
                    this.emitGameClosed(code);
                });

                // Update game state
                await this.gameStateManager.markGameAsRunning(result.process.pid);

                // Success message
                this.emitProgress({
                    task: 'Başarılı',
                    message: 'Minecraft başarıyla başlatıldı!',
                    current: 100,
                    total: 100
                });

                console.log('[VANILLA-LAUNCHER] ✅ Vanilla Minecraft launched successfully');
                
                // Return serializable data only (no ChildProcess object!)
                return { 
                    success: true, 
                    pid: result.process.pid,
                    javaPath: result.javaPath
                };
            } else {
                throw new Error('Vanilla launcher failed');
            }

        } catch (error) {
            console.error('[VANILLA-LAUNCHER] ❌ Launch failed:', error);
            this.resetGameState();
            this.emitError(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Launch modded Minecraft using existing system
     */
    async launchModdedMinecraft(options) {
        // CLEANUP: Remove old event listeners before starting
        console.log('[LAUNCHER] Cleaning up old event listeners...');
        this.eventManager.removeByTag('game-launch');
        this.eventManager.logStatus();

        try {
            // Acquire mutex
            this.launchMutex = true;
            console.log('[LAUNCHER] 🔒 Launch mutex acquired');

            const {
                version = '1.20.4',
                username = 'Player', // This will be overridden by profile.playerName
                authType = 'offline',
                javaPath = null,
                maxMemory = null, // Will be auto-optimized
                minMemory = null, // Will be auto-optimized
                windowWidth = 1280,
                windowHeight = 720,
                fullscreen = false,
                gameDirectory = null,
                modLoader = null,
                modLoaderVersion = null,
                isModpack = false,
                modCount = 0 // For Java optimization
            } = options;

            // AUTO-OPTIMIZE JAVA ARGUMENTS
            const javaOpts = javaOptimizer.getOptimalArgs({
                minecraftVersion: version,
                modloader: modLoader || 'vanilla',
                modCount: modCount
            });
            
            const optimizedMaxMemory = maxMemory || javaOpts.maxMemory;
            const optimizedMinMemory = minMemory || javaOpts.minMemory;
            
            console.log(`[JAVA-OPT] Using optimized memory: ${optimizedMinMemory} - ${optimizedMaxMemory}`);
            console.log(`[JAVA-OPT] JVM Args:`, javaOpts.jvmArgs.length, 'arguments');

            console.log(`[LAUNCHER] Starting Minecraft ${version} for user ${username}`);
            
            // Initialize GameStateManager for launch
            await this.gameStateManager.startLaunch({
                version: version,
                username: username,
                modLoader: modLoader,
                isModpack: isModpack
            });
            
            this.emitProgress({ task: 'Başlatılıyor', message: `Minecraft ${version} başlatılıyor...` });

            // For modpacks, Fabric version should now be available in main versions directory
            // No need for custom version root anymore - PrismLauncher approach
            let actualVersion = version;
            let versionRoot = this.gameDirectory;
            
            if (isModpack) {
                console.log(`[LAUNCHER] Launching modpack with version: ${actualVersion}`);
                console.log(`[LAUNCHER] Modloader: ${modLoader}, Version: ${modLoaderVersion}`);
                console.log(`[LAUNCHER] Using main versions directory (PrismLauncher approach)`);
                
                // CRITICAL FIX: For modpacks, ensure loader version is copied from instance to main versions
                if (modLoader === 'fabric') {
                    console.log(`[FABRIC-COPY] Copying Fabric version from instance to main versions...`);
                    await this.copyFabricFromInstance(gameDirectory, actualVersion);
                } else if (modLoader === 'neoforge') {
                    console.log(`[NEOFORGE-COPY] Copying NeoForge version from instance to main versions...`);
                    await this.copyNeoForgeFromInstance(gameDirectory, actualVersion);
                } else if (modLoader === 'forge') {
                    console.log(`[FORGE-COPY] Copying Forge version from instance to main versions...`);
                    await this.copyForgeFromInstance(gameDirectory, actualVersion);
                } else if (modLoader === 'quilt') {
                    console.log(`[QUILT-COPY] Copying Quilt version from instance to main versions...`);
                    await this.copyQuiltFromInstance(gameDirectory, actualVersion);
                }
            }
            
            // CRITICAL FIX: For modpacks, skip version checking and use minecraft-launcher-core directly
            let wasInstalled = false;
            
            // First get authentication (moved up to fix auth error)
            this.emitProgress({ task: 'Kimlik Doğrulama', message: 'Kimlik doğrulanıyor...' });
            let auth;
            if (authType === 'microsoft') {
                auth = await this.authenticateMicrosoft();
            } else {
                auth = await this.authenticateOffline(username);
            }
            console.log(`[LAUNCHER] Authenticated as: ${auth.name}`);

            // Ensure we pass non-demo features to arg expansion
            auth.features = { is_demo_user: false };

            // Forge/NeoForge/Quilt support removed - only Fabric is supported
            if (isModpack && modLoader && !['forge', 'neoforge', 'quilt'].includes(modLoader)) {
                console.log(`[LAUNCHER] ${modLoader.toUpperCase()} modpack detected`);
            }
            
            if (!isModpack) {
                // For other modpack types and non-modpacks, ensure base Minecraft version
                if (isModpack && modLoader === 'quilt') {
                    // Extract base Minecraft version from modloader version ID
                    const baseVersion = actualVersion.split('-')[3]; // "quilt-loader-0.26.4-1.20.1" -> "1.20.1"
                    console.log(`[LAUNCHER] Installing base Minecraft ${baseVersion} for QUILT modpack`);
                    
                    this.emitProgress({ task: 'Base Minecraft Yükleniyor', message: `${baseVersion} base versiyonu yükleniyor...` });
                    wasInstalled = await this.ensureVersionInstalled(baseVersion, versionRoot);
                    
                    console.log(`[LAUNCHER] Base Minecraft ${baseVersion} installed, QUILT profile ready: ${actualVersion}`);
                } else {
                    // First ensure the version is available/installed
                    this.emitProgress({ task: 'Versiyon Kontrol Ediliyor', message: `${actualVersion} versiyonu kontrol ediliyor...` });
                    wasInstalled = await this.ensureVersionInstalled(actualVersion, versionRoot);
                }
            }
            
            // ============ DEBUG: Forge Detection =============
            console.log(`[LAUNCHER-DEBUG] ========================================`);
            console.log(`[LAUNCHER-DEBUG] isModpack: ${isModpack}`);
            console.log(`[LAUNCHER-DEBUG] modLoader: ${modLoader}`);
            console.log(`[LAUNCHER-DEBUG] modLoaderVersion: ${modLoaderVersion}`);
            console.log(`[LAUNCHER-DEBUG] actualVersion: ${actualVersion}`);
            console.log(`[LAUNCHER-DEBUG] Will use Universal Forge? ${isModpack && modLoader === 'forge'}`);
            console.log(`[LAUNCHER-DEBUG] ========================================`);
            
            // For Forge modpacks, use minecraft-launcher-core with Forge version
            if (isModpack && modLoader === 'forge') {
                console.log(`[LAUNCHER] 🔥🔥🔥 FORGE MODPACK DETECTED - WILL USE UNIVERSAL FORGE SYSTEM 🔥🔥🔥`);
                // Continue with normal launcher flow - actualVersion is "1.20.1-forge-47.4.1"
            }
            
            if (wasInstalled) {
                console.log(`[LAUNCHER] Version ${actualVersion} was just installed, waiting before launch...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds after install
            }

            // Authentication already handled above for compatibility

            console.log(`[LAUNCHER] Authentication complete for ${username}`);

            // Launch configuration
            // CRITICAL FIX: For modpacks, always use MAIN minecraft directory for versions
            // Instance directory is only for mods/saves, versions must be in main directory
            const gameRoot = this.gameDirectory;  // Always use main directory for minecraft-launcher-core
            console.log(`[LAUNCHER-DEBUG] Using gameRoot: ${gameRoot}`);
            
            // For modpacks, use the installed modloader version
            // REAL FABRIC SUPPORT: Configure minecraft-launcher-core properly
            let launchOptions;
            
            if (isModpack && modLoader === 'fabric') {
                console.log(`[LAUNCHER] FABRIC modpack detected - Using DIRECT LAUNCH (BYPASS minecraft-launcher-core)`);
                
                // FABRIC DIRECT LAUNCH: Use direct Java launch like Forge
                const fabricResult = await this.launchFabricDirectly(gameDirectory, actualVersion, modLoader, modLoaderVersion, auth, options);
                if (fabricResult.success) {
                    console.log(`[LAUNCHER] ✅ Fabric modpack launched successfully with direct Java`);
                    return fabricResult;
                } else {
                    throw new Error(`Fabric direct launch failed: ${fabricResult.error}`);
                }
            } else if (isModpack && (modLoader === 'forge' || modLoader === 'neoforge')) {
                // New JSON-trust adapters for Forge/NeoForge
                const { launchForgeLike } = require('../loaders/ForgeAdapter');
                const { launchNeoForgeLike } = require('../loaders/NeoForgeAdapter');
                const launcherFn = modLoader === 'forge' ? launchForgeLike : launchNeoForgeLike;

                // Ensure BASE Minecraft version only (modded IDs are not in Mojang manifest)
                const baseMc = actualVersion.split('-')[0];
                this.emitProgress({ task: 'Versiyon Kontrol Ediliyor', message: `${baseMc} base versiyonu kontrol ediliyor...` });
                await this.ensureVersionInstalled(baseMc, this.gameDirectory);

                // Load global settings for memory
                const { app } = require('electron');
                const userDataPath = app.getPath('userData');
                const fsx = require('fs-extra');
                const pathx = require('path');
                const settings = await fsx.readJson(pathx.join(userDataPath, 'settings.json')).catch(() => ({ minMemoryGB: 2, maxMemoryGB: 4 }));

                // Auto-detect Java if not provided (with Minecraft version for smart selection)
                const resolvedJavaPath = javaPath || await javaDetector.getJavaPath(17, baseMc);
                console.log(`[FORGE/NEOFORGE] Using Java: ${resolvedJavaPath}`);
                
                const result = await launcherFn({
                    gameRoot: this.gameDirectory,
                    instanceDirectory: gameDirectory,
                    versionId: actualVersion,
                    javaPath: resolvedJavaPath,
                    minMemory: (settings.minMemoryGB || 2) * 1024,
                    maxMemory: (settings.maxMemoryGB || 4) * 1024,
                    user: {
                        name: auth.name,
                        uuid: auth.uuid,
                        accessToken: auth.access_token,
                        userType: auth.user_properties ? 'mojang' : 'mojang'
                    }
                });
                return result;
            } else {
                const fabricVersion = options.fabricVersion || (modLoader === 'fabric' ? modLoaderVersion : false);
                const forgeVersion = modLoader === 'forge' ? modLoaderVersion : false;
                
                // Auto-detect Java if not provided (with Minecraft version for smart selection)
                const resolvedJavaPath = javaPath || await javaDetector.getJavaPath(17, actualVersion);
                console.log(`[LAUNCHER] Using Java: ${resolvedJavaPath}`);
                
                launchOptions = {
                authorization: auth,
                    root: gameRoot,  // Main minecraft directory for versions/libraries
                    gameDirectory: gameDirectory || gameRoot,  // Instance directory for mods/saves (fallback to gameRoot)
                version: {
                        number: actualVersion,
                    type: 'release'
                },
                memory: {
                    max: optimizedMaxMemory,
                    min: optimizedMinMemory
                },
                customArgs: javaOpts.jvmArgs,
                window: {
                    width: windowWidth,
                    height: windowHeight,
                    fullscreen: fullscreen
                },
                    forge: forgeVersion,
                    fabric: fabricVersion,
                javaPath: resolvedJavaPath,
                customLaunchArgs: [],
                customArgs: [],
                overrides: {
                    detached: false
                }
            };
            }

            console.log(`[LAUNCHER] Launch configuration:`, {
                version: launchOptions.version.number,
                actualVersion: actualVersion,
                versionRoot: versionRoot,
                memory: launchOptions.memory,
                root: launchOptions.root,
                modLoader: modLoader,
                modLoaderVersion: modLoaderVersion,
                isModpack: isModpack,
                forge: launchOptions.forge,
                fabric: launchOptions.fabric
            });
            
            // CRITICAL DEBUG: Check if Fabric version exists
            if (isModpack && modLoader === 'fabric') {
                const fabricVersionPath = path.join(this.versionsDirectory, actualVersion, `${actualVersion}.json`);
                const fabricExists = await fs.pathExists(fabricVersionPath);
                console.log(`[FABRIC-DEBUG] Fabric version path: ${fabricVersionPath}`);
                console.log(`[FABRIC-DEBUG] Fabric version exists: ${fabricExists}`);
                
                if (fabricExists) {
                    const fabricProfile = await fs.readJSON(fabricVersionPath);
                    console.log(`[FABRIC-DEBUG] Fabric profile ID: ${fabricProfile.id}`);
                    console.log(`[FABRIC-DEBUG] Fabric profile type: ${fabricProfile.type}`);
                    console.log(`[FABRIC-DEBUG] Fabric libraries count: ${fabricProfile.libraries?.length || 0}`);
                }
            }
            
            // CRITICAL DEBUG: Check if Forge version exists
            if (isModpack && modLoader === 'forge') {
                const forgeVersionPath = path.join(this.versionsDirectory, actualVersion, `${actualVersion}.json`);
                const forgeExists = await fs.pathExists(forgeVersionPath);
                console.log(`[FORGE-DEBUG] Forge version path: ${forgeVersionPath}`);
                console.log(`[FORGE-DEBUG] Forge version exists: ${forgeExists}`);
                
                if (forgeExists) {
                    const forgeProfile = await fs.readJSON(forgeVersionPath);
                    console.log(`[FORGE-DEBUG] Forge profile ID: ${forgeProfile.id}`);
                    console.log(`[FORGE-DEBUG] Forge profile mainClass: ${forgeProfile.mainClass}`);
                    console.log(`[FORGE-DEBUG] Forge profile inheritsFrom: ${forgeProfile.inheritsFrom}`);
                }
            }
            
            // CRITICAL DEBUG: Check if NeoForge version exists
            if (isModpack && modLoader === 'neoforge') {
                // CRITICAL FIX: Use actualVersion directly (it's already formatted correctly)
                const neoforgeVersionId = actualVersion;
                const neoforgeVersionPath = path.join(this.versionsDirectory, neoforgeVersionId, `${neoforgeVersionId}.json`);
                const neoforgeExists = await fs.pathExists(neoforgeVersionPath);
                console.log(`[NEOFORGE-DEBUG] NeoForge version path: ${neoforgeVersionPath}`);
                console.log(`[NEOFORGE-DEBUG] NeoForge version exists: ${neoforgeExists}`);
                
                if (neoforgeExists) {
                    const neoforgeProfile = await fs.readJSON(neoforgeVersionPath);
                    console.log(`[NEOFORGE-DEBUG] NeoForge profile ID: ${neoforgeProfile.id}`);
                    console.log(`[NEOFORGE-DEBUG] NeoForge profile mainClass: ${neoforgeProfile.mainClass}`);
                    console.log(`[NEOFORGE-DEBUG] NeoForge profile inheritsFrom: ${neoforgeProfile.inheritsFrom}`);
                    console.log(`[NEOFORGE-DEBUG] NeoForge libraries count: ${neoforgeProfile.libraries?.length || 0}`);
                } else {
                    console.log(`[NEOFORGE-DEBUG] ❌ NeoForge profile NOT FOUND - will fallback to direct launch`);
                }
            }
            
            // CRITICAL DEBUG: Check if Quilt version exists
            if (isModpack && modLoader === 'quilt') {
                const quiltVersionPath = path.join(this.versionsDirectory, actualVersion, `${actualVersion}.json`);
                const quiltExists = await fs.pathExists(quiltVersionPath);
                console.log(`[QUILT-DEBUG] Quilt version path: ${quiltVersionPath}`);
                console.log(`[QUILT-DEBUG] Quilt version exists: ${quiltExists}`);
                
                if (quiltExists) {
                    const quiltProfile = await fs.readJSON(quiltVersionPath);
                    console.log(`[QUILT-DEBUG] Quilt profile ID: ${quiltProfile.id}`);
                    console.log(`[QUILT-DEBUG] Quilt profile mainClass: ${quiltProfile.mainClass}`);
                    console.log(`[QUILT-DEBUG] Quilt profile inheritsFrom: ${quiltProfile.inheritsFrom}`);
                }
            }

            // Create fresh client instance
            const { Client } = require('minecraft-launcher-core');
            const launcher = new Client();
            
            // Store launcher reference for stopping
            this.currentLauncher = launcher;
            this.gameProcess = null;

            // Set up progress tracking
            let progressStage = 'Hazırlanıyor';
            let currentFiles = 0;
            let totalFiles = 1;

            // Event listeners - USING EVENT MANAGER TO PREVENT MEMORY LEAKS
            this.eventManager.on(launcher, 'debug', (e) => {
                console.log('[MINECRAFT DEBUG]', e);
                // Only emit useful debug messages, not all debug output
                if (e && typeof e === 'string' && e.length < 100 && 
                    !e.includes('java') && !e.includes('.jar') && !e.includes('library.path')) {
                    this.emitProgress({ task: progressStage, message: e.substring(0, 50) });
                }
            }, 'game-launch');
            
            this.eventManager.on(launcher, 'data', (e) => {
                const data = e.toString('utf-8');
                console.log('[MINECRAFT DATA]', data);
                
                // Update progress based on output - but don't duplicate with the main data handler
                if (data.includes('Launching') && !data.includes('Setting user:')) {
                    progressStage = 'Minecraft Açılıyor';
                    this.emitProgress({ task: progressStage, message: 'Minecraft başlatılıyor...' });
                }
                
                // Don't emit raw data to UI - it's handled by the main data handler below
            }, 'game-launch');
            
            this.eventManager.on(launcher, 'progress', (e) => {
                console.log('[MINECRAFT PROGRESS]', e);
                
                // Handle different progress event types
                let progressData = {
                    task: progressStage,
                    current: 0,
                    total: 1,
                    message: progressStage
                };
                
                // Check if it's a number-based progress
                if (typeof e === 'number') {
                    progressData.current = e;
                    progressData.total = totalFiles || 1;
                    progressData.message = `${progressStage} (${e}/${totalFiles || 1})`;
                }
                // Check if it's an object with current/total
                else if (e && typeof e === 'object') {
                    if (e.current !== undefined && e.total !== undefined) {
                        progressData.current = e.current;
                        progressData.total = e.total;
                        currentFiles = e.current;
                        totalFiles = e.total;
                        progressData.message = `${progressStage} (${e.current}/${e.total})`;
                    }
                    
                    // Update stage based on task
                    const taskString = String(e.task || e.type || '');
                    if (taskString.includes('assets') || taskString.includes('asset')) {
                        progressStage = 'Varlıklar İndiriliyor';
                        progressData.task = progressStage;
                    } else if (taskString.includes('libraries') || taskString.includes('library')) {
                        progressStage = 'Kütüphaneler İndiriliyor';
                        progressData.task = progressStage;
                    } else if (taskString.includes('client') || taskString.includes('jar')) {
                        progressStage = 'Oyun İndiriliyor';
                        progressData.task = progressStage;
                    } else if (taskString.includes('extract') || taskString.includes('native')) {
                        progressStage = 'Dosyalar Çıkarılıyor';
                        progressData.task = progressStage;
                    }
                }

                console.log('[MINECRAFT EMIT]', progressData);
                this.emitProgress(progressData);
            });
            
            launcher.on('close', (code) => {
                console.log('[MINECRAFT CLOSE]', `Game closed with code: ${code}`);
                
                // Reset game state
                this.resetGameState();
                
                this.emitGameClosed(code);
            });
            
            launcher.on('error', (error) => {
                console.error('[MINECRAFT ERROR]', error);
                this.resetGameState();
                this.emitError(error);
            });

            // Launch the game
            console.log(`[LAUNCHER] Starting Minecraft launcher...`);
            console.log(`[LAUNCHER-DEBUG] Full launch options:`, JSON.stringify(launchOptions, null, 2));
            
            // CRITICAL DEBUG: Check if version directory exists
            const versionDir = path.join(launchOptions.root, 'versions', launchOptions.version.number);
            const versionJson = path.join(versionDir, `${launchOptions.version.number}.json`);
            console.log(`[LAUNCHER-DEBUG] Looking for version at: ${versionDir}`);
            console.log(`[LAUNCHER-DEBUG] Version JSON path: ${versionJson}`);
            console.log(`[LAUNCHER-DEBUG] Version directory exists: ${await fs.pathExists(versionDir)}`);
            console.log(`[LAUNCHER-DEBUG] Version JSON exists: ${await fs.pathExists(versionJson)}`);
            
            this.emitProgress({ task: 'Minecraft Başlatılıyor', message: 'Launcher başlatılıyor...' });
            
            // Launch and track completion properly
            return new Promise((resolve, reject) => {
                let isGameLaunched = false;
                let launchTimeout;

                let gameInitialized = false;
                let gameFullyLoaded = false;
                let launchSteps = {
                    user: false,
                    lwjgl: false,
                    resources: false,
                    ready: false
                };
                
                this.eventManager.on(launcher, 'data', (e) => {
                    const data = e.toString('utf-8');
                    console.log('[MINECRAFT OUTPUT]', data);
                    
                    // Track launch progression step by step
                    if (data.includes('Setting user:') && !launchSteps.user) {
                        launchSteps.user = true;
                        console.log('[LAUNCHER] ✓ Step 1: User set - GAME IS STARTING!');
                        this.emitProgress({ 
                            task: 'Oyun Başlıyor', 
                            message: 'Minecraft başlatıldı!' 
                        });
                    }
                    
                    if (data.includes('Backend library: LWJGL') && !launchSteps.lwjgl) {
                        launchSteps.lwjgl = true;
                        console.log('[LAUNCHER] ✓ Step 2: LWJGL initialized - GAME IS RUNNING!');
                        this.emitProgress({ 
                            task: 'Oyun Çalışıyor', 
                            message: 'Minecraft çalışıyor!' 
                        });
                    }
                    
                    if (data.includes('Reloading ResourceManager') && !launchSteps.resources) {
                        launchSteps.resources = true;
                        console.log('[LAUNCHER] ✓ Step 3: Resources loading');
                    }
                    
                    // Game is truly ready when it starts checking for Realms or similar multiplayer services
                    if ((data.includes('Realms Notification') || 
                         data.includes('Could not authorize you against Realms') ||
                         data.includes('Menu screen') ||
                         data.includes('Singleplayer') ||
                         data.includes('Multiplayer')) && !launchSteps.ready) {
                        launchSteps.ready = true;
                        gameFullyLoaded = true;
                        console.log('[LAUNCHER] ✓ Step 4: Game fully loaded');
                    }
                    
                    // 🔥 AGGRESSIVE: Launch as soon as we see LWJGL (2 steps = game is definitely running)
                    const completedNow = Object.values(launchSteps).filter(Boolean).length;
                    if (completedNow >= 2 && !isGameLaunched) {
                        isGameLaunched = true;
                        console.log('[LAUNCHER] 🎮 MINECRAFT IS RUNNING! Sending game-started event immediately');
                        console.log('[LAUNCHER] Completed steps:', launchSteps);
                        
                        // Send game started event IMMEDIATELY to hide progress
                        if (global.mainWindow) {
                            global.mainWindow.webContents.send('game-started');
                        }
                        
                        if (launchTimeout) clearTimeout(launchTimeout);
                        resolve(true);
                    }
                    
                    // Show current launch progress
                    const completedSteps = Object.values(launchSteps).filter(Boolean).length;
                    const totalSteps = Object.keys(launchSteps).length;
                    console.log(`[LAUNCHER] Launch Progress: ${completedSteps}/${totalSteps} steps completed`);
                    
                    // Don't show raw output in UI - filter sensitive data
                    if (!data.includes('--accessToken') && 
                        !data.includes('--uuid') && 
                        !data.includes('clientId') &&
                        data.trim().length < 100) {
                        // Only show important status messages
                        if (data.includes('Setting user:') || 
                            data.includes('Backend library:') ||
                            data.includes('Reloading ResourceManager')) {
                            this.emitProgress({ 
                                task: progressStage, 
                                message: data.trim().substring(0, 50) + '...' 
                            });
                        }
                    }
                });

                // Start the launch
                this.processState = 'STARTING';
                const gameProcess = launcher.launch(launchOptions);
                
                // Store the actual game process and PID
                if (gameProcess && gameProcess.pid) {
                    this.gameProcess = gameProcess;
                    this.gameProcessPid = gameProcess.pid;
                    this.currentLauncher = launcher;
                    console.log('[LAUNCHER] ✅ Game process started with PID:', gameProcess.pid);
                    
                    // REGISTER WITH PROCESS MANAGER
                    this.processManager.registerProcess(gameProcess.pid, {
                        type: 'minecraft',
                        version: actualVersion,
                        username
                    });
                    
                    // REGISTER WITH GAME STATE MANAGER
                    this.gameStateManager.registerProcess(gameProcess, gameProcess.pid);
                    console.log('[LAUNCHER] ✅ Process registered with GameStateManager');
                    
                    // Note: GameStateManager will handle process monitoring automatically
                    // No need for manual event listeners here
                } else {
                    // Fallback - store launcher reference
                    this.gameProcess = launcher;
                    this.currentLauncher = launcher;
                    console.log('[LAUNCHER] ⚠️ No PID found, using launcher reference');
                }
                this.isGameRunning = true;
                this.processState = 'RUNNING';
                
                // RELEASE MUTEX after game process starts
                this.launchMutex = false;
                console.log('[LAUNCHER] 🔓 Launch mutex released');

                // Shorter timeout - force completion after 10 seconds if 1+ steps complete
                launchTimeout = setTimeout(() => {
                    if (!isGameLaunched) {
                        const completedSteps = Object.values(launchSteps).filter(Boolean).length;
                        
                        console.log(`[LAUNCHER] ⏰ Timeout check - ${completedSteps}/4 steps completed`);
                        console.log('[LAUNCHER] Current step status:', launchSteps);
                        
                        if (completedSteps >= 1) {
                            // If we have ANY step, game process is running
                            console.log('[LAUNCHER] ✅ 1+ steps completed - game is running, forcing completion');
                            isGameLaunched = true;
                            
                            // Send game started event
                            if (global.mainWindow) {
                                global.mainWindow.webContents.send('game-started');
                            }
                            
                            resolve(true);
                        } else {
                            // Give a bit more time
                            console.log('[LAUNCHER] ⚠️ No steps yet, waiting longer...');
                            setTimeout(() => {
                                if (!isGameLaunched) {
                                    console.log('[LAUNCHER] ⏰ Final timeout - forcing completion anyway');
                                    isGameLaunched = true;
                                    
                                    // Send game started event
                                    if (global.mainWindow) {
                                        global.mainWindow.webContents.send('game-started');
                                    }
                                    
                                    resolve(true);
                                }
                            }, 10000); // Additional 10 seconds
                        }
                    }
                }, 10000); // Initial 10 seconds timeout
            });

        } catch (error) {
            console.error('[LAUNCHER ERROR] Launch failed:', error);
            
            // CRITICAL: Reset GameStateManager on error
            console.log('[LAUNCHER] 🔄 Resetting GameStateManager after error...');
            this.gameStateManager.resetState();
            
            // RELEASE MUTEX on error
            this.launchMutex = false;
            console.log('[LAUNCHER] 🔓 Launch mutex released (error)');
            
            // Cleanup event listeners on error
            this.eventManager.removeByTag('game-launch');
            
            this.emitError(error);
            throw error;
        }
    }

    async stopGame() {
        console.log('[LAUNCHER] 🛑 Attempting to stop Minecraft...');
        
        // Use GameStateManager for reliable stop
        const result = await this.gameStateManager.stopGame();
        
        // CRITICAL: Release mutex when game stops
        this.launchMutex = false;
        console.log('[LAUNCHER] 🔓 Launch mutex released (game stopped)');
        
        // Cleanup event listeners
        this.eventManager.removeByTag('game-launch');
        console.log('[LAUNCHER] Event listeners cleaned up');
        
        return result;
    }
    
    async forceKillGame() {
        console.log('[LAUNCHER] ⚡ Force killing Minecraft...');
        
        // Use GameStateManager for reliable force kill
        const result = await this.gameStateManager.forceKillGame();
        
        // CRITICAL: Release mutex when game is force killed
        this.launchMutex = false;
        console.log('[LAUNCHER] 🔓 Launch mutex released (force killed)');
        
        // Cleanup event listeners
        this.eventManager.removeByTag('game-launch');
        console.log('[LAUNCHER] Event listeners cleaned up');
        
        return result;
    }

    /**
     * Cleanup and destroy launcher
     */
    destroy() {
        console.log('[LAUNCHER] Cleaning up launcher...');
        
        // Cleanup managers
        if (this.gameStateManager) {
            this.gameStateManager.destroy();
        }
        
        if (this.progressTracker) {
            this.progressTracker.destroy();
        }
        
        if (this.eventManager) {
            this.eventManager.removeAllListeners();
        }
        
        console.log('[LAUNCHER] ✅ Launcher cleanup complete');
    }
            
    resetGameState() {
        console.log('[LAUNCHER] Resetting game state...');
        this.isGameRunning = false;
        this.processState = 'IDLE';
        this.gameProcess = null;
        this.gameProcessPid = null;
        this.currentLauncher = null;
        
        // CRITICAL: Also reset GameStateManager
        if (this.gameStateManager) {
            const currentState = this.gameStateManager.getState();
            console.log('[LAUNCHER] Current GameStateManager state:', currentState.state);
            
            if (currentState.state !== 'IDLE') {
                console.log('[LAUNCHER] Forcing GameStateManager reset...');
                this.gameStateManager.resetState();
            }
        }
        
        // CRITICAL: Release launch mutex
        if (this.launchMutex) {
            console.log('[LAUNCHER] Releasing launch mutex...');
            this.launchMutex = false;
        }
        
        console.log('[LAUNCHER] ✅ Game state fully reset');
    }
    
    getGameState() {
        // Use GameStateManager for accurate state
        return this.gameStateManager.getState();
    }

    async ensureVersionInstalled(version, customRoot = null) {
        try {
            console.log(`[LAUNCHER] Checking if version ${version} is installed...`);
            
            // Use custom root for modpack versions
            const versionsDir = customRoot ? path.join(customRoot, 'versions') : this.versionsDirectory;
            const versionPath = path.join(versionsDir, version);
            const versionJsonPath = path.join(versionPath, `${version}.json`);
            const versionJarPath = path.join(versionPath, `${version}.jar`);
            
            // Check if both JSON and JAR files exist and are not empty
            const jsonExists = await fs.pathExists(versionJsonPath);
            const jarExists = await fs.pathExists(versionJarPath);
            
            let jsonValid = false;
            let jarValid = false;
            
            if (jsonExists) {
                try {
                    const jsonStats = await fs.stat(versionJsonPath);
                    jsonValid = jsonStats.size > 100; // JSON should be at least 100 bytes
                    console.log(`[LAUNCHER] JSON file size: ${jsonStats.size} bytes`);
                } catch (err) {
                    console.log(`[LAUNCHER] Error checking JSON stats:`, err.message);
                }
            }
            
            if (jarExists) {
                try {
                    const jarStats = await fs.stat(versionJarPath);
                    jarValid = jarStats.size > 1000000; // JAR should be at least 1MB
                    console.log(`[LAUNCHER] JAR file size: ${jarStats.size} bytes`);
                } catch (err) {
                    console.log(`[LAUNCHER] Error checking JAR stats:`, err.message);
                }
            }
            
            if (!jsonValid || !jarValid) {
                console.log(`[LAUNCHER] Version ${version} not found or incomplete, installing...`);
                console.log(`[LAUNCHER] JSON valid: ${jsonValid}, JAR valid: ${jarValid}`);
                this.emitProgress({ 
                    task: 'Versiyon Kuruluyor', 
                    message: `Minecraft ${version} kuruluyor...` 
                });
                
                // Clean up incomplete files first
                if (await fs.pathExists(versionPath)) {
                    console.log(`[LAUNCHER] Cleaning up incomplete installation...`);
                    await fs.remove(versionPath);
                }
                
                await this.installVersion(version);
                return true; // Indicate that installation happened
            } else {
                console.log(`[LAUNCHER] ✅ Version ${version} is already installed and complete`);
                console.log(`[LAUNCHER] Skipping installation - files are valid`);
                this.emitProgress({ 
                    task: 'Versiyon Hazır', 
                    message: `Minecraft ${version} zaten kurulu` 
                });
                
                // Small delay to show the message
                await new Promise(resolve => setTimeout(resolve, 500));
                return false; // Indicate that no installation was needed
            }
        } catch (error) {
            console.error(`[LAUNCHER] Error ensuring version ${version}:`, error);
            throw error;
        }
    }

    getProgressTaskName(task) {
        const taskNames = {
            'downloadAssets': 'Varlıklar İndiriliyor',
            'downloadLibraries': 'Kütüphaneler İndiriliyor',
            'downloadClient': 'Oyun İndiriliyor',
            'extractNatives': 'Dosyalar Çıkarılıyor',
            'launchMinecraft': 'Minecraft Başlatılıyor',
            'authenticate': 'Kimlik Doğrulanıyor',
            'validateFiles': 'Dosyalar Kontrol Ediliyor'
        };
        return taskNames[task] || task || 'İşlem Yapılıyor';
    }

    /**
     * Copy Fabric version from instance to main versions directory
     */
    async copyFabricFromInstance(instanceDirectory, fabricVersionId) {
        try {
            const instanceVersionsDir = path.join(instanceDirectory, 'versions');
            const fabricVersionDir = path.join(instanceVersionsDir, fabricVersionId);
            const fabricVersionJson = path.join(fabricVersionDir, `${fabricVersionId}.json`);
            
            // Target in main versions directory
            const mainVersionsDir = this.versionsDirectory;
            const mainVersionDir = path.join(mainVersionsDir, fabricVersionId);
            const mainVersionJson = path.join(mainVersionDir, `${fabricVersionId}.json`);
            
            // Check if already exists in main directory
            if (await fs.pathExists(mainVersionJson)) {
                console.log(`[FABRIC-COPY] ✅ ${fabricVersionId} already exists in main versions`);
            return true;
            }
            
            // Check if source exists in instance
            if (!await fs.pathExists(fabricVersionJson)) {
                console.error(`[FABRIC-COPY] ❌ Source version not found: ${fabricVersionJson}`);
                return false;
            }
            
            // Copy entire version directory to main versions
            await fs.ensureDir(mainVersionsDir);
            await fs.copy(fabricVersionDir, mainVersionDir, { overwrite: true });
            console.log(`[FABRIC-COPY] ✅ Copied ${fabricVersionId} from instance to main versions`);
            
            // Also copy libraries if they exist in instance
            const instanceLibsDir = path.join(instanceDirectory, 'libraries');
            const mainLibsDir = path.join(this.gameDirectory, 'libraries');
            
            if (await fs.pathExists(instanceLibsDir)) {
                await fs.copy(instanceLibsDir, mainLibsDir, { overwrite: false }); // Don't overwrite existing
                console.log(`[FABRIC-COPY] ✅ Copied Fabric libraries to main libraries directory`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`[FABRIC-COPY] ❌ Failed to copy Fabric version:`, error);
            return false;
        }
    }

    /**
     * Copy NeoForge version from instance to main versions directory
     */
    async copyNeoForgeFromInstance(instanceDirectory, neoforgeVersionId) {
        try {
            const instanceVersionsDir = path.join(instanceDirectory, 'versions');
            const neoforgeVersionDir = path.join(instanceVersionsDir, neoforgeVersionId);
            const neoforgeVersionJson = path.join(neoforgeVersionDir, `${neoforgeVersionId}.json`);
            
            // Target in main versions directory
            const mainVersionsDir = this.versionsDirectory;
            const mainVersionDir = path.join(mainVersionsDir, neoforgeVersionId);
            const mainVersionJson = path.join(mainVersionDir, `${neoforgeVersionId}.json`);
            
            // Check if already exists in main directory
            if (await fs.pathExists(mainVersionJson)) {
                console.log(`[NEOFORGE-COPY] ✅ ${neoforgeVersionId} already exists in main versions`);
                return true;
            }
            
            // Check if source exists in instance
            if (!await fs.pathExists(neoforgeVersionJson)) {
                console.error(`[NEOFORGE-COPY] ❌ Source version not found: ${neoforgeVersionJson}`);
                return false;
            }
            
            // Copy entire version directory to main versions
            await fs.ensureDir(mainVersionsDir);
            await fs.copy(neoforgeVersionDir, mainVersionDir, { overwrite: true });
            console.log(`[NEOFORGE-COPY] ✅ Copied ${neoforgeVersionId} from instance to main versions`);
            
            // Also copy libraries if they exist in instance
            const instanceLibsDir = path.join(instanceDirectory, 'libraries');
            const mainLibsDir = path.join(this.gameDirectory, 'libraries');
            
            if (await fs.pathExists(instanceLibsDir)) {
                await fs.copy(instanceLibsDir, mainLibsDir, { overwrite: false }); // Don't overwrite existing
                console.log(`[NEOFORGE-COPY] ✅ Copied NeoForge libraries to main libraries directory`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`[NEOFORGE-COPY] ❌ Failed to copy NeoForge version:`, error);
            return false;
        }
    }

    /**
     * Copy Forge version from instance to main versions directory
     */
    async copyForgeFromInstance(instanceDirectory, forgeVersionId) {
        try {
            const instanceVersionsDir = path.join(instanceDirectory, 'versions');
            const forgeVersionDir = path.join(instanceVersionsDir, forgeVersionId);
            const forgeVersionJson = path.join(forgeVersionDir, `${forgeVersionId}.json`);
            
            // Target in main versions directory
            const mainVersionsDir = this.versionsDirectory;
            const mainVersionDir = path.join(mainVersionsDir, forgeVersionId);
            const mainVersionJson = path.join(mainVersionDir, `${forgeVersionId}.json`);
            
            // Check if already exists in main directory
            if (await fs.pathExists(mainVersionJson)) {
                console.log(`[FORGE-COPY] ✅ ${forgeVersionId} already exists in main versions`);
                return true;
            }
            
            // Check if source exists in instance
            if (!await fs.pathExists(forgeVersionJson)) {
                console.error(`[FORGE-COPY] ❌ Source version not found: ${forgeVersionJson}`);
                return false;
            }
            
            // Copy entire version directory to main versions
            await fs.ensureDir(mainVersionsDir);
            await fs.copy(forgeVersionDir, mainVersionDir, { overwrite: true });
            console.log(`[FORGE-COPY] ✅ Copied ${forgeVersionId} from instance to main versions`);
            
            // Also copy libraries if they exist in instance
            const instanceLibsDir = path.join(instanceDirectory, 'libraries');
            const mainLibsDir = path.join(this.gameDirectory, 'libraries');
            
            if (await fs.pathExists(instanceLibsDir)) {
                await fs.copy(instanceLibsDir, mainLibsDir, { overwrite: false }); // Don't overwrite existing
                console.log(`[FORGE-COPY] ✅ Copied Forge libraries to main libraries directory`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`[FORGE-COPY] ❌ Failed to copy Forge version:`, error);
            return false;
        }
    }

    /**
     * Copy Quilt version from instance to main versions directory
     */
    async copyQuiltFromInstance(instanceDirectory, quiltVersionId) {
        try {
            const instanceVersionsDir = path.join(instanceDirectory, 'versions');
            const quiltVersionDir = path.join(instanceVersionsDir, quiltVersionId);
            const quiltVersionJson = path.join(quiltVersionDir, `${quiltVersionId}.json`);
            
            // Target in main versions directory
            const mainVersionsDir = this.versionsDirectory;
            const mainVersionDir = path.join(mainVersionsDir, quiltVersionId);
            const mainVersionJson = path.join(mainVersionDir, `${quiltVersionId}.json`);
            
            // Check if already exists in main directory
            if (await fs.pathExists(mainVersionJson)) {
                console.log(`[QUILT-COPY] ✅ ${quiltVersionId} already exists in main versions`);
                return true;
            }
            
            // Check if source exists in instance
            if (!await fs.pathExists(quiltVersionJson)) {
                console.error(`[QUILT-COPY] ❌ Source version not found: ${quiltVersionJson}`);
                return false;
            }
            
            // Copy entire version directory to main versions
            await fs.ensureDir(mainVersionsDir);
            await fs.copy(quiltVersionDir, mainVersionDir, { overwrite: true });
            console.log(`[QUILT-COPY] ✅ Copied ${quiltVersionId} from instance to main versions`);
            
            // Also copy libraries if they exist in instance
            const instanceLibsDir = path.join(instanceDirectory, 'libraries');
            const mainLibsDir = path.join(this.gameDirectory, 'libraries');
            
            if (await fs.pathExists(instanceLibsDir)) {
                await fs.copy(instanceLibsDir, mainLibsDir, { overwrite: false }); // Don't overwrite existing
                console.log(`[QUILT-COPY] ✅ Copied Quilt libraries to main libraries directory`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`[QUILT-COPY] ❌ Failed to copy Quilt version:`, error);
            return false;
        }
    }

    // Removed duplicate installer functions - ProfessionalModManager handles all loader installations

    /**
     * Launch vanilla Minecraft for Forge modpacks (LEGACY METHOD)
     * @deprecated Use launchVanillaMinecraft for new launches
     */
    async launchVanillaMinecraftForForge(gameDirectory, minecraftVersion, auth) {
        try {
            console.log(`[VANILLA-FORGE] Launching vanilla Minecraft ${minecraftVersion} for Forge modpack`);
            console.log(`[VANILLA-FORGE] Game directory: ${gameDirectory}`);
            
            // Ensure vanilla Minecraft version is installed
            const wasInstalled = await this.ensureVersionInstalled(minecraftVersion, this.versionsDirectory);
            if (wasInstalled) {
                console.log(`[VANILLA-FORGE] ✅ Minecraft ${minecraftVersion} installed successfully`);
            }
            
            // Use minecraft-launcher-core for vanilla launch
            const launcher = new Client();
            
            const launchOptions = {
                authorization: auth,
                root: this.gameDirectory, // Main .minecraft directory
                gameDir: gameDirectory,   // Modpack instance directory
                version: {
                    number: minecraftVersion,
                    type: "release"
                },
                memory: {
                    max: "4G",
                    min: "1G"
                },
                forge: false, // Explicitly disable Forge in launcher-core
                javaPath: this.javaPath
            };
            
            console.log(`[VANILLA-FORGE] Launch options:`, {
                version: launchOptions.version.number,
                gameDir: launchOptions.gameDir,
                root: launchOptions.root,
                user: auth.name
            });
            
            this.emitProgress({ task: 'Minecraft Başlatılıyor', message: `Vanilla Minecraft ${minecraftVersion} başlatılıyor...` });
            
            // Launch vanilla Minecraft
            const minecraftProcess = await launcher.launch(launchOptions);
            
            console.log(`[VANILLA-FORGE] ✅ Vanilla Minecraft process started with PID: ${minecraftProcess.pid}`);
            
            // Register process with GameStateManager
            this.gameStateManager.registerProcess(minecraftProcess, minecraftProcess.pid);
            
            this.emitProgress({ task: 'Başlatıldı', message: `Minecraft başarıyla başlatıldı! (PID: ${minecraftProcess.pid})` });
            
            return minecraftProcess;
            
        } catch (error) {
            console.error('[VANILLA-FORGE] Launch failed:', error);
            this.emitProgress({ task: 'Hata', message: `Vanilla Minecraft başlatma hatası: ${error.message}` });
            throw error;
        }
    }

    /**
     * Get instance metadata for Universal Forge System
     */
    async getInstanceMetadata(instanceDirectory) {
        try {
            const metadataPath = path.join(instanceDirectory, 'instance.json');
            if (await fs.pathExists(metadataPath)) {
                return await fs.readJSON(metadataPath);
            }
            return null;
        } catch (error) {
            console.log(`[LAUNCHER] Could not read instance metadata: ${error.message}`);
            return null;
        }
    }

    /**
     * Launch Fabric modpack directly with Java (BYPASS minecraft-launcher-core)
     */
    async launchFabricDirectly(gameDirectory, version, modloader, modloaderVersion, auth, options) {
        try {
            console.log(`[FABRIC-INDEPENDENT] Starting Fabric ${version} with independent system`);
            
            // Extract base Minecraft version from Fabric version
            const baseVersion = version.replace(`fabric-loader-${modloaderVersion}-`, '');
            console.log(`[FABRIC-INDEPENDENT] Base Minecraft version: ${baseVersion}`);
            console.log(`[FABRIC-INDEPENDENT] Fabric version: ${modloaderVersion}`);
            
            // Load Fabric profile
            const fabricProfilePath = path.join(this.gameDirectory, 'versions', version, `${version}.json`);
            if (!await fs.pathExists(fabricProfilePath)) {
                throw new Error(`Fabric profile not found: ${fabricProfilePath}`);
            }
            
            const fabricProfile = await fs.readJSON(fabricProfilePath);
            console.log(`[FABRIC-INDEPENDENT] Loaded Fabric profile: ${version}`);
            
            // Build classpath
            const classpath = [];
            
            // Add base Minecraft JAR
            const minecraftJar = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.jar`);
            if (await fs.pathExists(minecraftJar)) {
                classpath.push(minecraftJar);
                console.log(`[FABRIC-INDEPENDENT] Added Minecraft JAR: ${minecraftJar}`);
            }
            
            // CRITICAL: Ensure base Minecraft version is downloaded
            const baseProfile = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.json`);
            if (!await fs.pathExists(baseProfile)) {
                console.log(`[FABRIC-INDEPENDENT] Base Minecraft version not found, downloading: ${baseVersion}`);
                try {
                    await this.downloadVersionFiles(baseVersion);
                    console.log(`[FABRIC-INDEPENDENT] ✅ Base Minecraft version downloaded: ${baseVersion}`);
                } catch (error) {
                    console.error(`[FABRIC-INDEPENDENT] ❌ Failed to download base version: ${error.message}`);
                }
            }

            // Add Fabric libraries (CRITICAL: Different format than Forge!)
            if (fabricProfile.libraries) {
                let addedLibs = 0;
                for (const lib of fabricProfile.libraries) {
                    // FABRIC USES DIFFERENT FORMAT: name + url directly
                    if (lib.name && lib.url) {
                        // Convert Maven coordinates to path
                        const parts = lib.name.split(':');
                        if (parts.length >= 3) {
                            const [group, artifact, version] = parts;
                            const groupPath = group.replace(/\./g, '/');
                            const fileName = `${artifact}-${version}.jar`;
                            const libPath = path.join(this.librariesDirectory, groupPath, artifact, version, fileName);
                            
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                                addedLibs++;
                                console.log(`[FABRIC-INDEPENDENT] ✅ Found: ${lib.name}`);
                            } else {
                                // Download missing Fabric library
                                console.log(`[FABRIC-INDEPENDENT] Downloading missing Fabric library: ${lib.name}`);
                                try {
                                    await fs.ensureDir(path.dirname(libPath));
                                    await this.downloadFile(lib.url, libPath);
                                    classpath.push(libPath);
                                    addedLibs++;
                                    console.log(`[FABRIC-INDEPENDENT] ✅ Downloaded: ${lib.name}`);
                                } catch (error) {
                                    console.error(`[FABRIC-INDEPENDENT] ❌ Failed to download ${lib.name}: ${error.message}`);
                                }
                            }
                        }
                    } else if (lib.downloads?.artifact?.path) {
                        // Standard Minecraft library format (fallback)
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpath.push(libPath);
                            addedLibs++;
                        } else {
                            console.log(`[FABRIC-INDEPENDENT] Downloading missing standard library: ${lib.name}`);
                            try {
                                await fs.ensureDir(path.dirname(libPath));
                                await this.downloadFile(lib.downloads.artifact.url, libPath);
                                classpath.push(libPath);
                                addedLibs++;
                                console.log(`[FABRIC-INDEPENDENT] ✅ Downloaded: ${lib.name}`);
                            } catch (error) {
                                console.error(`[FABRIC-INDEPENDENT] ❌ Failed to download ${lib.name}: ${error.message}`);
                            }
                        }
                    }
                }
                console.log(`[FABRIC-INDEPENDENT] Added ${addedLibs}/${fabricProfile.libraries.length} Fabric libraries`);
            }

            // Add base Minecraft libraries (EXCLUDE ASM - Fabric has its own)
            if (await fs.pathExists(baseProfile)) {
                const baseProfileData = await fs.readJSON(baseProfile);
                if (baseProfileData.libraries) {
                    let addedBaseLibs = 0;
                    let skippedASM = 0;
                    for (const lib of baseProfileData.libraries) {
                        // CRITICAL: Skip ASM libraries to avoid duplicates with Fabric
                        if (lib.name && lib.name.startsWith('org.ow2.asm:')) {
                            skippedASM++;
                            console.log(`[FABRIC-INDEPENDENT] ⚠️ Skipped duplicate ASM: ${lib.name} (Fabric has ASM 9.8)`);
                            continue;
                        }
                        
                        if (lib.downloads?.artifact?.path) {
                            const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                                addedBaseLibs++;
                            } else {
                                // Download missing base library
                                console.log(`[FABRIC-INDEPENDENT] Downloading missing base library: ${lib.name}`);
                                try {
                                    await fs.ensureDir(path.dirname(libPath));
                                    await this.downloadFile(lib.downloads.artifact.url, libPath);
                                    classpath.push(libPath);
                                    addedBaseLibs++;
                                    console.log(`[FABRIC-INDEPENDENT] ✅ Downloaded base: ${lib.name}`);
                                } catch (error) {
                                    console.error(`[FABRIC-INDEPENDENT] ❌ Failed to download base ${lib.name}: ${error.message}`);
                                }
                            }
                        }
                    }
                    console.log(`[FABRIC-INDEPENDENT] Added ${addedBaseLibs}/${baseProfileData.libraries.length} base libraries (skipped ${skippedASM} ASM duplicates)`);
                }
            }
            
            // Add mods from instance directory
            const modsDir = path.join(gameDirectory, 'mods');
            if (await fs.pathExists(modsDir)) {
                const modFiles = await fs.readdir(modsDir);
                const jarFiles = modFiles.filter(file => file.endsWith('.jar'));
                for (const jarFile of jarFiles) {
                    classpath.push(path.join(modsDir, jarFile));
                }
                console.log(`[FABRIC-INDEPENDENT] Added ${jarFiles.length} mod JARs`);
            }
            
            console.log(`[FABRIC-INDEPENDENT] Total classpath entries: ${classpath.length}`);
            
            // Build Java arguments
            const javaArgs = [
                '-Xmx4G',
                '-Xms1G',
                `-Djava.library.path=${path.join(this.gameDirectory, 'natives', version)}`,
                '-Dminecraft.launcher.brand=BlockSmiths',
                '-Dminecraft.launcher.version=1.0.0'
            ];

            // Main class (Fabric uses vanilla main class)
            const mainClass = fabricProfile.mainClass || 'net.minecraft.client.main.Main';
            
            // Game arguments
            const gameArgs = [
                '--username', auth.name || 'Player',
                '--version', version,
                '--gameDir', gameDirectory,
                '--assetsDir', path.join(this.gameDirectory, 'assets'),
                '--assetIndex', baseVersion,
                '--uuid', auth.uuid || 'offline',
                '--accessToken', auth.access_token || 'offline',
                '--userType', 'offline',
                '--width', '1280',
                '--height', '720'
            ];

            // Use arguments file to avoid ENAMETOOLONG
            console.log(`[FABRIC-INDEPENDENT] Creating arguments file to avoid ENAMETOOLONG...`);
            
            const libsDir = path.join(gameDirectory, 'libs');
            await fs.ensureDir(libsDir);
            
            // Copy all classpath JARs to libs directory for wildcard
            let libCount = 0;
            for (const jarPath of classpath) {
                const jarName = path.basename(jarPath);
                const targetPath = path.join(libsDir, jarName);
                if (!await fs.pathExists(targetPath)) {
                    try {
                        await fs.copy(jarPath, targetPath);
                        libCount++;
                    } catch (error) {
                        console.error(`[FABRIC-INDEPENDENT] ❌ Failed to copy ${jarName}: ${error.message}`);
                    }
                }
            }
            console.log(`[FABRIC-INDEPENDENT] Copied ${libCount} JARs to libs directory for wildcard classpath`);
            
            // Use wildcard classpath + Minecraft JAR
            const wildcardClasspath = path.join(libsDir, '*');
            
            // Complete classpath: libs/* + Minecraft JAR (reuse existing minecraftJar variable)
            const fullClasspath = `${wildcardClasspath}${process.platform === 'win32' ? ';' : ':'}${minecraftJar}`;
            
            // Create arguments file
            const argsFile = path.join(gameDirectory, 'launch.args');
            
            const allArgs = [
                ...javaArgs,
                '-cp', fullClasspath,
                mainClass,
                ...gameArgs
            ];
            
            // Write arguments to file, one per line
            await fs.writeFile(argsFile, allArgs.join('\n'), 'utf8');
            
            console.log(`[FABRIC-INDEPENDENT] Using arguments file with ${allArgs.length} arguments`);
            console.log(`[FABRIC-INDEPENDENT] Full classpath: ${fullClasspath}`);
            
            // Auto-detect Java if not provided (with Minecraft version for smart selection)
            const resolvedJavaPath = this.javaPath || await javaDetector.getJavaPath(17, baseVersion);
            console.log(`[FABRIC-INDEPENDENT] Using Java: ${resolvedJavaPath}`);
            
            // Launch with @argsfile syntax
            const { spawn } = require('child_process');
            const minecraftProcess = spawn(resolvedJavaPath, [`@${argsFile}`], {
                cwd: gameDirectory,
                detached: false
            });
            
            console.log(`[FABRIC-INDEPENDENT] ✅ Process started with PID: ${minecraftProcess.pid}`);
            
            // REGISTER WITH GAME STATE MANAGER
            this.gameStateManager.registerProcess(minecraftProcess, minecraftProcess.pid);
            console.log('[FABRIC-INDEPENDENT] ✅ Process registered with GameStateManager');
            
            // Return serializable data only (no ChildProcess object!)
            return { success: true, pid: minecraftProcess.pid };
            
        } catch (error) {
            console.error(`[FABRIC-INDEPENDENT] Launch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * UNIVERSAL MODPACK LAUNCHER - Supports ALL modloaders
     * Fabric, Forge, Quilt, NeoForge - ALL VERSIONS
     */
    async launchModpackDirectly(gameDirectory, modloaderVersionId, modloader, modloaderVersion, auth) {
        try {
            const modloaderName = (modloader || 'UNKNOWN').toUpperCase();
            console.log(`[DIRECT-LAUNCH] Starting ${modloaderName} modpack: ${modloaderVersionId}`);
            
            // Extract base Minecraft version from modloader version ID
            let baseVersion;
            let modloaderPrefix;
            
            switch (modloader.toLowerCase()) {
                case 'fabric':
                    modloaderPrefix = 'fabric-loader-';
                    baseVersion = modloaderVersionId.replace(`fabric-loader-${modloaderVersion}-`, '');
                    break;
                case 'forge':
                    modloaderPrefix = 'forge-';
                    baseVersion = modloaderVersionId.split('-')[0]; // e.g., "1.21.7-forge-52.0.9" -> "1.21.7"
                    break;
                case 'quilt':
                    modloaderPrefix = 'quilt-loader-';
                    baseVersion = modloaderVersionId.replace(`quilt-loader-${modloaderVersion}-`, '');
                    break;
                case 'neoforge':
                    modloaderPrefix = 'neoforge-';
                    baseVersion = modloaderVersionId.split('-')[0];
                    break;
                default:
                    throw new Error(`Unsupported modloader: ${modloader}`);
            }
            
            console.log(`[DIRECT-LAUNCH] Base Minecraft version: ${baseVersion}`);
            console.log(`[DIRECT-LAUNCH] Modloader: ${modloader} v${modloaderVersion}`);
            
            // Paths - CRITICAL FIX: Use MAIN directory for profile and Minecraft JAR
            const modloaderVersionDir = path.join(this.gameDirectory, 'versions', modloaderVersionId);
            const modloaderVersionJson = path.join(modloaderVersionDir, `${modloaderVersionId}.json`);
            
            // Use MAIN minecraft directory for base version JAR (not instance directory)
            const mainBaseVersionDir = path.join(this.gameDirectory, 'versions', baseVersion);
            const baseVersionJar = path.join(mainBaseVersionDir, `${baseVersion}.jar`);
            
            console.log(`[DIRECT-LAUNCH] Using main Minecraft JAR: ${baseVersionJar}`);
            
            console.log(`[DIRECT-LAUNCH] Modloader profile: ${modloaderVersionJson}`);
            console.log(`[DIRECT-LAUNCH] Base Minecraft JAR: ${baseVersionJar}`);
            
            // Ensure base Minecraft version exists
            if (!await fs.pathExists(baseVersionJar)) {
                console.log(`[DIRECT-LAUNCH] Base Minecraft not found, downloading: ${baseVersion}`);
                await this.ensureVersionInstalled(baseVersion, this.gameDirectory);
            }
            
            // Check modloader profile
            if (!await fs.pathExists(modloaderVersionJson)) {
                throw new Error(`${modloader} profile not found: ${modloaderVersionJson}`);
            }
            
            // Read modloader profile
            const modloaderProfile = await fs.readJSON(modloaderVersionJson);
            console.log(`[DIRECT-LAUNCH] Profile loaded: ${modloaderProfile.id}`);
            
            // Build classpath - CRITICAL FIX: Support BOTH Mojang and Fabric formats
            const instanceLibrariesDir = path.join(gameDirectory, 'libraries');
            const mainLibrariesDir = path.join(this.gameDirectory, 'libraries');
            const classpath = [];
            
            // Add modloader libraries - ONLY FABRIC-SPECIFIC ones to avoid conflicts
            if (modloaderProfile.libraries) {
                for (const library of modloaderProfile.libraries) {
                    let libraryPath;
                    let libraryName;
                    
                    if (library.downloads?.artifact) {
                        // Mojang format
                        libraryPath = library.downloads.artifact.path;
                        libraryName = library.name || '';
                    } else if (library.name) {
                        // Fabric format: convert name to path
                        const parts = library.name.split(':');
                        if (parts.length !== 3) continue;
                        
                        const [group, artifact, version] = parts;
                        const groupPath = group.replace(/\./g, '/');
                        const fileName = `${artifact}-${version}.jar`;
                        libraryPath = `${groupPath}/${artifact}/${version}/${fileName}`;
                        libraryName = library.name;
                    } else {
                        continue;
                    }
                    
                    // CRITICAL: Skip ONLY core ASM, but allow ASM tree/analysis/commons/util for Fabric
                    const skipPatterns = [
                        'org.ow2.asm:asm:9.8', // Skip only ASM core 9.8 - Minecraft has 9.6
                        'org.slf4j:slf4j-api:', // Skip SLF4J - Minecraft has its own
                        'commons-logging:commons-logging:', // Skip commons - Minecraft has its own
                        'org.apache.logging.log4j:', // Skip Log4J - Minecraft has its own
                    ];
                    
                    const shouldSkip = skipPatterns.some(pattern => libraryName.startsWith(pattern));
                    if (shouldSkip) {
                        console.log(`[DIRECT-LAUNCH] SKIPPED conflicting library: ${path.basename(libraryPath)} (would conflict with Minecraft)`);
                        continue;
                    }
                    
                    // Allow modloader-specific libraries
                    const isFabricSpecific = libraryName.includes('fabricmc') || 
                                           libraryName.includes('sponge-mixin') || 
                                           libraryName.includes('intermediary');
                    
                    const isForgeSpecific = libraryName.includes('minecraftforge') || 
                                          libraryName.includes('forge:') ||
                                          libraryName.includes('net.minecraftforge');
                    
                    const isQuiltSpecific = libraryName.includes('quiltmc') || 
                                          libraryName.includes('quilt-loader');
                    
                    const isNeoForgeSpecific = libraryName.includes('neoforged') || 
                                             libraryName.includes('neoforge');
                    
                    const isRequiredASM = libraryName.includes('org.ow2.asm:asm-tree:') ||
                                        libraryName.includes('org.ow2.asm:asm-analysis:') ||
                                        libraryName.includes('org.ow2.asm:asm-commons:') ||
                                        libraryName.includes('org.ow2.asm:asm-util:');
                    
                    const isModloaderLibrary = isFabricSpecific || isForgeSpecific || isQuiltSpecific || isNeoForgeSpecific || isRequiredASM;
                    
                    if (!isModloaderLibrary) {
                        console.log(`[DIRECT-LAUNCH] SKIPPED non-modloader library: ${path.basename(libraryPath)} (not modloader-specific)`);
                        continue;
                    }
                    
                    // Try instance libraries first, then main libraries
                    const instanceLibPath = path.join(instanceLibrariesDir, libraryPath);
                    const mainLibPath = path.join(mainLibrariesDir, libraryPath);
                    
                    if (await fs.pathExists(instanceLibPath)) {
                        classpath.push(instanceLibPath);
                        console.log(`[DIRECT-LAUNCH] Added Fabric library: ${path.basename(libraryPath)}`);
                    } else if (await fs.pathExists(mainLibPath)) {
                        classpath.push(mainLibPath);
                        console.log(`[DIRECT-LAUNCH] Added Fabric library: ${path.basename(libraryPath)}`);
                    } else {
                        console.warn(`[DIRECT-LAUNCH] Missing Fabric library: ${path.basename(libraryPath)}`);
                    }
                }
            }
            
            // CRITICAL: Also add BASE MINECRAFT LIBRARIES
            let baseProfile = null;
            const baseVersionJson = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.json`);
            if (await fs.pathExists(baseVersionJson)) {
                baseProfile = await fs.readJSON(baseVersionJson);
                console.log(`[DIRECT-LAUNCH] Loading ${baseProfile.libraries?.length || 0} base Minecraft libraries...`);
                
                if (baseProfile.libraries) {
                    for (const library of baseProfile.libraries) {
                        if (library.downloads?.artifact) {
                            const libPath = path.join(mainLibrariesDir, library.downloads.artifact.path);
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                                console.log(`[DIRECT-LAUNCH] Added base library: ${path.basename(library.downloads.artifact.path)}`);
                            } else {
                                console.warn(`[DIRECT-LAUNCH] Missing base library: ${path.basename(library.downloads.artifact.path)}`);
                            }
                        }
                    }
                }
            }
            
            // Add base Minecraft JAR
            classpath.push(baseVersionJar);
            
            const fabricLibCount = classpath.length - (baseProfile?.libraries?.length || 0) - 1;
            const minecraftLibCount = baseProfile?.libraries?.length || 0;
            console.log(`[DIRECT-LAUNCH] FINAL Classpath built with ${classpath.length} entries (Fabric: ${fabricLibCount}, Minecraft: ${minecraftLibCount}, JAR: 1)`);
            
            // Determine main class based on modloader - FABRIC SYSTEM FOR ALL
            let mainClass;
            switch (modloader.toLowerCase()) {
                case 'fabric':
                    mainClass = modloaderProfile.mainClass || 'net.fabricmc.loader.impl.launch.knot.KnotClient';
                    break;
                case 'forge':
                    // Use Fabric-like approach: net.minecraft.client.main.Main with Forge libs in classpath
                    mainClass = 'net.minecraft.client.main.Main';
                    break;
                case 'quilt':
                    mainClass = modloaderProfile.mainClass || 'org.quiltmc.loader.impl.launch.knot.KnotClient';
                    break;
                case 'neoforge':
                    // Use Fabric-like approach: net.minecraft.client.main.Main with NeoForge libs in classpath
                    mainClass = 'net.minecraft.client.main.Main';
                    break;
                default:
                    mainClass = modloaderProfile.mainClass || 'net.minecraft.client.main.Main';
            }
            
            console.log(`[DIRECT-LAUNCH] Main class: ${mainClass}`);
            
            // Get natives directory
            const nativesDir = path.join(gameDirectory, 'versions', baseVersion, 'natives');
            await fs.ensureDir(nativesDir);
            
            // Build Java arguments with modloader-specific properties
            const javaArgs = [
                '-Xmx4G',
                '-Xms1G',
                `-Djava.library.path=${nativesDir}`,
                '-Dminecraft.launcher.brand=BlockSmiths',
                '-Dminecraft.launcher.version=1.0.0'
            ];
            
            // Add modloader-specific system properties
            switch (modloader.toLowerCase()) {
                case 'forge':
                    javaArgs.push(
                        '-Dfml.forgeVersion=' + modloaderVersion,
                        '-Dfml.mcVersion=' + baseVersion,
                        '-Dfml.forgeGroup=net.minecraftforge',
                        '-Dfml.modsDir=' + path.join(gameDirectory, 'mods'),
                        '-Dnet.minecraftforge.fml.earlyprogresswindow=false'
                    );
                    break;
                case 'neoforge':
                    // NeoForge system properties - CRITICAL for mod loading
                    javaArgs.push(
                        '-Dnet.neoforged.fml.neoForgeVersion=' + modloaderVersion,
                        '-Dnet.neoforged.fml.mcVersion=' + baseVersion,
                        '-Dnet.neoforged.fml.earlyprogresswindow=false',
                        '-Dnet.neoforged.fml.modsDir=' + path.join(gameDirectory, 'mods')
                    );
                    
                    // CRITICAL FIX: NeoForge JAR should be in classpath, NOT as javaagent
                    // The javaagent was causing "Failed to find Premain-Class manifest attribute" error
                    const neoforgeJarPath = path.join(gameDirectory, 'libraries', 'net', 'neoforged', 'neoforge', modloaderVersion, `neoforge-${modloaderVersion}-universal.jar`);
                    if (fs.existsSync(neoforgeJarPath)) {
                        classpath.unshift(neoforgeJarPath); // Add NeoForge JAR to beginning of classpath
                    }
                    break;
            }
            
            // Add classpath and main class
            javaArgs.push(
                '-cp', classpath.join(process.platform === 'win32' ? ';' : ':'),
                mainClass
            );
            
            // Add game arguments - CRITICAL FIX: Use main assets directory
            const gameArgs = [
                '--username', auth.name || 'Player',
                '--version', modloaderVersionId,
                '--gameDir', gameDirectory,
                '--assetsDir', path.join(this.gameDirectory, 'assets'), // Use MAIN assets, not instance assets
                '--assetIndex', baseVersion,
                '--uuid', auth.uuid || 'offline-uuid',
                '--accessToken', auth.access_token || 'offline-token',
                '--clientId', auth.clientId || 'offline-client',
                '--xuid', auth.xuid || 'offline-xuid',
                '--userType', auth.userType || 'offline',
                '--versionType', 'release',
                '--width', '1280',
                '--height', '720'
            ];
            
            javaArgs.push(...gameArgs);
            
            console.log(`[DIRECT-LAUNCH] Final command: java ${javaArgs.join(' ')}`);
            
            // Launch Java process
            const { spawn } = require('child_process');
            const javaProcess = spawn('java', javaArgs, {
                cwd: gameDirectory,
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false
            });
            
            console.log(`[DIRECT-LAUNCH] ✅ ${modloaderName} process started with PID: ${javaProcess.pid}`);
            
            // Handle process events
            javaProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    console.log(`[${modloaderName}] ${output}`);
                    this.emitProgress({ task: `${modloader || 'Minecraft'}`, message: `${modloader || 'Minecraft'} çalışıyor...` });
                }
            });
            
            javaProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (error) {
                    console.log(`[${modloaderName}] ${error}`);
                }
            });
            
            javaProcess.on('close', (code) => {
                console.log(`[DIRECT-LAUNCH] ${modloaderName} process closed with code: ${code}`);
                this.emitGameClosed(code);
            });
            
            javaProcess.on('error', (error) => {
                console.error(`[DIRECT-LAUNCH] ${modloaderName} process error:`, error);
            });
            
            // Store process reference
            this.gameProcess = javaProcess;
            
            return { success: true };
            
        } catch (error) {
            const modloaderName = (modloader || 'UNKNOWN').toUpperCase();
            console.error(`[DIRECT-LAUNCH] ❌ ${modloaderName} launch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    emitProgress(progress) {
        // Emit to renderer process via IPC
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('launch-progress', progress);
        }
    }
    
    emitGameState(state) {
        // Emit game state to renderer process via IPC
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('game-state-changed', state);
        }
    }

    emitGameClosed(code) {
        if (global.mainWindow) {
            global.mainWindow.webContents.send('game-closed', code);
        }
    }

    emitError(error) {
        if (global.mainWindow) {
            global.mainWindow.webContents.send('launch-error', error.message);
        }
    }

    async installVersion(version) {
        try {
            console.log(`[INSTALLER] 📦 Installing Minecraft ${version} - DOWNLOAD ONLY MODE`);
            this.emitProgress({ task: 'Versiyon Kuruluyor', message: `Minecraft ${version} kuruluyor...` });
            
            // Check disk space before installation (estimate ~1.5GB for full version)
            const requiredSpace = 1.5 * 1024 * 1024 * 1024; // 1.5GB
            const spaceCheck = await diskSpaceChecker.checkSpace(this.gameDirectory, requiredSpace);
            
            if (!spaceCheck.hasSpace) {
                throw new Error(`Yetersiz disk alanı! ${spaceCheck.freeGB} GB mevcut, ${spaceCheck.requiredGB} GB gerekli`);
            }
            
            console.log(`[INSTALLER] ✅ Disk space OK: ${spaceCheck.freeGB} GB available`);
            
            // Use manual download approach instead of launcher to avoid auto-launch
            await this.downloadVersionFiles(version);
            
            console.log(`[INSTALLER] ✅ Minecraft ${version} installed successfully - NO LAUNCH ATTEMPTED`);
            return true;
        } catch (error) {
            console.error('[INSTALLER] Installation failed:', error);
            this.emitError(error);
            throw error;
        }
    }

    async downloadVersionFiles(version) {
        try {
            console.log(`[DOWNLOADER] Starting manual download for ${version}...`);
            
            // Get version manifest
            const versionManifest = await this.getVersionManifest(version);
            if (!versionManifest) {
                throw new Error(`Could not get manifest for version ${version}`);
            }

            const versionPath = path.join(this.versionsDirectory, version);
            await fs.ensureDir(versionPath);

            // Download version JSON
            console.log(`[DOWNLOADER] Downloading version JSON...`);
            this.emitProgress({ task: 'Versiyon Bilgileri', message: 'Versiyon bilgileri indiriliyor...' });
            
            const versionJsonPath = path.join(versionPath, `${version}.json`);
            await fs.writeJSON(versionJsonPath, versionManifest);

            // Download client JAR
            if (versionManifest.downloads && versionManifest.downloads.client) {
                console.log(`[DOWNLOADER] Downloading client JAR...`);
                this.emitProgress({ task: 'Oyun İndiriliyor', message: 'Minecraft client indiriliyor...' });
                
                const clientUrl = versionManifest.downloads.client.url;
                const jarPath = path.join(versionPath, `${version}.jar`);
                
                await this.downloadFile(clientUrl, jarPath);
                console.log(`[DOWNLOADER] Client JAR downloaded: ${jarPath}`);
                this.emitProgress({ task: 'Oyun İndirildi', message: 'Minecraft client başarıyla indirildi' });
            }

            // Download libraries (PARALLEL for speed)
            if (versionManifest.libraries) {
                console.log(`[DOWNLOADER] Processing ${versionManifest.libraries.length} libraries...`);
                this.emitProgress({ task: 'Kütüphaneler İndiriliyor', message: 'Kütüphaneler indiriliyor...' });
                
                const pLimit = require('p-limit');
                const limit = pLimit(8); // Download 8 libraries in parallel
                
                let completed = 0;
                const downloadPromises = versionManifest.libraries.map((lib) => limit(async () => {
                    if (lib.downloads && lib.downloads.artifact) {
                        const libUrl = lib.downloads.artifact.url;
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        const libSha1 = lib.downloads.artifact.sha1 || null;
                        
                        await fs.ensureDir(path.dirname(libPath));
                        await this.downloadFile(libUrl, libPath, 3, libSha1);
                        
                        completed++;
                        if (completed % 10 === 0) { // Update every 10 libraries
                            this.emitProgress({ 
                                task: 'Kütüphaneler İndiriliyor', 
                                message: `Kütüphaneler indiriliyor... (${completed}/${versionManifest.libraries.length})` 
                            });
                        }
                    }
                }));
                
                await Promise.all(downloadPromises);
                console.log(`[DOWNLOADER] ✅ All ${versionManifest.libraries.length} libraries downloaded`);
                this.emitProgress({ 
                    task: 'Kütüphaneler Tamamlandı', 
                    message: `${versionManifest.libraries.length} kütüphane başarıyla indirildi` 
                });
            }

            // Download assets
            if (versionManifest.assetIndex) {
                console.log(`[DOWNLOADER] Processing assets...`);
                this.emitProgress({ task: 'Varlıklar İndiriliyor', message: 'Asset dosyaları indiriliyor...' });
                
                const assetIndexUrl = versionManifest.assetIndex.url;
                const assetIndexPath = path.join(this.assetsDirectory, 'indexes', `${versionManifest.assetIndex.id}.json`);
                
                await fs.ensureDir(path.dirname(assetIndexPath));
                await this.downloadFile(assetIndexUrl, assetIndexPath);
                
                // Download individual assets (PARALLEL for speed)
                const assetIndex = await fs.readJSON(assetIndexPath);
                if (assetIndex.objects) {
                    const assets = Object.keys(assetIndex.objects);
                    const pLimit = require('p-limit');
                    const limit = pLimit(10); // Download 10 assets in parallel
                    
                    let completed = 0;
                    const downloadPromises = assets.map((assetName) => limit(async () => {
                        const assetData = assetIndex.objects[assetName];
                        const assetHash = assetData.hash;
                        const assetDir = assetHash.substring(0, 2);
                        const assetUrl = `https://resources.download.minecraft.net/${assetDir}/${assetHash}`;
                        const assetPath = path.join(this.assetsDirectory, 'objects', assetDir, assetHash);
                        
                        await fs.ensureDir(path.dirname(assetPath));
                        
                        // Download with SHA1 verification (hash is the SHA1)
                        await this.downloadFile(assetUrl, assetPath, 3, assetHash);
                        
                        completed++;
                        if (completed % 50 === 0) { // Update every 50 assets
                            this.emitProgress({ 
                                task: 'Varlıklar İndiriliyor', 
                                message: `Asset dosyaları indiriliyor... (${completed}/${assets.length})` 
                            });
                        }
                    }));
                    
                    await Promise.all(downloadPromises);
                    console.log(`[DOWNLOADER] ✅ All ${assets.length} assets downloaded`);
                    this.emitProgress({ 
                        task: 'Varlıklar Tamamlandı', 
                        message: `${assets.length} asset dosyası başarıyla indirildi` 
                    });
                }
            }

            console.log(`[DOWNLOADER] All files downloaded successfully for ${version}`);
            this.emitProgress({ task: 'Kurulum Tamamlandı', message: `Minecraft ${version} başarıyla kuruldu!` });
            
        } catch (error) {
            console.error(`[DOWNLOADER] Download failed:`, error);
            throw error;
        }
    }

    async downloadFile(url, filePath, retries = 3, sha1 = null) {
        // Use new DownloadManager with file locking and SHA1 verification
        return await downloadManager.downloadFile(url, filePath, {
            sha1,
            retries,
            timeout: 60000
        });
    }

    /**
     * Launch Forge modpack directly with Java (bypass minecraft-launcher-core)
     */
    /**
     * FORGE INDEPENDENT SYSTEM - Similar to Fabric but separate
     */
    async launchForgeDirectly(gameDirectory, version, forgeVersion, auth, options) {
        try {
            console.log(`[FORGE-INDEPENDENT] Starting Forge ${version} with independent system`);
            
            const baseVersion = version.split('-')[0]; // "1.19.2-forge-43.3.5" -> "1.19.2"
            console.log(`[FORGE-INDEPENDENT] Base Minecraft version: ${baseVersion}`);
            console.log(`[FORGE-INDEPENDENT] Forge version: ${forgeVersion}`);
            
            // Paths - Use MAIN directory for profile and Minecraft JAR (like Fabric)
            const forgeVersionDir = path.join(this.gameDirectory, 'versions', version);
            const forgeVersionJson = path.join(forgeVersionDir, `${version}.json`);
            
            // Check if Forge profile exists
            if (!await fs.pathExists(forgeVersionJson)) {
                throw new Error(`Forge profile not found: ${forgeVersionJson}`);
            }
            
            // Load Forge profile
            const forgeProfile = await fs.readJSON(forgeVersionJson);
            console.log(`[FORGE-INDEPENDENT] Loaded Forge profile: ${version}`);
            
            // Build classpath from Forge profile libraries
            const classpath = [];
            
            // Add base Minecraft JAR
            const minecraftJar = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.jar`);
            if (await fs.pathExists(minecraftJar)) {
                classpath.push(minecraftJar);
                console.log(`[FORGE-INDEPENDENT] Added Minecraft JAR: ${minecraftJar}`);
            }
            
            // CRITICAL: Download and add Forge libraries (includes ASM!)
            if (forgeProfile.libraries) {
                let addedLibs = 0;
                for (const lib of forgeProfile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpath.push(libPath);
                            addedLibs++;
                        } else {
                            // CRITICAL: Download missing library
                            console.log(`[FORGE-INDEPENDENT] Downloading missing library: ${lib.name}`);
                            try {
                                await fs.ensureDir(path.dirname(libPath));
                                await this.downloadFile(lib.downloads.artifact.url, libPath);
                                classpath.push(libPath);
                                addedLibs++;
                                console.log(`[FORGE-INDEPENDENT] ✅ Downloaded: ${lib.name}`);
                            } catch (error) {
                                console.error(`[FORGE-INDEPENDENT] ❌ Failed to download ${lib.name}: ${error.message}`);
                            }
                        }
                    }
                }
                console.log(`[FORGE-INDEPENDENT] Added ${addedLibs}/${forgeProfile.libraries.length} Forge libraries (includes ASM)`);
            }
            
            // CRITICAL: Ensure base Minecraft version is downloaded
            const baseProfile = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.json`);
            if (!await fs.pathExists(baseProfile)) {
                console.log(`[FORGE-INDEPENDENT] Base Minecraft version not found, downloading: ${baseVersion}`);
                try {
                    await this.downloadVersionFiles(baseVersion);
                    console.log(`[FORGE-INDEPENDENT] ✅ Base Minecraft version downloaded: ${baseVersion}`);
                } catch (error) {
                    console.error(`[FORGE-INDEPENDENT] ❌ Failed to download base version: ${error.message}`);
                }
            }

            // CRITICAL: Download and add base Minecraft libraries (includes jopt-simple!)
            if (await fs.pathExists(baseProfile)) {
                const baseProfileData = await fs.readJSON(baseProfile);
                if (baseProfileData.libraries) {
                    let addedBaseLibs = 0;
                    for (const lib of baseProfileData.libraries) {
                        if (lib.downloads?.artifact?.path) {
                            const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                                addedBaseLibs++;
                            } else {
                                // CRITICAL: Download missing base library
                                console.log(`[FORGE-INDEPENDENT] Downloading missing base library: ${lib.name}`);
                                try {
                                    await fs.ensureDir(path.dirname(libPath));
                                    await this.downloadFile(lib.downloads.artifact.url, libPath);
                                    classpath.push(libPath);
                                    addedBaseLibs++;
                                    console.log(`[FORGE-INDEPENDENT] ✅ Downloaded base: ${lib.name}`);
                                } catch (error) {
                                    console.error(`[FORGE-INDEPENDENT] ❌ Failed to download base ${lib.name}: ${error.message}`);
                                }
                            }
                        }
                    }
                    console.log(`[FORGE-INDEPENDENT] Added ${addedBaseLibs}/${baseProfileData.libraries.length} base Minecraft libraries (includes jopt-simple)`);
                }
            } else {
                console.log(`[FORGE-INDEPENDENT] ⚠️ Base Minecraft profile still not found after download: ${baseProfile}`);
            }
            
            // Add mods from instance directory
            const modsDir = path.join(gameDirectory, 'mods');
            if (await fs.pathExists(modsDir)) {
                const modFiles = await fs.readdir(modsDir);
                for (const modFile of modFiles) {
                    if (modFile.endsWith('.jar')) {
                        classpath.push(path.join(modsDir, modFile));
                    }
                }
                console.log(`[FORGE-INDEPENDENT] Added ${modFiles.filter(f => f.endsWith('.jar')).length} mod JARs`);
            }
            
            console.log(`[FORGE-INDEPENDENT] Total classpath entries: ${classpath.length}`);
            
            // Get natives directory
            const nativesDir = path.join(this.gameDirectory, 'versions', baseVersion, 'natives');
            await fs.ensureDir(nativesDir);
            
            // Decide main class (from profile if present)
            const mainClass = forgeProfile.mainClass || 'net.minecraft.client.main.Main';

            // Build Java arguments - Forge specific
            const javaArgs = [
                '-Xmx4G',
                '-Xms1G',
                `-Djava.library.path=${nativesDir}`,
                '-Dminecraft.launcher.brand=BlockSmiths',
                '-Dminecraft.launcher.version=1.0.0',
                // Forge specific properties
                '-Dfml.forgeVersion=' + forgeVersion,
                '-Dfml.mcVersion=' + baseVersion,
                '-Dfml.forgeGroup=net.minecraftforge',
                '-Dfml.modsDir=' + path.join(gameDirectory, 'mods'),
                '-Dnet.minecraftforge.fml.earlyprogresswindow=false'
            ];

            // If using ModLauncher OR BootstrapLauncher, add Java module access args
            if (mainClass.includes('cpw.mods.modlauncher.Launcher') || mainClass.includes('cpw.mods.bootstraplauncher.BootstrapLauncher')) {
                
                // CRITICAL: Add module path (-p) for BootstrapLauncher
                const forgeLibraries = [
                    path.join(this.librariesDirectory, 'cpw', 'mods', 'bootstraplauncher', '1.1.2', 'bootstraplauncher-1.1.2.jar'),
                    path.join(this.librariesDirectory, 'cpw', 'mods', 'securejarhandler', '2.1.10', 'securejarhandler-2.1.10.jar'),
                    path.join(this.librariesDirectory, 'org', 'ow2', 'asm', 'asm-commons', '9.7.1', 'asm-commons-9.7.1.jar'),
                    path.join(this.librariesDirectory, 'org', 'ow2', 'asm', 'asm-util', '9.7.1', 'asm-util-9.7.1.jar'),
                    path.join(this.librariesDirectory, 'org', 'ow2', 'asm', 'asm-analysis', '9.7.1', 'asm-analysis-9.7.1.jar'),
                    path.join(this.librariesDirectory, 'org', 'ow2', 'asm', 'asm-tree', '9.7.1', 'asm-tree-9.7.1.jar'),
                    path.join(this.librariesDirectory, 'org', 'ow2', 'asm', 'asm', '9.7.1', 'asm-9.7.1.jar'),
                    path.join(this.librariesDirectory, 'net', 'minecraftforge', 'JarJarFileSystems', '0.3.19', 'JarJarFileSystems-0.3.19.jar')
                ];
                
                const modulePathExists = forgeLibraries.filter(lib => fs.existsSync(lib));
                if (modulePathExists.length > 0) {
                    const modulePath = modulePathExists.join(process.platform === 'win32' ? ';' : ':');
                    javaArgs.push('-p', modulePath);
                    console.log(`[FORGE-INDEPENDENT] Added module path (-p) with ${modulePathExists.length} libraries`);
                }
                
                javaArgs.push(
                    // MODERN FORGE: Complete Java module access flags
                    '--add-modules', 'ALL-MODULE-PATH',
                    '--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler',
                    '--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler',
                    '--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler',
                    '--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming',
                    '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.util=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.io=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.util.jar=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.nio.file=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.security=ALL-UNNAMED',
                    '--add-exports', 'java.base/sun.security.util=ALL-UNNAMED',
                    '--add-exports', 'java.base/sun.security.x509=ALL-UNNAMED',
                    '--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=ALL-UNNAMED'
                );
                console.log(`[FORGE-INDEPENDENT] Added Java module access flags for ${mainClass}`);
            }

            // Classpath and main class
            javaArgs.push('-cp', classpath.join(process.platform === 'win32' ? ';' : ':'), mainClass);
            
            // Add game arguments
            const gameArgs = [
                '--username', auth.name || 'Player',
                '--version', version,
                '--gameDir', gameDirectory,
                '--assetsDir', path.join(this.gameDirectory, 'assets'),
                '--assetIndex', baseVersion,
                '--uuid', auth.uuid || 'offline',
                '--accessToken', auth.access_token || 'offline',
                '--userType', 'offline',
                '--width', '1280',
                '--height', '720'
            ];

            // Always add launch target for Forge (ModLauncher expects it)
            gameArgs.push('--launchTarget', 'forgeclient');
            
            // CRITICAL: Use arguments file to avoid ENAMETOOLONG on Windows (32k limit)
            console.log(`[FORGE-INDEPENDENT] Creating arguments file to avoid ENAMETOOLONG...`);
            
            // Create libs directory and copy all JARs there for wildcard classpath
            const libsDir = path.join(gameDirectory, 'libs');
            await fs.ensureDir(libsDir);
            
            // Copy all classpath JARs to libs directory for wildcard (FLAT structure!)
            let libCount = 0;
            for (const jarPath of classpath) {
                const jarName = path.basename(jarPath);
                const targetPath = path.join(libsDir, jarName);
                if (!await fs.pathExists(targetPath)) {
                    try {
                        await fs.copy(jarPath, targetPath);
                        libCount++;
                        console.log(`[FORGE-INDEPENDENT] ✅ Copied: ${jarName}`);
                    } catch (error) {
                        console.error(`[FORGE-INDEPENDENT] ❌ Failed to copy ${jarName}: ${error.message}`);
                    }
                }
            }
            console.log(`[FORGE-INDEPENDENT] Copied ${libCount} JARs to libs directory for wildcard classpath`);
            
            // Use wildcard classpath + Minecraft JAR
            const wildcardClasspath = path.join(libsDir, '*');
            
            // Complete classpath: libs/* + Minecraft JAR (reuse existing minecraftJar variable)
            const fullClasspath = `${wildcardClasspath}${process.platform === 'win32' ? ';' : ':'}${minecraftJar}`;
            
            // Create arguments file
            const argsFile = path.join(gameDirectory, 'launch.args');
            
            // Remove classpath and mainClass from javaArgs (they're at the end)
            const cleanJavaArgs = javaArgs.slice(0, -3); // Remove '-cp', classpath, mainClass
            
            const allArgs = [
                ...cleanJavaArgs,
                '-cp', fullClasspath,
                mainClass,
                ...gameArgs
            ];
            
            // Write arguments to file, one per line
            await fs.writeFile(argsFile, allArgs.join('\n'), 'utf8');
            
            console.log(`[FORGE-INDEPENDENT] Using arguments file with ${allArgs.length} arguments`);
            console.log(`[FORGE-INDEPENDENT] Full classpath: ${fullClasspath}`);
            
            // Launch with @argsfile syntax
            const { spawn } = require('child_process');
            const minecraftProcess = spawn('java', [`@${argsFile}`], {
                cwd: gameDirectory,
                detached: false
            });
            
            minecraftProcess.stdout.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.stderr.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.on('close', (code) => {
                console.log(`[MINECRAFT] Process exited with code ${code}`);
            });
            
            return { success: true };
            
        } catch (error) {
            console.error(`[FORGE-INDEPENDENT] Launch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Launch NeoForge modpack directly with Java
     */
    /**
     * NEOFORGE INDEPENDENT SYSTEM - Similar to Fabric but separate
     */
    async launchNeoForgeDirectly(gameDirectory, version, neoforgeVersion, auth, options) {
        try {
            console.log(`[NEOFORGE-INDEPENDENT] Starting NeoForge ${version} with independent system`);
            
            const baseVersion = version.split('-')[0]; // "1.21.1-neoforge-21.1.172" -> "1.21.1"
            console.log(`[NEOFORGE-INDEPENDENT] Base Minecraft version: ${baseVersion}`);
            console.log(`[NEOFORGE-INDEPENDENT] NeoForge version: ${neoforgeVersion}`);
            
            // Paths - Use MAIN directory for profile and Minecraft JAR (like Fabric)
            const neoforgeVersionDir = path.join(this.gameDirectory, 'versions', version);
            const neoforgeVersionJson = path.join(neoforgeVersionDir, `${version}.json`);
            
            // Check if NeoForge profile exists
            if (!await fs.pathExists(neoforgeVersionJson)) {
                throw new Error(`NeoForge profile not found: ${neoforgeVersionJson}`);
            }
            
            // Load NeoForge profile
            const neoforgeProfile = await fs.readJSON(neoforgeVersionJson);
            console.log(`[NEOFORGE-INDEPENDENT] Loaded NeoForge profile: ${version}`);
            
            // Build classpath from NeoForge profile libraries
            const classpath = [];
            
            // Add base Minecraft JAR
            const minecraftJar = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.jar`);
            if (await fs.pathExists(minecraftJar)) {
                classpath.push(minecraftJar);
                console.log(`[NEOFORGE-INDEPENDENT] Added Minecraft JAR: ${minecraftJar}`);
            }
            
            // Add NeoForge libraries
            if (neoforgeProfile.libraries) {
                for (const lib of neoforgeProfile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpath.push(libPath);
                        } else {
                            console.log(`[NEOFORGE-INDEPENDENT] ⚠️ Missing NeoForge library: ${libPath}`);
                        }
                    }
                }
                console.log(`[NEOFORGE-INDEPENDENT] Added ${neoforgeProfile.libraries.length} NeoForge libraries`);
            }
            
            // CRITICAL: Add base Minecraft libraries (includes Log4j!)
            const baseProfile = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.json`);
            if (await fs.pathExists(baseProfile)) {
                const baseProfileData = await fs.readJSON(baseProfile);
                if (baseProfileData.libraries) {
                    for (const lib of baseProfileData.libraries) {
                        if (lib.downloads?.artifact?.path) {
                            const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                            } else {
                                console.log(`[NEOFORGE-INDEPENDENT] ⚠️ Missing base library: ${libPath}`);
                            }
                        }
                    }
                    console.log(`[NEOFORGE-INDEPENDENT] Added ${baseProfileData.libraries.length} base Minecraft libraries (includes Log4j)`);
                }
            } else {
                console.log(`[NEOFORGE-INDEPENDENT] ⚠️ Base Minecraft profile not found: ${baseProfile}`);
            }
            
            // Add mods from instance directory
            const modsDir = path.join(gameDirectory, 'mods');
            if (await fs.pathExists(modsDir)) {
                const modFiles = await fs.readdir(modsDir);
                for (const modFile of modFiles) {
                    if (modFile.endsWith('.jar')) {
                        classpath.push(path.join(modsDir, modFile));
                    }
                }
                console.log(`[NEOFORGE-INDEPENDENT] Added ${modFiles.filter(f => f.endsWith('.jar')).length} mod JARs`);
            }
            
            console.log(`[NEOFORGE-INDEPENDENT] Total classpath entries: ${classpath.length}`);
            
            // Get natives directory
            const nativesDir = path.join(this.gameDirectory, 'versions', baseVersion, 'natives');
            await fs.ensureDir(nativesDir);
            
            // Use vanilla Minecraft main class with NeoForge in classpath
            const mainClass = 'net.minecraft.client.main.Main';
            console.log(`[NEOFORGE-INDEPENDENT] Using main class: ${mainClass} (with NeoForge in classpath)`);

            // Find NeoForge JAR for Java agent
            let neoforgeJar = null;
            for (const lib of neoforgeProfile.libraries || []) {
                if (lib.name && lib.name.includes('neoforge:') && lib.downloads?.artifact?.path) {
                    const jarPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                    if (await fs.pathExists(jarPath)) {
                        neoforgeJar = jarPath;
                        console.log(`[NEOFORGE-INDEPENDENT] Found NeoForge JAR: ${neoforgeJar}`);
                        break;
                    }
                }
            }

            // Build Java arguments - NeoForge specific (SIMPLE APPROACH)
            const javaArgs = [
                '-Xmx4G',
                '-Xms1G',
                `-Djava.library.path=${nativesDir}`,
                '-Dminecraft.launcher.brand=BlockSmiths',
                '-Dminecraft.launcher.version=1.0.0'
            ];

            // Add basic NeoForge properties only (no transformers)
            if (neoforgeJar) {
                javaArgs.push(
                    // Basic NeoForge properties
                    '-Dfml.neoForgeVersion=' + neoforgeVersion,
                    '-Dfml.mcVersion=' + baseVersion,
                    '-Dfml.modsDir=' + path.join(gameDirectory, 'mods'),
                    '-Dminecraft.applet.TargetDirectory=' + gameDirectory,
                    // Game directories
                    '-Dneoforge.gameDir=' + gameDirectory,
                    '-Dneoforge.assetsDir=' + path.join(this.gameDirectory, 'assets')
                );
                console.log(`[NEOFORGE-INDEPENDENT] Added basic NeoForge properties (no transformers)`);
            }

            // If using ModLauncher, add Java 21 module args
            if (mainClass.includes('cpw.mods.modlauncher.Launcher')) {
                javaArgs.push(
                    '--add-opens', 'java.base/java.util.jar=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
                    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
                    '--add-exports', 'java.base/sun.security.util=ALL-UNNAMED',
                    '--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=ALL-UNNAMED'
                );
            }

            // Classpath and main class
            javaArgs.push('-cp', classpath.join(process.platform === 'win32' ? ';' : ':'), mainClass);
            
            // Add game arguments
            const gameArgs = [
                '--username', auth.name || 'Player',
                '--version', version,
                '--gameDir', gameDirectory,
                '--assetsDir', path.join(this.gameDirectory, 'assets'),
                '--assetIndex', baseVersion,
                '--uuid', auth.uuid || 'offline',
                '--accessToken', auth.access_token || 'offline',
                '--userType', 'offline',
                '--width', '1280',
                '--height', '720'
            ];

            // No ModLauncher arguments needed for direct launch
            
            const allArgs = [...javaArgs, ...gameArgs];
            console.log(`[NEOFORGE-INDEPENDENT] Launching with ${allArgs.length} arguments`);
            
            // Launch Java process
            const { spawn } = require('child_process');
            const minecraftProcess = spawn('java', allArgs, {
                cwd: gameDirectory,
                detached: false
            });
            
            minecraftProcess.stdout.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.stderr.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.on('close', (code) => {
                console.log(`[MINECRAFT] Process exited with code ${code}`);
            });
            
            return { success: true };
            
        } catch (error) {
            console.error(`[NEOFORGE-INDEPENDENT] Launch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * QUILT INDEPENDENT SYSTEM - Similar to Fabric but separate
     */
    async launchQuiltDirectly(gameDirectory, version, quiltVersion, auth, options) {
        try {
            console.log(`[QUILT-INDEPENDENT] Starting Quilt ${version} with independent system`);
            
            const baseVersion = version.replace(`quilt-loader-${quiltVersion}-`, ''); // "quilt-loader-0.21.0-1.20.1" -> "1.20.1"
            console.log(`[QUILT-INDEPENDENT] Base Minecraft version: ${baseVersion}`);
            console.log(`[QUILT-INDEPENDENT] Quilt version: ${quiltVersion}`);
            
            // Paths - Use MAIN directory for profile and Minecraft JAR (like Fabric)
            const quiltVersionDir = path.join(this.gameDirectory, 'versions', version);
            const quiltVersionJson = path.join(quiltVersionDir, `${version}.json`);
            
            // Check if Quilt profile exists
            if (!await fs.pathExists(quiltVersionJson)) {
                throw new Error(`Quilt profile not found: ${quiltVersionJson}`);
            }
            
            // Load Quilt profile
            const quiltProfile = await fs.readJSON(quiltVersionJson);
            console.log(`[QUILT-INDEPENDENT] Loaded Quilt profile: ${version}`);
            
            // Build classpath from Quilt profile libraries
            const classpath = [];
            
            // Add base Minecraft JAR
            const minecraftJar = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.jar`);
            if (await fs.pathExists(minecraftJar)) {
                classpath.push(minecraftJar);
                console.log(`[QUILT-INDEPENDENT] Added Minecraft JAR: ${minecraftJar}`);
            }
            
            // Add Quilt libraries
            if (quiltProfile.libraries) {
                for (const lib of quiltProfile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpath.push(libPath);
                    } else {
                            console.log(`[QUILT-INDEPENDENT] ⚠️ Missing Quilt library: ${libPath}`);
                        }
                    }
                }
                console.log(`[QUILT-INDEPENDENT] Added ${quiltProfile.libraries.length} Quilt libraries`);
            }
            
            // CRITICAL: Add base Minecraft libraries (includes Log4j!)
            const baseProfile = path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.json`);
            if (await fs.pathExists(baseProfile)) {
                const baseProfileData = await fs.readJSON(baseProfile);
                if (baseProfileData.libraries) {
                    for (const lib of baseProfileData.libraries) {
                        if (lib.downloads?.artifact?.path) {
                            const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                            if (await fs.pathExists(libPath)) {
                                classpath.push(libPath);
                            } else {
                                console.log(`[QUILT-INDEPENDENT] ⚠️ Missing base library: ${libPath}`);
                            }
                        }
                    }
                    console.log(`[QUILT-INDEPENDENT] Added ${baseProfileData.libraries.length} base Minecraft libraries (includes Log4j)`);
                }
            } else {
                console.log(`[QUILT-INDEPENDENT] ⚠️ Base Minecraft profile not found: ${baseProfile}`);
            }
            
            // Add mods from instance directory
            const modsDir = path.join(gameDirectory, 'mods');
            if (await fs.pathExists(modsDir)) {
                const modFiles = await fs.readdir(modsDir);
                for (const modFile of modFiles) {
                    if (modFile.endsWith('.jar')) {
                        classpath.push(path.join(modsDir, modFile));
                    }
                }
                console.log(`[QUILT-INDEPENDENT] Added ${modFiles.filter(f => f.endsWith('.jar')).length} mod JARs`);
            }
            
            console.log(`[QUILT-INDEPENDENT] Total classpath entries: ${classpath.length}`);
            
            // Get natives directory
            const nativesDir = path.join(this.gameDirectory, 'versions', baseVersion, 'natives');
            await fs.ensureDir(nativesDir);
            
            // Build Java arguments - Quilt specific
            const javaArgs = [
                '-Xmx4G',
                '-Xms1G',
                `-Djava.library.path=${nativesDir}`,
                '-Dminecraft.launcher.brand=BlockSmiths',
                '-Dminecraft.launcher.version=1.0.0',
                // Quilt specific properties (similar to Fabric)
                '-Dloader.gameJar=' + path.join(this.gameDirectory, 'versions', baseVersion, `${baseVersion}.jar`),
                '-Dloader.remapClasspathFile=' + path.join(gameDirectory, '.quilt', 'remapped_classpath.txt'),
                '-Dloader.modsDir=' + path.join(gameDirectory, 'mods'),
                // Classpath and main class
                '-cp', classpath.join(process.platform === 'win32' ? ';' : ':'),
                quiltProfile.mainClass || 'org.quiltmc.loader.impl.launch.knot.KnotClient'
            ];
            
            // Add game arguments
            const gameArgs = [
                '--username', auth.name || 'Player',
                '--version', version,
                '--gameDir', gameDirectory,
                '--assetsDir', path.join(this.gameDirectory, 'assets'),
                '--assetIndex', baseVersion,
                '--uuid', auth.uuid || 'offline',
                '--accessToken', auth.access_token || 'offline',
                '--userType', 'offline',
                '--width', '1280',
                '--height', '720'
            ];
            
            const allArgs = [...javaArgs, ...gameArgs];
            console.log(`[QUILT-INDEPENDENT] Launching with ${allArgs.length} arguments`);
            
            // Launch Java process
            const { spawn } = require('child_process');
            const minecraftProcess = spawn('java', allArgs, {
                cwd: gameDirectory,
                detached: false
            });
            
            minecraftProcess.stdout.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.stderr.on('data', (data) => {
                console.log(`[MINECRAFT] ${data.toString().trim()}`);
            });
            
            minecraftProcess.on('close', (code) => {
                console.log(`[MINECRAFT] Process exited with code ${code}`);
            });
            
            return { success: true };
            
        } catch (error) {
            console.error(`[QUILT-INDEPENDENT] Launch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Build Forge classpath - DYNAMIC WITHOUT BASE MINECRAFT
     */
    async buildForgeClasspath(baseVersion, forgeVersion, gameDirectory) {
        const classpathEntries = [];
        console.log(`[FORGE-CP] Building dynamic classpath for ${forgeVersion}`);
        
        // TRY to add Minecraft client JAR (optional)
        const minecraftJar = path.join(this.versionsDirectory, baseVersion, `${baseVersion}.jar`);
        if (await fs.pathExists(minecraftJar)) {
            classpathEntries.push(minecraftJar);
            console.log(`[FORGE-CP] ✅ Added Minecraft JAR: ${minecraftJar}`);
        } else {
            console.log(`[FORGE-CP] ⚠️ Minecraft JAR not found, continuing without it: ${minecraftJar}`);
        }
        
        // Add Forge libraries from profile (REQUIRED)
        const forgeProfile = path.join(this.versionsDirectory, forgeVersion, `${forgeVersion}.json`);
        if (await fs.pathExists(forgeProfile)) {
            const profile = await fs.readJSON(forgeProfile);
            console.log(`[FORGE-CP] Found Forge profile with ${profile.libraries?.length || 0} libraries`);
            
            if (profile.libraries) {
                for (const lib of profile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpathEntries.push(libPath);
                        } else {
                            console.log(`[FORGE-CP] ⚠️ Missing library: ${libPath}`);
                        }
                    }
                }
            }
        } else {
            console.log(`[FORGE-CP] ❌ Forge profile not found: ${forgeProfile}`);
        }
        
        // CRITICAL: Add ModLauncher JAR manually (required for cpw.mods.modlauncher.Launcher)
        const modLauncherPaths = [
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '10.0.9', 'modlauncher-10.0.9.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '9.1.3', 'modlauncher-9.1.3.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '10.0.8', 'modlauncher-10.0.8.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '8.1.3', 'modlauncher-8.1.3.jar')
        ];
        
        for (const modLauncherPath of modLauncherPaths) {
            if (await fs.pathExists(modLauncherPath)) {
                classpathEntries.push(modLauncherPath);
                console.log(`[FORGE-CP] ✅ Added ModLauncher: ${modLauncherPath}`);
                break;
            }
        }

        // Add FML Loader (Forge) and BootstrapLauncher if present
        const forgeFmlLoaderCandidates = [
            path.join(this.librariesDirectory, 'net', 'minecraftforge', 'fmlloader')
        ];
        for (const basePath of forgeFmlLoaderCandidates) {
            try {
                if (await fs.pathExists(basePath)) {
                    const versions = (await fs.readdir(basePath)).sort().reverse();
                    for (const v of versions) {
                        const jar = path.join(basePath, v, `fmlloader-${v}.jar`);
                        if (await fs.pathExists(jar)) {
                            classpathEntries.push(jar);
                            console.log(`[FORGE-CP] ✅ Added FML Loader: ${jar}`);
                            break;
                        }
                    }
                }
            } catch {}
        }
        const bootstrapCandidates = [
            path.join(this.librariesDirectory, 'cpw', 'mods', 'bootstraplauncher')
        ];
        for (const basePath of bootstrapCandidates) {
            try {
                if (await fs.pathExists(basePath)) {
                    const versions = (await fs.readdir(basePath)).sort().reverse();
                    for (const v of versions) {
                        const jar = path.join(basePath, v, `bootstraplauncher-${v}.jar`);
                        if (await fs.pathExists(jar)) {
                            classpathEntries.push(jar);
                            console.log(`[FORGE-CP] ✅ Added BootstrapLauncher: ${jar}`);
                            break;
                        }
                    }
                }
            } catch {}
        }
        
        // TRY to add base Minecraft libraries (optional)
        const baseProfile = path.join(this.versionsDirectory, baseVersion, `${baseVersion}.json`);
        if (await fs.pathExists(baseProfile)) {
            const profile = await fs.readJSON(baseProfile);
            if (profile.libraries) {
                for (const lib of profile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpathEntries.push(libPath);
                        }
                    }
                }
            }
        } else {
            console.log(`[FORGE-CP] ⚠️ Base Minecraft profile not found, continuing: ${baseProfile}`);
        }
        
        // Add ALL mod JARs to classpath (CRITICAL for Forge)
        const modsDir = path.join(gameDirectory, 'mods');
        if (await fs.pathExists(modsDir)) {
            const modFiles = await fs.readdir(modsDir);
            let modCount = 0;
            for (const modFile of modFiles) {
                if (modFile.endsWith('.jar')) {
                    classpathEntries.push(path.join(modsDir, modFile));
                    modCount++;
                }
            }
            console.log(`[FORGE-CP] ✅ Added ${modCount} mod JARs to classpath`);
        }
        
        console.log(`[FORGE-CP] ✅ Built dynamic classpath with ${classpathEntries.length} entries`);
        return classpathEntries.join(path.delimiter);
    }

    /**
     * Build NeoForge classpath - DYNAMIC WITHOUT BASE MINECRAFT
     */
    async buildNeoForgeClasspath(baseVersion, neoforgeVersion, gameDirectory) {
        const classpathEntries = [];
        console.log(`[NEOFORGE-CP] Building dynamic classpath for ${neoforgeVersion}`);
        
        // TRY to add Minecraft client JAR (optional)
        const minecraftJar = path.join(this.versionsDirectory, baseVersion, `${baseVersion}.jar`);
        if (await fs.pathExists(minecraftJar)) {
            classpathEntries.push(minecraftJar);
            console.log(`[NEOFORGE-CP] ✅ Added Minecraft JAR: ${minecraftJar}`);
        } else {
            console.log(`[NEOFORGE-CP] ⚠️ Minecraft JAR not found, continuing without it: ${minecraftJar}`);
        }
        
        // Add NeoForge libraries from profile (REQUIRED)
        const neoforgeProfile = path.join(this.versionsDirectory, neoforgeVersion, `${neoforgeVersion}.json`);
        if (await fs.pathExists(neoforgeProfile)) {
            const profile = await fs.readJSON(neoforgeProfile);
            console.log(`[NEOFORGE-CP] Found NeoForge profile with ${profile.libraries?.length || 0} libraries`);
            
            if (profile.libraries) {
                for (const lib of profile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpathEntries.push(libPath);
                        } else {
                            console.log(`[NEOFORGE-CP] ⚠️ Missing library: ${libPath}`);
                        }
                    }
                }
            }
        } else {
            console.log(`[NEOFORGE-CP] ❌ NeoForge profile not found: ${neoforgeProfile}`);
        }
        
        // CRITICAL: Add ModLauncher JAR manually (required for cpw.mods.modlauncher.Launcher)
        const modLauncherPaths = [
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '10.0.9', 'modlauncher-10.0.9.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '9.1.3', 'modlauncher-9.1.3.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '10.0.8', 'modlauncher-10.0.8.jar'),
            path.join(this.librariesDirectory, 'cpw', 'mods', 'modlauncher', '8.1.3', 'modlauncher-8.1.3.jar')
        ];
        
        for (const modLauncherPath of modLauncherPaths) {
            if (await fs.pathExists(modLauncherPath)) {
                classpathEntries.push(modLauncherPath);
                console.log(`[NEOFORGE-CP] ✅ Added ModLauncher: ${modLauncherPath}`);
                break;
            }
        }

        // Add FML Loader (NeoForge) and BootstrapLauncher if present
        const neoFmlLoaderCandidates = [
            path.join(this.librariesDirectory, 'net', 'neoforged', 'fmlloader')
        ];
        for (const basePath of neoFmlLoaderCandidates) {
            try {
                if (await fs.pathExists(basePath)) {
                    const versions = (await fs.readdir(basePath)).sort().reverse();
                    for (const v of versions) {
                        const jar = path.join(basePath, v, `fmlloader-${v}.jar`);
                        if (await fs.pathExists(jar)) {
                            classpathEntries.push(jar);
                            console.log(`[NEOFORGE-CP] ✅ Added FML Loader: ${jar}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                console.log(`[NEOFORGE-CP] Error reading FML Loader directory: ${error.message}`);
            }
        }

        // Add FML Core (NeoForge) if present
        const neoFmlCoreCandidates = [
            path.join(this.librariesDirectory, 'net', 'neoforged', 'fmlcore')
        ];
        for (const basePath of neoFmlCoreCandidates) {
            try {
                if (await fs.pathExists(basePath)) {
                    const versions = (await fs.readdir(basePath)).sort().reverse();
                    for (const v of versions) {
                        const jar = path.join(basePath, v, `fmlcore-${v}.jar`);
                        if (await fs.pathExists(jar)) {
                            classpathEntries.push(jar);
                            console.log(`[NEOFORGE-CP] ✅ Added FML Core: ${jar}`);
                            break;
                        }
                    }
                }
            } catch (error) {
                console.log(`[NEOFORGE-CP] Error reading FML Core directory: ${error.message}`);
            }
        }

        const bootstrapCandidatesNeo = [
            path.join(this.librariesDirectory, 'cpw', 'mods', 'bootstraplauncher')
        ];
        for (const basePath of bootstrapCandidatesNeo) {
            try {
                if (await fs.pathExists(basePath)) {
                    const versions = (await fs.readdir(basePath)).sort().reverse();
                    for (const v of versions) {
                        const jar = path.join(basePath, v, `bootstraplauncher-${v}.jar`);
                        if (await fs.pathExists(jar)) {
                            classpathEntries.push(jar);
                            console.log(`[NEOFORGE-CP] ✅ Added BootstrapLauncher: ${jar}`);
                            break;
                        }
                    }
                }
            } catch {}
        }
        
        // CRITICAL: Add SecureJarHandler JAR manually (required for ModLauncher)
        const secureJarHandlerPath = path.join(this.librariesDirectory, 'cpw', 'mods', 'securejarhandler', '2.1.10', 'securejarhandler-2.1.10.jar');
        if (await fs.pathExists(secureJarHandlerPath)) {
            classpathEntries.push(secureJarHandlerPath);
            console.log(`[NEOFORGE-CP] ✅ Added SecureJarHandler: ${secureJarHandlerPath}`);
        } else {
            console.log(`[NEOFORGE-CP] ❌ SecureJarHandler not found: ${secureJarHandlerPath}`);
        }
        
        // TRY to add base Minecraft libraries (optional)
        const baseProfile = path.join(this.versionsDirectory, baseVersion, `${baseVersion}.json`);
        if (await fs.pathExists(baseProfile)) {
            const profile = await fs.readJSON(baseProfile);
            if (profile.libraries) {
                for (const lib of profile.libraries) {
                    if (lib.downloads?.artifact?.path) {
                        const libPath = path.join(this.librariesDirectory, lib.downloads.artifact.path);
                        if (await fs.pathExists(libPath)) {
                            classpathEntries.push(libPath);
                        }
                    }
                }
            }
        } else {
            console.log(`[NEOFORGE-CP] ⚠️ Base Minecraft profile not found, continuing: ${baseProfile}`);
        }
        
        // Add ALL mod JARs to classpath (CRITICAL for NeoForge)
        const modsDir = path.join(gameDirectory, 'mods');
        if (await fs.pathExists(modsDir)) {
            const modFiles = await fs.readdir(modsDir);
            let modCount = 0;
            for (const modFile of modFiles) {
                if (modFile.endsWith('.jar')) {
                    classpathEntries.push(path.join(modsDir, modFile));
                    modCount++;
                }
            }
            console.log(`[NEOFORGE-CP] ✅ Added ${modCount} mod JARs to classpath`);
        }
        
        console.log(`[NEOFORGE-CP] ✅ Built dynamic classpath with ${classpathEntries.length} entries`);
        return classpathEntries.join(path.delimiter);
    }

    /**
     * Launch NeoForge modpack with simple direct approach (Ferium-inspired)
     */
    async launchNeoForgeSimple(gameDirectory, version, neoforgeVersion, auth) {
        try {
            console.log(`[NEOFORGE-SIMPLE] Using NeoForge version: ${version}`);
            
            // Use minecraft-launcher-core with proper gameDirectory for mods
            const launchOptions = {
                authorization: auth,
                root: this.gameDirectory,  // Main minecraft directory for versions/libraries  
                gameDirectory: gameDirectory,  // Instance directory for mods/saves
                version: {
                    number: version,
                    type: 'release'
                },
                memory: {
                    max: '4G',
                    min: '1G'
                },
                javaPath: await this.getJavaPathForNeoForge(modLoader, actualVersion),
                customLaunchArgs: [],
                customArgs: [],
                overrides: {
                    detached: false
                }
            };

            console.log(`[LAUNCHER] NEOFORGE modpack detected - Using SIMPLE DIRECT LAUNCH (Ferium-inspired)`);
            console.log(`[NEOFORGE-SIMPLE] Launch configuration:`, {
                version: launchOptions.version.number,
                actualVersion: version,
                versionRoot: this.gameDirectory,
                memory: launchOptions.memory,
                root: launchOptions.root,
                gameDirectory: gameDirectory,
                isModpack: true,
                forge: undefined,
                fabric: undefined
            });

            // Launch with minecraft-launcher-core
            console.log(`[LAUNCHER] Starting Minecraft launcher...`);
            const child = await this.client.launch(launchOptions);

            // Handle process events
            child.on('close', (code) => {
                console.log(`[MINECRAFT CLOSE] Game closed with code: ${code}`);
                this.emitProgress({ task: 'Tamamlandı', message: `Oyun kapandı (kod: ${code})` });
            });

            child.on('error', (error) => {
                console.error(`[MINECRAFT ERROR] Game error:`, error);
                this.emitProgress({ task: 'Hata', message: `Oyun hatası: ${error.message}` });
            });

            return { success: true };

        } catch (error) {
            console.error('[NEOFORGE-SIMPLE] Launch failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Helper method to get Java path for NeoForge (Java 21 required for MC 1.21+)
    async getJavaPathForNeoForge(modLoader, version) {
        if (modLoader === 'neoforge' && version.includes('1.21')) {
            console.log(`[NEOFORGE] MC 1.21+ detected - Java 21 required`);
            
            // Try to find Java 21 (common paths)
            const java21Paths = [
                'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe',
                'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe',
                'C:\\Program Files\\Microsoft\\jdk-21.0.4.7-hotspot\\bin\\java.exe',
                'C:\\Program Files\\Amazon\\AMZN-Java-21\\bin\\java.exe'
            ];
            
            for (const javaCandidate of java21Paths) {
                if (await fs.pathExists(javaCandidate)) {
                    console.log(`[NEOFORGE] ✅ Found Java 21: ${javaCandidate}`);
                    return javaCandidate;
                }
            }
            
            console.log(`[NEOFORGE] ⚠️ Java 21 not found in common paths, using system default`);
        }
        
        return null; // Use system default
    }

}

module.exports = MinecraftLauncher;
