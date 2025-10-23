const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * JAVA DETECTOR
 * Automatically detects and validates Java installations
 * - Checks system PATH
 * - Scans common Java installation directories
 * - Validates Java version
 * - Downloads bundled Java if needed
 */
class JavaDetector {
    constructor() {
        this.cachedJavaPath = null;
        this.javaVersion = null;
    }

    /**
     * Get Java executable path with automatic detection
     * @param {number} minVersion - Minimum required Java version (default: 17)
     * @returns {Promise<string>} - Path to java.exe/javaw.exe
     */
    async getJavaPath(minVersion = 17, minecraftVersion = null) {
        // Return cached path if available and meets requirements
        if (this.cachedJavaPath && this.javaVersion >= minVersion) {
            console.log('[JAVA] Using in-memory cached Java path:', this.cachedJavaPath);
            return this.cachedJavaPath;
        }

        // Try persistent cache first (faster startup)
        const persistentCache = await this.loadPersistentCache();
        if (persistentCache && persistentCache.javaPath) {
            // Validate cached Java still exists and works
            if (await this.validateJava(persistentCache.javaPath)) {
                const version = await this.getJavaVersion(persistentCache.javaPath);
                if (version >= minVersion) {
                    console.log('[JAVA] Using persistent cached Java:', persistentCache.javaPath, `(v${version})`);
                    this.cachedJavaPath = persistentCache.javaPath;
                    this.javaVersion = version;
                    return persistentCache.javaPath;
                } else {
                    console.log(`[JAVA] Persistent cache version ${version} < required ${minVersion}, re-detecting...`);
                }
            } else {
                console.log('[JAVA] Persistent cache invalid, re-detecting...');
            }
        }

        console.log(`[JAVA] Detecting Java ${minVersion}+ installation...`);

        // Try detection methods in order (system Java first)
        const detectionMethods = [
            () => this.checkSystemPath(),
            () => this.checkJavaHome(),
            () => this.checkCommonPaths(),
            () => this.checkMinecraftLauncher()
        ];

        let bestJava = null;
        let bestVersion = 0;

        for (const method of detectionMethods) {
            try {
                const javaPath = await method();
                if (javaPath) {
                    // Validate Java version
                    const version = await this.getJavaVersion(javaPath);
                    console.log(`[JAVA] Found Java ${version}: ${javaPath}`);
                    
                    if (version >= minVersion) {
                        console.log(`[JAVA] ✅ Using system Java ${version} (meets requirement: ${minVersion}+)`);
                        this.cachedJavaPath = javaPath;
                        this.javaVersion = version;
                        
                        // Save to persistent cache for faster next startup
                        await this.savePersistentCache(javaPath, version);
                        
                        return javaPath;
                    } else if (version > bestVersion) {
                        console.log(`[JAVA] Java ${version} is best so far (need ${minVersion}+)`);
                        bestJava = javaPath;
                        bestVersion = version;
                    }
                }
            } catch (error) {
                console.error(`[JAVA] Detection method failed:`, error.message);
            }
        }

        // If system Java doesn't meet requirements, use bundled Java
        console.log(`[JAVA] System Java insufficient, using bundled Java...`);
        try {
            const bundledJava = await this.downloadBundledJava(minVersion, minecraftVersion);
            if (bundledJava) {
                console.log(`[JAVA] ✅ Using bundled Java: ${bundledJava}`);
                this.cachedJavaPath = bundledJava;
                this.javaVersion = minVersion;
                return bundledJava;
            }
        } catch (error) {
            console.error(`[JAVA] Bundled Java failed:`, error.message);
        }

        // If we found ANY Java, use it even if version is lower (last resort)
        if (bestJava) {
            console.log(`[JAVA] ⚠️ Using Java ${bestVersion} (recommended: ${minVersion}+)`);
            this.cachedJavaPath = bestJava;
            this.javaVersion = bestVersion;
            return bestJava;
        }

        throw new Error(`Java ${minVersion}+ bulunamadı ve otomatik indirme başarısız oldu. Lütfen Java ${minVersion} veya üstünü manuel olarak yükleyin.`);
    }

    /**
     * Check system PATH for java
     */
    async checkSystemPath() {
        try {
            console.log('[JAVA] Checking system PATH...');
            
            let bestPath = null;
            let bestVersion = 0;
            
            if (process.platform === 'win32') {
                // Try both java.exe and javaw.exe
                for (const javaCmd of ['javaw.exe', 'java.exe']) {
                    try {
                        const { stdout } = await execAsync(`where ${javaCmd}`);
                        const javaPaths = stdout.trim().split('\n');
                        
                        // Check all found paths
                        for (const javaPath of javaPaths) {
                            if (await fs.pathExists(javaPath.trim())) {
                                const version = await this.getJavaVersion(javaPath.trim());
                                console.log(`[JAVA] PATH has Java ${version}: ${javaPath.trim()}`);
                                
                                if (version > bestVersion) {
                                    bestPath = javaPath.trim();
                                    bestVersion = version;
                                }
                            }
                        }
                    } catch (error) {
                        // Command not found, continue
                    }
                }
            } else {
                // Linux/Mac
                try {
                    const { stdout } = await execAsync('which java');
                    const javaPath = stdout.trim();
                    
                    if (await fs.pathExists(javaPath)) {
                        const version = await this.getJavaVersion(javaPath);
                        console.log(`[JAVA] PATH has Java ${version}: ${javaPath}`);
                        bestPath = javaPath;
                        bestVersion = version;
                    }
                } catch (error) {
                    // Command not found
                }
            }
            
            if (bestPath) {
                console.log(`[JAVA] Best from PATH: Java ${bestVersion} at ${bestPath}`);
            }
            
            return bestPath;
        } catch (error) {
            console.error('[JAVA] PATH check failed:', error.message);
            return null;
        }
    }

