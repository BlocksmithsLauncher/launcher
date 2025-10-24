const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * CrashManager - TLegacy inspired crash detection and recovery system
 * Handles vanilla Minecraft crashes, Java errors, and system failures
 */
class CrashManager extends EventEmitter {
    constructor(gameDirectory) {
        super();
        this.gameDirectory = gameDirectory;
        this.crashLogsDir = path.join(gameDirectory, 'crash-reports');
        this.isMonitoring = false;
        this.crashCount = 0;
        this.lastCrashTime = 0;
        this.crashThreshold = 3; // Max crashes in 5 minutes
        this.crashWindow = 5 * 60 * 1000; // 5 minutes
        
        // Ensure crash logs directory exists
        this.initializeCrashDirectory();
        
        console.log('[CRASH-MANAGER] Initialized for vanilla Minecraft');
    }

    /**
     * Initialize crash reports directory
     */
    async initializeCrashDirectory() {
        try {
            await fs.ensureDir(this.crashLogsDir);
            console.log('[CRASH-MANAGER] Crash directory created:', this.crashLogsDir);
        } catch (error) {
            console.error('[CRASH-MANAGER] Failed to create crash directory:', error);
        }
    }

    /**
     * Start monitoring vanilla Minecraft process
     */
    startMonitoring(process) {
        if (this.isMonitoring) {
            console.warn('[CRASH-MANAGER] Already monitoring');
            return;
        }

        this.isMonitoring = true;
        this.monitoredProcess = process;
        
        console.log('[CRASH-MANAGER] Starting crash monitoring for vanilla Minecraft...');

        // Monitor process exit
        process.on('exit', (code, signal) => {
            this.handleProcessExit(code, signal);
        });

        // Monitor process error
        process.on('error', (error) => {
            this.handleProcessError(error);
        });

        // Monitor stderr for Java errors
        if (process.stderr) {
            process.stderr.on('data', (data) => {
                this.analyzeStderr(data.toString());
            });
        }

        // Monitor stdout for crash indicators
        if (process.stdout) {
            process.stdout.on('data', (data) => {
                this.analyzeStdout(data.toString());
            });
        }

        console.log('[CRASH-MANAGER] ✅ Monitoring started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        this.monitoredProcess = null;
        console.log('[CRASH-MANAGER] Monitoring stopped');
    }

    /**
     * Handle process exit
     */
    handleProcessExit(code, signal) {
        console.log(`[CRASH-MANAGER] Process exited: code=${code}, signal=${signal}`);
        
        // Check if this is a crash (non-zero exit code)
        if (code !== 0) {
            this.handleCrash({
                type: 'PROCESS_EXIT',
                code: code,
                signal: signal,
                message: `Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`
            });
        } else {
            console.log('[CRASH-MANAGER] Process exited normally');
        }
    }

    /**
     * Handle process error
     */
    handleProcessError(error) {
        console.error('[CRASH-MANAGER] Process error:', error);
        
        this.handleCrash({
            type: 'PROCESS_ERROR',
            error: error.message,
            message: `Process error: ${error.message}`
        });
    }

    /**
     * Analyze stderr for Java errors
     */
    analyzeStderr(data) {
        const errorText = data.toString();
        
        // Critical Java errors
        const criticalErrors = [
            'Could not create the Java Virtual Machine',
            'A fatal exception has occurred',
            'java.lang.OutOfMemoryError',
            'Error: Invalid or corrupt jarfile',
            'java.lang.UnsatisfiedLinkError',
            'java.lang.NoClassDefFoundError',
            'java.lang.ClassNotFoundException',
            'Exception in thread "main"',
            'Caused by: java.lang.OutOfMemoryError',
            'java.lang.StackOverflowError'
        ];

        for (const error of criticalErrors) {
            if (errorText.includes(error)) {
                this.handleCrash({
                    type: 'JAVA_ERROR',
                    error: error,
                    details: errorText,
                    message: `Java error detected: ${error}`
                });
                break;
            }
        }
    }

    /**
     * Analyze stdout for crash indicators
     */
    analyzeStdout(data) {
        const output = data.toString();
        
        // Minecraft crash indicators
        const crashIndicators = [
            'The game crashed whilst',
            'A fatal error has occurred',
            'Minecraft has crashed!',
            'Exception in thread "main"',
            'Caused by:',
            'at net.minecraft',
            'java.lang.Exception'
        ];

        for (const indicator of crashIndicators) {
            if (output.includes(indicator)) {
                this.handleCrash({
                    type: 'MINECRAFT_CRASH',
                    indicator: indicator,
                    details: output,
                    message: `Minecraft crash detected: ${indicator}`
                });
                break;
            }
        }
    }

    /**
     * Handle crash detection
     */
    async handleCrash(crashInfo) {
        const now = Date.now();
        
        // Check crash frequency
        if (now - this.lastCrashTime < this.crashWindow) {
            this.crashCount++;
        } else {
            this.crashCount = 1;
        }
        
        this.lastCrashTime = now;
        
        console.error(`[CRASH-MANAGER] ❌ CRASH DETECTED (${this.crashCount}/${this.crashThreshold}):`, crashInfo.message);
        
        // Generate crash report
        const crashReport = await this.generateCrashReport(crashInfo);
        
        // Emit crash event
        this.emit('crash', {
            ...crashInfo,
            crashReport: crashReport,
            crashCount: this.crashCount,
            isFrequentCrash: this.crashCount >= this.crashThreshold
        });
        
        // Handle frequent crashes
        if (this.crashCount >= this.crashThreshold) {
            this.handleFrequentCrashes(crashInfo);
        }
    }

    /**
     * Generate detailed crash report
     */
    async generateCrashReport(crashInfo) {
        const timestamp = new Date().toISOString();
        const crashId = `crash-${Date.now()}`;
        
        const report = {
            crashId: crashId,
            timestamp: timestamp,
            type: crashInfo.type,
            message: crashInfo.message,
            details: crashInfo.details || crashInfo.error || '',
            systemInfo: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                cpus: os.cpus().length
            },
            gameInfo: {
                gameDirectory: this.gameDirectory,
                processId: this.monitoredProcess ? this.monitoredProcess.pid : null
            },
            crashCount: this.crashCount,
            isFrequentCrash: this.crashCount >= this.crashThreshold
        };
        
        // Save crash report to file
        const reportPath = path.join(this.crashLogsDir, `${crashId}.json`);
        try {
            await fs.writeJson(reportPath, report, { spaces: 2 });
            console.log('[CRASH-MANAGER] Crash report saved:', reportPath);
        } catch (error) {
            console.error('[CRASH-MANAGER] Failed to save crash report:', error);
        }
        
        return report;
    }

