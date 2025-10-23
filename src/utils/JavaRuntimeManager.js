const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { app } = require('electron');

/**
 * JavaRuntimeManager - Downloads and manages bundled Java runtimes
 * Supports Java 8, 17, and 21 from Adoptium (Eclipse Temurin)
 */
class JavaRuntimeManager {
    constructor() {
        // Java runtimes directory (lazy initialization)
        this._runtimesDir = null;
        
        // Adoptium API endpoints for different Java versions
        this.adoptiumAPI = 'https://api.adoptium.net/v3';
        
        // Supported Java versions
        this.supportedVersions = {
            8: { major: 8, feature: '8' },
            17: { major: 17, feature: '17' },
            21: { major: 21, feature: '21' }
        };
        
        // Platform detection
        this.platform = this.detectPlatform();
        this.arch = this.detectArch();
        
        console.log(`[JAVA-RUNTIME] Platform: ${this.platform}, Arch: ${this.arch}`);
    }

    /**
     * Get runtimes directory (lazy initialization)
     * CRITICAL: Only call this after app.whenReady()!
     */
    getRuntimesDir() {
        if (!this._runtimesDir) {
            if (!app.isReady()) {
                throw new Error('[JAVA-RUNTIME] Cannot get runtimesDir before app is ready!');
            }
            this._runtimesDir = path.join(app.getPath('userData'), 'java-runtimes');
            console.log(`[JAVA-RUNTIME] Runtimes directory: ${this._runtimesDir}`);
        }
        return this._runtimesDir;
    }

    /**
     * Detect platform for Adoptium API
     */
    detectPlatform() {
        const platform = os.platform();
        switch (platform) {
            case 'win32': return 'windows';
            case 'darwin': return 'mac';
            case 'linux': return 'linux';
            default: return 'windows';
        }
    }

    /**
     * Detect architecture for Adoptium API
     */
    detectArch() {
        const arch = os.arch();
        switch (arch) {
            case 'x64': return 'x64';
            case 'ia32': return 'x86';
            case 'arm64': return 'aarch64';
            default: return 'x64';
        }
    }

    /**
     * Get Java runtime path for a specific version
     * Downloads if not present
     */
    async getJavaRuntime(majorVersion = 17) {
        try {
            console.log(`[JAVA-RUNTIME] Requesting Java ${majorVersion}`);
            
            // Check if already installed
            const installedPath = await this.getInstalledJavaPath(majorVersion);
            if (installedPath) {
                console.log(`[JAVA-RUNTIME] ✅ Java ${majorVersion} already installed: ${installedPath}`);
                
                // Validate it still works
                if (await this.validateJavaExecutable(installedPath)) {
                    return installedPath;
                } else {
                    console.warn(`[JAVA-RUNTIME] ⚠️ Installed Java ${majorVersion} is invalid, re-downloading...`);
                    await this.removeJavaRuntime(majorVersion);
                }
            }

            // Download and install
            console.log(`[JAVA-RUNTIME] 📥 Downloading Java ${majorVersion}...`);
            const downloadedPath = await this.downloadJavaRuntime(majorVersion);
            
            console.log(`[JAVA-RUNTIME] ✅ Java ${majorVersion} ready: ${downloadedPath}`);
            return downloadedPath;
            
        } catch (error) {
            console.error(`[JAVA-RUNTIME] ❌ Failed to get Java ${majorVersion}:`, error.message);
            throw new Error(`Java ${majorVersion} runtime indirilemedi: ${error.message}`);
        }
    }

    /**
     * Check if Java runtime is already installed
     */
    async getInstalledJavaPath(majorVersion) {
        const versionDir = path.join(this.getRuntimesDir(), `java-${majorVersion}`);
        
        if (!await fs.pathExists(versionDir)) {
            return null;
        }

        // Find java executable
        const javaExe = this.platform === 'windows' ? 'javaw.exe' : 'java';
        const possiblePaths = [
            path.join(versionDir, 'bin', javaExe),
            path.join(versionDir, 'jre', 'bin', javaExe),
            path.join(versionDir, 'Contents', 'Home', 'bin', javaExe) // macOS
        ];

        for (const javaPath of possiblePaths) {
            if (await fs.pathExists(javaPath)) {
                return javaPath;
            }
        }

        return null;
    }

