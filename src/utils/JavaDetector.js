const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

/**
 * ENHANCED JAVA DETECTOR
 * Based on TLegacy and XLauncher analysis
 * 
 * Features:
 * - Automatic Java detection
 * - Architecture detection (x64, arm64)
 * - Version validation
 * - Caching system
 * - Error handling
 * - Cross-platform support
 */
class JavaDetector {
    constructor() {
        this.commonPaths = this.getCommonJavaPaths();
        this.detectedJavas = new Map();
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Get common Java installation paths for current platform
     */
    getCommonJavaPaths() {
        if (process.platform === 'win32') {
            return [
                'C:\\Program Files\\Java',
                'C:\\Program Files (x86)\\Java',
                'C:\\Program Files\\Eclipse Adoptium',
                'C:\\Program Files\\Microsoft\\jdk-11.0.12.7-hotspot',
                'C:\\Program Files\\Microsoft\\jdk-17.0.2.8-hotspot',
                'C:\\Program Files\\Microsoft\\jdk-21.0.1.12-hotspot',
                'C:\\Program Files\\OpenJDK',
                'C:\\Program Files\\Amazon Corretto',
                'C:\\Program Files\\Zulu'
            ];
        } else if (process.platform === 'darwin') {
            return [
                '/Library/Java/JavaVirtualMachines',
                '/System/Library/Java/JavaVirtualMachines',
                '/usr/lib/jvm',
                '/opt/homebrew/Cellar/openjdk',
                '/opt/homebrew/Cellar/temurin',
                '/opt/homebrew/Cellar/amazon-corretto'
            ];
        } else {
            return [
                '/usr/lib/jvm',
                '/usr/lib/java',
                '/opt/java',
                '/usr/local/java',
                '/opt/openjdk',
                '/opt/temurin',
                '/opt/amazon-corretto'
            ];
        }
    }

    /**
     * Detect all Java installations
     */
    async detectJava() {
        console.log('[JAVA] Detecting Java installations...');
        const javas = [];
        
        // Check cache first
        const cachedJavas = this.getCachedJavas();
        if (cachedJavas.length > 0) {
            console.log(`[JAVA] Found ${cachedJavas.length} cached Java installations`);
            return cachedJavas;
        }
        
        for (const basePath of this.commonPaths) {
            try {
                const javaPaths = await this.findJavaInPath(basePath);
                for (const javaPath of javaPaths) {
                    const javaInfo = await this.validateJava(javaPath);
                    if (javaInfo) {
                        javas.push(javaInfo);
                        this.detectedJavas.set(javaPath, javaInfo);
                        this.cacheJava(javaPath, javaInfo);
                    }
                }
            } catch (error) {
                console.warn(`[JAVA] Error scanning ${basePath}:`, error.message);
            }
        }
        
        console.log(`[JAVA] Found ${javas.length} Java installations`);
        return javas;
    }

    /**
     * Find Java executables in a directory
     */
    async findJavaInPath(basePath) {
        const javaPaths = [];
        
        try {
            if (!fs.existsSync(basePath)) {
                return javaPaths;
            }
            
            const entries = await fs.readdir(basePath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const javaPath = this.findJavaExecutable(path.join(basePath, entry.name));
                    if (javaPath) {
                        javaPaths.push(javaPath);
                    }
                }
            }
        } catch (error) {
            // Path doesn't exist or no permission
        }
        
        return javaPaths;
    }

    /**
     * Find Java executable in a Java home directory
     */
    findJavaExecutable(javaHome) {
        const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
        const possiblePaths = [
            path.join(javaHome, 'bin', exeName),
            path.join(javaHome, 'jre', 'bin', exeName),
            path.join(javaHome, 'Contents', 'Home', 'bin', exeName),
            path.join(javaHome, 'jre', 'Contents', 'Home', 'bin', exeName)
        ];
        
        for (const javaPath of possiblePaths) {
            if (fs.existsSync(javaPath)) {
                return javaPath;
            }
        }
        
        return null;
    }

