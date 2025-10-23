const EventEmitter = require('events');
const { spawn } = require('child_process');
const processManager = require('./ProcessManager');

/**
 * Modern Game State Management System
 * - Reliable process tracking
 * - Automatic state detection
 * - Heartbeat monitoring
 * - Graceful shutdown handling
 */
class GameStateManager extends EventEmitter {
    constructor() {
        super();
        
        // Game state
        this.state = 'IDLE'; // IDLE, LAUNCHING, RUNNING, STOPPING, CRASHED
        this.gameProcess = null;
        this.gamePid = null;
        this.gameStartTime = null;
        this.gameMetadata = null;
        
        // Launch detection
        this.launchSteps = {
            processStarted: false,
            userSet: false,
            lwjglLoaded: false,
            resourcesLoaded: false,
            fullyStarted: false
        };
        
        // Heartbeat monitoring
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        this.missedHeartbeats = 0;
        
        // Output tracking
        this.outputBuffer = [];
        this.maxBufferSize = 1000;
        
        // Mutex for state changes
        this.stateMutex = false;
        
        console.log('[GAME-STATE] Manager initialized');
    }

    /**
     * Get current game state
     */
    getState() {
        return {
            state: this.state,
            isRunning: this.state === 'RUNNING',
            isLaunching: this.state === 'LAUNCHING',
            pid: this.gamePid,
            startTime: this.gameStartTime,
            uptime: this.gameStartTime ? Date.now() - this.gameStartTime : 0,
            metadata: this.gameMetadata,
            launchSteps: { ...this.launchSteps }
        };
    }

    /**
     * Start game launch
     */
    async startLaunch(metadata = {}) {
        if (this.stateMutex) {
            console.warn('[GAME-STATE] ⚠️ State change already in progress');
            throw new Error('State change already in progress');
        }

        if (this.state !== 'IDLE') {
            console.warn(`[GAME-STATE] ⚠️ Cannot launch: current state is ${this.state}`);
            throw new Error(`Cannot launch: current state is ${this.state}`);
        }

        this.stateMutex = true;

        try {
            console.log('[GAME-STATE] 🚀 Starting game launch...');
            
            // Reset state
            this.state = 'LAUNCHING';
            this.gameMetadata = metadata;
            this.gameStartTime = Date.now();
            this.launchSteps = {
                processStarted: false,
                userSet: false,
                lwjglLoaded: false,
                resourcesLoaded: false,
                fullyStarted: false
            };
            this.outputBuffer = [];
            this.missedHeartbeats = 0;

            this.emit('state-changed', this.getState());
            
            console.log('[GAME-STATE] ✅ Launch state initialized');
        } catch (error) {
            // CRITICAL: Reset state on error
            console.error('[GAME-STATE] ❌ Error in startLaunch, resetting state:', error);
            this.resetState();
            throw error;
        } finally {
            this.stateMutex = false;
        }
    }

    /**
     * Register game process
     */
    registerProcess(process, pid = null) {
        if (this.state !== 'LAUNCHING') {
            console.warn('[GAME-STATE] Cannot register process: not in LAUNCHING state');
            return;
        }

        this.gameProcess = process;
        this.gamePid = pid || process.pid;
        this.launchSteps.processStarted = true;

        console.log(`[GAME-STATE] ✅ Process registered: PID ${this.gamePid}`);

        // Setup process monitoring
        this.setupProcessMonitoring(process);

        // Start heartbeat
        this.startHeartbeat();

        this.emit('process-registered', { pid: this.gamePid });
        this.emit('state-changed', this.getState());
    }

    /**
     * Setup process output monitoring
     */
    setupProcessMonitoring(process) {
        if (!process) return;

        // Monitor stdout
        if (process.stdout) {
            process.stdout.on('data', (data) => {
                const output = data.toString();
                this.handleGameOutput(output, 'stdout');
            });
        }

        // Monitor stderr
        if (process.stderr) {
            process.stderr.on('data', (data) => {
                const output = data.toString();
                this.handleGameOutput(output, 'stderr');
            });
        }

        // Monitor process exit
        process.on('close', (code, signal) => {
            console.log(`[GAME-STATE] Process closed: code=${code}, signal=${signal}`);
            this.handleProcessExit(code, signal);
        });

        process.on('error', (error) => {
            console.error('[GAME-STATE] Process error:', error);
            this.handleProcessError(error);
        });

        // Register with ProcessManager
        if (this.gamePid) {
            processManager.registerProcess(this.gamePid, 'minecraft', {
                name: this.gameMetadata?.name || 'Minecraft',
                startTime: this.gameStartTime
            });
        }
    }