    /**
     * Download Java runtime from Adoptium
     */
    async downloadJavaRuntime(majorVersion) {
        try {
            // Ensure runtimes directory exists
            await fs.ensureDir(this.getRuntimesDir());

            // Get download URL from Adoptium API
            const downloadInfo = await this.getAdoptiumDownloadInfo(majorVersion);
            if (!downloadInfo) {
                throw new Error(`Java ${majorVersion} için indirme bilgisi bulunamadı`);
            }

            console.log(`[JAVA-RUNTIME] Download URL: ${downloadInfo.url}`);
            console.log(`[JAVA-RUNTIME] Size: ${(downloadInfo.size / 1024 / 1024).toFixed(2)} MB`);

            // Download to temp directory
            const tmpDir = path.join(os.tmpdir(), 'blocksmiths-java');
            await fs.ensureDir(tmpDir);
            const tmpFile = path.join(tmpDir, `java-${majorVersion}.${downloadInfo.extension}`);

            // Download with progress
            await this.downloadFile(downloadInfo.url, tmpFile, (progress) => {
                if (progress % 10 === 0) { // Log every 10%
                    console.log(`[JAVA-RUNTIME] Download progress: ${progress}%`);
                }
            });

            console.log(`[JAVA-RUNTIME] ✅ Download complete, extracting...`);

            // Extract to runtimes directory
            const extractDir = path.join(this.getRuntimesDir(), `java-${majorVersion}`);
            await fs.ensureDir(extractDir);
            
            if (downloadInfo.extension === 'zip') {
                await this.extractZip(tmpFile, extractDir);
            } else if (downloadInfo.extension === 'tar.gz') {
                await this.extractTarGz(tmpFile, extractDir);
            }

            // Clean up temp file
            await fs.remove(tmpFile);

            console.log(`[JAVA-RUNTIME] ✅ Extraction complete`);

            // Find and return java executable path
            const javaPath = await this.getInstalledJavaPath(majorVersion);
            if (!javaPath) {
                throw new Error('Java executable bulunamadı (extraction sonrası)');
            }

            // Make executable on Unix systems
            if (this.platform !== 'windows') {
                await fs.chmod(javaPath, 0o755);
            }

            return javaPath;

        } catch (error) {
            console.error(`[JAVA-RUNTIME] Download/extract error:`, error);
            throw error;
        }
    }

