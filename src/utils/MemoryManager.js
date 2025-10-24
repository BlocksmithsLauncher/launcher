const EventEmitter = require('events');

/**
 * MEMORY MANAGER
 * Prevents memory leaks by tracking intervals, timeouts, and event listeners
 * Based on TLegacy and XLauncher analysis
 */
class MemoryManager extends EventEmitter {
    constructor() {
        super();
        this.intervals = new Set();
        this.timeouts = new Set();
        this.eventListeners = new Map();
        this.resources = new Set();
        this.isDestroyed = false;
        
        console.log('[MEMORY] MemoryManager initialized');
    }

    /**
     * Create tracked interval
     */
    setInterval(callback, delay) {
        if (this.isDestroyed) {
            console.warn('[MEMORY] Cannot create interval after destruction');
            return null;
        }
        
        const id = setInterval(callback, delay);
        this.intervals.add(id);
        console.log(`[MEMORY] Created interval ${id}`);
        return id;
    }

    /**
     * Clear tracked interval
     */
    clearInterval(id) {
        if (this.intervals.has(id)) {
            clearInterval(id);
            this.intervals.delete(id);
            console.log(`[MEMORY] Cleared interval ${id}`);
        }
    }

    /**
     * Create tracked timeout
     */
    setTimeout(callback, delay) {
        if (this.isDestroyed) {
            console.warn('[MEMORY] Cannot create timeout after destruction');
            return null;
        }
        
        const id = setTimeout(callback, delay);
        this.timeouts.add(id);
        console.log(`[MEMORY] Created timeout ${id}`);
        return id;
    }

    /**
     * Clear tracked timeout
     */
    clearTimeout(id) {
        if (this.timeouts.has(id)) {
            clearTimeout(id);
            this.timeouts.delete(id);
            console.log(`[MEMORY] Cleared timeout ${id}`);
        }
    }

    /**
     * Add tracked event listener
     */
    addEventListener(target, event, listener, options = {}) {
        if (this.isDestroyed) {
            console.warn('[MEMORY] Cannot add event listener after destruction');
            return;
        }
        
        target.addEventListener(event, listener, options);
        
        if (!this.eventListeners.has(target)) {
            this.eventListeners.set(target, new Set());
        }
        
        this.eventListeners.get(target).add({ event, listener, options });
        console.log(`[MEMORY] Added event listener for ${event} on ${target.constructor.name}`);
    }

    /**
     * Remove tracked event listener
     */
    removeEventListener(target, event, listener, options = {}) {
        if (this.eventListeners.has(target)) {
            const listeners = this.eventListeners.get(target);
            listeners.delete({ event, listener, options });
            
            if (listeners.size === 0) {
                this.eventListeners.delete(target);
            }
        }
        
        target.removeEventListener(event, listener, options);
        console.log(`[MEMORY] Removed event listener for ${event} on ${target.constructor.name}`);
    }

    /**
     * Add tracked resource
     */
    addResource(resource) {
        if (this.isDestroyed) {
            console.warn('[MEMORY] Cannot add resource after destruction');
            return;
        }
        
        this.resources.add(resource);
        console.log(`[MEMORY] Added resource: ${resource.constructor.name}`);
    }

    /**
     * Remove tracked resource
     */
    removeResource(resource) {
        this.resources.delete(resource);
        console.log(`[MEMORY] Removed resource: ${resource.constructor.name}`);
    }

    /**
     * Get memory usage statistics
     */
    getStats() {
        return {
            intervals: this.intervals.size,
            timeouts: this.timeouts.size,
            eventListeners: this.eventListeners.size,
            resources: this.resources.size,
            isDestroyed: this.isDestroyed
        };
    }

    /**
     * Cleanup all tracked resources
     */
    cleanup() {
        if (this.isDestroyed) {
            console.warn('[MEMORY] Already destroyed');
            return;
        }
        
        console.log('[MEMORY] Starting cleanup...');
        
        // Clear all intervals
        this.intervals.forEach(id => {
            clearInterval(id);
            console.log(`[MEMORY] Cleared interval ${id}`);
        });
        this.intervals.clear();
        
        // Clear all timeouts
        this.timeouts.forEach(id => {
            clearTimeout(id);
            console.log(`[MEMORY] Cleared timeout ${id}`);
        });
        this.timeouts.clear();
        
        // Remove all event listeners
        this.eventListeners.forEach((listeners, target) => {
            listeners.forEach(({ event, listener, options }) => {
                target.removeEventListener(event, listener, options);
                console.log(`[MEMORY] Removed event listener for ${event} on ${target.constructor.name}`);
            });
        });
        this.eventListeners.clear();
        
        // Cleanup resources
        this.resources.forEach(resource => {
            if (resource && typeof resource.cleanup === 'function') {
                try {
                    resource.cleanup();
                    console.log(`[MEMORY] Cleaned up resource: ${resource.constructor.name}`);
                } catch (error) {
                    console.error(`[MEMORY] Error cleaning up resource: ${error.message}`);
                }
            } else if (resource && typeof resource.destroy === 'function') {
                try {
                    resource.destroy();
                    console.log(`[MEMORY] Destroyed resource: ${resource.constructor.name}`);
                } catch (error) {
                    console.error(`[MEMORY] Error destroying resource: ${error.message}`);
                }
            }
        });
        this.resources.clear();
        
        this.isDestroyed = true;
        console.log('[MEMORY] Cleanup completed');
        
        this.emit('cleanup');
    }

    /**
     * Force cleanup (emergency)
     */
    forceCleanup() {
        console.log('[MEMORY] Force cleanup initiated');
        
        // Clear all intervals without logging
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        // Clear all timeouts without logging
        this.timeouts.forEach(id => clearTimeout(id));
        this.timeouts.clear();
        
        // Remove all event listeners without logging
        this.eventListeners.forEach((listeners, target) => {
            listeners.forEach(({ event, listener, options }) => {
                try {
                    target.removeEventListener(event, listener, options);
                } catch (error) {
                    // Ignore errors during force cleanup
                }
            });
        });
        this.eventListeners.clear();
        
        // Force cleanup resources
        this.resources.forEach(resource => {
            try {
                if (resource && typeof resource.cleanup === 'function') {
                    resource.cleanup();
                } else if (resource && typeof resource.destroy === 'function') {
                    resource.destroy();
                }
            } catch (error) {
                // Ignore errors during force cleanup
            }
        });
        this.resources.clear();
        
        this.isDestroyed = true;
        console.log('[MEMORY] Force cleanup completed');
    }
}

module.exports = MemoryManager;
