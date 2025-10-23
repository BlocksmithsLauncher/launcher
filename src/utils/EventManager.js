/**
 * Event Manager
 * Manages event listeners with automatic cleanup to prevent memory leaks
 */

class EventManager {
    constructor() {
        this.listeners = [];
        this.maxListeners = 100; // Safety limit
    }

    /**
     * Register an event listener with automatic tracking
     * @param {EventEmitter} emitter - The event emitter
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @param {string} tag - Optional tag for debugging
     */
    on(emitter, event, handler, tag = 'unknown') {
        if (!emitter || typeof emitter.on !== 'function') {
            console.error('[EventManager] Invalid emitter provided');
            return null;
        }

        if (this.listeners.length >= this.maxListeners) {
            console.warn('[EventManager] Max listeners reached, cleaning up old ones');
            this.cleanupOldest(10);
        }

        // Wrap handler to track calls
        const wrappedHandler = (...args) => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`[EventManager] Error in handler for ${event}:`, error);
            }
        };

        // Register the listener
        emitter.on(event, wrappedHandler);

        // Track it
        const listenerId = `${tag}_${event}_${Date.now()}`;
        this.listeners.push({
            id: listenerId,
            emitter,
            event,
            handler: wrappedHandler,
            originalHandler: handler,
            tag,
            timestamp: Date.now()
        });

        console.log(`[EventManager] Registered: ${listenerId} (Total: ${this.listeners.length})`);
        return listenerId;
    }

    /**
     * Register a one-time event listener
     */
    once(emitter, event, handler, tag = 'unknown') {
        const wrappedHandler = (...args) => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`[EventManager] Error in once handler for ${event}:`, error);
            } finally {
                // Auto-cleanup after firing
                this.removeByEmitterAndEvent(emitter, event, wrappedHandler);
            }
        };

        emitter.once(event, wrappedHandler);

        const listenerId = `${tag}_${event}_once_${Date.now()}`;
        this.listeners.push({
            id: listenerId,
            emitter,
            event,
            handler: wrappedHandler,
            originalHandler: handler,
            tag,
            timestamp: Date.now(),
            once: true
        });

        return listenerId;
    }

    /**
     * Remove a specific listener by ID
     */
    removeById(listenerId) {
        const index = this.listeners.findIndex(l => l.id === listenerId);
        if (index === -1) return false;

        const listener = this.listeners[index];
        try {
            listener.emitter.removeListener(listener.event, listener.handler);
            this.listeners.splice(index, 1);
            console.log(`[EventManager] Removed: ${listenerId}`);
            return true;
        } catch (error) {
            console.error(`[EventManager] Error removing listener ${listenerId}:`, error);
            return false;
        }
    }

    /**
     * Remove listener by emitter and event
     */
    removeByEmitterAndEvent(emitter, event, handler = null) {
        const toRemove = this.listeners.filter(l => 
            l.emitter === emitter && 
            l.event === event &&
            (handler === null || l.handler === handler)
        );

        toRemove.forEach(listener => {
            this.removeById(listener.id);
        });

        return toRemove.length;
    }

    /**
     * Remove all listeners for a specific tag
     */
    removeByTag(tag) {
        const toRemove = this.listeners.filter(l => l.tag === tag);
        
        toRemove.forEach(listener => {
            try {
                listener.emitter.removeListener(listener.event, listener.handler);
            } catch (error) {
                console.error(`[EventManager] Error removing ${listener.id}:`, error);
            }
        });

        this.listeners = this.listeners.filter(l => l.tag !== tag);
        console.log(`[EventManager] Removed ${toRemove.length} listeners with tag: ${tag}`);
        
        return toRemove.length;
    }

    /**
     * Remove all listeners from a specific emitter
     */
    removeByEmitter(emitter) {
        const toRemove = this.listeners.filter(l => l.emitter === emitter);
        
        toRemove.forEach(listener => {
            try {
                listener.emitter.removeListener(listener.event, listener.handler);
            } catch (error) {
                console.error(`[EventManager] Error removing listener:`, error);
            }
        });

        this.listeners = this.listeners.filter(l => l.emitter !== emitter);
        console.log(`[EventManager] Removed ${toRemove.length} listeners from emitter`);
        
        return toRemove.length;
    }

    /**
     * Cleanup oldest listeners (FIFO)
     */
    cleanupOldest(count = 10) {
        // Sort by timestamp (oldest first)
        const sorted = [...this.listeners].sort((a, b) => a.timestamp - b.timestamp);
        const toRemove = sorted.slice(0, count);

        toRemove.forEach(listener => {
            this.removeById(listener.id);
        });

        console.log(`[EventManager] Cleaned up ${toRemove.length} oldest listeners`);
    }

    /**
     * Remove all listeners
     */
    removeAll() {
        console.log(`[EventManager] Removing all ${this.listeners.length} listeners`);
        
        this.listeners.forEach(listener => {
            try {
                listener.emitter.removeListener(listener.event, listener.handler);
            } catch (error) {
                // Ignore errors during cleanup
            }
        });

        const count = this.listeners.length;
        this.listeners = [];
        
        return count;
    }

    /**
     * Get statistics
     */
    getStats() {
        const byTag = {};
        const byEvent = {};

        this.listeners.forEach(listener => {
            byTag[listener.tag] = (byTag[listener.tag] || 0) + 1;
            byEvent[listener.event] = (byEvent[listener.event] || 0) + 1;
        });

        return {
            total: this.listeners.length,
            byTag,
            byEvent,
            oldest: this.listeners.length > 0 
                ? new Date(Math.min(...this.listeners.map(l => l.timestamp)))
                : null
        };
    }

    /**
     * Log current status
     */
    logStatus() {
        const stats = this.getStats();
        console.log('[EventManager] Status:', {
            total: stats.total,
            tags: Object.keys(stats.byTag).length,
            events: Object.keys(stats.byEvent).length
        });
        console.log('[EventManager] By Tag:', stats.byTag);
        console.log('[EventManager] By Event:', stats.byEvent);
    }
}

module.exports = EventManager;

