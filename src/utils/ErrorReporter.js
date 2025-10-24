const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * ErrorReporter - Advanced error reporting and categorization system
 * Inspired by TLegacy's error handling with XLauncher's modern approach
 */
class ErrorReporter extends EventEmitter {
    constructor(gameDirectory) {
        super();
        this.gameDirectory = gameDirectory;
        this.errorLogsDir = path.join(gameDirectory, 'error-logs');
        this.errorCounts = new Map();
        this.errorHistory = [];
        this.maxHistorySize = 100;
        
        // Error categories
        this.categories = {
            CRITICAL: { level: 0, color: 'red', action: 'STOP' },
            ERROR: { level: 1, color: 'red', action: 'REPORT' },
            WARNING: { level: 2, color: 'yellow', action: 'LOG' },
            INFO: { level: 3, color: 'blue', action: 'LOG' },
            DEBUG: { level: 4, color: 'gray', action: 'LOG' }
        };
        
        this.initializeErrorDirectory();
        console.log('[ERROR-REPORTER] Initialized for vanilla Minecraft');
    }

    /**
     * Initialize error logs directory
     */
    async initializeErrorDirectory() {
        try {
            await fs.ensureDir(this.errorLogsDir);
            console.log('[ERROR-REPORTER] Error directory created:', this.errorLogsDir);
        } catch (error) {
            console.error('[ERROR-REPORTER] Failed to create error directory:', error);
        }
    }

    /**
     * Report an error with automatic categorization
     */
    async reportError(error, context = {}) {
        const errorInfo = this.categorizeError(error, context);
        const timestamp = new Date().toISOString();
        
        // Add to history
        this.addToHistory(errorInfo);
        
        // Update error counts
        this.updateErrorCounts(errorInfo);
        
        // Log error
        this.logError(errorInfo);
        
        // Save to file if critical or error level
        if (errorInfo.category.level <= 1) {
            await this.saveErrorToFile(errorInfo);
        }
        
        // Emit error event
        this.emit('error', errorInfo);
        
        // Take action based on category
        this.takeAction(errorInfo);
        
        return errorInfo;
    }

    /**
     * Categorize error based on type and context
     */
    categorizeError(error, context) {
        const errorMessage = error.message || error.toString();
        const errorStack = error.stack || '';
        
        let category = 'INFO';
        let severity = 'LOW';
        let action = 'LOG';
        
        // Critical errors
        if (errorMessage.includes('Cannot access') ||
            errorMessage.includes('is not a function') ||
            errorMessage.includes('Cannot read property') ||
            errorMessage.includes('Maximum call stack') ||
            errorMessage.includes('ENOENT') ||
            errorMessage.includes('EACCES') ||
            errorMessage.includes('EMFILE') ||
            errorMessage.includes('ENOSPC')) {
            category = 'CRITICAL';
            severity = 'CRITICAL';
            action = 'STOP';
        }
        // Java errors
        else if (errorMessage.includes('Java') ||
                 errorMessage.includes('JVM') ||
                 errorMessage.includes('OutOfMemoryError') ||
                 errorMessage.includes('ClassNotFoundException') ||
                 errorMessage.includes('NoClassDefFoundError')) {
            category = 'ERROR';
            severity = 'HIGH';
            action = 'REPORT';
        }
        // Minecraft errors
        else if (errorMessage.includes('Minecraft') ||
                 errorMessage.includes('launch') ||
                 errorMessage.includes('version') ||
                 errorMessage.includes('profile')) {
            category = 'ERROR';
            severity = 'HIGH';
            action = 'REPORT';
        }
        // Process errors
        else if (errorMessage.includes('spawn') ||
                 errorMessage.includes('process') ||
                 errorMessage.includes('timeout') ||
                 errorMessage.includes('killed')) {
            category = 'WARNING';
            severity = 'MEDIUM';
            action = 'LOG';
        }
        // Network errors
        else if (errorMessage.includes('network') ||
                 errorMessage.includes('connection') ||
                 errorMessage.includes('timeout') ||
                 errorMessage.includes('ECONNREFUSED')) {
            category = 'WARNING';
            severity = 'MEDIUM';
            action = 'LOG';
        }
        // File system errors
        else if (errorMessage.includes('file') ||
                 errorMessage.includes('directory') ||
                 errorMessage.includes('path') ||
                 errorMessage.includes('permission')) {
            category = 'WARNING';
            severity = 'MEDIUM';
            action = 'LOG';
        }
        
        return {
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            category: category,
            severity: severity,
            action: action,
            message: errorMessage,
            stack: errorStack,
            context: context,
            level: this.categories[category].level,
            color: this.categories[category].color
        };
    }

