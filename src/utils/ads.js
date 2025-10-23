const { shell } = require('electron');
const axios = require('axios');

/**
 * Banner Ad Manager for BlockSmiths Launcher
 * Displays custom banner ads from backend
 */

class AdManager {
    constructor() {
        this.apiUrl = process.env.BACKEND_API_URL || 'https://api.blocksmithslauncher.com';
        this.adsEnabled = true;
        this.activeBanners = new Map();
        this.trackingQueue = [];
        this.refreshInterval = null;
    }

    /**
     * Initialize ads in the renderer process
     */
    async initializeAds(mainWindow) {
        if (!mainWindow || !this.adsEnabled) return;

        // Clear existing interval to prevent duplicates
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        try {
            console.log('[ADS] Fetching banners from:', `${this.apiUrl}/api/banners/active`);
            
            // Fetch active banners from backend (backend returns 2 random banners)
            const response = await axios.get(`${this.apiUrl}/api/banners/active`, {
                timeout: 30000, // 30 second timeout (increased from 10)
                headers: {
                    'User-Agent': 'Blocksmiths-Launcher/1.0'
                },
                validateStatus: (status) => status < 500 // Accept any status < 500
            });
            
            console.log('[ADS] Response status:', response.status);
            console.log('[ADS] Response data:', response.data);
            
            if (response.data && response.data.success && response.data.banners) {
                const banners = response.data.banners;
                
                if (banners.length === 0) {
                    console.log('[ADS] No active banners available from backend');
                    this.showPlaceholder('admob-banner-1', mainWindow);
                    this.showPlaceholder('admob-banner-2', mainWindow);
                    return;
                }
                
                // Load banners into slots (random order from backend)
                if (banners[0]) {
                    this.loadBanner('admob-banner-1', banners[0], mainWindow);
                }
                if (banners[1]) {
                    this.loadBanner('admob-banner-2', banners[1], mainWindow);
                }

                console.log('[ADS] Successfully loaded', banners.length, 'banner(s)');
            } else {
                console.warn('[ADS] Invalid response format or no banners available');
                this.showPlaceholder('admob-banner-1', mainWindow);
                this.showPlaceholder('admob-banner-2', mainWindow);
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('[ADS] Request timeout - banner server took too long to respond');
            } else if (error.code === 'ECONNREFUSED') {
                console.error('[ADS] Connection refused - banner server is not reachable');
            } else {
                console.error('[ADS] Failed to load banners:', error.message);
            }
            
            // Show placeholder on error
            this.showPlaceholder('admob-banner-1', mainWindow);
            this.showPlaceholder('admob-banner-2', mainWindow);
        }

        // Refresh banners every 5 minutes for rotation
        this.refreshInterval = setInterval(() => {
            this.refreshAds(mainWindow);
        }, 5 * 60 * 1000);
    }

    /**
     * Load a banner in a specific container
     */
    loadBanner(containerId, banner, mainWindow) {
        if (!mainWindow) return;

        this.activeBanners.set(containerId, banner);

        // Track impression
        this.trackImpression(banner.id);

        mainWindow.webContents.executeJavaScript(`
            (function() {
                const container = document.getElementById('${containerId}');
                if (!container) {
                    console.warn('Banner container ${containerId} not found');
                    return;
                }

                // Clear existing content
                container.innerHTML = '';

                // Create banner element
                const bannerDiv = document.createElement('div');
                bannerDiv.className = 'banner-ad';
                bannerDiv.style.cssText = 'width:100%;height:250px;cursor:pointer;overflow:hidden;border-radius:8px;';
                
                const img = document.createElement('img');
                img.src = 'https://api.blocksmithslauncher.com${banner.imageUrl}';
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                img.alt = '${banner.name || 'Reklam'}';
                
                // Add loading timeout (30 seconds)
                let imageTimeout = setTimeout(() => {
                    console.error('Banner image load timeout:', img.src);
                    container.innerHTML = \`
                        <div class="ad-placeholder">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>Reklam yüklenemedi</span>
                            <small>Bağlantı zaman aşımına uğradı</small>
                        </div>
                    \`;
                }, 30000);
                
                img.onerror = function() {
                    clearTimeout(imageTimeout);
                    console.error('Failed to load banner image:', img.src);
                    container.innerHTML = \`
                        <div class="ad-placeholder">
                            <i class="fas fa-ad"></i>
                            <span>Reklam Alanı</span>
                            <small>Görsel yüklenemedi</small>
                        </div>
                    \`;
                };
                
                img.onload = function() {
                    clearTimeout(imageTimeout);
                    console.log('Banner image loaded successfully:', img.src);
                };
                
                bannerDiv.appendChild(img);
                container.appendChild(bannerDiv);

                // Add click handler
                bannerDiv.onclick = function() {
                    console.log('Banner clicked:', '${banner.id}', '${banner.targetUrl}');
                    // Use ipcRenderer directly since electronAPI might not be available
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('banner-click', { id: '${banner.id}', url: '${banner.targetUrl}' });
                };

                console.log('Banner loaded for ${containerId}:', '${banner.name}');
            })();
        `);
    }

    /**
     * Refresh ads (call periodically or after page changes)
     */
    async refreshAds(mainWindow) {
        if (!mainWindow || !this.adsEnabled) return;

        console.log('[ADS] Refreshing banners...');
        await this.initializeAds(mainWindow);
    }

    /**
     * Track banner impression
     */
    async trackImpression(bannerId) {
        try {
            await axios.post(`${this.apiUrl}/api/banners/${bannerId}/impression`);
        } catch (error) {
            console.error('[ADS] Failed to track impression:', error.message);
        }
    }

    /**
     * Track banner click
     */
    async trackClick(bannerId) {
        try {
            await axios.post(`${this.apiUrl}/api/banners/${bannerId}/click`);
        } catch (error) {
            console.error('[ADS] Failed to track click:', error.message);
        }
    }

    /**
     * Handle banner click (open URL in browser)
     */
    handleBannerClick(bannerId, url) {
        this.trackClick(bannerId);
        shell.openExternal(url);
    }

    /**
     * Enable/disable ads (Ads are always enabled)
     */
    setAdsEnabled(enabled) {
        this.adsEnabled = true; // Always enabled
    }

    /**
     * Show placeholder when banners can't be loaded
     */
    showPlaceholder(containerId, mainWindow) {
        if (!mainWindow) return;
        
        mainWindow.webContents.executeJavaScript(`
            (function() {
                const container = document.getElementById('${containerId}');
                if (!container) return;
                
                container.innerHTML = \`
                    <div class="ad-placeholder">
                        <i class="fas fa-ad"></i>
                        <span>Reklam Alanı</span>
                        <small>Yükleniyor...</small>
                    </div>
                \`;
            })();
        `);
    }

    /**
     * Check if ads are enabled (Always returns true)
     */
    areAdsEnabled() {
        return true;
    }
}

module.exports = new AdManager();
