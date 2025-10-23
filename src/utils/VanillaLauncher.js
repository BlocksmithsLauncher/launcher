const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const extract = require('extract-zip');
const crypto = require('crypto');

/**
 * VANILLA MINECRAFT LAUNCHER
 * Eski launcher'dan alınan performanslı ve güvenilir vanilla sistem
 * 
 * Özellikler:
 * - minecraft-launcher-core'a bağımlılık yok
 * - Direct Java spawn ile %100 kontrol
 * - Robust asset download (SHA1 validation, retry, concurrency control)
 * - Her launch'ta asset validation
 * - Basit ve hızlı
 */
class VanillaLauncher {
    constructor(gameDirectory) {
        // CRITICAL: Ensure gameDirectory is valid
        if (!gameDirectory || typeof gameDirectory !== 'string') {
            gameDirectory = path.join(os.homedir(), '.blocksmiths', 'minecraft');
            console.log('[VANILLA] Using default game directory:', gameDirectory);
        }
        
        this.gameDirectory = gameDirectory;
        this.versionsDir = path.join(this.gameDirectory, 'versions');
        this.librariesDir = path.join(this.gameDirectory, 'libraries');
        this.assetsDir = path.join(this.gameDirectory, 'assets');
        this.nativesDir = null; // Will be set per version
        
        console.log('[VANILLA] Initialized with game directory:', this.gameDirectory);
        console.log('[VANILLA] Versions directory:', this.versionsDir);
        console.log('[VANILLA] Libraries directory:', this.librariesDir);
        console.log('[VANILLA] Assets directory:', this.assetsDir);
    }

