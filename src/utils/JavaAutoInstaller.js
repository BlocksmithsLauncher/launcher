const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { app, dialog } = require('electron');

/**
 * JAVA AUTO-INSTALLER
 * Adoptium JDK 21 otomatik kurulum sistemi
 * 
 * Features:
 * - Bundled MSI installer
 * - Silent installation
 * - User permission dialog
 * - Progress tracking
 * - Post-install verification
 */
class JavaAutoInstaller {
    constructor() {
        this.javaVersion = '21.0.9';
        this.javaVendor = 'Eclipse Adoptium';
        
        // MSI path (production build'de resources klasöründe)
        if (app.isPackaged) {
            this.msiPath = path.join(process.resourcesPath, 'java', 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.9_10.msi');
        } else {
            // Development mode
            this.msiPath = path.join(__dirname, '..', '..', '..', 'Java-windows', 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.9_10.msi');
        }
        
        // Java installation path (default)
        this.javaInstallPath = path.join('C:', 'Program Files', 'Eclipse Adoptium', 'jdk-21.0.9.10-hotspot');
        
        console.log('[JAVA-INSTALLER] Initialized');
        console.log('[JAVA-INSTALLER] MSI Path:', this.msiPath);
    }

    /**
     * Check if bundled MSI exists
     */
    async checkMSIExists() {
        try {
            const exists = await fs.pathExists(this.msiPath);
            if (exists) {
                const stats = await fs.stat(this.msiPath);
                const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`[JAVA-INSTALLER] ✅ MSI found: ${sizeMB}MB`);
                return true;
            } else {
                console.error('[JAVA-INSTALLER] ❌ MSI not found:', this.msiPath);
                return false;
            }
        } catch (error) {
            console.error('[JAVA-INSTALLER] Error checking MSI:', error);
            return false;
        }
    }

    /**
     * Show user permission dialog
     */
    async askUserPermission(mainWindow) {
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['Java 21 Kur', 'Daha Sonra', 'İptal'],
            defaultId: 0,
            cancelId: 2,
            title: 'Java Kurulumu Gerekli',
            message: 'Minecraft modpacklerini çalıştırmak için Java 21 gerekiyor.',
            detail: 
                'Blocksmiths Launcher, Eclipse Adoptium JDK 21\'i otomatik olarak kurabilir.\n\n' +
                '• Kurulum süresi: 2-3 dakika\n' +
                '• Disk alanı: ~300MB\n' +
                '• Tüm modpackler çalışacak\n\n' +
                'Java 21 şimdi kurulsun mu?',
            checkboxLabel: 'Bir daha sorma (otomatik kur)',
            checkboxChecked: false
        });
        
