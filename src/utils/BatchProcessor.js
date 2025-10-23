/**
 * BATCH PROCESSOR
 * Optimizes multiple operations by batching them together
 * - Reduces duplicate file system operations
 * - Batches directory creations
 * - Optimizes file existence checks
 */
class BatchProcessor {
    constructor() {
        // Track pending operations to batch
        this.pendingDirCreations = new Set();
        this.pendingFileChecks = new Map();
        this.dirCreationTimer = null;
        this.fileCheckTimer = null;
        this.batchDelay = 50; // ms
    }

    /**
     * Batch directory creation
     * Collects multiple ensureDir calls and creates all parent directories efficiently
     */
    async batchEnsureDir(dirPath) {
        const fs = require('fs-extra');
        const path = require('path');
        
        // Add to pending set
        this.pendingDirCreations.add(dirPath);
        
        // Clear existing timer
        if (this.dirCreationTimer) {
            clearTimeout(this.dirCreationTimer);
        }
        
        // Set new timer to execute batch
        return new Promise((resolve, reject) => {
            this.dirCreationTimer = setTimeout(async () => {
                try {
                    // Get all unique directories and their parents
                    const allDirs = new Set();
                    
                    for (const dir of this.pendingDirCreations) {
                        let current = path.normalize(dir);
                        while (current !== path.dirname(current)) {
                            allDirs.add(current);
                            current = path.dirname(current);
                        }
                    }
                    
                    // Sort by depth (create parent directories first)
                    const sortedDirs = Array.from(allDirs).sort((a, b) => {
                        return a.split(path.sep).length - b.split(path.sep).length;
                    });
                    
                    // Create directories
                    for (const dir of sortedDirs) {
                        if (!await fs.pathExists(dir)) {
                            await fs.mkdir(dir, { recursive: false });
                        }
                    }
                    
                    console.log(`[BATCH] Created ${sortedDirs.length} directories in batch`);
                    
                    // Clear pending set
                    this.pendingDirCreations.clear();
                    resolve();
                } catch (error) {
                    console.error('[BATCH] Directory creation error:', error.message);
                    this.pendingDirCreations.clear();
                    reject(error);
                }
            }, this.batchDelay);
        });
    }

    /**
     * Batch file existence checks
     * Reduces multiple fs.pathExists calls to single batch operation
     */
    async batchFileExists(filePaths) {
        const fs = require('fs-extra');
        
        const results = new Map();
        
        // Check all files in parallel (more efficient than sequential)
        const checks = filePaths.map(async (filePath) => {
            const exists = await fs.pathExists(filePath);
            results.set(filePath, exists);
        });
        
        await Promise.all(checks);
        
        console.log(`[BATCH] Checked existence of ${filePaths.length} files`);
        return results;
    }

    /**
     * Batch file stat operations
     */
    async batchFileStat(filePaths) {
        const fs = require('fs-extra');
        
        const results = new Map();
        
        const stats = filePaths.map(async (filePath) => {
            try {
                if (await fs.pathExists(filePath)) {
                    const stat = await fs.stat(filePath);
                    results.set(filePath, stat);
                } else {
                    results.set(filePath, null);
                }
            } catch (error) {
                results.set(filePath, null);
            }
        });
        
        await Promise.all(stats);
        
        console.log(`[BATCH] Retrieved stats for ${filePaths.length} files`);
        return results;
    }

    /**
     * Optimize file copy operations by using streams for large files
     */
    async optimizedCopy(src, dest, sizeThreshold = 1024 * 1024) {
        const fs = require('fs-extra');
        
        try {
            const stats = await fs.stat(src);
            
            if (stats.size > sizeThreshold) {
                // Use stream for large files (more efficient)
                return new Promise((resolve, reject) => {
                    const readStream = fs.createReadStream(src);
                    const writeStream = fs.createWriteStream(dest);
                    
                    readStream.on('error', reject);
                    writeStream.on('error', reject);
                    writeStream.on('finish', resolve);
                    
                    readStream.pipe(writeStream);
                });
            } else {
                // Use normal copy for small files
                await fs.copy(src, dest);
            }
        } catch (error) {
            console.error('[BATCH] Optimized copy error:', error.message);
            throw error;
        }
    }
}

// Singleton instance
const batchProcessor = new BatchProcessor();

module.exports = batchProcessor;

