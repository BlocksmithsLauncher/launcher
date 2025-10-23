const { app, dialog, shell } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const CURRENT_VERSION = app.getVersion(); // package.json'dan gelir
const API_BASE = 'https://api.blocksmithslauncher.com';

class LauncherUpdater {
    constructor() {
        this.updateCheckInterval = null;
        this.currentVersion = CURRENT_VERSION;
    }

    // Check for updates
    async checkForUpdates(silent = false) {
        try {
            console.log(`[UPDATER] Checking for updates... Current version: ${this.currentVersion}`);
            
            const updateData = await this.fetchUpdateInfo();
            
            if (!updateData || !updateData.updateAvailable) {
                console.log('[UPDATER] No updates available');
                if (!silent) {
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'Güncelleme',
                        message: 'Launcher güncel!',
                        detail: `Mevcut versiyon: ${this.currentVersion}`,
                        buttons: ['Tamam']
                    });
                }
                return null;
            }

            console.log('[UPDATER] Update available:', updateData.latestVersion);
            return updateData.latestVersion;
        } catch (error) {
            console.error('[UPDATER] Check update error:', error);
            if (!silent) {
                dialog.showMessageBox({
                    type: 'error',
                    title: 'Hata',
                    message: 'Güncelleme kontrolü başarısız',
                    detail: error.message,
                    buttons: ['Tamam']
                });
            }
            return null;
        }
    }

    // Fetch update info from API
    fetchUpdateInfo() {
        return new Promise((resolve, reject) => {
            const url = `${API_BASE}/api/launcher-versions/check-update?version=${this.currentVersion}`;
            
            // Use https module for HTTPS URLs
            const protocol = url.startsWith('https:') ? https : http;
            
            const req = protocol.get(url, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (error) {
                        console.error('[UPDATER] Parse error:', error.message);
                        reject(new Error('Invalid response from update server'));
                    }
                });
            }).on('error', (error) => {
                console.error('[UPDATER] Request error:', error.message);
                reject(error);
            });
            
            // Add timeout
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Update check timeout'));
            });
        });
    }

    // Prompt user to update
    async promptUpdate(versionInfo, mainWindow) {
        const isMandatory = versionInfo.isMandatory;
        
        const releaseNotes = versionInfo.releaseNotes 
            ? versionInfo.releaseNotes.join('\n• ')
            : 'Yeni özellikler ve iyileştirmeler';

        const message = isMandatory
            ? `Yeni bir zorunlu güncelleme mevcut!\n\nMevcut: ${this.currentVersion}\nYeni: ${versionInfo.version}\n\nLauncher'ı kullanmak için güncellemeniz gerekiyor.`
            : `Yeni bir güncelleme mevcut!\n\nMevcut: ${this.currentVersion}\nYeni: ${versionInfo.version}\n\nGüncellemek ister misiniz?`;

        const buttons = isMandatory ? ['Güncelle', 'Çık'] : ['Güncelle', 'Daha Sonra'];

        const result = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Launcher Güncellemesi',
            message: message,
            detail: `Yenilikler:\n• ${releaseNotes}`,
            buttons: buttons,
            defaultId: 0,
            cancelId: isMandatory ? 1 : 1,
            noLink: true
        });

        if (result.response === 0) {
            // User clicked "Güncelle"
            await this.downloadAndInstall(versionInfo, mainWindow);
        } else if (isMandatory && result.response === 1) {
            // User clicked "Çık" for mandatory update
            app.quit();
        }
        // If not mandatory and user clicked "Daha Sonra", do nothing
    }

    // Download and install update
    async downloadAndInstall(versionInfo, mainWindow) {
        try {
            // Get platform-specific version
            const platform = os.platform();
            let platformName;
            
            if (platform === 'win32') {
                platformName = 'windows';
            } else if (platform === 'darwin') {
                platformName = 'macos';
            } else {
                platformName = 'linux';
            }

            // Get download URL
            const downloadUrl = `${API_BASE}/api/launcher-versions/download/${versionInfo.id}`;
            
            // Show progress dialog
            const progressDialog = await dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Güncelleme İndiriliyor',
                message: 'Güncelleme indiriliyor, lütfen bekleyin...',
                detail: 'İndirme tamamlandığında yükleyici açılacak.',
                buttons: []
            });

            // Download file
            const downloadsPath = path.join(app.getPath('downloads'), `blocksmiths-launcher-${versionInfo.version}.exe`);
            
            await this.downloadFile(downloadUrl, downloadsPath, (progress) => {
                console.log(`[UPDATER] Download progress: ${progress}%`);
                // You could send this to renderer via IPC for a progress bar
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-download-progress', progress);
                }
            });

            console.log('[UPDATER] Download complete:', downloadsPath);

            // Show success message
            const result = await dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Güncelleme İndirildi',
                message: 'Güncelleme başarıyla indirildi!',
                detail: `Dosya konumu: ${downloadsPath}\n\nYükleyiciyi şimdi açmak ister misiniz?\n\nNot: Launcher kapatılacak ve yükleyici açılacaktır.`,
                buttons: ['Yükleyiciyi Aç', 'Daha Sonra'],
                defaultId: 0
            });

            if (result.response === 0) {
                // Open installer and quit
                await shell.openPath(downloadsPath);
                
                // Wait a bit for the installer to open
                setTimeout(() => {
                    app.quit();
                }, 1000);
            }

        } catch (error) {
            console.error('[UPDATER] Download/Install error:', error);
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Güncelleme Hatası',
                message: 'Güncelleme indirilirken bir hata oluştu',
                detail: error.message,
                buttons: ['Tamam']
            });
        }
    }

    // Download file with progress
    downloadFile(url, dest, progressCallback) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            
            // Use https for https:// URLs, http for http:// URLs
            const protocol = url.startsWith('https://') ? https : http;
            
            protocol.get(url, (response) => {
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const progress = Math.round((downloadedSize / totalSize) * 100);
                    if (progressCallback) {
                        progressCallback(progress);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlink(dest, () => {}); // Delete the file
                    reject(err);
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {}); // Delete the file
                reject(err);
            });
        });
    }

    // Start automatic update check (every 6 hours)
    startAutoUpdateCheck(mainWindow) {
        // Check on startup
        setTimeout(async () => {
            const update = await this.checkForUpdates(true); // Silent check
            if (update) {
                await this.promptUpdate(update, mainWindow);
            }
        }, 5000); // 5 seconds after launch

        // Check every 6 hours
        this.updateCheckInterval = setInterval(async () => {
            const update = await this.checkForUpdates(true);
            if (update) {
                await this.promptUpdate(update, mainWindow);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    // Stop automatic update check
    stopAutoUpdateCheck() {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
            this.updateCheckInterval = null;
        }
    }
}

module.exports = new LauncherUpdater();