    /**
     * Validate Java installation and get info
     */
    async validateJava(javaPath) {
        try {
            const result = await this.execJavaVersion(javaPath);
            if (result.success) {
                const javaInfo = {
                    path: javaPath,
                    version: result.version,
                    majorVersion: result.majorVersion,
                    architecture: result.architecture,
                    valid: true,
                    detectedAt: Date.now()
                };
                
                console.log(`[JAVA] Validated Java ${result.version} at ${javaPath}`);
                return javaInfo;
            }
        } catch (error) {
            console.warn(`[JAVA] Invalid Java at ${javaPath}:`, error.message);
        }
        
        return null;
    }

    /**
     * Execute java -version and parse output
     */
    async execJavaVersion(javaPath) {
        return new Promise((resolve) => {
            const process = spawn(javaPath, ['-version'], { stdio: 'pipe' });
            let stderr = '';
            let stdout = '';
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    const output = stderr || stdout;
                    const versionMatch = output.match(/version "([^"]+)"/);
                    if (versionMatch) {
                        const version = versionMatch[1];
                        const majorVersion = this.parseMajorVersion(version);
                        const architecture = this.detectArchitecture(output);
                        
                        resolve({
                            success: true,
                            version,
                            majorVersion,
                            architecture
                        });
                    } else {
                        resolve({ success: false });
                    }
                } else {
                    resolve({ success: false });
                }
            });
            
            process.on('error', () => {
                resolve({ success: false });
            });
        });
    }

    /**
     * Parse major version from version string
     */
    parseMajorVersion(version) {
        const parts = version.split('.');
        if (parts[0] === '1') {
            // Java 8 and earlier: 1.8.0 -> 8
            return parseInt(parts[1]) || 8;
        } else {
            // Java 9+: 17.0.1 -> 17
            return parseInt(parts[0]) || 17;
        }
    }

    /**
     * Detect Java architecture from version output
     */
    detectArchitecture(output) {
        if (output.includes('64-Bit')) return 'x64';
        if (output.includes('32-Bit')) return 'x32';
        if (output.includes('aarch64')) return 'arm64';
        if (output.includes('arm64')) return 'arm64';
        if (output.includes('ARM64')) return 'arm64';
        return 'x64'; // Default
    }

    /**
     * Get best Java for Minecraft version
     */
    async getBestJava(minecraftVersion = '1.20.1') {
        const javas = await this.detectJava();
        if (javas.length === 0) {
            return null;
        }
        
        // Filter by architecture
        const systemArch = process.arch;
        const compatibleJavas = javas.filter(java => 
            java.architecture === systemArch || java.architecture === 'x64'
        );
        
        if (compatibleJavas.length === 0) {
            return javas[0]; // Fallback to any Java
        }
        
        // Prefer Java 17+ for modern versions
        const modernJavas = compatibleJavas.filter(java => java.majorVersion >= 17);
        if (modernJavas.length > 0) {
            // Sort by version (newest first)
            modernJavas.sort((a, b) => b.majorVersion - a.majorVersion);
            return modernJavas[0];
        }
        
        // Fallback to highest version
        compatibleJavas.sort((a, b) => b.majorVersion - a.majorVersion);
        return compatibleJavas[0];
    }

    /**
     * Cache Java information
     */
    cacheJava(javaPath, javaInfo) {
        this.cache.set(javaPath, {
            ...javaInfo,
            cachedAt: Date.now()
        });
    }

    /**
     * Get cached Java installations
     */
    getCachedJavas() {
        const now = Date.now();
        const cachedJavas = [];
        
        for (const [javaPath, javaInfo] of this.cache.entries()) {
            if (now - javaInfo.cachedAt < this.cacheTimeout) {
                cachedJavas.push(javaInfo);
            } else {
                this.cache.delete(javaPath);
            }
        }
        
        return cachedJavas;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.detectedJavas.clear();
        console.log('[JAVA] Cache cleared');
    }

    /**
     * Get Java statistics
     */
    getStats() {
        return {
            cachedJavas: this.cache.size,
            detectedJavas: this.detectedJavas.size,
            commonPaths: this.commonPaths.length
        };
    }
}

module.exports = JavaDetector;