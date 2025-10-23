const fs = require('fs-extra');
const path = require('path');

/**
 * PRELOAD OPTIMIZER
 * Preloads and caches frequently used data on launcher startup
 * - Preload version manifests
 * - Preload instance metadata
 * - Background prefetch of common assets
 */
class PreloadOptimizer {
    constructor() {
        this.preloadedData = {
            versions: new Map(),
            instances: new Map(),
            manifests: new Map()
        };
        this.isPreloading = false;
    }

    /**
     * Start background preload on launcher startup
     */
    async startPreload(gameDirectory) {
        if (this.isPreloading) {
            console.log('[PRELOAD] Already preloading, skipping...');
            return;
        }

        this.isPreloading = true;
        console.log('[PRELOAD] Starting background preload...');

        try {
            // Run preload operations in parallel
            await Promise.all([
                this.preloadVersions(gameDirectory),
                this.preloadInstances(gameDirectory),
                this.preloadCommonManifests()
            ]);

            console.log('[PRELOAD] ✅ Preload completed');
        } catch (error) {
            console.error('[PRELOAD] Error:', error.message);
        } finally {
            this.isPreloading = false;
        }
    }

    /**
     * Preload installed Minecraft versions
     */
    async preloadVersions(gameDirectory) {
        try {
            const versionsDir = path.join(gameDirectory, 'versions');
            
            if (!await fs.pathExists(versionsDir)) {
                return;
            }

            const versionFolders = await fs.readdir(versionsDir);
            
            // Load version JSONs in parallel (limit to 10 at a time)
            const pLimit = require('p-limit');
            const limit = pLimit(10);
            
            const loadTasks = versionFolders.map(folder => limit(async () => {
                const versionFile = path.join(versionsDir, folder, `${folder}.json`);
                
                if (await fs.pathExists(versionFile)) {
                    try {
                        const versionData = await fs.readJSON(versionFile);
                        this.preloadedData.versions.set(folder, versionData);
                    } catch (error) {
                        // Ignore invalid version files
                    }
                }
            }));
            
            await Promise.all(loadTasks);
            
            console.log(`[PRELOAD] Loaded ${this.preloadedData.versions.size} versions`);
        } catch (error) {
            console.error('[PRELOAD] Version preload error:', error.message);
        }
    }

    /**
     * Preload installed instances
     */
    async preloadInstances(gameDirectory) {
        try {
            const instancesDir = path.join(gameDirectory, 'instances');
            
            if (!await fs.pathExists(instancesDir)) {
                return;
            }

            const instanceFolders = await fs.readdir(instancesDir);
            
            // Load instance metadata in parallel
            const pLimit = require('p-limit');
            const limit = pLimit(10);
            
            const loadTasks = instanceFolders.map(folder => limit(async () => {
                const instanceFile = path.join(instancesDir, folder, 'instance.json');
                
                if (await fs.pathExists(instanceFile)) {
                    try {
                        const instanceData = await fs.readJSON(instanceFile);
                        this.preloadedData.instances.set(instanceData.id, instanceData);
                    } catch (error) {
                        // Ignore invalid instance files
                    }
                }
            }));
            
            await Promise.all(loadTasks);
            
            console.log(`[PRELOAD] Loaded ${this.preloadedData.instances.size} instances`);
        } catch (error) {
            console.error('[PRELOAD] Instance preload error:', error.message);
        }
    }

    /**
     * Preload common Minecraft version manifests
     */
    async preloadCommonManifests() {
        try {
            const axios = require('axios');
            
            // Fetch Minecraft version manifest
            const response = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json', {
                timeout: 10000
            });
            
            this.preloadedData.manifests.set('minecraft', response.data);
            
            console.log('[PRELOAD] Loaded Minecraft version manifest');
        } catch (error) {
            console.error('[PRELOAD] Manifest preload error:', error.message);
        }
    }

    /**
     * Get preloaded version data
     */
    getVersion(versionId) {
        return this.preloadedData.versions.get(versionId);
    }

    /**
     * Get preloaded instance data
     */
    getInstance(instanceId) {
        return this.preloadedData.instances.get(instanceId);
    }

    /**
     * Get preloaded manifest
     */
    getManifest(manifestId) {
        return this.preloadedData.manifests.get(manifestId);
    }

    /**
     * Get preload statistics
     */
    getStats() {
        return {
            versions: this.preloadedData.versions.size,
            instances: this.preloadedData.instances.size,
            manifests: this.preloadedData.manifests.size,
            isPreloading: this.isPreloading
        };
    }

    /**
     * Clear preloaded data
     */
    clear() {
        this.preloadedData.versions.clear();
        this.preloadedData.instances.clear();
        this.preloadedData.manifests.clear();
        console.log('[PRELOAD] Cleared all preloaded data');
    }
}

// Singleton instance
const preloadOptimizer = new PreloadOptimizer();

module.exports = preloadOptimizer;