    /**
     * Launch vanilla Minecraft
     */
    async launch(options, sendProgress = null) {
        // CRITICAL: Validate options
        if (!options) {
            throw new Error('[VANILLA] Launch options are required');
        }

        console.log('[VANILLA] Launch called with options:', JSON.stringify(options, null, 2));

        // Extract parameters with comprehensive fallbacks
        const profile = options.profile;
        const version = options.version || '1.20.4';
        const memory = options.memory || 4096;
        const minMemory = options.minMemory || 2048;
        const javaPath = options.javaPath || null;
        const javaArgs = options.javaArgs || [];
        const windowWidth = options.windowWidth || 1280;
        const windowHeight = options.windowHeight || 720;
        const fullscreen = options.fullscreen || false;
        const server = options.server || null;

        // CRITICAL: Validate required parameters with detailed logging
        console.log('[VANILLA] Validating parameters...');
        console.log('[VANILLA] Profile:', profile);
        console.log('[VANILLA] Version:', version);
        console.log('[VANILLA] Memory:', memory);
        console.log('[VANILLA] Game Directory:', this.gameDirectory);
        
        if (!profile) {
            throw new Error('[VANILLA] Profile is required. Received: ' + JSON.stringify(profile));
        }
        if (!version || typeof version !== 'string') {
            throw new Error('[VANILLA] Valid version string is required. Received: ' + version + ' (type: ' + typeof version + ')');
        }
        if (!profile.name && !profile.username) {
            throw new Error('[VANILLA] Profile must have a name or username. Profile: ' + JSON.stringify(profile));
        }
        if (!this.gameDirectory || typeof this.gameDirectory !== 'string') {
            throw new Error('[VANILLA] Invalid gameDirectory: ' + this.gameDirectory);
        }

        console.log('[VANILLA] ✅ All parameters validated successfully');

        try {
            console.log('[VANILLA] 🚀 Starting vanilla Minecraft launch...');
            console.log('[VANILLA] Version:', version);
            console.log('[VANILLA] Player:', profile.name || profile.username);
            console.log('[VANILLA] Memory:', `${minMemory}MB - ${memory}MB`);
            console.log('[VANILLA] Game Directory:', this.gameDirectory);

            // Progress helper
            const progress = (stage, message, current = 0, total = 0) => {
                if (sendProgress) {
                    sendProgress(stage, message, current, total);
                }
                console.log(`[VANILLA] ${stage}: ${message}`);
            };

            // Step 1: Ensure directories
            try {
                console.log('[VANILLA] Step 1: Ensuring directories...');
                progress('Hazırlanıyor', 'Dizinler kontrol ediliyor...', 1, 8);
                await this.ensureDirectories();
                console.log('[VANILLA] Step 1: ✅ Directories ensured');
            } catch (error) {
                console.error('[VANILLA] Step 1: ❌ ensureDirectories failed:', error);
                throw new Error(`Directory setup failed: ${error.message}`);
            }

            // Step 2: Download/validate Minecraft
            try {
                console.log('[VANILLA] Step 2: Ensuring Minecraft version...');
                progress('Minecraft Kontrol Ediliyor', 'Versiyon dosyaları kontrol ediliyor...', 2, 8);
                await this.ensureMinecraft(version, sendProgress);
                console.log('[VANILLA] Step 2: ✅ Minecraft ensured');
            } catch (error) {
                console.error('[VANILLA] Step 2: ❌ ensureMinecraft failed:', error);
                throw new Error(`Minecraft setup failed: ${error.message}`);
            }

            // Step 2.5: CRITICAL - Set natives directory before assets
            try {
                console.log('[VANILLA] Step 2.5: Setting natives directory...');
                console.log('[VANILLA] this.versionsDir:', this.versionsDir);
                console.log('[VANILLA] version:', version);
                
                if (!this.versionsDir || typeof this.versionsDir !== 'string') {
                    throw new Error(`Invalid versionsDir: ${this.versionsDir}`);
                }
                if (!version || typeof version !== 'string') {
                    throw new Error(`Invalid version: ${version}`);
                }
                
                this.nativesDir = path.join(this.versionsDir, version, 'natives');
                console.log('[VANILLA] Step 2.5: ✅ Natives directory set:', this.nativesDir);
            } catch (error) {
                console.error('[VANILLA] Step 2.5: ❌ Setting nativesDir failed:', error);
                throw new Error(`Natives directory setup failed: ${error.message}`);
            }

            // Step 3: CRITICAL - Always validate assets
            try {
                console.log('[VANILLA] Step 3: Validating and downloading assets...');
                progress('Asset Kontrol Ediliyor', 'Oyun dosyaları doğrulanıyor...', 5, 8);
                await this.validateAndDownloadAssets(version, sendProgress);
                console.log('[VANILLA] Step 3: ✅ Assets validated');
            } catch (error) {
                console.error('[VANILLA] Step 3: ❌ validateAndDownloadAssets failed:', error);
                throw new Error(`Asset validation failed: ${error.message}`);
            }

            // Step 3.5: CRITICAL - Always extract natives (especially for old versions)
            try {
                console.log('[VANILLA] Step 3.5: Extracting native libraries...');
                progress('Native Dosyalar', 'Native kütüphaneler hazırlanıyor...', 6, 8);
                
                // Read version data for libraries
                const versionJsonPath = path.join(this.versionsDir, version, `${version}.json`);
                const versionData = await fs.readJson(versionJsonPath);
                
                // Always re-extract natives to ensure they're fresh
                await this.extractNatives(version, versionData.libraries);
                console.log('[VANILLA] Step 3.5: ✅ Natives extracted');
            } catch (error) {
                console.error('[VANILLA] Step 3.5: ❌ extractNatives failed:', error);
                throw new Error(`Native extraction failed: ${error.message}`);
            }

            // Step 4: Find Java
            let javaExecutable, javaVersion;
            try {
                console.log('[VANILLA] Step 4: Finding Java...');
                progress('Java Kontrol Ediliyor', 'Java runtime bulunuyor...', 7, 8);
                
                if (javaPath) {
                    // If javaPath provided, detect its version
                    javaExecutable = javaPath;
                    try {
                        const JavaDetector = require('./JavaDetector');
                        const detector = new JavaDetector();
                        javaVersion = await detector.getJavaVersion(javaPath);
                    } catch (e) {
                        javaVersion = 17; // Default fallback
                    }
                } else {
                    // Auto-detect Java
                    const javaInfo = await this.findJava(version);
                    javaExecutable = javaInfo.path;
                    javaVersion = javaInfo.version;
                }
                
                console.log(`[VANILLA] Step 4: ✅ Using Java ${javaVersion}:`, javaExecutable);
            } catch (error) {
                console.error('[VANILLA] Step 4: ❌ findJava failed:', error);
                throw new Error(`Java detection failed: ${error.message}`);
            }

            // Step 5: Build launch arguments
            let args;
            try {
                console.log('[VANILLA] Step 5: Building launch arguments...');
                progress('Başlatılıyor', 'Launch parametreleri hazırlanıyor...', 8, 8);
                args = await this.buildLaunchArgs({
                    version,
                    profile,
                    memory,
                    minMemory,
                    javaExecutable,
                    javaVersion, // Pass Java version for JVM args optimization
                    javaArgs,
                    windowWidth,
                    windowHeight,
                    fullscreen,
                    server
                });
                console.log('[VANILLA] Step 5: ✅ Launch arguments built');
            } catch (error) {
                console.error('[VANILLA] Step 5: ❌ buildLaunchArgs failed:', error);
                throw new Error(`Building launch arguments failed: ${error.message}`);
            }

            // Step 6: Launch Minecraft
            let process;
            try {
                console.log('[VANILLA] Step 6: Launching Minecraft process...');
                progress('Minecraft Başlatılıyor', 'Oyun başlatılıyor...', 8, 8);
                process = await this.launchMinecraft(javaExecutable, args);
                console.log('[VANILLA] Step 6: ✅ Minecraft process started');
            } catch (error) {
                console.error('[VANILLA] Step 6: ❌ launchMinecraft failed:', error);
                throw new Error(`Minecraft process launch failed: ${error.message}`);
            }

            console.log('[VANILLA] ✅ Minecraft launched successfully');
            return { success: true, process, javaPath: javaExecutable, javaVersion, args };

        } catch (error) {
            console.error('[VANILLA] ❌ Launch failed:', error);
            throw error;
        }
    }

