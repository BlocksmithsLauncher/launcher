/**
 * Process Manager
 * Manages game processes with proper cleanup and orphan prevention
 */

const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ProcessManager {
    constructor() {
        this.activeProcesses = new Map(); // pid -> process info
        this.orphanCheckInterval = null;
    }

    /**
     * Register a process for tracking
     */
    registerProcess(pid, info = {}) {
        if (!pid) {
            console.error('[ProcessManager] Cannot register process without PID');
            return false;
        }

        this.activeProcesses.set(pid, {
            pid,
            startTime: Date.now(),
            ...info
        });

        console.log(`[ProcessManager] Registered process ${pid}. Active: ${this.activeProcesses.size}`);
        return true;
    }

    /**
     * Unregister a process
     */
    unregisterProcess(pid) {
        const deleted = this.activeProcesses.delete(pid);
        if (deleted) {
            console.log(`[ProcessManager] Unregistered process ${pid}. Active: ${this.activeProcesses.size}`);
        }
        return deleted;
    }

    /**
     * Check if process is running
     */
    isProcessRunning(pid) {
        if (!pid) return false;

        try {
            // Signal 0 doesn't kill the process, just checks if it exists
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get child processes (cross-platform)
     */
    async getChildProcesses(parentPid) {
        const children = [];

        try {
            if (process.platform === 'win32') {
                // Windows: Use WMIC
                const { stdout } = await execPromise(
                    `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
                    { timeout: 5000 }
                );

                const lines = stdout.split('\n').filter(line => line.trim());
                for (let i = 1; i < lines.length; i++) { // Skip header
                    const pid = parseInt(lines[i].trim());
                    if (!isNaN(pid)) {
                        children.push(pid);
                    }
                }
            } else {
                // Linux/macOS: Use ps
                const { stdout } = await execPromise(
                    `ps -o pid --no-headers --ppid ${parentPid}`,
                    { timeout: 5000 }
                );

                const pids = stdout.trim().split('\n').map(p => parseInt(p.trim()));
                children.push(...pids.filter(p => !isNaN(p)));
            }
        } catch (error) {
            console.error(`[ProcessManager] Error getting children of ${parentPid}:`, error.message);
        }

        return children;
    }

    /**
     * Kill process tree (parent + all children)
     */
    async killProcessTree(pid, signal = 'SIGTERM') {
        console.log(`[ProcessManager] Killing process tree: ${pid}`);

        try {
            if (process.platform === 'win32') {
                // Windows: Use taskkill with /T (tree) flag
                await this.windowsKillTree(pid);
            } else {
                // Linux/macOS: Kill process group
                await this.unixKillTree(pid, signal);
            }

            return { success: true };
        } catch (error) {
            console.error(`[ProcessManager] Error killing tree ${pid}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Windows-specific tree kill
     */
    async windowsKillTree(pid) {
        try {
            // First try graceful termination
            await execPromise(`taskkill /PID ${pid} /T`, { timeout: 5000 });
            await this.sleep(1000);

            // Check if still running
            if (this.isProcessRunning(pid)) {
                console.log(`[ProcessManager] Process ${pid} still running, force killing...`);
                // Force kill
                await execPromise(`taskkill /PID ${pid} /T /F`, { timeout: 5000 });
            }
        } catch (error) {
            // taskkill returns error even on success sometimes
            console.log(`[ProcessManager] taskkill result:`, error.message);
        }
    }

    /**
     * Unix-specific tree kill
     */
    async unixKillTree(pid, signal = 'SIGTERM') {
        try {
            // Get all children recursively
            const children = await this.getAllDescendants(pid);
            
            // Kill children first (bottom-up)
            for (const childPid of children.reverse()) {
                try {
                    process.kill(childPid, signal);
                } catch (error) {
                    // Ignore if process doesn't exist
                }
            }

            await this.sleep(1000);

            // Then kill parent
            try {
                process.kill(pid, signal);
                await this.sleep(1000);

                // Force kill if still alive
                if (this.isProcessRunning(pid)) {
                    process.kill(pid, 'SIGKILL');
                }
            } catch (error) {
                // Process might already be dead
            }
        } catch (error) {
            console.error(`[ProcessManager] Unix kill tree error:`, error);
        }
    }

    /**
     * Get all descendants recursively
     */
    async getAllDescendants(pid, descendants = []) {
        const children = await this.getChildProcesses(pid);
        
        for (const childPid of children) {
            if (!descendants.includes(childPid)) {
                descendants.push(childPid);
                await this.getAllDescendants(childPid, descendants);
            }
        }

        return descendants;
    }

    /**
     * Verify process is stopped (with timeout)
     */
    async verifyProcessStopped(pid, maxWaitMs = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitMs) {
            if (!this.isProcessRunning(pid)) {
                console.log(`[ProcessManager] Process ${pid} confirmed stopped`);
                return true;
            }
            await this.sleep(500);
        }

        console.warn(`[ProcessManager] Process ${pid} still running after ${maxWaitMs}ms`);
        return false;
    }

    /**
     * Graceful shutdown attempt
     */
    async gracefulShutdown(pid, timeoutMs = 5000) {
        console.log(`[ProcessManager] Attempting graceful shutdown of ${pid}`);

        try {
            if (process.platform === 'win32') {
                // Windows: Send WM_CLOSE message
                await execPromise(`taskkill /PID ${pid}`, { timeout: timeoutMs });
            } else {
                // Unix: Send SIGTERM
                process.kill(pid, 'SIGTERM');
            }

            // Wait and verify
            return await this.verifyProcessStopped(pid, timeoutMs);
        } catch (error) {
            console.error(`[ProcessManager] Graceful shutdown failed:`, error.message);
            return false;
        }
    }

    /**
     * Force kill
     */
    async forceKill(pid) {
        console.log(`[ProcessManager] Force killing ${pid}`);

        try {
            if (process.platform === 'win32') {
                await execPromise(`taskkill /PID ${pid} /F`, { timeout: 3000 });
            } else {
                process.kill(pid, 'SIGKILL');
            }

            await this.sleep(500);
            return !this.isProcessRunning(pid);
        } catch (error) {
            console.error(`[ProcessManager] Force kill failed:`, error.message);
            return false;
        }
    }

    /**
     * Complete stop sequence: graceful -> force -> verify
     */
    async stopProcess(pid) {
        if (!pid) {
            return { success: false, error: 'No PID provided' };
        }

        if (!this.isProcessRunning(pid)) {
            console.log(`[ProcessManager] Process ${pid} not running`);
            this.unregisterProcess(pid);
            return { success: true, message: 'Process already stopped' };
        }

        console.log(`[ProcessManager] Stopping process ${pid}...`);

        try {
            // Step 1: Kill process tree
            await this.killProcessTree(pid);
            await this.sleep(1000);

            // Step 2: Verify tree stopped
            const stopped = await this.verifyProcessStopped(pid, 3000);
            
            if (!stopped) {
                console.warn(`[ProcessManager] Process tree still running, force killing...`);
                await this.forceKill(pid);
                await this.sleep(1000);
            }

            // Final verification
            const finalCheck = !this.isProcessRunning(pid);
            
            if (finalCheck) {
                this.unregisterProcess(pid);
                console.log(`[ProcessManager] ✅ Process ${pid} successfully stopped`);
            } else {
                console.error(`[ProcessManager] ❌ Failed to stop process ${pid}`);
            }

            return {
                success: finalCheck,
                message: finalCheck ? 'Process stopped' : 'Failed to stop process'
            };
        } catch (error) {
            console.error(`[ProcessManager] Error stopping ${pid}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop all tracked processes
     */
    async stopAllProcesses() {
        console.log(`[ProcessManager] Stopping all ${this.activeProcesses.size} processes...`);

        const results = [];
        for (const pid of this.activeProcesses.keys()) {
            const result = await this.stopProcess(pid);
            results.push({ pid, ...result });
        }

        return results;
    }

    /**
     * Check for orphaned processes
     */
    async checkOrphans() {
        const orphans = [];

        for (const [pid, info] of this.activeProcesses.entries()) {
            if (!this.isProcessRunning(pid)) {
                orphans.push(pid);
                this.unregisterProcess(pid);
            }
        }

        if (orphans.length > 0) {
            console.log(`[ProcessManager] Found ${orphans.length} orphaned PIDs:`, orphans);
        }

        return orphans;
    }

    /**
     * Start periodic orphan check - CPU OPTIMIZED
     */
    startOrphanCheck(intervalMs = 60000) { // 60s instead of 30s (CPU optimized)
        if (this.orphanCheckInterval) {
            clearInterval(this.orphanCheckInterval);
        }

        this.orphanCheckInterval = setInterval(() => {
            // Only check if we have active processes (CPU optimization)
            if (this.activeProcesses.size > 0) {
                this.checkOrphans();
            }
        }, intervalMs);

        console.log(`[ProcessManager] Orphan check started (every ${intervalMs}ms, conditional)`);
    }

    /**
     * Stop orphan check
     */
    stopOrphanCheck() {
        if (this.orphanCheckInterval) {
            clearInterval(this.orphanCheckInterval);
            this.orphanCheckInterval = null;
            console.log('[ProcessManager] Orphan check stopped');
        }
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            activeProcesses: this.activeProcesses.size,
            pids: Array.from(this.activeProcesses.keys())
        };
    }

    /**
     * Cleanup - stop all processes and clear tracking
     */
    async cleanup() {
        console.log('[ProcessManager] Cleanup started...');
        
        this.stopOrphanCheck();
        await this.stopAllProcesses();
        this.activeProcesses.clear();
        
        console.log('[ProcessManager] Cleanup complete');
    }

    /**
     * Helper: sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton
module.exports = new ProcessManager();