        return {
            install: result.response === 0,
            later: result.response === 1,
            autoInstall: result.checkboxChecked
        };
    }

    /**
     * Install Java silently using MSI
     */
    async installJava(progressCallback = null) {
        try {
            console.log('[JAVA-INSTALLER] Starting Java installation...');
            
            if (progressCallback) {
                progressCallback('Java 21 kurulumu başlatılıyor...');
            }
            
            // Check if MSI exists
            if (!await this.checkMSIExists()) {
                throw new Error('Java installer (MSI) bulunamadı');
            }
            
            if (progressCallback) {
                progressCallback('Java 21 kuruluyor... (Bu 2-3 dakika sürebilir)');
            }
            
            // Run MSI installer silently
            // /i = install, /quiet = silent, /norestart = no reboot
            const installArgs = [
                '/i',
                `"${this.msiPath}"`,
                '/quiet',
                '/norestart',
                `INSTALLDIR="${this.javaInstallPath}"`,
                '/L*V',
                `"${path.join(app.getPath('temp'), 'java-install.log')}"`
            ];
            
            console.log('[JAVA-INSTALLER] msiexec args:', installArgs.join(' '));
            
            // Execute MSI installer
            const result = await this.executeMSI(installArgs, progressCallback);
            
            if (result.success) {
                console.log('[JAVA-INSTALLER] ✅ Java installation completed');
                
                if (progressCallback) {
                    progressCallback('Java 21 başarıyla kuruldu!');
                }
                
                // Wait a bit for Windows to register the installation
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Verify installation
                const javaPath = await this.findInstalledJava();
                
                if (javaPath) {
                    console.log('[JAVA-INSTALLER] ✅ Java verified at:', javaPath);
                    return {
                        success: true,
                        javaPath: javaPath,
                        message: 'Java 21 başarıyla kuruldu!'
                    };
                } else {
                    console.warn('[JAVA-INSTALLER] ⚠️ Java installed but not found in expected path');
                    return {
                        success: true,
                        javaPath: null,
                        message: 'Java kuruldu ancak konumu tespit edilemedi. Lütfen launcher\'ı yeniden başlatın.'
                    };
                }
            } else {
                throw new Error(result.error || 'Java kurulumu başarısız');
            }
            
        } catch (error) {
            console.error('[JAVA-INSTALLER] Installation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute MSI installer
     */
    async executeMSI(args, progressCallback) {
        return new Promise((resolve) => {
            const msiexec = spawn('msiexec', args, {
                stdio: 'pipe',
                shell: true,
                windowsHide: true
            });
            
            let stdout = '';
            let stderr = '';
            
            msiexec.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            msiexec.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            // Progress updates every 5 seconds
            const progressInterval = setInterval(() => {
                if (progressCallback) {
                    progressCallback('Java 21 kuruluyor... Lütfen bekleyin...');
                }
            }, 5000);
            
            msiexec.on('close', (code) => {
                clearInterval(progressInterval);
                
                if (code === 0) {
                    console.log('[JAVA-INSTALLER] msiexec completed successfully');
                    resolve({ success: true });
                } else {
                    console.error('[JAVA-INSTALLER] msiexec failed with code:', code);
                    console.error('[JAVA-INSTALLER] stderr:', stderr);
                    resolve({ 
                        success: false, 
                        error: `Installation failed with code ${code}` 
                    });
                }
            });
            
            msiexec.on('error', (error) => {
                clearInterval(progressInterval);
                console.error('[JAVA-INSTALLER] msiexec error:', error);
                resolve({ 
                    success: false, 
                    error: error.message 
                });
            });
        });
    }

    /**
     * Find installed Java after installation
     */
    async findInstalledJava() {
        const possiblePaths = [
            // Default install path
            path.join(this.javaInstallPath, 'bin', 'java.exe'),
            
            // Alternative paths
            path.join('C:', 'Program Files', 'Eclipse Adoptium', 'jdk-21.0.9.10-hotspot', 'bin', 'java.exe'),
            path.join('C:', 'Program Files', 'Eclipse Adoptium', 'jdk-21', 'bin', 'java.exe'),
            path.join('C:', 'Program Files', 'Java', 'jdk-21.0.9', 'bin', 'java.exe'),
            
            // Search in Program Files
            ...(await this.searchProgramFiles())
        ];
        
        for (const javaPath of possiblePaths) {
            if (await fs.pathExists(javaPath)) {
                console.log('[JAVA-INSTALLER] Found Java at:', javaPath);
                return javaPath;
            }
        }
        
        console.warn('[JAVA-INSTALLER] Java not found in any expected path');
        return null;
    }

    /**
     * Search for Java in Program Files
     */
    async searchProgramFiles() {
        const javaExecutables = [];
        const programFiles = [
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Java',
            'C:\\Program Files\\OpenJDK'
        ];
        
        for (const baseDir of programFiles) {
            try {
                if (await fs.pathExists(baseDir)) {
                    const dirs = await fs.readdir(baseDir);
                    for (const dir of dirs) {
                        if (dir.includes('jdk-21') || dir.includes('21.0')) {
                            const javaPath = path.join(baseDir, dir, 'bin', 'java.exe');
                            if (await fs.pathExists(javaPath)) {
                                javaExecutables.push(javaPath);
                            }
                        }
                    }
                }
            } catch (error) {
                // Ignore errors
            }
        }
        
        return javaExecutables;
    }

    /**
     * Get auto-install preference
     */
    async getAutoInstallPreference() {
        try {
            const configPath = path.join(app.getPath('userData'), 'java-auto-install.json');
            if (await fs.pathExists(configPath)) {
                const config = await fs.readJson(configPath);
                return config.autoInstall === true;
            }
        } catch (error) {
            console.error('[JAVA-INSTALLER] Error reading preference:', error);
        }
        return false;
    }

    /**
     * Save auto-install preference
     */
    async saveAutoInstallPreference(autoInstall) {
        try {
            const configPath = path.join(app.getPath('userData'), 'java-auto-install.json');
            await fs.writeJson(configPath, { autoInstall });
            console.log('[JAVA-INSTALLER] Preference saved:', autoInstall);
        } catch (error) {
            console.error('[JAVA-INSTALLER] Error saving preference:', error);
        }
    }
}

module.exports = JavaAutoInstaller;