    /**
     * Get download info from Adoptium API
     */
    async getAdoptiumDownloadInfo(majorVersion) {
        try {
            const featureVersion = this.supportedVersions[majorVersion]?.feature;
            if (!featureVersion) {
                throw new Error(`Unsupported Java version: ${majorVersion}`);
            }

            // Adoptium API endpoint for latest release
            const apiUrl = `${this.adoptiumAPI}/assets/latest/${featureVersion}/hotspot`;
            
            console.log(`[JAVA-RUNTIME] Fetching from Adoptium API: ${apiUrl}`);
            
            const response = await axios.get(apiUrl, {
                params: {
                    architecture: this.arch,
                    image_type: 'jre', // JRE is smaller than JDK
                    os: this.platform,
                    vendor: 'eclipse'
                },
                timeout: 30000
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('No releases found from Adoptium API');
            }

            // Get first matching release
            const release = response.data[0];
            const binary = release.binary;
            const pkg = binary.package;

            return {
                url: pkg.link,
                size: pkg.size,
                checksum: pkg.checksum,
                extension: pkg.name.endsWith('.zip') ? 'zip' : 'tar.gz',
                version: release.version.semver
            };

        } catch (error) {
            console.error(`[JAVA-RUNTIME] Adoptium API error:`, error.message);
            
            // Fallback to direct download URLs (hardcoded for reliability)
            return this.getFallbackDownloadInfo(majorVersion);
        }
    }

    /**
     * Fallback download URLs (in case Adoptium API fails)
     */
    getFallbackDownloadInfo(majorVersion) {
        console.log(`[JAVA-RUNTIME] Using fallback download URLs`);
        
        const baseUrl = 'https://github.com/adoptium/temurin';
        const platform = this.platform;
        const arch = this.arch;

        // Hardcoded direct download links (updated periodically)
        const fallbackUrls = {
            8: {
                windows: {
                    x64: 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u392-b08/OpenJDK8U-jre_x64_windows_hotspot_8u392b08.zip'
                }
            },
            17: {
                windows: {
                    x64: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_windows_hotspot_17.0.9_9.zip'
                },
                linux: {
                    x64: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.9%2B9/OpenJDK17U-jre_x64_linux_hotspot_17.0.9_9.tar.gz'
                }
            },
            21: {
                windows: {
                    x64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.1%2B12/OpenJDK21U-jre_x64_windows_hotspot_21.0.1_12.zip'
                },
                linux: {
                    x64: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.1%2B12/OpenJDK21U-jre_x64_linux_hotspot_21.0.1_12.tar.gz'
                }
            }
        };

        const url = fallbackUrls[majorVersion]?.[platform]?.[arch];
        if (!url) {
            throw new Error(`Fallback URL not available for Java ${majorVersion} on ${platform}-${arch}`);
        }

        return {
            url: url,
            size: 0, // Unknown
            extension: url.endsWith('.zip') ? 'zip' : 'tar.gz'
        };
    }

    /**
     * Download file with progress tracking
     */
    async downloadFile(url, destPath, progressCallback) {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 300000, // 5 minutes
            maxRedirects: 5
        });

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        const writer = fs.createWriteStream(destPath);

        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize > 0 && progressCallback) {
                const progress = Math.floor((downloadedSize / totalSize) * 100);
                progressCallback(progress);
            }
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });
    }

    /**
     * Extract ZIP archive
     */
    async extractZip(zipPath, destDir) {
        try {
            console.log(`[JAVA-RUNTIME] Extracting ZIP: ${zipPath} -> ${destDir}`);
            
            const zip = new AdmZip(zipPath);
            const entries = zip.getEntries();
            
            // Find root directory in archive (usually jdk-xxx or jre-xxx)
            let rootDir = null;
            for (const entry of entries) {
                if (entry.isDirectory) {
                    const parts = entry.entryName.split('/');
                    if (parts.length === 2 && parts[1] === '') {
                        rootDir = parts[0];
                        break;
                    }
                }
            }

            console.log(`[JAVA-RUNTIME] Archive root directory: ${rootDir || 'none'}`);

            // Extract all files
            zip.extractAllTo(destDir, true);

            // If there's a root directory, move contents up one level
            if (rootDir) {
                const rootPath = path.join(destDir, rootDir);
                const items = await fs.readdir(rootPath);
                
                for (const item of items) {
                    const srcPath = path.join(rootPath, item);
                    const destPath = path.join(destDir, item);
                    await fs.move(srcPath, destPath, { overwrite: true });
                }
                
                // Remove empty root directory
                await fs.remove(rootPath);
            }

            console.log(`[JAVA-RUNTIME] ✅ ZIP extraction complete`);
        } catch (error) {
            console.error(`[JAVA-RUNTIME] ZIP extraction error:`, error);
            throw error;
        }
    }

    /**
     * Extract TAR.GZ archive (for Linux/macOS)
     */
    async extractTarGz(tarPath, destDir) {
        return new Promise((resolve, reject) => {
            console.log(`[JAVA-RUNTIME] Extracting TAR.GZ: ${tarPath} -> ${destDir}`);
            
            const tar = require('tar');
            
            tar.extract({
                file: tarPath,
                cwd: destDir,
                strip: 1 // Remove root directory from archive
            })
            .then(() => {
                console.log(`[JAVA-RUNTIME] ✅ TAR.GZ extraction complete`);
                resolve();
            })
            .catch((error) => {
                console.error(`[JAVA-RUNTIME] TAR.GZ extraction error:`, error);
                reject(error);
            });
        });
    }

    /**
     * Validate Java executable
     */
    async validateJavaExecutable(javaPath) {
        try {
            return new Promise((resolve) => {
                const proc = spawn(javaPath, ['-version'], {
                    windowsHide: true
                });

                let hasOutput = false;

                proc.stderr.on('data', () => {
                    hasOutput = true;
                });

                proc.on('close', (code) => {
                    resolve(hasOutput && code === 0);
                });

                proc.on('error', () => {
                    resolve(false);
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    proc.kill();
                    resolve(false);
                }, 5000);
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * Remove Java runtime
     */
    async removeJavaRuntime(majorVersion) {
        const versionDir = path.join(this.getRuntimesDir(), `java-${majorVersion}`);
        if (await fs.pathExists(versionDir)) {
            console.log(`[JAVA-RUNTIME] Removing Java ${majorVersion}: ${versionDir}`);
            await fs.remove(versionDir);
        }
    }

    /**
     * Get all installed Java runtimes
     */
    async getInstalledRuntimes() {
        const runtimes = [];
        
        for (const version of Object.keys(this.supportedVersions)) {
            const javaPath = await this.getInstalledJavaPath(parseInt(version));
            if (javaPath) {
                runtimes.push({
                    version: parseInt(version),
                    path: javaPath
                });
            }
        }

        return runtimes;
    }

    /**
     * Determine required Java version for Minecraft version
     */
    getRequiredJavaVersion(minecraftVersion) {
        // Parse Minecraft version
        const versionParts = minecraftVersion.split('.');
        const major = parseInt(versionParts[0]);
        const minor = parseInt(versionParts[1] || 0);

        // Minecraft version -> Java version mapping
        if (major === 1) {
            if (minor >= 18) {
                return 17; // 1.18+ requires Java 17
            } else if (minor >= 17) {
                return 16; // 1.17 requires Java 16 (use 17)
            } else {
                return 8; // 1.16 and below use Java 8
            }
        }

        // Default to Java 17 for unknown versions
        return 17;
    }

    /**
     * Get best Java for Minecraft version
     */
    async getBestJavaForMinecraft(minecraftVersion) {
        const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);
        console.log(`[JAVA-RUNTIME] Minecraft ${minecraftVersion} requires Java ${requiredVersion}`);
        
        // Try to get required version
        try {
            return await this.getJavaRuntime(requiredVersion);
        } catch (error) {
            console.error(`[JAVA-RUNTIME] Failed to get Java ${requiredVersion}, trying fallback...`);
            
            // Fallback: try Java 17 (most compatible)
            if (requiredVersion !== 17) {
                try {
                    return await this.getJavaRuntime(17);
                } catch (fallbackError) {
                    console.error(`[JAVA-RUNTIME] Fallback to Java 17 also failed`);
                    throw new Error(`Java ${requiredVersion} veya Java 17 indirilemedi`);
                }
            }
            
            throw error;
        }
    }

    /**
     * Preload common Java versions (background task)
     */
    async preloadCommonVersions() {
        console.log(`[JAVA-RUNTIME] Preloading common Java versions in background...`);
        
        // Preload Java 17 (most common)
        try {
            await this.getJavaRuntime(17);
            console.log(`[JAVA-RUNTIME] ✅ Java 17 preloaded`);
        } catch (error) {
            console.error(`[JAVA-RUNTIME] Failed to preload Java 17:`, error.message);
        }

        // Preload Java 8 (for older versions)
        try {
            await this.getJavaRuntime(8);
            console.log(`[JAVA-RUNTIME] ✅ Java 8 preloaded`);
        } catch (error) {
            console.error(`[JAVA-RUNTIME] Failed to preload Java 8:`, error.message);
        }
    }
}

// Singleton instance
const javaRuntimeManager = new JavaRuntimeManager();

module.exports = javaRuntimeManager;