    /**
     * Ensure all required directories exist
     */
    async ensureDirectories() {
        const dirs = [
            this.versionsDir,
            this.librariesDir,
            this.assetsDir,
            path.join(this.assetsDir, 'objects'),
            path.join(this.assetsDir, 'indexes'),
            path.join(this.gameDirectory, 'logs')
        ];

        for (const dir of dirs) {
            await fs.ensureDir(dir);
        }

        console.log('[VANILLA] Directories verified');
    }

    /**
     * Ensure Minecraft version is downloaded
     */
    async ensureMinecraft(version, sendProgress = null) {
        // CRITICAL: Validate version
        if (!version || typeof version !== 'string') {
            throw new Error('[VANILLA] Invalid version: ' + version);
        }
        
        console.log('[VANILLA] Ensuring Minecraft version:', version);
        console.log('[VANILLA] Versions directory:', this.versionsDir);
        
        const versionDir = path.join(this.versionsDir, version);
        const versionJson = path.join(versionDir, `${version}.json`);
        const clientJar = path.join(versionDir, `${version}.jar`);
        
        console.log('[VANILLA] Version directory:', versionDir);
        console.log('[VANILLA] Version JSON:', versionJson);
        console.log('[VANILLA] Client JAR:', clientJar);

        // Check if already downloaded
        if (await fs.pathExists(versionJson) && await fs.pathExists(clientJar)) {
            console.log('[VANILLA] Minecraft version already downloaded');
            return;
        }

        console.log('[VANILLA] Downloading Minecraft', version);

        // Download version manifest
        const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
        const manifestResponse = await fetch(manifestUrl);
        const manifest = await manifestResponse.json();

        const versionInfo = manifest.versions.find(v => v.id === version);
        if (!versionInfo) {
            throw new Error(`Minecraft ${version} bulunamadı`);
        }

        // Download version JSON
        if (sendProgress) sendProgress('Minecraft İndiriliyor', `${version} manifest indiriliyor...`, 10, 100);
        const versionResponse = await fetch(versionInfo.url);
        const versionData = await versionResponse.json();

        await fs.ensureDir(versionDir);
        await fs.writeJson(versionJson, versionData, { spaces: 2 });

        // Download client JAR
        if (!await fs.pathExists(clientJar)) {
            if (sendProgress) sendProgress('Minecraft İndiriliyor', 'Client JAR indiriliyor...', 20, 100);
            console.log('[VANILLA] Downloading client JAR...');

            const clientResponse = await this.downloadWithRetry(versionData.downloads.client.url);
            const clientBuffer = await clientResponse.buffer();
            await fs.writeFile(clientJar, clientBuffer);
        }

        // Download libraries
        if (sendProgress) sendProgress('Minecraft İndiriliyor', 'Kütüphaneler indiriliyor...', 40, 100);
        await this.downloadLibraries(versionData.libraries, sendProgress);

        // Extract natives
        if (sendProgress) sendProgress('Minecraft İndiriliyor', 'Native dosyalar çıkartılıyor...', 70, 100);
        await this.extractNatives(version, versionData.libraries);

        console.log('[VANILLA] ✅ Minecraft version downloaded');
    }

