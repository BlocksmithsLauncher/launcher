const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');

/**
 * RecoveryManager - Automatic recovery mechanisms for vanilla Minecraft
 * Inspired by TLegacy's recovery system with modern error handling
 */
class RecoveryManager extends EventEmitter {
    constructor(gameDirectory) {
        super();
        this.gameDirectory = gameDirectory;
        this.recoveryAttempts = new Map();
        this.maxRecoveryAttempts = 3;
        this.recoveryCooldown = 30000; // 30 seconds
        this.isRecovering = false;
        
        console.log('[RECOVERY-MANAGER] Initialized for vanilla Minecraft');
    }

    /**
     * Attempt recovery for a specific error
     */
    async attemptRecovery(error, context = {}) {
        if (this.isRecovering) {
            console.warn('[RECOVERY-MANAGER] Recovery already in progress');
            return { success: false, reason: 'Already recovering' };
        }

        const errorKey = this.getErrorKey(error);
        const attempts = this.recoveryAttempts.get(errorKey) || 0;
        
        if (attempts >= this.maxRecoveryAttempts) {
            console.error(`[RECOVERY-MANAGER] Max recovery attempts reached for: ${errorKey}`);
            return { success: false, reason: 'Max attempts reached' };
        }

        this.isRecovering = true;
        this.recoveryAttempts.set(errorKey, attempts + 1);
        
        console.log(`[RECOVERY-MANAGER] Attempting recovery (${attempts + 1}/${this.maxRecoveryAttempts}) for: ${errorKey}`);
        
        try {
            const recoveryResult = await this.performRecovery(error, context);
            
            if (recoveryResult.success) {
                console.log('[RECOVERY-MANAGER] ✅ Recovery successful');
                this.emit('recoverySuccess', { error, context, result: recoveryResult });
            } else {
                console.warn('[RECOVERY-MANAGER] ⚠️ Recovery failed:', recoveryResult.reason);
                this.emit('recoveryFailed', { error, context, result: recoveryResult });
            }
            
            return recoveryResult;
        } catch (recoveryError) {
            console.error('[RECOVERY-MANAGER] Recovery error:', recoveryError);
            this.emit('recoveryError', { error, context, recoveryError });
            return { success: false, reason: recoveryError.message };
        } finally {
            this.isRecovering = false;
        }
    }

    /**
     * Perform specific recovery based on error type
     */
    async performRecovery(error, context) {
        const errorMessage = error.message || error.toString();
        
        // Java-related errors
        if (errorMessage.includes('Java') || errorMessage.includes('JVM') || errorMessage.includes('OutOfMemoryError')) {
            return await this.recoverJavaError(error, context);
        }
        
        // Process spawn errors
        if (errorMessage.includes('spawn') || errorMessage.includes('ENOENT')) {
            return await this.recoverProcessError(error, context);
        }
        
        // Memory errors
        if (errorMessage.includes('memory') || errorMessage.includes('OutOfMemory')) {
            return await this.recoverMemoryError(error, context);
        }
        
        // File system errors
        if (errorMessage.includes('file') || errorMessage.includes('directory') || errorMessage.includes('path')) {
            return await this.recoverFileSystemError(error, context);
        }
        
        // Network errors
        if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
            return await this.recoverNetworkError(error, context);
        }
        
