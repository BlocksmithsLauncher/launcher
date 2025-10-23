// Launcher Utilities
class LauncherUtils {
    constructor() {
        this.isLaunching = false;
        this.currentProgress = null;
        
        // Event listeners setup
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Launch progress
        window.electronAPI.onLaunchProgress((progress) => {
            this.handleLaunchProgress(progress);
        });

        // Game closed
        window.electronAPI.onGameClosed((code) => {
            this.handleGameClosed(code);
        });

        // Launch error
        window.electronAPI.onLaunchError((error) => {
            this.handleLaunchError(error);
        });
    }

    async launchGame(profile, version = '1.20.4') {
        if (this.isLaunching) {
            this.showNotification('Oyun zaten başlatılıyor!', 'warning');
            return;
        }

        try {
            this.isLaunching = true;
            this.showLaunchProgress('Oyun başlatılıyor...', 0);

            const launchOptions = {
                version: version,
                username: profile.playerName || profile.name,
                authType: profile.authType || 'offline',
                maxMemory: profile.maxMemory || '4G',
                minMemory: profile.minMemory || '1G',
                windowWidth: profile.windowWidth || 1280,
                windowHeight: profile.windowHeight || 720,
                fullscreen: profile.fullscreen || false
            };

            console.log('Launching game with options:', launchOptions);

            const result = await window.electronAPI.launchGame(launchOptions);
            
            if (result.success) {
                this.showNotification('Minecraft başarıyla başlatıldı!', 'success');
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Launch failed:', error);
            this.showNotification(`Oyun başlatılamadı: ${error.message}`, 'error');
            this.hideLaunchProgress();
            this.isLaunching = false;
        }
    }

    async installVersion(version) {
        try {
            this.showLaunchProgress(`Minecraft ${version} indiriliyor...`, 0);

            const result = await window.electronAPI.installVersion(version);
            
            if (result.success) {
                this.showNotification(`Minecraft ${version} başarıyla kuruldu!`, 'success');
                this.hideLaunchProgress();
                return true;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Installation failed:', error);
            this.showNotification(`Kurulum başarısız: ${error.message}`, 'error');
            this.hideLaunchProgress();
            return false;
        }
    }

    async getAvailableVersions() {
        try {
            const result = await window.electronAPI.getAvailableVersions();
            
            if (result.success) {
                return result.versions;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Failed to get versions:', error);
            this.showNotification('Sürümler yüklenemedi', 'error');
            return [];
        }
    }

    async getInstalledVersions() {
        try {
            const result = await window.electronAPI.getInstalledVersions();
            
            if (result.success) {
                return result.versions;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Failed to get installed versions:', error);
            return [];
        }
    }

    async getSystemInfo() {
        try {
            const result = await window.electronAPI.getSystemInfo();
            
            if (result.success) {
                return result.info;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Failed to get system info:', error);
            return null;
        }
    }

    async authenticateMicrosoft() {
        try {
            this.showLaunchProgress('Microsoft hesabına giriş yapılıyor...', 0);

            const result = await window.electronAPI.authenticateMicrosoft();
            
            if (result.success) {
                this.showNotification('Microsoft hesabına başarıyla giriş yapıldı!', 'success');
                this.hideLaunchProgress();
                return result.auth;
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Microsoft authentication failed:', error);
            this.showNotification(`Microsoft girişi başarısız: ${error.message}`, 'error');
            this.hideLaunchProgress();
            return null;
        }
    }

    handleLaunchProgress(progress) {
        console.log('Launch progress:', progress);
        
        const percentage = Math.round((progress.current / progress.total) * 100);
        const message = `${progress.task}: ${progress.current}/${progress.total}`;
        
        this.showLaunchProgress(message, percentage);
    }

    handleGameClosed(code) {
        console.log('Game closed with code:', code);
        this.isLaunching = false;
        this.hideLaunchProgress();
        
        if (code === 0) {
            this.showNotification('Minecraft kapatıldı', 'info');
        } else {
            this.showNotification(`Minecraft beklenmedik şekilde kapandı (kod: ${code})`, 'warning');
        }
    }

    handleLaunchError(error) {
        console.error('Launch error:', error);
        this.isLaunching = false;
        this.hideLaunchProgress();
        this.showNotification(`Oyun hatası: ${error}`, 'error');
    }

    showLaunchProgress(message, percentage) {
        // Create or update progress overlay
        let overlay = document.getElementById('launch-progress-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'launch-progress-overlay';
            overlay.className = 'launch-progress-overlay';
            overlay.innerHTML = `
                <div class="progress-content">
                    <div class="progress-spinner">
                        <i class="fas fa-cube fa-spin"></i>
                    </div>
                    <div class="progress-text" id="progress-text">${message}</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-percentage" id="progress-percentage">${percentage}%</div>
                </div>
            `;
            document.body.appendChild(overlay);
        } else {
            document.getElementById('progress-text').textContent = message;
            document.getElementById('progress-fill').style.width = `${percentage}%`;
            document.getElementById('progress-percentage').textContent = `${percentage}%`;
        }

        overlay.style.display = 'flex';
    }

    hideLaunchProgress() {
        const overlay = document.getElementById('launch-progress-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add to notifications container
        let container = document.getElementById('notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications-container';
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }

        container.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            case 'info': 
            default: return 'info-circle';
        }
    }

    formatMemory(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}s ${minutes % 60}d ${seconds % 60}sn`;
        } else if (minutes > 0) {
            return `${minutes}d ${seconds % 60}sn`;
        } else {
            return `${seconds}sn`;
        }
    }
}

// Global launcher utils instance
window.launcherUtils = new LauncherUtils();