    /**
     * Download libraries with retry
     */
    async downloadLibraries(libraries, sendProgress = null) {
        console.log('[VANILLA] Checking libraries...');

        const missingLibraries = [];

        // First check which libraries are missing
        for (const library of libraries) {
            if (library.downloads && library.downloads.artifact) {
                const artifact = library.downloads.artifact;
                const libPath = path.join(this.librariesDir, artifact.path);

                if (!await fs.pathExists(libPath)) {
                    missingLibraries.push({ library, artifact, libPath });
                }
            }
        }

        if (missingLibraries.length === 0) {
            console.log('[VANILLA] All libraries present');
            return;
        }

        console.log(`[VANILLA] Downloading ${missingLibraries.length} missing libraries...`);

        for (let i = 0; i < missingLibraries.length; i++) {
            const { library, artifact, libPath } = missingLibraries[i];

            if (sendProgress) {
                sendProgress('Kütüphaneler İndiriliyor', `${library.name}`, i, missingLibraries.length);
            }

            try {
                const response = await this.downloadWithRetry(artifact.url);
                const buffer = await response.buffer();

                await fs.ensureDir(path.dirname(libPath));
                await fs.writeFile(libPath, buffer);

                console.log(`[VANILLA] Downloaded library: ${library.name}`);
            } catch (error) {
                console.error(`[VANILLA] Failed to download library ${library.name}:`, error);
                throw error;
            }
        }
    }

    /**
     * Extract native libraries
     */
    async extractNatives(version, libraries) {
        this.nativesDir = path.join(this.versionsDir, version, 'natives');
        
        // CRITICAL: Clean natives directory to avoid conflicts between versions
        console.log('[VANILLA] Cleaning natives directory...');
        if (await fs.pathExists(this.nativesDir)) {
            await fs.remove(this.nativesDir);
        }
        await fs.ensureDir(this.nativesDir);

        let extractedCount = 0;
        for (const library of libraries) {
            if (library.downloads && library.downloads.classifiers) {
                const osName = this.getOSName();
                const nativeKey = `natives-${osName}`;

                if (library.downloads.classifiers[nativeKey]) {
                    const native = library.downloads.classifiers[nativeKey];
                    const nativePath = path.join(this.librariesDir, native.path);

                    if (await fs.pathExists(nativePath)) {
                        console.log(`[VANILLA] Extracting native: ${library.name}`);
                        try {
                            await extract(nativePath, { dir: this.nativesDir });
                            extractedCount++;
                        } catch (error) {
                            console.warn(`[VANILLA] Failed to extract native ${library.name}:`, error.message);
                        }
                    } else {
                        console.warn(`[VANILLA] Native not found: ${nativePath}`);
                    }
                }
            }
        }

        console.log(`[VANILLA] ✅ Natives extracted: ${extractedCount} libraries`);
        
        // Verify natives directory has files
        const nativeFiles = await fs.readdir(this.nativesDir);
        console.log(`[VANILLA] Natives directory contains ${nativeFiles.length} files`);
        
        if (nativeFiles.length === 0) {
            console.error('[VANILLA] ⚠️ WARNING: No native files extracted!');
        }
    }

