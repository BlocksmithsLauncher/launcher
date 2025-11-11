const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * CACHE MANAGER
 * Caches API responses and metadata to speed up launcher
 * - API response caching (modpacks, servers, etc.)
 * - Metadata caching (version manifests, etc.)
 * - Automatic cache invalidation
 */
class CacheManager {
    constructor() {
        const os = require('os');
        this.cacheDir = path.join(os.homedir(), '.blocksmiths', 'cache');
        this.cacheMetaFile = path.join(this.cacheDir, 'meta.json');
        this.cacheMeta = {};
        
        // Adaptive TTL based on data type
        this.TTL_CONFIG = {
            'modpacks': 300000,      // 5 minutes (frequently updated)
            'servers': 60000,        // 1 minute (real-time status)
            'versions': 3600000,     // 1 hour (rarely changes)
            'news': 600000,          // 10 minutes
            'mods': 300000,          // 5 minutes
            'featured': 300000,      // 5 minutes
            'default': 300000        // 5 minutes (safer default)
        };
        
        this.defaultTTL = this.TTL_CONFIG.default;
        
        this.initialize();
    }

    async initialize() {
        try {
            await fs.ensureDir(this.cacheDir);
            
            // Load cache metadata
            if (await fs.pathExists(this.cacheMetaFile)) {
                this.cacheMeta = await fs.readJSON(this.cacheMetaFile);
            }
            
            // Clean expired entries on startup
            await this.cleanExpiredEntries();
            
            console.log('[CACHE] Initialized with', Object.keys(this.cacheMeta).length, 'entries');
        } catch (error) {
            console.error('[CACHE] Initialization error:', error.message);
        }
    }

    /**
     * Get cache key from string (URL, identifier, etc.)
     */
    getCacheKey(key) {
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * Get adaptive TTL based on key/type
     * @param {string} key - Cache key
     * @returns {number} - TTL in milliseconds
     */
    getAdaptiveTTL(key) {
        const lowerKey = key.toLowerCase();
        
        for (const [type, ttl] of Object.entries(this.TTL_CONFIG)) {
            if (lowerKey.includes(type)) {
                return ttl;
            }
        }
        
        return this.TTL_CONFIG.default;
    }
    
    /**
     * Get cached data (with adaptive TTL)
     * @param {string} key - Cache key (URL, identifier, etc.)
     * @param {number} ttl - Time to live in milliseconds (optional, auto-detected if not provided)
     * @returns {Promise<any|null>} - Cached data or null if not found/expired
     */
    async get(key, ttl = null) {
        try {
            const cacheKey = this.getCacheKey(key);
            const meta = this.cacheMeta[cacheKey];
            
            if (!meta) {
                console.log('[CACHE] Miss:', key);
                return null;
            }

            // Use adaptive TTL if not explicitly provided
            if (ttl === null) {
                ttl = this.getAdaptiveTTL(key);
            }

            // Check if expired
            const now = Date.now();
            if (now - meta.timestamp > ttl) {
                const ageMinutes = Math.round((now - meta.timestamp) / 60000);
                console.log(`[CACHE] Expired: ${key} (age: ${ageMinutes}m, ttl: ${Math.round(ttl/60000)}m)`);
                await this.delete(key);
                return null;
            }

            // Read cache file
            const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
            if (await fs.pathExists(cacheFile)) {
                const data = await fs.readJSON(cacheFile);
                const ageMinutes = Math.round((now - meta.timestamp) / 60000);
                console.log(`[CACHE] Hit: ${key} (age: ${ageMinutes}m)`);
                return data;
            }

            return null;
        } catch (error) {
            console.error('[CACHE] Get error:', error.message);
            return null;
        }
    }

    /**
     * Set cached data
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    async set(key, data) {
        try {
            const cacheKey = this.getCacheKey(key);
            const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
            
            // Write cache file
            await fs.writeJSON(cacheFile, data);
            
            // Update metadata
            this.cacheMeta[cacheKey] = {
                key: key,
                timestamp: Date.now(),
                size: JSON.stringify(data).length
            };
            
            await this.saveMeta();
            console.log('[CACHE] Set:', key);
        } catch (error) {
            console.error('[CACHE] Set error:', error.message);
        }
    }

    /**
     * Delete cached entry
     */
    async delete(key) {
        try {
            const cacheKey = this.getCacheKey(key);
            const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
            
            if (await fs.pathExists(cacheFile)) {
                await fs.remove(cacheFile);
            }
            
            delete this.cacheMeta[cacheKey];
            await this.saveMeta();
            
            console.log('[CACHE] Deleted:', key);
        } catch (error) {
            console.error('[CACHE] Delete error:', error.message);
        }
    }

    /**
     * Clear all cache
     */
    async clear() {
        try {
            await fs.emptyDir(this.cacheDir);
            this.cacheMeta = {};
            await this.saveMeta();
            console.log('[CACHE] Cleared all entries');
        } catch (error) {
            console.error('[CACHE] Clear error:', error.message);
        }
    }

    /**
     * Clean expired entries
     */
    async cleanExpiredEntries() {
        try {
            const now = Date.now();
            let cleaned = 0;
            
            for (const [cacheKey, meta] of Object.entries(this.cacheMeta)) {
                if (now - meta.timestamp > this.defaultTTL) {
                    const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
                    if (await fs.pathExists(cacheFile)) {
                        await fs.remove(cacheFile);
                    }
                    delete this.cacheMeta[cacheKey];
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                await this.saveMeta();
                console.log('[CACHE] Cleaned', cleaned, 'expired entries');
            }
        } catch (error) {
            console.error('[CACHE] Clean error:', error.message);
        }
    }

    /**
     * Save cache metadata
     */
    async saveMeta() {
        try {
            await fs.writeJSON(this.cacheMetaFile, this.cacheMeta);
        } catch (error) {
            console.error('[CACHE] Save meta error:', error.message);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const entries = Object.values(this.cacheMeta);
        const totalSize = entries.reduce((sum, meta) => sum + (meta.size || 0), 0);
        
        return {
            entries: entries.length,
            totalSizeKB: Math.round(totalSize / 1024),
            oldestEntry: entries.length > 0 ? Math.min(...entries.map(m => m.timestamp)) : null,
            newestEntry: entries.length > 0 ? Math.max(...entries.map(m => m.timestamp)) : null
        };
    }

    /**
     * Invalidate cache by pattern
     * @param {string} pattern - Pattern to match keys (e.g., 'modpacks', 'servers')
     */
    async invalidateByPattern(pattern) {
        try {
            let invalidated = 0;
            
            for (const [cacheKey, meta] of Object.entries(this.cacheMeta)) {
                if (meta.key.includes(pattern)) {
                    const cacheFile = path.join(this.cacheDir, cacheKey + '.json');
                    if (await fs.pathExists(cacheFile)) {
                        await fs.remove(cacheFile);
                    }
                    delete this.cacheMeta[cacheKey];
                    invalidated++;
                }
            }
            
            if (invalidated > 0) {
                await this.saveMeta();
                console.log('[CACHE] Invalidated', invalidated, 'entries matching:', pattern);
            }
        } catch (error) {
            console.error('[CACHE] Invalidate error:', error.message);
        }
    }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;

