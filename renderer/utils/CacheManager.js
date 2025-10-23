/**
 * Cache Manager
 * In-memory cache with TTL for API responses
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 60000; // 1 minute default
        this.maxSize = 100; // Max cache entries
        this.startCleanupInterval();
    }

    /**
     * Get from cache
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            console.log(`[CACHE] Expired: ${key}`);
            return null;
        }

        console.log(`[CACHE] HIT: ${key}`);
        entry.hits++;
        entry.lastAccessed = Date.now();
        return entry.data;
    }

    /**
     * Set cache entry
     */
    set(key, data, ttl = null) {
        // Check size limit
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        const actualTTL = ttl || this.defaultTTL;
        
        this.cache.set(key, {
            data,
            createdAt: Date.now(),
            expiresAt: Date.now() + actualTTL,
            lastAccessed: Date.now(),
            hits: 0,
            ttl: actualTTL
        });

        console.log(`[CACHE] SET: ${key} (TTL: ${actualTTL}ms)`);
    }

    /**
     * Check if key exists and is valid
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete cache entry
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            console.log(`[CACHE] DELETE: ${key}`);
        }
        return deleted;
    }

    /**
     * Clear all cache
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`[CACHE] CLEAR: Removed ${size} entries`);
    }

    /**
     * Evict least recently used entry
     */
    evictLRU() {
        let lruKey = null;
        let lruTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
            console.log(`[CACHE] LRU Evicted: ${lruKey}`);
        }
    }

    /**
     * Cleanup expired entries
     */
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[CACHE] Cleanup: Removed ${cleaned} expired entries`);
        }

        return cleaned;
    }

    /**
     * Start automatic cleanup interval - CPU OPTIMIZED
     */
    startCleanupInterval() {
        setInterval(() => {
            // Only cleanup if we have entries (CPU optimization)
            if (this.cache.size > 0) {
                this.cleanupExpired();
            }
        }, 5 * 60 * 1000); // Run every 5 minutes (CPU optimized from 1min)
    }

    /**
     * Get cache statistics
     */
    getStats() {
        let totalHits = 0;
        let totalSize = 0;
        const entries = [];

        for (const [key, entry] of this.cache.entries()) {
            totalHits += entry.hits;
            totalSize += JSON.stringify(entry.data).length;
            entries.push({
                key,
                hits: entry.hits,
                age: Date.now() - entry.createdAt,
                ttl: entry.ttl
            });
        }

        return {
            entries: this.cache.size,
            maxSize: this.maxSize,
            totalHits,
            totalSize,
            averageHits: this.cache.size > 0 ? totalHits / this.cache.size : 0,
            topEntries: entries.sort((a, b) => b.hits - a.hits).slice(0, 5)
        };
    }

    /**
     * Log cache status
     */
    logStatus() {
        const stats = this.getStats();
        console.log('[CACHE] Status:', {
            entries: stats.entries,
            maxSize: stats.maxSize,
            totalHits: stats.totalHits,
            avgHits: stats.averageHits.toFixed(2),
            sizeMB: (stats.totalSize / 1024 / 1024).toFixed(2)
        });
        
        if (stats.topEntries.length > 0) {
            console.log('[CACHE] Top 5:', stats.topEntries);
        }
    }
}

// Create and export singleton
const cacheManager = new CacheManager();

// Make it globally accessible for debugging
window.cacheManager = cacheManager;

module.exports = cacheManager;

