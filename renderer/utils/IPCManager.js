/**
 * IPC Manager
 * Manages IPC renderer listeners with automatic cleanup to prevent memory leaks
 */

const { ipcRenderer } = require('electron');

class IPCManager {
    constructor() {
        this.listeners = new Map();
        this.setupCleanup();
    }

    /**
     * Register an IPC listener with automatic tracking
     */
    on(channel, handler) {
        // Remove old listener if exists
        this.off(channel);
        
        // Wrap handler for error catching
        const wrappedHandler = (...args) => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`[IPC] Error in handler for ${channel}:`, error);
            }
        };
        
        ipcRenderer.on(channel, wrappedHandler);
        this.listeners.set(channel, wrappedHandler);
        
        console.log(`[IPC] Registered: ${channel} (Total: ${this.listeners.size})`);
    }

    /**
     * Register a one-time IPC listener
     */
    once(channel, handler) {
        const wrappedHandler = (...args) => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`[IPC] Error in once handler for ${channel}:`, error);
            } finally {
                this.listeners.delete(channel);
            }
        };
        
        ipcRenderer.once(channel, wrappedHandler);
        this.listeners.set(channel, wrappedHandler);
        
        console.log(`[IPC] Registered once: ${channel}`);
    }

    /**
     * Remove a specific listener
     */
    off(channel) {
        const handler = this.listeners.get(channel);
        if (handler) {
            ipcRenderer.removeListener(channel, handler);
            this.listeners.delete(channel);
            console.log(`[IPC] Removed: ${channel}`);
            return true;
        }
        return false;
    }

    /**
     * Invoke IPC (no cleanup needed for invoke)
     */
    async invoke(channel, ...args) {
        try {
            return await ipcRenderer.invoke(channel, ...args);
        } catch (error) {
            console.error(`[IPC] Invoke error for ${channel}:`, error);
            throw error;
        }
    }

    /**
     * Send IPC (no cleanup needed for send)
     */
    send(channel, ...args) {
        try {
            ipcRenderer.send(channel, ...args);
        } catch (error) {
            console.error(`[IPC] Send error for ${channel}:`, error);
        }
    }

    /**
     * Remove all listeners
     */
    removeAll() {
        console.log(`[IPC] Removing all ${this.listeners.size} listeners`);
        
        this.listeners.forEach((handler, channel) => {
            try {
                ipcRenderer.removeListener(channel, handler);
            } catch (error) {
                console.error(`[IPC] Error removing ${channel}:`, error);
            }
        });
        
        const count = this.listeners.size;
        this.listeners.clear();
        
        return count;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            total: this.listeners.size,
            channels: Array.from(this.listeners.keys())
        };
    }

    /**
     * Log current status
     */
    logStatus() {
        const stats = this.getStats();
        console.log('[IPC] Status:', {
            total: stats.total,
            channels: stats.channels
        });
    }

    /**
     * Setup automatic cleanup on page unload
     */
    setupCleanup() {
        window.addEventListener('beforeunload', () => {
            console.log('[IPC] Page unloading, cleaning up listeners...');
            this.removeAll();
        });

        // Also cleanup on visibility change (when window is hidden for long)
        let hiddenTimer = null;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Set timer to cleanup if hidden for more than 5 minutes
                hiddenTimer = setTimeout(() => {
                    console.log('[IPC] Window hidden for 5min, cleaning up...');
                    this.removeAll();
                }, 5 * 60 * 1000);
            } else {
                // Cancel cleanup if window becomes visible again
                if (hiddenTimer) {
                    clearTimeout(hiddenTimer);
                    hiddenTimer = null;
                }
            }
        });
    }
}

// Create and export singleton instance
const ipcManager = new IPCManager();

// Make it globally accessible
window.ipcManager = ipcManager;

module.exports = ipcManager;