    /**
     * Check JAVA_HOME environment variable
     */
    async checkJavaHome() {
        try {
            console.log('[JAVA] Checking JAVA_HOME...');
            
            const javaHome = process.env.JAVA_HOME;
            if (!javaHome) {
                return null;
            }

            const javaExe = process.platform === 'win32' 
                ? path.join(javaHome, 'bin', 'javaw.exe')
                : path.join(javaHome, 'bin', 'java');

            if (await fs.pathExists(javaExe)) {
                console.log('[JAVA] Found via JAVA_HOME:', javaExe);
                return javaExe;
            }

            return null;
        } catch (error) {
            console.error('[JAVA] JAVA_HOME check failed:', error.message);
            return null;
        }
    }

    /**
     * Check common Java installation paths
     */
    async checkCommonPaths() {
        console.log('[JAVA] Checking common installation paths...');

        const commonPaths = [];

        if (process.platform === 'win32') {
            // Windows common paths
            const basePaths = [
                'C:\\Program Files\\Java',
                'C:\\Program Files (x86)\\Java',
                'C:\\Program Files\\Eclipse Adoptium',
                'C:\\Program Files\\Eclipse Foundation',
                'C:\\Program Files\\Microsoft',
                'C:\\Program Files\\Amazon Corretto',
                'C:\\Program Files\\BellSoft',
                'C:\\Program Files\\Zulu',
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Java')
            ];

            for (const basePath of basePaths) {
                if (await fs.pathExists(basePath)) {
                    try {
                        const entries = await fs.readdir(basePath);
                        
                        for (const entry of entries) {
                            const javaPath = path.join(basePath, entry, 'bin', 'javaw.exe');
                            if (await fs.pathExists(javaPath)) {
                                commonPaths.push(javaPath);
                            }
                            
                            const javaPath2 = path.join(basePath, entry, 'bin', 'java.exe');
                            if (await fs.pathExists(javaPath2)) {
                                commonPaths.push(javaPath2);
                            }
                        }
                    } catch (error) {
                        // Directory not accessible
                    }
                }
            }
        } else if (process.platform === 'darwin') {
            // macOS common paths
            commonPaths.push(
                '/Library/Java/JavaVirtualMachines/*/Contents/Home/bin/java',
                '/System/Library/Frameworks/JavaVM.framework/Versions/Current/Commands/java'
            );
        } else {
            // Linux common paths
            commonPaths.push(
                '/usr/lib/jvm/*/bin/java',
                '/usr/java/*/bin/java',
                '/opt/java/*/bin/java'
            );
        }

        // Check all paths and return the one with highest version
        let bestPath = null;
        let bestVersion = 0;
        
        console.log(`[JAVA] Scanning ${commonPaths.length} potential Java locations...`);
        
        for (const javaPath of commonPaths) {
            if (await fs.pathExists(javaPath)) {
                try {
                    const version = await this.getJavaVersion(javaPath);
                    console.log(`[JAVA] Found Java ${version} at: ${javaPath}`);
                    
                    if (version > bestVersion) {
                        bestPath = javaPath;
                        bestVersion = version;
                    }
                } catch (error) {
                    // Can't get version, skip
                }
            }
        }
        
        if (bestPath) {
            console.log(`[JAVA] Best from common paths: Java ${bestVersion} at ${bestPath}`);
        }

        return bestPath;
    }