    /**
     * Validate and download missing assets
     * This is the ROBUST system from old launcher
     */
    async validateAndDownloadAssets(version, sendProgress = null) {
        console.log('[VANILLA] Validating game assets...');

        const versionJsonPath = path.join(this.versionsDir, version, `${version}.json`);
        const versionData = await fs.readJson(versionJsonPath);

        const objectsDir = path.join(this.assetsDir, 'objects');
        const indexesDir = path.join(this.assetsDir, 'indexes');

        await fs.ensureDir(objectsDir);
        await fs.ensureDir(indexesDir);

        // Download asset index
        const assetIndexPath = path.join(indexesDir, `${versionData.assetIndex.id}.json`);

        if (!await fs.pathExists(assetIndexPath)) {
            console.log('[VANILLA] Downloading asset index...');
            const indexResponse = await this.downloadWithRetry(versionData.assetIndex.url);
            const indexData = await indexResponse.json();
            await fs.writeJson(assetIndexPath, indexData);
        }

        const indexData = await fs.readJson(assetIndexPath);
        const objects = indexData.objects;
        const totalAssets = Object.keys(objects).length;

        console.log(`[VANILLA] Total assets to validate: ${totalAssets}`);

        // Validate existing assets and collect missing/corrupted ones
        const missingAssets = [];
        let validatedCount = 0;

        for (const [assetPath, asset] of Object.entries(objects)) {
            const hash = asset.hash;
            const assetSubdir = hash.substring(0, 2);
            const assetFilePath = path.join(objectsDir, assetSubdir, hash);

            let needsDownload = false;

            if (await fs.pathExists(assetFilePath)) {
                try {
                    const fileBuffer = await fs.readFile(assetFilePath);
                    const fileHash = this.calculateSHA1(fileBuffer);

                    if (fileHash !== hash || fileBuffer.length !== asset.size) {
                        console.log(`[VANILLA] Asset corrupted: ${assetPath}`);
                        needsDownload = true;
                    }
                } catch (error) {
                    console.log(`[VANILLA] Asset read error: ${assetPath}`);
                    needsDownload = true;
                }
            } else {
                needsDownload = true;
            }

            if (needsDownload) {
                missingAssets.push([assetPath, asset]);
            }

            validatedCount++;
            if (validatedCount % 100 === 0 && sendProgress) {
                sendProgress('Asset Kontrol Ediliyor', `${validatedCount}/${totalAssets} kontrol edildi`, validatedCount, totalAssets);
            }
        }

        console.log(`[VANILLA] Validation complete. Missing/corrupted: ${missingAssets.length}/${totalAssets}`);

        if (missingAssets.length === 0) {
            console.log('[VANILLA] ✅ All assets validated successfully!');
            return;
        }

        // Download missing assets with controlled concurrency
        console.log(`[VANILLA] Downloading ${missingAssets.length} missing assets...`);
        const concurrency = 3; // Controlled concurrency for stability
        let downloadedCount = 0;
        const totalToDownload = missingAssets.length;

        const downloadPromises = [];
        const semaphore = new Array(concurrency).fill(null).map(() => Promise.resolve());

        for (const [assetPath, asset] of missingAssets) {
            const downloadPromise = this.waitForSemaphore(semaphore).then(async (release) => {
                try {
                    await this.downloadSingleAsset(asset, objectsDir, assetPath);
                    downloadedCount++;

                    if (sendProgress) {
                        sendProgress('Asset İndiriliyor', `${downloadedCount}/${totalToDownload}`, downloadedCount, totalToDownload);
                    }
                } catch (error) {
                    console.error(`[VANILLA] Failed to download asset ${assetPath}:`, error.message);
                } finally {
                    release();
                }
            });

            downloadPromises.push(downloadPromise);
        }

        await Promise.all(downloadPromises);
        console.log(`[VANILLA] ✅ Asset download complete: ${downloadedCount}/${totalToDownload}`);
    }