    /**
     * Add error to history
     */
    addToHistory(errorInfo) {
        this.errorHistory.unshift(errorInfo);
        
        // Keep only recent errors
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Update error counts
     */
    updateErrorCounts(errorInfo) {
        const key = `${errorInfo.category}-${errorInfo.message}`;
        const current = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, current + 1);
    }

    /**
     * Log error to console
     */
    logError(errorInfo) {
        const { category, message, timestamp, severity } = errorInfo;
        const color = this.categories[category].color;
        
        const logMessage = `[${timestamp}] [${category}] ${message}`;
        
        switch (category) {
            case 'CRITICAL':
                console.error(`🔴 ${logMessage}`);
                break;
            case 'ERROR':
                console.error(`🔴 ${logMessage}`);
                break;
            case 'WARNING':
                console.warn(`🟡 ${logMessage}`);
                break;
            case 'INFO':
                console.info(`🔵 ${logMessage}`);
                break;
            case 'DEBUG':
                console.debug(`⚪ ${logMessage}`);
                break;
        }
    }

    /**
     * Save error to file
     */
    async saveErrorToFile(errorInfo) {
        try {
            const filename = `error-${errorInfo.id}.json`;
            const filepath = path.join(this.errorLogsDir, filename);
            
            const errorReport = {
                ...errorInfo,
                systemInfo: {
                    platform: process.platform,
                    arch: process.arch,
                    nodeVersion: process.version,
                    totalMemory: os.totalmem(),
                    freeMemory: os.freemem(),
                    cpus: os.cpus().length
                }
            };
            
            await fs.writeJson(filepath, errorReport, { spaces: 2 });
            console.log(`[ERROR-REPORTER] Error saved to file: ${filename}`);
        } catch (error) {
            console.error('[ERROR-REPORTER] Failed to save error to file:', error);
        }
    }

    /**
     * Take action based on error category
     */
    takeAction(errorInfo) {
        const { category, action, message } = errorInfo;
        
        switch (action) {
            case 'STOP':
                console.error(`[ERROR-REPORTER] 🛑 STOPPING due to critical error: ${message}`);
                this.emit('criticalError', errorInfo);
                break;
                
            case 'REPORT':
                console.error(`[ERROR-REPORTER] 📊 REPORTING error: ${message}`);
                this.emit('errorReport', errorInfo);
                break;
                
            case 'LOG':
                console.log(`[ERROR-REPORTER] 📝 LOGGING ${category.toLowerCase()}: ${message}`);
                this.emit('errorLogged', errorInfo);
                break;
        }
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            totalErrors: this.errorHistory.length,
            errorCounts: Object.fromEntries(this.errorCounts),
            categories: {},
            recentErrors: this.errorHistory.slice(0, 10)
        };
        
        // Count by category
        for (const error of this.errorHistory) {
            const category = error.category;
            stats.categories[category] = (stats.categories[category] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * Get error history
     */
    getErrorHistory(limit = 50) {
        return this.errorHistory.slice(0, limit);
    }

    /**
     * Clear error history
     */
    clearHistory() {
        this.errorHistory = [];
        this.errorCounts.clear();
        console.log('[ERROR-REPORTER] Error history cleared');
    }

    /**
     * Clear old error files
     */
    async clearOldErrorFiles(daysOld = 7) {
        try {
            const files = await fs.readdir(this.errorLogsDir);
            const errorFiles = files.filter(f => f.endsWith('.json'));
            const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            
            let deletedCount = 0;
            for (const file of errorFiles) {
                const filePath = path.join(this.errorLogsDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < cutoffTime) {
                    await fs.remove(filePath);
                    deletedCount++;
                }
            }
            
            console.log(`[ERROR-REPORTER] Cleared ${deletedCount} old error files`);
            return deletedCount;
        } catch (error) {
            console.error('[ERROR-REPORTER] Failed to clear old error files:', error);
            return 0;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.clearHistory();
        this.removeAllListeners();
        console.log('[ERROR-REPORTER] Destroyed');
    }
}

module.exports = ErrorReporter;