    /**
     * Handle game output for launch detection
     */
    handleGameOutput(output, stream) {
        // Add to buffer
        this.outputBuffer.push({
            timestamp: Date.now(),
            stream: stream,
            content: output
        });

        // Trim buffer if too large
        if (this.outputBuffer.length > this.maxBufferSize) {
            this.outputBuffer.shift();
        }

        // Emit raw output
        this.emit('game-output', { stream, content: output });

        // Launch detection patterns
        if (this.state === 'LAUNCHING') {
            // Step 1: User set
            if (!this.launchSteps.userSet && output.includes('Setting user:')) {
                this.launchSteps.userSet = true;
                console.log('[GAME-STATE] ✅ Step 1: User set');
                this.emit('launch-step', { step: 'userSet', completed: true });
            }

            // Step 2: LWJGL loaded
            if (!this.launchSteps.lwjglLoaded && output.includes('Backend library: LWJGL')) {
                this.launchSteps.lwjglLoaded = true;
                console.log('[GAME-STATE] ✅ Step 2: LWJGL loaded');
                this.emit('launch-step', { step: 'lwjglLoaded', completed: true });
            }

            // Step 3: Resources loading
            if (!this.launchSteps.resourcesLoaded && output.includes('Reloading ResourceManager')) {
                this.launchSteps.resourcesLoaded = true;
                console.log('[GAME-STATE] ✅ Step 3: Resources loaded');
                this.emit('launch-step', { step: 'resourcesLoaded', completed: true });
            }

            // Step 4: Fully started (main menu or world loaded)
            if (!this.launchSteps.fullyStarted && 
                (output.includes('OpenAL initialized') || 
                 output.includes('Sound engine started') ||
                 output.includes('Created: 1024x1024'))) {
                this.launchSteps.fullyStarted = true;
                console.log('[GAME-STATE] ✅ Step 4: Game fully started');
                this.markGameAsRunning();
            }
        }

        // Error detection
        if (output.includes('FATAL') || output.includes('Crash Report') || output.includes('java.lang.OutOfMemoryError')) {
            console.error('[GAME-STATE] ❌ Fatal error detected in game output');
            this.emit('game-error', { type: 'fatal', output });
        }
    }

    /**
     * Mark game as fully running
     */
    markGameAsRunning() {
        if (this.state !== 'LAUNCHING') return;

        this.state = 'RUNNING';
        const launchDuration = Date.now() - this.gameStartTime;

        console.log(`[GAME-STATE] 🎮 Game is now RUNNING (launch took ${launchDuration}ms)`);
        
        this.emit('game-started', {
            pid: this.gamePid,
            launchDuration: launchDuration,
            metadata: this.gameMetadata
        });
        
        this.emit('state-changed', this.getState());
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.lastHeartbeat = Date.now();

        this.heartbeatInterval = setInterval(() => {
            this.checkHeartbeat();
        }, 5000); // Check every 5 seconds

        console.log('[GAME-STATE] Heartbeat monitoring started');
    }

    /**
     * Check process heartbeat
     */
    checkHeartbeat() {
        if (!this.gamePid || (this.state !== 'LAUNCHING' && this.state !== 'RUNNING')) {
            return;
        }

        // Check if process still exists
        const isRunning = processManager.isProcessRunning(this.gamePid);

        if (!isRunning) {
            this.missedHeartbeats++;
            console.warn(`[GAME-STATE] ⚠️ Missed heartbeat ${this.missedHeartbeats}/3`);

            if (this.missedHeartbeats >= 3) {
                console.error('[GAME-STATE] ❌ Process appears to be dead (3 missed heartbeats)');
                this.handleProcessCrash('Process not responding');
            }
        } else {
            this.missedHeartbeats = 0;
            this.lastHeartbeat = Date.now();
        }
    }

    /**
     * Handle process exit
     */
    handleProcessExit(code, signal) {
        console.log(`[GAME-STATE] Process exited: code=${code}, signal=${signal}`);

        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Determine exit type
        const wasRunning = this.state === 'RUNNING';
        const exitType = code === 0 ? 'normal' : 'abnormal';

        this.emit('game-stopped', {
            pid: this.gamePid,
            exitCode: code,
            signal: signal,
            exitType: exitType,
            wasRunning: wasRunning,
            uptime: this.gameStartTime ? Date.now() - this.gameStartTime : 0
        });

        // Reset state
        this.resetState();
    }

    /**
     * Handle process error
     */
    handleProcessError(error) {
        console.error('[GAME-STATE] Process error:', error);

        this.emit('game-error', {
            type: 'process-error',
            error: error.message,
            pid: this.gamePid
        });

        // If error during launch, mark as crashed
        if (this.state === 'LAUNCHING') {
            this.handleProcessCrash(error.message);
        }
    }