    /**
     * Download single asset with validation and retry
     */
    async downloadSingleAsset(asset, objectsDir, assetPath) {
        const hash = asset.hash;
        const assetSubdir = hash.substring(0, 2);
        const assetFilePath = path.join(objectsDir, assetSubdir, hash);

        await fs.ensureDir(path.dirname(assetFilePath));

        const assetUrl = `https://resources.download.minecraft.net/${assetSubdir}/${hash}`;
        const maxRetries = 5;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.downloadWithRetry(assetUrl, 1, {
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const buffer = await response.buffer();

                // Validate size
                if (buffer.length !== asset.size) {
                    throw new Error(`Size mismatch: expected ${asset.size}, got ${buffer.length}`);
                }

                // Validate hash
                const downloadedHash = this.calculateSHA1(buffer);
                if (downloadedHash !== hash) {
                    throw new Error(`Hash mismatch: expected ${hash}, got ${downloadedHash}`);
                }

                await fs.writeFile(assetFilePath, buffer);
                return;

            } catch (error) {
                if (attempt === maxRetries) {
                    throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
                }

                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Semaphore for controlled concurrency
     */
    async waitForSemaphore(semaphore) {
        const index = await Promise.race(
            semaphore.map((promise, i) => promise.then(() => i))
        );

        let resolveRelease;
        semaphore[index] = new Promise(resolve => {
            resolveRelease = resolve;
        });

        return () => resolveRelease();
    }

    /**
     * Build launch arguments for vanilla Minecraft
     */
    async buildLaunchArgs(options) {
        const {
            version,
            profile,
            memory,
            minMemory,
            javaExecutable,
            javaVersion = 17, // Java version for GC optimization
            javaArgs = [],
            windowWidth,
            windowHeight,
            fullscreen,
            server
        } = options;

        const versionJsonPath = path.join(this.versionsDir, version, `${version}.json`);
        const versionData = await fs.readJson(versionJsonPath);

        // CRITICAL FIX: Ensure nativesDir is set
        if (!this.nativesDir) {
            this.nativesDir = path.join(this.versionsDir, version, 'natives');
            console.log('[VANILLA] Natives directory set to:', this.nativesDir);
        }

        // Build classpath
        const classpath = [];
        for (const library of versionData.libraries) {
            if (library.downloads && library.downloads.artifact) {
                const libPath = path.join(this.librariesDir, library.downloads.artifact.path);
                if (await fs.pathExists(libPath)) {
                    classpath.push(libPath);
                }
            }
        }

        // Add client JAR
        const clientJar = path.join(this.versionsDir, version, `${version}.jar`);
        classpath.push(clientJar);

        // Get optimized JVM arguments from JavaOptimizer
        const JavaOptimizer = require('./JavaOptimizer');
        const optimizer = new JavaOptimizer(); // Class can now be instantiated
        const optimizedArgs = optimizer.getOptimalArgs({
            minecraftVersion: version,
            modloader: 'vanilla',
            modCount: 0,
            javaVersion: javaVersion // Pass Java version for GC selection
        });

        console.log(`[VANILLA] Using optimized JVM args for Java ${javaVersion}:`, optimizedArgs.jvmArgs.slice(0, 5));

        // JVM arguments (merge custom + optimized + system)
        const jvmArgs = [
            ...javaArgs, // Custom Java args first
            ...optimizedArgs.jvmArgs, // Optimized GC and performance args
            `-Xmx${memory}M`,
            `-Xms${minMemory}M`,
            `-Djava.library.path=${this.nativesDir}`,
            `-Dminecraft.launcher.brand=BlocksmithsLauncher`,
            `-Dminecraft.launcher.version=2.0.0`,
            `-cp`, classpath.join(process.platform === 'win32' ? ';' : ':'),
            versionData.mainClass
        ];

        // Game arguments
        const gameArgs = [
            '--username', profile.name || profile.username || 'Player',
            '--version', version,
            '--gameDir', this.gameDirectory,
            '--assetsDir', this.assetsDir,
            '--assetIndex', versionData.assetIndex ? versionData.assetIndex.id : version,
            '--uuid', profile.uuid || 'offline',
            '--accessToken', 'null',
            '--userType', 'legacy',
            '--versionType', 'Blocksmiths'
        ];

        // Window settings
        if (!fullscreen) {
            gameArgs.push('--width', windowWidth.toString());
            gameArgs.push('--height', windowHeight.toString());
        } else {
            gameArgs.push('--fullscreen');
        }

        // Server auto-connect
        if (server) {
            gameArgs.push('--server', server.ip);
            if (server.port && server.port !== 25565) {
                gameArgs.push('--port', server.port.toString());
            }
        }

        return [...jvmArgs, ...gameArgs];
    }

    /**
     * Launch Minecraft process
     */
    async launchMinecraft(javaPath, args) {
        console.log('[VANILLA] Launching Minecraft...');
        console.log('[VANILLA] Java:', javaPath);
        console.log('[VANILLA] Args:', args.length, 'arguments');
        
        // CRITICAL: Verify Java exists before launching
        if (!await fs.pathExists(javaPath)) {
            throw new Error(`Java executable not found at: ${javaPath}`);
        }

        return new Promise((resolve, reject) => {
            let launched = false;
            let stderrBuffer = [];
            
            console.log('[VANILLA] Spawning Java process...');
            
            const process = spawn(javaPath, args, {
                cwd: this.gameDirectory,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            });
            
            console.log('[VANILLA] Process spawned with PID:', process.pid);

            process.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('[MINECRAFT-STDOUT]', output.trim());

                if (!launched && output.includes('Setting user:')) {
                    launched = true;
                    console.log('[VANILLA] ✅ Minecraft launched successfully!');
                    resolve(process);
                }
            });

            process.stderr.on('data', (data) => {
                const error = data.toString();
                stderrBuffer.push(error);
                console.error('[MINECRAFT-STDERR]', error.trim());
                
                // Check for critical Java errors
                if (error.includes('Could not create the Java Virtual Machine') ||
                    error.includes('A fatal exception has occurred') ||
                    error.includes('java.lang.OutOfMemoryError') ||
                    error.includes('Error: Invalid or corrupt jarfile')) {
                    console.error('[VANILLA] ❌ CRITICAL JAVA ERROR DETECTED!');
                    console.error('[VANILLA] Full stderr output:', stderrBuffer.join('\n'));
                }
            });

            process.on('error', (error) => {
                console.error('[VANILLA] Process spawn error:', error);
                console.error('[VANILLA] Java path:', javaPath);
                console.error('[VANILLA] Working directory:', this.gameDirectory);
                reject(new Error(`Failed to spawn Java process: ${error.message}`));
            });

            process.on('exit', (code, signal) => {
                console.log(`[VANILLA] Process exited: code=${code}, signal=${signal}`);
                if (!launched) {
                    const stderrOutput = stderrBuffer.join('\n');
                    console.error('[VANILLA] ❌ Minecraft failed to start!');
                    console.error('[VANILLA] Exit code:', code);
                    console.error('[VANILLA] Stderr output:', stderrOutput);
                    
                    let errorMessage = `Minecraft failed to start (exit code: ${code})`;
                    if (stderrOutput) {
                        errorMessage += `\n\nJava Error:\n${stderrOutput}`;
                    }
                    reject(new Error(errorMessage));
                }
            });

            // Timeout after 60 seconds (increased from 30)
            setTimeout(() => {
                if (!launched) {
                    console.error('[VANILLA] ❌ Launch timeout after 60 seconds');
                    console.error('[VANILLA] Stderr output:', stderrBuffer.join('\n'));
                    process.kill();
                    reject(new Error('Minecraft launch timeout (60s). Check logs for details.'));
                }
            }, 60000);
        });
    }

    /**
     * Find Java installation
     * @returns {Promise<{path: string, version: number}>} Java path and version
     */
    async findJava(minecraftVersion = null) {
        // Try JavaDetector first
        try {
            const JavaDetector = require('./JavaDetector');
            const detector = new JavaDetector();
            const javaPath = await detector.getJavaPath(17, minecraftVersion);
            if (javaPath) {
                const version = detector.javaVersion || await detector.getJavaVersion(javaPath);
                console.log(`[VANILLA] Found Java ${version} at:`, javaPath);
                return { path: javaPath, version: version };
            }
        } catch (error) {
            console.warn('[VANILLA] JavaDetector failed, trying fallback:', error.message);
        }

        // Fallback to common paths
        const possiblePaths = [
            'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot\\bin\\javaw.exe',
            'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
            'C:\\Program Files\\Java\\jre-21\\bin\\javaw.exe',
            'C:\\Program Files\\OpenJDK\\jdk-21\\bin\\javaw.exe'
        ];

        for (const javaPath of possiblePaths) {
            if (await fs.pathExists(javaPath)) {
                console.log('[VANILLA] Found Java at:', javaPath);
                // Try to detect version
                try {
                    const JavaDetector = require('./JavaDetector');
                    const detector = new JavaDetector();
                    const version = await detector.getJavaVersion(javaPath);
                    return { path: javaPath, version: version };
                } catch (e) {
                    return { path: javaPath, version: 17 }; // Default fallback
                }
            }
        }

        // Try JAVA_HOME
        const javaEnv = process.env.JAVA_HOME;
        if (javaEnv) {
            const javaPath = path.join(javaEnv, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
            if (await fs.pathExists(javaPath)) {
                console.log('[VANILLA] Found Java via JAVA_HOME:', javaPath);
                // Try to detect version
                try {
                    const JavaDetector = require('./JavaDetector');
                    const detector = new JavaDetector();
                    const version = await detector.getJavaVersion(javaPath);
                    return { path: javaPath, version: version };
                } catch (e) {
                    return { path: javaPath, version: 17 }; // Default fallback
                }
            }
        }

        throw new Error('Java bulunamadı. Lütfen Java 17+ yükleyin.');
    }

    /**
     * Utility: Download with retry
     */
    async downloadWithRetry(url, maxRetries = 3, options = {}) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    timeout: 30000,
                    ...options
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response;
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }

                console.warn(`[VANILLA] Download attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Utility: Calculate SHA1 hash
     */
    calculateSHA1(buffer) {
        return crypto.createHash('sha1').update(buffer).digest('hex');
    }

    /**
     * Utility: Get OS name for natives
     */
    getOSName() {
        if (process.platform === 'win32') {
            return process.arch === 'x64' ? 'windows' : 'windows-x86';
        } else if (process.platform === 'darwin') {
            return 'macos';
        } else if (process.platform === 'linux') {
            return 'linux';
        }
        return 'windows'; // fallback
    }
}

module.exports = VanillaLauncher;

