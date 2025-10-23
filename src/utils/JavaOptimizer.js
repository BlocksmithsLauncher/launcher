const os = require('os');

/**
 * JAVA OPTIMIZER
 * Auto-detects optimal Java arguments based on:
 * - Available system RAM
 * - Minecraft version
 * - Modloader type
 * - Number of mods
 */
class JavaOptimizer {
    constructor() {
        this.totalRAM = os.totalmem();
        this.freeRAM = os.freemem();
        this.cpuCount = os.cpus().length;
    }

    /**
     * Get optimal Java arguments for Minecraft
     * @param {object} options - { minecraftVersion, modloader, modCount }
     * @returns {object} - { minMemory, maxMemory, jvmArgs }
     */
    getOptimalArgs(options = {}) {
        const {
            minecraftVersion = '1.20.1',
            modloader = 'vanilla',
            modCount = 0
        } = options;

        const totalRAMGB = Math.floor(this.totalRAM / (1024 ** 3));
        
        // Determine RAM allocation based on available memory
        let maxMemoryGB, minMemoryGB;
        
        if (totalRAMGB <= 4) {
            // Low RAM system (4GB or less)
            maxMemoryGB = 2;
            minMemoryGB = 1;
        } else if (totalRAMGB <= 8) {
            // Medium RAM system (8GB)
            maxMemoryGB = modCount > 50 ? 4 : 3;
            minMemoryGB = 2;
        } else if (totalRAMGB <= 16) {
            // High RAM system (16GB)
            maxMemoryGB = modCount > 100 ? 6 : 4;
            minMemoryGB = 2;
        } else {
            // Very high RAM system (32GB+)
            maxMemoryGB = modCount > 150 ? 8 : 6;
            minMemoryGB = 3;
        }

        // Parse Minecraft version
        const versionParts = minecraftVersion.split('.');
        const majorVersion = parseInt(versionParts[1]) || 20;
        const isModern = majorVersion >= 17; // 1.17+ uses different JVM args

        // Base JVM arguments
        const jvmArgs = [];

        // Memory settings
        jvmArgs.push(`-Xms${minMemoryGB}G`);
        jvmArgs.push(`-Xmx${maxMemoryGB}G`);

        // Garbage Collection Optimization (Modern Java 17+)
        if (isModern) {
            // G1GC with optimized settings for modern Minecraft
            jvmArgs.push('-XX:+UnlockExperimentalVMOptions');
            jvmArgs.push('-XX:+UseG1GC');
            jvmArgs.push('-XX:G1NewSizePercent=20');
            jvmArgs.push('-XX:G1ReservePercent=20');
            jvmArgs.push('-XX:MaxGCPauseMillis=50');
            jvmArgs.push('-XX:G1HeapRegionSize=32M');
        } else {
            // Legacy Minecraft (pre-1.17)
            jvmArgs.push('-XX:+UseConcMarkSweepGC');
            jvmArgs.push('-XX:+CMSIncrementalMode');
            jvmArgs.push('-XX:-UseAdaptiveSizePolicy');
        }

        // Performance optimizations
        jvmArgs.push('-XX:+ParallelRefProcEnabled');
        jvmArgs.push('-XX:+DisableExplicitGC');
        jvmArgs.push('-XX:+AlwaysPreTouch');
        jvmArgs.push('-XX:+PerfDisableSharedMem');
        
        // CPU optimization
        if (this.cpuCount >= 4) {
            jvmArgs.push('-XX:ParallelGCThreads=' + Math.min(this.cpuCount - 1, 8));
            jvmArgs.push('-XX:ConcGCThreads=' + Math.max(Math.floor(this.cpuCount / 4), 1));
        }

        // Modded Minecraft optimization
        if (modloader !== 'vanilla' && modCount > 50) {
            // More aggressive optimization for heavily modded packs
            jvmArgs.push('-XX:+UseStringDeduplication');
            jvmArgs.push('-XX:+UseFastAccessorMethods');
            jvmArgs.push('-XX:+OptimizeStringConcat');
            
            // Increase code cache for mods
            jvmArgs.push('-XX:ReservedCodeCacheSize=256M');
        }

        // Windows-specific optimizations
        if (process.platform === 'win32') {
            jvmArgs.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
        }

        // Modern Java performance flags
        jvmArgs.push('-Dfile.encoding=UTF-8');
        jvmArgs.push('-Dlog4j2.formatMsgNoLookups=true'); // Log4Shell protection

        console.log('[JAVA-OPTIMIZER] System RAM:', totalRAMGB, 'GB');
        console.log('[JAVA-OPTIMIZER] Allocated:', minMemoryGB, '-', maxMemoryGB, 'GB');
        console.log('[JAVA-OPTIMIZER] CPU Cores:', this.cpuCount);
        console.log('[JAVA-OPTIMIZER] Mod Count:', modCount);
        console.log('[JAVA-OPTIMIZER] Generated', jvmArgs.length, 'JVM arguments');

        return {
            minMemory: `${minMemoryGB}G`,
            maxMemory: `${maxMemoryGB}G`,
            jvmArgs: jvmArgs
        };
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            totalRAM: this.totalRAM,
            freeRAM: this.freeRAM,
            totalRAMGB: Math.floor(this.totalRAM / (1024 ** 3)),
            freeRAMGB: Math.floor(this.freeRAM / (1024 ** 3)),
            cpuCount: this.cpuCount,
            cpuModel: os.cpus()[0]?.model || 'Unknown'
        };
    }
}

// Singleton instance
const javaOptimizer = new JavaOptimizer();

module.exports = javaOptimizer;