    /**
     * Handle process crash
     */
    handleProcessCrash(reason) {
        console.error(`[GAME-STATE] 💥 Game crashed: ${reason}`);

        this.state = 'CRASHED';

        this.emit('game-crashed', {
            pid: this.gamePid,
            reason: reason,
            uptime: this.gameStartTime ? Date.now() - this.gameStartTime : 0,
            metadata: this.gameMetadata
        });

        this.emit('state-changed', this.getState());

        // Auto-reset after 5 seconds
        setTimeout(() => {
            this.resetState();
        }, 5000);
    }

    /**
     * Stop game gracefully
     */
    async stopGame() {
        if (this.state === 'IDLE') {
            console.log('[GAME-STATE] No game to stop');
            return { success: true, message: 'No game running' };
        }

        if (this.state === 'STOPPING') {
            console.log('[GAME-STATE] Already stopping');
            return { success: true, message: 'Already stopping' };
        }

        console.log('[GAME-STATE] 🛑 Stopping game...');
        this.state = 'STOPPING';
        this.emit('state-changed', this.getState());

        try {
            if (!this.gamePid) {
                console.warn('[GAME-STATE] ⚠️ No PID stored, trying to find Minecraft process...');
                
                // Try to find Minecraft process manually
                try {
                    const { exec } = require('child_process');
                    const util = require('util');
                    const execAsync = util.promisify(exec);
                    
                    if (process.platform === 'win32') {
                        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq javaw.exe" /FO CSV /NH');
                        console.log('[GAME-STATE] Found Java processes:', stdout);
                        
                        // Kill all javaw.exe processes (Minecraft uses javaw.exe)
                        await execAsync('taskkill /F /IM javaw.exe');
                        console.log('[GAME-STATE] ✅ Killed Minecraft processes');
                    } else {
                        // Linux/Mac: kill java processes
                        await execAsync('pkill -f "net.minecraft.client.main.Main"');
                        console.log('[GAME-STATE] ✅ Killed Minecraft processes');
                    }
                } catch (killError) {
                    console.warn('[GAME-STATE] Could not kill Minecraft:', killError.message);
                }
                
                this.resetState();
                return { success: true, message: 'Process killed manually' };
            }

            // Use ProcessManager to stop
            const result = await processManager.stopProcess(this.gamePid);

            // Stop heartbeat
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }

            // Reset state
            this.resetState();

            if (result.success) {
                console.log('[GAME-STATE] ✅ Game stopped successfully');
                return { success: true, message: 'Game stopped' };
            } else {
                console.warn('[GAME-STATE] ⚠️ Stop may have failed, but state reset');
                return { success: true, message: 'Stop attempted, state reset' };
            }

        } catch (error) {
            console.error('[GAME-STATE] Error stopping game:', error);
            this.resetState();
            return { success: false, error: error.message };
        }
    }

    /**
     * Force kill game
     */
    async forceKillGame() {
        console.log('[GAME-STATE] ⚡ Force killing game...');

        if (!this.gamePid) {
            this.resetState();
            return { success: true, message: 'No PID to kill' };
        }

        try {
            await processManager.forceKill(this.gamePid);
            
            // Stop heartbeat
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }

            this.resetState();

            console.log('[GAME-STATE] ✅ Game force killed');
            return { success: true, message: 'Game force killed' };

        } catch (error) {
            console.error('[GAME-STATE] Error force killing:', error);
            this.resetState();
            return { success: false, error: error.message };
        }
    }

    /**
     * Reset state to IDLE
     */
    resetState() {
        console.log('[GAME-STATE] Resetting to IDLE...');

        const previousState = this.state;
        
        this.state = 'IDLE';
        this.gameProcess = null;
        this.gamePid = null;
        this.gameStartTime = null;
        this.gameMetadata = null;
        this.launchSteps = {
            processStarted: false,
            userSet: false,
            lwjglLoaded: false,
            resourcesLoaded: false,
            fullyStarted: false
        };
        this.outputBuffer = [];
        this.missedHeartbeats = 0;

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        this.emit('state-reset', { previousState });
        this.emit('state-changed', this.getState());

        console.log('[GAME-STATE] ✅ State reset to IDLE');
    }

    /**
     * Get recent output
     */
    getRecentOutput(lines = 50) {
        return this.outputBuffer.slice(-lines);
    }

    /**
     * Cleanup and destroy manager
     */
    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.removeAllListeners();
        this.resetState();
        
        console.log('[GAME-STATE] Manager destroyed');
    }
}

// Singleton instance
const gameStateManager = new GameStateManager();

module.exports = gameStateManager;