    /**
     * Check Minecraft launcher's bundled Java
     */
    async checkMinecraftLauncher() {
        try {
            console.log('[JAVA] Checking Minecraft launcher Java...');

            if (process.platform === 'win32') {
                const mcLauncherPath = path.join(
                    process.env.APPDATA || '',
                    '.minecraft',
                    'runtime'
                );

                if (await fs.pathExists(mcLauncherPath)) {
                    const runtimes = await fs.readdir(mcLauncherPath);
                    
                    // Look for java-runtime-* directories
                    for (const runtime of runtimes) {
                        if (runtime.startsWith('java-runtime-')) {
                            const javaPath = path.join(
                                mcLauncherPath,
                                runtime,
                                'windows-x64',
                                runtime,
                                'bin',
                                'javaw.exe'
                            );

                            if (await fs.pathExists(javaPath)) {
                                console.log('[JAVA] Found Minecraft Java:', javaPath);
                                return javaPath;
                            }
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('[JAVA] Minecraft Java check failed:', error.message);
            return null;
        }
    }

    /**
     * Download bundled Java using JavaRuntimeManager
     */
    async downloadBundledJava(minVersion = 17, minecraftVersion = null) {
        try {
            console.log(`[JAVA] Downloading bundled Java ${minVersion}...`);
            const javaRuntimeManager = require('./JavaRuntimeManager');
            
            // If Minecraft version is provided, get best Java for it
            if (minecraftVersion) {
                return await javaRuntimeManager.getBestJavaForMinecraft(minecraftVersion);
            }
            
            // Otherwise, get requested version
            return await javaRuntimeManager.getJavaRuntime(minVersion);
        } catch (error) {
            console.error('[JAVA] Bundled Java download failed:', error.message);
            return null;
        }
    }

    /**
     * Get Java version from executable
     */
    async getJavaVersion(javaPath) {
        try {
            // Run java -version (output goes to stderr!)
            const { stdout, stderr } = await execAsync(`"${javaPath}" -version 2>&1`);
            const output = (stderr || stdout || '').toString();
            
            console.log('[JAVA] Version output:', output.substring(0, 200));
            
            // Parse version from output
            // Modern format: java version "17.0.1" or "21.0.1"
            const versionMatch = output.match(/version "(\d+)\.(\d+)\.(\d+)/);
            if (versionMatch) {
                const majorVersion = parseInt(versionMatch[1]);
                console.log('[JAVA] Parsed major version:', majorVersion);
                return majorVersion;
            }

            // Java 9+ format: version "17" or "21"
            const modernMatch = output.match(/version "(\d+)"/);
            if (modernMatch) {
                const majorVersion = parseInt(modernMatch[1]);
                console.log('[JAVA] Parsed modern version:', majorVersion);
                return majorVersion;
            }

            // Old format: java version "1.8.0_xxx"
            const oldMatch = output.match(/version "1\.(\d+)\./);
            if (oldMatch) {
                const majorVersion = parseInt(oldMatch[1]);
                console.log('[JAVA] Parsed old version (1.x format):', majorVersion);
                return majorVersion;
            }

            console.warn('[JAVA] Could not parse version from:', output);
            return 8; // Assume old version
        } catch (error) {
            console.error('[JAVA] Version check failed:', error.message);
            return 0;
        }
    }

    /**
     * Get Java version info
     */
    async getJavaInfo(javaPath) {
        try {
            const { stdout, stderr } = await execAsync(`"${javaPath}" -version`);
            const output = stderr + stdout;
            
            return {
                version: await this.getJavaVersion(javaPath),
                fullVersion: output.trim().split('\n')[0],
                path: javaPath
            };
        } catch (error) {
            console.error('[JAVA] Info check failed:', error.message);
            return null;
        }
    }

    /**
     * Load persistent cache from disk
     */
    async loadPersistentCache() {
        try {
            const os = require('os');
            const cacheFile = path.join(os.homedir(), '.blocksmiths', 'java-cache.json');
            
            if (await fs.pathExists(cacheFile)) {
                const cache = await fs.readJSON(cacheFile);
                
                // Cache valid for 7 days
                const cacheAge = Date.now() - (cache.timestamp || 0);
                if (cacheAge < 7 * 24 * 3600 * 1000) {
                    return cache;
                } else {
                    console.log('[JAVA] Persistent cache expired (>7 days old)');
                }
            }
        } catch (error) {
            console.error('[JAVA] Failed to load persistent cache:', error.message);
        }
        return null;
    }

    /**
     * Save persistent cache to disk
     */
    async savePersistentCache(javaPath, version) {
        try {
            const os = require('os');
            const cacheDir = path.join(os.homedir(), '.blocksmiths');
            const cacheFile = path.join(cacheDir, 'java-cache.json');
            
            await fs.ensureDir(cacheDir);
            await fs.writeJSON(cacheFile, {
                javaPath: javaPath,
                version: version,
                timestamp: Date.now()
            }, { spaces: 2 });
            
            console.log('[JAVA] Persistent cache saved');
        } catch (error) {
            console.error('[JAVA] Failed to save persistent cache:', error.message);
        }
    }

    /**
     * Clear cached Java path (force re-detection)
     */
    clearCache() {
        this.cachedJavaPath = null;
        this.javaVersion = null;
        console.log('[JAVA] In-memory cache cleared');
        
        // Also clear persistent cache
        try {
            const os = require('os');
            const cacheFile = path.join(os.homedir(), '.blocksmiths', 'java-cache.json');
            fs.removeSync(cacheFile);
            console.log('[JAVA] Persistent cache cleared');
        } catch (error) {
            // Ignore errors
        }
    }

    /**
     * Validate Java installation
     */
    async validateJava(javaPath) {
        try {
            // Check if file exists
            if (!await fs.pathExists(javaPath)) {
                return false;
            }

            // Try to run java -version
            await execAsync(`"${javaPath}" -version`);
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Singleton instance
const javaDetector = new JavaDetector();

module.exports = javaDetector;