    /**
     * Handle frequent crashes
     */
    handleFrequentCrashes(crashInfo) {
        console.error(`[CRASH-MANAGER] ⚠️ FREQUENT CRASHES DETECTED (${this.crashCount}/${this.crashThreshold})`);
        
        // Emit frequent crash event
        this.emit('frequentCrashes', {
            crashCount: this.crashCount,
            crashInfo: crashInfo,
            message: `Frequent crashes detected: ${this.crashCount} crashes in ${this.crashWindow / 1000} seconds`
        });
        
        // Reset crash counter after handling
        this.crashCount = 0;
        this.lastCrashTime = 0;
    }

    /**
     * Get crash statistics
     */
    async getCrashStats() {
        try {
            const files = await fs.readdir(this.crashLogsDir);
            const crashFiles = files.filter(f => f.endsWith('.json'));
            
            return {
                totalCrashes: crashFiles.length,
                recentCrashes: crashFiles.length,
                crashDirectory: this.crashLogsDir,
                isMonitoring: this.isMonitoring
            };
        } catch (error) {
            console.error('[CRASH-MANAGER] Failed to get crash stats:', error);
            return {
                totalCrashes: 0,
                recentCrashes: 0,
                crashDirectory: this.crashLogsDir,
                isMonitoring: this.isMonitoring
            };
        }
    }

    /**
     * Clear old crash reports
     */
    async clearOldCrashReports(daysOld = 7) {
        try {
            const files = await fs.readdir(this.crashLogsDir);
            const crashFiles = files.filter(f => f.endsWith('.json'));
            const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            
            let deletedCount = 0;
            for (const file of crashFiles) {
                const filePath = path.join(this.crashLogsDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.mtime.getTime() < cutoffTime) {
                    await fs.remove(filePath);
                    deletedCount++;
                }
            }
            
            console.log(`[CRASH-MANAGER] Cleared ${deletedCount} old crash reports`);
            return deletedCount;
        } catch (error) {
            console.error('[CRASH-MANAGER] Failed to clear old crash reports:', error);
            return 0;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopMonitoring();
        this.removeAllListeners();
        console.log('[CRASH-MANAGER] Destroyed');
    }
}

module.exports = CrashManager;
