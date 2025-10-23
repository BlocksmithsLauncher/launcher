const EventEmitter = require('events');

/**
 * Modern Progress Tracking System
 * - Centralized progress management
 * - Multiple concurrent operations support
 * - Detailed progress reporting
 * - Automatic stale detection
 */
class ProgressTracker extends EventEmitter {
    constructor() {
        super();
        
        // Active operations tracking
        this.operations = new Map();
        
        // Operation types
        this.OPERATION_TYPES = {
            DOWNLOAD: 'download',
            INSTALL: 'install',
            EXTRACT: 'extract',
            LAUNCH: 'launch',
            STOP: 'stop'
        };
        
        // Progress states
        this.STATES = {
            PENDING: 'pending',
            ACTIVE: 'active',
            COMPLETED: 'completed',
            FAILED: 'failed',
            CANCELLED: 'cancelled'
        };
        
        // Stale detection (operations stuck for >30s)
        this.staleCheckInterval = setInterval(() => this.checkStaleOperations(), 5000);
        
        console.log('[PROGRESS-TRACKER] Initialized');
    }

    /**
     * Start tracking a new operation
     */
    startOperation(operationId, type, metadata = {}) {
        const operation = {
            id: operationId,
            type: type,
            state: this.STATES.PENDING,
            progress: 0,
            current: 0,
            total: 0,
            message: metadata.message || 'Başlatılıyor...',
            metadata: metadata,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            stages: [],
            currentStage: null
        };

        this.operations.set(operationId, operation);
        
        console.log(`[PROGRESS-TRACKER] Started operation: ${operationId} (${type})`);
        this.emitProgress(operationId);
        
        return operationId;
    }

    /**
     * Update operation progress
     */
    updateProgress(operationId, updates) {
        const operation = this.operations.get(operationId);
        if (!operation) {
            console.warn(`[PROGRESS-TRACKER] Operation not found: ${operationId}`);
            return;
        }

        // Update fields
        if (updates.state !== undefined) operation.state = updates.state;
        if (updates.progress !== undefined) operation.progress = Math.min(100, Math.max(0, updates.progress));
        if (updates.current !== undefined) operation.current = updates.current;
        if (updates.total !== undefined) operation.total = updates.total;
        if (updates.message !== undefined) operation.message = updates.message;
        if (updates.metadata !== undefined) operation.metadata = { ...operation.metadata, ...updates.metadata };

        // Auto-calculate progress if current/total provided
        if (updates.current !== undefined && updates.total !== undefined && updates.total > 0) {
            operation.progress = Math.round((updates.current / updates.total) * 100);
        }

        // Update timestamp
        operation.lastUpdate = Date.now();

        // Mark as active if not already
        if (operation.state === this.STATES.PENDING && updates.progress > 0) {
            operation.state = this.STATES.ACTIVE;
        }

        this.emitProgress(operationId);
    }

    /**
     * Add a stage to operation (for multi-stage processes)
     */
    addStage(operationId, stageName, stageProgress = 0) {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        const stage = {
            name: stageName,
            progress: stageProgress,
            startTime: Date.now(),
            completed: false
        };

        operation.stages.push(stage);
        operation.currentStage = stage;

        console.log(`[PROGRESS-TRACKER] ${operationId}: Stage added - ${stageName}`);
        this.emitProgress(operationId);
    }

    /**
     * Complete current stage
     */
    completeStage(operationId) {
        const operation = this.operations.get(operationId);
        if (!operation || !operation.currentStage) return;

        operation.currentStage.completed = true;
        operation.currentStage.endTime = Date.now();

        console.log(`[PROGRESS-TRACKER] ${operationId}: Stage completed - ${operation.currentStage.name}`);
        this.emitProgress(operationId);
    }

    /**
     * Complete operation
     */
    completeOperation(operationId, finalMessage = 'Tamamlandı') {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        operation.state = this.STATES.COMPLETED;
        operation.progress = 100;
        operation.message = finalMessage;
        operation.endTime = Date.now();

        const duration = operation.endTime - operation.startTime;
        console.log(`[PROGRESS-TRACKER] ✅ Operation completed: ${operationId} (${duration}ms)`);
        
        this.emitProgress(operationId);

        // Auto-cleanup after 5 seconds
        setTimeout(() => {
            this.operations.delete(operationId);
            this.emit('operation-removed', operationId);
        }, 5000);
    }

