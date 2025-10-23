const { app } = require('electron');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const API_BASE = 'https://api.blocksmithslauncher.com';
const LOCAL_API = 'http://localhost:5000'; // For local development

class AnalyticsManager {
    constructor() {
        this.sessionId = null;
        this.heartbeatInterval = null;
        this.isInitialized = false;
        // Use production API URL
        this.API_URL = API_BASE;
        
        // Feature flag - disable if backend not ready
        this.ANALYTICS_ENABLED = process.env.ANALYTICS_ENABLED !== 'false'; // Default: enabled
    }
    
    /**
     * Initialize analytics system
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            this.sessionId = await this.getOrCreateSessionId();
            console.log('[ANALYTICS] Initialized with session:', this.sessionId.substring(0, 8) + '...');
            
            // Send initial heartbeat
            await this.sendHeartbeat();
            
            // Start heartbeat interval (every 5 minutes)
            this.startHeartbeat();
            
            this.isInitialized = true;
        } catch (error) {
            console.error('[ANALYTICS] Initialization failed:', error.message);
        }
    }
    
    /**
     * Get or create unique session ID
     */
    async getOrCreateSessionId() {
        const sessionFile = path.join(app.getPath('userData'), 'session.json');
        
        try {
            if (await fs.pathExists(sessionFile)) {
                const data = await fs.readJSON(sessionFile);
                if (data.sessionId) {
                    return data.sessionId;
                }
            }
        } catch (error) {
            console.error('[ANALYTICS] Failed to read session file:', error.message);
        }
        
        // Create new session ID
        const sessionId = crypto.randomUUID();
        const sessionData = {
            sessionId,
            createdAt: Date.now(),
            version: app.getVersion()
        };
        
        try {
            await fs.writeJSON(sessionFile, sessionData);
        } catch (error) {
            console.error('[ANALYTICS] Failed to save session file:', error.message);
        }
        
        return sessionId;
    }
    
    /**
     * Send heartbeat to server
     */
    async sendHeartbeat() {
        if (!this.sessionId) return;
        
        try {
            const heartbeatData = {
                sessionId: this.sessionId,
                launcherVersion: app.getVersion(),
                os: os.platform(),
                osVersion: os.release(),
                arch: os.arch(),
                locale: app.getLocale()
            };
            
            const response = await axios.post(
                `${this.API_URL}/api/launcher/heartbeat`,
                heartbeatData,
                { timeout: 10000 }
            );
            
            if (response.data.success) {
                console.log(`[ANALYTICS] Heartbeat sent successfully. Active users: ${response.data.activeUsers || 'N/A'}`);
            }
        } catch (error) {
            console.error('[ANALYTICS] Heartbeat failed:', error.message);
        }
    }
    
    /**
     * Start periodic heartbeat - WITH EXPONENTIAL BACKOFF
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatFailures = 0;
        this.maxFailures = 3;
        this.baseInterval = 5 * 60 * 1000; // 5 minutes
        
        const sendWithBackoff = async () => {
            try {
                await this.sendHeartbeat();
                this.heartbeatFailures = 0;
                
                // Schedule next heartbeat at normal interval
                this.scheduleNextHeartbeat(this.baseInterval);
            } catch (error) {
                this.heartbeatFailures++;
                console.error('[ANALYTICS] Heartbeat failed:', error.message);
                
                if (this.heartbeatFailures >= this.maxFailures) {
                    console.warn('[ANALYTICS] Too many failures, pausing heartbeat for 30 minutes');
                    this.scheduleNextHeartbeat(30 * 60 * 1000); // Pause for 30 minutes
                    this.heartbeatFailures = 0; // Reset after long pause
                } else {
                    // Exponential backoff: 30s, 60s, 120s
                    const backoff = Math.min(30000 * Math.pow(2, this.heartbeatFailures - 1), 120000);
                    console.log(`[ANALYTICS] Retrying in ${backoff/1000}s (attempt ${this.heartbeatFailures}/${this.maxFailures})`);
                    this.scheduleNextHeartbeat(backoff);
                }
            }
        };
        
        // Send initial heartbeat
        sendWithBackoff();
        
        console.log('[ANALYTICS] Heartbeat started (5 min interval with backoff)');
    }
    
    /**
     * Schedule next heartbeat
     */
    scheduleNextHeartbeat(delay) {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
        }
        
        this.heartbeatTimeout = setTimeout(async () => {
            try {
                await this.sendHeartbeat();
                this.heartbeatFailures = 0;
                this.scheduleNextHeartbeat(this.baseInterval);
            } catch (error) {
                this.heartbeatFailures++;
                
                if (this.heartbeatFailures >= this.maxFailures) {
                    this.scheduleNextHeartbeat(30 * 60 * 1000);
                    this.heartbeatFailures = 0;
                } else {
                    const backoff = Math.min(30000 * Math.pow(2, this.heartbeatFailures - 1), 120000);
                    this.scheduleNextHeartbeat(backoff);
                }
            }
        }, delay);
    }
    
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
        console.log('[ANALYTICS] Heartbeat stopped');
    }
    
    /**
     * Track custom event
     */
    async trackEvent(eventType, metadata = {}) {
        if (!this.sessionId) return;
        
        try {
            await axios.post(
                `${this.API_URL}/api/launcher/event`,
                {
                    sessionId: this.sessionId,
                    eventType,
                    metadata,
                    timestamp: Date.now()
                },
                { timeout: 10000 }
            );
            
            console.log(`[ANALYTICS] Event tracked: ${eventType}`);
        } catch (error) {
            console.error(`[ANALYTICS] Event tracking failed (${eventType}):`, error.message);
        }
    }
    
    /**
     * Track modpack installation
     */
    async trackModpackInstall(modpackId, modpackName, source = 'unknown') {
        await this.trackEvent('modpack_install', {
            modpackId,
            modpackName,
            source // 'blocksmiths' or 'modrinth'
        });
    }
    
    /**
     * Track modpack launch
     */
    async trackModpackLaunch(modpackId, modpackName) {
        await this.trackEvent('modpack_launch', {
            modpackId,
            modpackName
        });
    }
    
    /**
     * Track server join
     */
    async trackServerJoin(serverIp, serverName = null) {
        await this.trackEvent('server_join', {
            serverIp,
            serverName
        });
    }
    
    /**
     * Track playtime update
     */
    async trackPlaytime(modpackId, modpackName, seconds) {
        await this.trackEvent('playtime_update', {
            modpackId,
            modpackName,
            seconds
        });
    }
    
    /**
     * Track launcher download (for new installations)
     */
    async trackLauncherDownload() {
        await this.trackEvent('launcher_download', {
            version: app.getVersion(),
            platform: os.platform()
        });
    }
    
    /**
     * Cleanup on app quit
     */
    async cleanup() {
        this.stopHeartbeat();
        
        // Send final heartbeat with exit event
        if (this.sessionId) {
            try {
                await this.trackEvent('launcher_exit', {
                    uptime: process.uptime()
                });
            } catch (error) {
                console.error('[ANALYTICS] Cleanup failed:', error.message);
            }
        }
    }
}

// Export singleton instance
module.exports = new AnalyticsManager();

