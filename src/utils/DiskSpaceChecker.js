const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * DISK SPACE CHECKER
 * Checks available disk space before downloads
 */
class DiskSpaceChecker {
    constructor() {
        this.minRequiredSpace = 2 * 1024 * 1024 * 1024; // 2GB minimum
    }

    /**
     * Get available disk space for a path
     * @param {string} dirPath - Directory path to check
     * @returns {Promise<object>} - { free, total, percentage }
     */
    async getAvailableSpace(dirPath) {
        try {
            // Ensure directory exists
            await fs.ensureDir(dirPath);

            if (process.platform === 'win32') {
                return await this.getWindowsSpace(dirPath);
            } else {
                return await this.getUnixSpace(dirPath);
            }
        } catch (error) {
            console.error('[DISK-SPACE] Error checking disk space:', error.message);
            // Return conservative estimate if check fails
            return {
                free: this.minRequiredSpace,
                total: this.minRequiredSpace * 2,
                percentage: 50,
                error: error.message
            };
        }
    }

    /**
     * Get disk space on Windows
     */
    async getWindowsSpace(dirPath) {
        try {
            // Get drive letter from path
            const drive = path.parse(dirPath).root.replace('\\', '');
            
            // Use WMIC to get disk space
            const { stdout } = await execAsync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size /format:list`);
            
            const lines = stdout.split('\n').filter(line => line.trim());
            let free = 0, total = 0;
            
            for (const line of lines) {
                if (line.startsWith('FreeSpace=')) {
                    free = parseInt(line.split('=')[1]);
                } else if (line.startsWith('Size=')) {
                    total = parseInt(line.split('=')[1]);
                }
            }

            const percentage = total > 0 ? Math.round((free / total) * 100) : 0;

            return {
                free,
                total,
                percentage,
                freeGB: Math.floor(free / (1024 ** 3)),
                totalGB: Math.floor(total / (1024 ** 3))
            };
        } catch (error) {
            console.error('[DISK-SPACE] Windows check failed:', error.message);
            throw error;
        }
    }

    /**
     * Get disk space on Unix/Linux
     */
    async getUnixSpace(dirPath) {
        try {
            const { stdout } = await execAsync(`df -k "${dirPath}"`);
            const lines = stdout.trim().split('\n');
            
            if (lines.length < 2) {
                throw new Error('Invalid df output');
            }

            const stats = lines[1].split(/\s+/);
            const total = parseInt(stats[1]) * 1024; // Convert KB to bytes
            const used = parseInt(stats[2]) * 1024;
            const free = parseInt(stats[3]) * 1024;
            const percentage = parseInt(stats[4]);

            return {
                free,
                total,
                percentage: 100 - percentage,
                freeGB: Math.floor(free / (1024 ** 3)),
                totalGB: Math.floor(total / (1024 ** 3))
            };
        } catch (error) {
            console.error('[DISK-SPACE] Unix check failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if enough space is available
     * @param {string} dirPath - Directory to check
     * @param {number} requiredSpace - Required space in bytes (default 2GB)
     * @returns {Promise<object>} - { hasSpace, free, required, message }
     */
    async checkSpace(dirPath, requiredSpace = this.minRequiredSpace) {
        const space = await this.getAvailableSpace(dirPath);
        const hasSpace = space.free >= requiredSpace;

        const requiredGB = (requiredSpace / (1024 ** 3)).toFixed(2);
        const freeGB = (space.free / (1024 ** 3)).toFixed(2);

        return {
            hasSpace,
            free: space.free,
            required: requiredSpace,
            freeGB: parseFloat(freeGB),
            requiredGB: parseFloat(requiredGB),
            message: hasSpace 
                ? `Yeterli alan mevcut: ${freeGB} GB / ${requiredGB} GB gerekli`
                : `Yetersiz disk alanı! ${freeGB} GB mevcut, ${requiredGB} GB gerekli`
        };
    }

    /**
     * Estimate required space for modpack
     * @param {number} modCount - Number of mods
     * @param {string} minecraftVersion - Minecraft version
     * @returns {number} - Estimated bytes needed
     */
    estimateModpackSpace(modCount, minecraftVersion = '1.20.1') {
        // Base Minecraft installation: ~500MB
        let required = 500 * 1024 * 1024;

        // Average mod size: ~5MB
        required += modCount * 5 * 1024 * 1024;

        // Assets and libraries: ~300MB
        required += 300 * 1024 * 1024;

        // Buffer for temporary files and world saves: +50%
        required = Math.floor(required * 1.5);

        console.log(`[DISK-SPACE] Estimated space for ${modCount} mods: ${(required / (1024 ** 3)).toFixed(2)} GB`);

        return required;
    }
}

// Singleton instance
const diskSpaceChecker = new DiskSpaceChecker();

module.exports = diskSpaceChecker;