    /**
     * Fail operation
     */
    failOperation(operationId, errorMessage) {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        operation.state = this.STATES.FAILED;
        operation.message = errorMessage;
        operation.error = errorMessage;
        operation.endTime = Date.now();

        console.error(`[PROGRESS-TRACKER] ❌ Operation failed: ${operationId} - ${errorMessage}`);
        
        this.emitProgress(operationId);

        // Auto-cleanup after 10 seconds
        setTimeout(() => {
            this.operations.delete(operationId);
            this.emit('operation-removed', operationId);
        }, 10000);
    }

    /**
     * Cancel operation
     */
    cancelOperation(operationId, reason = 'Kullanıcı tarafından iptal edildi') {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        operation.state = this.STATES.CANCELLED;
        operation.message = reason;
        operation.endTime = Date.now();

        console.log(`[PROGRESS-TRACKER] 🚫 Operation cancelled: ${operationId} - ${reason}`);
        
        this.emitProgress(operationId);

        // Auto-cleanup after 3 seconds
        setTimeout(() => {
            this.operations.delete(operationId);
            this.emit('operation-removed', operationId);
        }, 3000);
    }

    /**
     * Get operation status
     */
    getOperation(operationId) {
        return this.operations.get(operationId);
    }

    /**
     * Get all operations
     */
    getAllOperations() {
        return Array.from(this.operations.values());
    }

    /**
     * Get active operations
     */
    getActiveOperations() {
        return Array.from(this.operations.values()).filter(
            op => op.state === this.STATES.ACTIVE || op.state === this.STATES.PENDING
        );
    }

    /**
     * Check for stale operations (stuck for >30s)
     */
    checkStaleOperations() {
        const now = Date.now();
        const staleThreshold = 30000; // 30 seconds

        for (const [id, operation] of this.operations) {
            if (operation.state === this.STATES.ACTIVE || operation.state === this.STATES.PENDING) {
                const timeSinceUpdate = now - operation.lastUpdate;
                
                if (timeSinceUpdate > staleThreshold) {
                    console.warn(`[PROGRESS-TRACKER] ⚠️ Stale operation detected: ${id} (${timeSinceUpdate}ms since last update)`);
                    
                    // Emit stale warning
                    this.emit('operation-stale', {
                        operationId: id,
                        operation: operation,
                        staleDuration: timeSinceUpdate
                    });
                    
                    // Auto-fail after 60 seconds
                    if (timeSinceUpdate > 60000) {
                        this.failOperation(id, 'İşlem zaman aşımına uğradı (60s)');
                    }
                }
            }
        }
    }

    /**
     * Emit progress update to listeners
     */
    emitProgress(operationId) {
        const operation = this.operations.get(operationId);
        if (!operation) return;

        // Emit specific operation progress
        this.emit('progress', {
            operationId: operationId,
            ...operation
        });

        // Emit global progress update
        this.emit('progress-update', {
            operationId: operationId,
            operation: operation,
            activeCount: this.getActiveOperations().length,
            totalCount: this.operations.size
        });
    }

    /**
     * Clear all completed/failed operations
     */
    clearCompleted() {
        let cleared = 0;
        for (const [id, operation] of this.operations) {
            if (operation.state === this.STATES.COMPLETED || 
                operation.state === this.STATES.FAILED || 
                operation.state === this.STATES.CANCELLED) {
                this.operations.delete(id);
                cleared++;
            }
        }
        
        if (cleared > 0) {
            console.log(`[PROGRESS-TRACKER] Cleared ${cleared} completed operations`);
            this.emit('operations-cleared', cleared);
        }
    }

    /**
     * Cleanup and destroy tracker
     */
    destroy() {
        clearInterval(this.staleCheckInterval);
        this.operations.clear();
        this.removeAllListeners();
        console.log('[PROGRESS-TRACKER] Destroyed');
    }
}

// Singleton instance
const progressTracker = new ProgressTracker();

module.exports = progressTracker;