        // Generic recovery
        return await this.recoverGenericError(error, context);
    }

    /**
     * Recover from Java-related errors
     */
    async recoverJavaError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting Java error recovery...');
        
        try {
            // Try to find alternative Java installation
            const JavaDetector = require('./JavaDetector');
            const detector = new JavaDetector();
            const availableJavas = await detector.detectJava();
            
            if (availableJavas.length > 0) {
                const bestJava = availableJavas[0];
                console.log(`[RECOVERY-MANAGER] Found alternative Java: ${bestJava.version} at ${bestJava.path}`);
                
                return {
                    success: true,
                    action: 'java_switched',
                    newJavaPath: bestJava.path,
                    message: `Switched to Java ${bestJava.version}`
                };
            }
            
            return {
                success: false,
                reason: 'No alternative Java found',
                message: 'No alternative Java installations available'
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'Failed to detect alternative Java'
            };
        }
    }

    /**
     * Recover from process spawn errors
     */
    async recoverProcessError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting process error recovery...');
        
        try {
            // Check if game directory exists and is accessible
            const gameDirExists = await fs.pathExists(this.gameDirectory);
            if (!gameDirExists) {
                await fs.ensureDir(this.gameDirectory);
                console.log('[RECOVERY-MANAGER] Created game directory');
            }
            
            // Check if versions directory exists
            const versionsDir = path.join(this.gameDirectory, 'versions');
            const versionsDirExists = await fs.pathExists(versionsDir);
            if (!versionsDirExists) {
                await fs.ensureDir(versionsDir);
                console.log('[RECOVERY-MANAGER] Created versions directory');
            }
            
            return {
                success: true,
                action: 'directories_created',
                message: 'Created missing directories'
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'Failed to create directories'
            };
        }
    }

    /**
     * Recover from memory errors
     */
    async recoverMemoryError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting memory error recovery...');
        
        try {
            // Reduce memory allocation
            const currentMemory = context.maxMemory || 4096;
            const reducedMemory = Math.max(1024, Math.floor(currentMemory * 0.75));
            
            console.log(`[RECOVERY-MANAGER] Reducing memory from ${currentMemory}MB to ${reducedMemory}MB`);
            
            return {
                success: true,
                action: 'memory_reduced',
                newMemory: reducedMemory,
                message: `Reduced memory allocation to ${reducedMemory}MB`
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'Failed to adjust memory settings'
            };
        }
    }

    /**
     * Recover from file system errors
     */
    async recoverFileSystemError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting file system error recovery...');
        
        try {
            // Check and fix permissions
            const gameDirExists = await fs.pathExists(this.gameDirectory);
            if (gameDirExists) {
                // Try to write a test file to check permissions
                const testFile = path.join(this.gameDirectory, '.permission-test');
                await fs.writeFile(testFile, 'test');
                await fs.remove(testFile);
                console.log('[RECOVERY-MANAGER] Directory permissions verified');
            }
            
            return {
                success: true,
                action: 'permissions_verified',
                message: 'File system permissions verified'
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'File system permissions issue'
            };
        }
    }

    /**
     * Recover from network errors
     */
    async recoverNetworkError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting network error recovery...');
        
        try {
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            return {
                success: true,
                action: 'retry_after_delay',
                message: 'Retrying after network delay'
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'Network recovery failed'
            };
        }
    }

    /**
     * Generic error recovery
     */
    async recoverGenericError(error, context) {
        console.log('[RECOVERY-MANAGER] Attempting generic error recovery...');
        
        try {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return {
                success: true,
                action: 'retry_after_delay',
                message: 'Retrying after delay'
            };
        } catch (recoveryError) {
            return {
                success: false,
                reason: recoveryError.message,
                message: 'Generic recovery failed'
            };
        }
    }

    /**
     * Get unique key for error tracking
     */
    getErrorKey(error) {
        const message = error.message || error.toString();
        const type = error.constructor.name;
        return `${type}-${message.substring(0, 50)}`;
    }

    /**
     * Reset recovery attempts for an error
     */
    resetRecoveryAttempts(errorKey) {
        this.recoveryAttempts.delete(errorKey);
        console.log(`[RECOVERY-MANAGER] Reset recovery attempts for: ${errorKey}`);
    }

    /**
     * Get recovery statistics
     */
    getRecoveryStats() {
        return {
            totalAttempts: Array.from(this.recoveryAttempts.values()).reduce((a, b) => a + b, 0),
            uniqueErrors: this.recoveryAttempts.size,
            isRecovering: this.isRecovering,
            maxAttempts: this.maxRecoveryAttempts
        };
    }

    /**
     * Clear all recovery attempts
     */
    clearRecoveryAttempts() {
        this.recoveryAttempts.clear();
        console.log('[RECOVERY-MANAGER] All recovery attempts cleared');
    }

    /**
     * Cleanup
     */
    destroy() {
        this.clearRecoveryAttempts();
        this.removeAllListeners();
        this.isRecovering = false;
        console.log('[RECOVERY-MANAGER] Destroyed');
    }
}

module.exports = RecoveryManager;
