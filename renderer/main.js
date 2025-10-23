const { ipcRenderer } = require('electron');
const ipcManager = require('./utils/IPCManager');
const cacheManager = require('./utils/CacheManager');
const { debounce, throttle, measurePerformanceAsync } = require('./utils/performance');

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');
const versionSelect = document.getElementById('versionSelect');
const launchProgress = document.getElementById('launchProgress');
const loadingOverlay = document.getElementById('loadingOverlay');
const memorySlider = document.getElementById('memorySlider');
const memoryValue = document.getElementById('memoryValue');
const statusText = document.getElementById('statusText');

// Global Variables
let currentProfile = null;
let settings = {};
let isLaunching = false;
let currentRunningModpackId = null; // Track which modpack is currently running
let recentModpacks = JSON.parse(localStorage.getItem('recentModpacks') || '[]');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadProfile();
    await loadSettings();
    await loadAvailableVersions();
    await loadLauncherVersion(); // Load and display version
    setupEventListeners();
    setupNavigation();
    updateStatusBar();
    loadNews();
    updateRecentModpacksUI();
    setupModpackSearch();
    
    // Initialize Discord RPC with home page
    ipcRenderer.invoke('update-discord-rpc', 'home');
    
    // Load servers immediately for sidebar rotation
    await loadServers();
    
    // Sidebar system ready - will be triggered by real modpack installations
});

// Load current profile
async function loadProfile() {
    try {
        const profilesData = await ipcRenderer.invoke('get-profiles');
        if (profilesData.selectedProfile) {
            currentProfile = profilesData.profiles.find(p => p.id === profilesData.selectedProfile);
            updateProfileDisplay();
        }
    } catch (error) {
        console.error('Profil yüklenirken hata:', error);
        showNotification('Profil yüklenirken hata oluştu', 'error');
    }
}

// Update profile display in header and sidebar
function updateProfileDisplay() {
    if (!currentProfile) return;
    
    // Legacy titlebar elements (might not exist anymore)
    const profileName = document.getElementById('currentProfileName');
    const profileVersion = document.getElementById('currentProfileVersion');
    const profileAvatar = document.getElementById('currentProfileAvatar');
    
    if (profileName) profileName.textContent = currentProfile.name;
    if (profileVersion) profileVersion.textContent = `v${currentProfile.gameVersion}`;
    
    // Update avatar (legacy)
    if (profileAvatar && currentProfile.avatar && currentProfile.avatar !== 'steve') {
        const avatarSrc = currentProfile.avatar.startsWith('data:') 
            ? currentProfile.avatar 
            : `../assets/images/avatars/${currentProfile.avatar}.png`;
        
        profileAvatar.innerHTML = `<img src="${avatarSrc}" alt="${currentProfile.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><i class="fas fa-user" style="display: none;"></i>`;
    }
    
    // Update version selector
    if (versionSelect) versionSelect.value = currentProfile.gameVersion;
    
    // Update sidebar profile
    updateSidebarProfile();
}

// Load settings
async function loadSettings() {
    try {
        settings = await ipcRenderer.invoke('get-settings');
        updateSettingsDisplay();
    } catch (error) {
        console.error('Ayarlar yüklenirken hata:', error);
    }
}

// Update settings display
function updateSettingsDisplay() {
    // Memory slider
    const memoryAmount = parseInt(settings.maxMemoryGB || settings.memory?.replace('G', '') || '2');
    if (memorySlider) {
    memorySlider.value = memoryAmount;
    memoryValue.textContent = `${memoryAmount} GB`;
    }
    
    // Game directory
    const gameDirectoryInput = document.getElementById('gameDirectory');
    if (gameDirectoryInput) {
        gameDirectoryInput.value = settings.gameDirectory || '';
    }
    
    // Java args
    const javaArgsInput = document.getElementById('javaArgs');
    if (javaArgsInput) {
        javaArgsInput.value = settings.javaArgs || '';
    }
    
    // Checkboxes
    // Note: showAds option removed - ads are always enabled
    
    const autoLoginCheckbox = document.getElementById('autoLogin');
    if (autoLoginCheckbox) {
        autoLoginCheckbox.checked = settings.autoLogin === true;
    }
    
    // Language
    const languageSelect = document.getElementById('language');
    if (languageSelect) {
        languageSelect.value = settings.language || 'tr';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Play button
    playButton.addEventListener('click', launchMinecraft);
    
    // Stop button
    stopButton.addEventListener('click', stopMinecraft);
    
    // Version selector
    versionSelect.addEventListener('change', (e) => {
        if (currentProfile) {
            currentProfile.gameVersion = e.target.value;
            updateProfile();
            console.log(`Version changed to: ${e.target.value}`);
        }
    });
    
    // Memory slider
    if (memorySlider) {
        memorySlider.addEventListener('input', async (e) => {
            const value = parseInt(e.target.value, 10);
            memoryValue.textContent = `${value} GB`;
            settings.maxMemoryGB = value;
            if (!settings.minMemoryGB || settings.minMemoryGB > value) settings.minMemoryGB = Math.max(1, value - 1);
            await saveSettings();
        });
    }
    
    // Settings form elements
    const settingsInputs = document.querySelectorAll('#settingsPage input, #settingsPage select');
    settingsInputs.forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Import .mrpack via file dialog
    const importBtn = document.getElementById('importMrpackBtn');
    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            const res = await ipcRenderer.invoke('import-modpack-dialog');
            if (res && res.success && res.filePath) {
                const run = await ipcRenderer.invoke('import-modpack', res.filePath);
                if (run && run.success) {
                    showNotification('Modpack başarıyla içe aktarıldı', 'success');
                } else {
                    showNotification(run?.error || 'Modpack içe aktarma başarısız', 'error');
                }
            }
        });
    }

    // Featured modpacks quick import (defined later in the file around line ~3508)
    
    // IPC listeners for launch events
    ipcRenderer.on('launch-debug', (event, data) => {
        console.log('Launch debug:', data);
    });
    
    ipcRenderer.on('launch-data', (event, data) => {
        console.log('Launch data:', data);
        updateStatusBar('Minecraft çalışıyor...');
    });
    
    // Listen for game state changes
    ipcRenderer.on('game-state-changed', (event, state) => {
        console.log('🎮 [GAME-STATE] State changed:', state);
        handleGameStateChange(state);
    });
    
    ipcRenderer.on('launch-progress', (event, progress) => {
        console.log('🚀 [PROGRESS-DEBUG] Received:', progress);
        console.log('🚀 [PROGRESS-TASK]:', progress.task);
        console.log('🚀 [PROGRESS-MESSAGE]:', progress.message);
        updateLaunchProgress(progress);
        
        // CRITICAL: Check for completion messages
        if (progress.task === 'Varlıklar Tamamlandı' || progress.message?.includes('asset dosyası başarıyla indirildi')) {
            console.log('✅ [SIDEBAR-COMPLETE-DETECTED] Minecraft download completed!');
            updateSidebarProgressFromMessage(progress.message || 'Varlıklar Tamamlandı');
        }
        // Update sidebar progress for modpack installations
        else if (progress.task === 'Modpack İşlemleri' && progress.message) {
            console.log('🎯 [SIDEBAR-TRIGGER] Triggering sidebar update for:', progress.message);
            updateSidebarProgressFromMessage(progress.message);
        } else if (progress.message && (
            progress.message.includes('yükleniyor') || 
            progress.message.includes('indiriliyor') || 
            progress.message.includes('kuruluyor') ||
            progress.message.includes('Modpack') ||
            progress.message.includes('Fabric') ||
            progress.message.includes('Mod ')
        )) {
            console.log('🎯 [SIDEBAR-ALT] Alternative sidebar trigger for:', progress.message);
            updateSidebarProgressFromMessage(progress.message);
        } else if (window.currentModpackInstallation && progress.message) {
            // Update current installation progress
            console.log('🔄 [INSTALL-UPDATE] Updating current installation progress:', progress.message);
            updateCurrentInstallationProgress(progress.message);
        } else {
            console.log('❌ [SIDEBAR-SKIP] Skipping sidebar update - task:', progress.task, 'message:', !!progress.message);
        }
        
        // Auto-hide progress after successful launch - but wait for actual game launch
        if (progress.task === 'Minecraft Çalışıyor' && progress.message.includes('açıldı')) {
            setTimeout(() => {
                hideLaunchProgress();
                updateStatusBar('Minecraft çalışıyor');
                // Keep stop button visible when game is running
                isLaunching = false;
            }, 2000);
        } else if (progress.task === 'Versiyon Hazır') {
            // Don't hide progress for already installed versions, just continue
            setTimeout(() => {
                updateStatusBar('Versiyon hazır, başlatılıyor...');
            }, 500);
        }
    });
    
    ipcRenderer.on('launch-close', (event, code) => {
        console.log('Minecraft kapatıldı, kod:', code);
        hideLaunchProgress();
        updateStatusBar('Hazır');
        toggleGameButtons(false);
        isLaunching = false;
    });
    
    ipcRenderer.on('launch-error', (event, error) => {
        console.error('[RENDERER] Launch error:', error);
        
        // Hide progress and reset UI
        hideLaunchProgress();
        updateStatusBar('Hata oluştu');
        toggleGameButtons(false);
        isLaunching = false;
        
        // CRITICAL: Reset currentRunningModpackId
        if (currentRunningModpackId) {
            console.log('[RENDERER] Resetting currentRunningModpackId:', currentRunningModpackId);
            currentRunningModpackId = null;
        }
        
        // Reset currently playing modpack buttons
        if (currentlyPlayingModpackId) {
            console.log('[RENDERER] Resetting modpack buttons after error for:', currentlyPlayingModpackId);
            toggleModpackButtons(currentlyPlayingModpackId, false);
            updateModpackProgress(currentlyPlayingModpackId, `Hata: ${error}`, false);
            
            // Clear error message after 5 seconds
            setTimeout(() => {
                updateModpackProgress(currentlyPlayingModpackId, '', false);
            }, 5000);
            
            currentlyPlayingModpackId = null;
        }
        
        showNotification(`Başlatma hatası: ${error}`, 'error');
    });
    
    ipcRenderer.on('game-closed', async (event, code) => {
        console.log('[RENDERER] Game closed with code:', code);
        
        // Stop game state checking
        if (gameStateCheckInterval) {
            clearInterval(gameStateCheckInterval);
            gameStateCheckInterval = null;
        }
        
        // Reset Discord RPC to home page
        ipcRenderer.invoke('update-discord-rpc', 'home');
        
        // Calculate and save playtime
        if (gameStartTime && currentlyPlayingModpackId) {
            const gameEndTime = new Date();
            const playTimeMinutes = Math.floor((gameEndTime - gameStartTime) / (1000 * 60));
            console.log('[PLAYTIME] Session ended. Duration:', playTimeMinutes, 'minutes');
            
            // Update modpack playtime
            const modpack = libraryData.find(m => m.id === currentlyPlayingModpackId);
            if (modpack) {
                modpack.totalPlayTime = (modpack.totalPlayTime || 0) + playTimeMinutes;
                console.log('[PLAYTIME] Total playtime for', modpack.name, ':', modpack.totalPlayTime, 'minutes');
                
                // Save to instance.json
                try {
                    await ipcRenderer.invoke('update-modpack-playtime', currentlyPlayingModpackId, playTimeMinutes);
                } catch (error) {
                    console.error('[PLAYTIME] Error saving playtime:', error);
                }
                
                updateLibraryDisplay();
            }
            
            gameStartTime = null;
        }
        
        // Hide progress and reset UI
        hideLaunchProgress();
        updateStatusBar('Hazır');
        toggleGameButtons(false);
        isLaunching = false;
        
        // Reset currently playing modpack buttons
        if (currentlyPlayingModpackId) {
            console.log('[RENDERER] Resetting modpack buttons for:', currentlyPlayingModpackId);
            toggleModpackButtons(currentlyPlayingModpackId, false);
            updateModpackProgress(currentlyPlayingModpackId, '', false);
            currentlyPlayingModpackId = null;
        }
        
        // Show notification
        if (code === 0) {
            showNotification('Oyun normal şekilde kapandı', 'success');
        } else if (code !== null && code !== undefined) {
            showNotification(`Oyun kapandı (çıkış kodu: ${code})`, 'info');
        } else {
            showNotification('Oyun kapandı', 'info');
        }
    });
    
    // Game successfully started - hide launch progress and start tracking playtime
    ipcRenderer.on('game-started', async () => {
        console.log('[RENDERER] ✅ Game-started event received');
        
        // Wait a moment for process to fully initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify game is actually running before showing stop button
        const gameState = await ipcRenderer.invoke('get-game-state');
        console.log('[RENDERER] Game state after start:', gameState);
        
        if (!gameState.isRunning) {
            console.log('[RENDERER] ⚠️ Game not actually running yet, will wait for periodic check');
            // Don't return, still start the check interval
        }
        
        // Update Discord RPC - game actually started
        if (currentlyPlayingModpackId) {
            const modpack = libraryData.find(m => m.id === currentlyPlayingModpackId);
            if (modpack) {
                ipcRenderer.invoke('update-discord-rpc', 'playing', {
                    modpackName: modpack.name,
                    version: modpack.minecraftVersion || modpack.version,
                    iconUrl: modpack.iconUrl,
                    startTimestamp: Date.now()
                });
            }
        } else {
            // Vanilla Minecraft
            const selectedVersion = versionSelect ? versionSelect.value : '1.20.4';
            ipcRenderer.invoke('update-discord-rpc', 'playing', {
                modpackName: null,
                version: selectedVersion,
                startTimestamp: Date.now()
            });
        }
        
        // Start tracking playtime
        gameStartTime = new Date();
        console.log('[PLAYTIME] ✅ Started tracking at:', gameStartTime.toISOString());
        
        // Hide launch progress
        hideLaunchProgress();
        updateStatusBar('Oyun çalışıyor');
        
        // Keep stop button visible (game is running)
        toggleGameButtons(true);
        isLaunching = false;
        
        // Hide modpack progress if a modpack is playing
        if (currentlyPlayingModpackId) {
            console.log('[RENDERER] Hiding modpack progress for:', currentlyPlayingModpackId);
            updateModpackProgress(currentlyPlayingModpackId, '', false);
        }
        
        showNotification('Minecraft başarıyla başlatıldı!', 'success');
        
        // Start periodic check to ensure game is still running
        startGameStateCheck();
    });
}

// Setup navigation
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.dataset.page;
            switchPage(targetPage);
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// Switch between pages (exposed globally for use in other scripts)
window.switchPage = function switchPage(pageId) {
    pages.forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(`${pageId}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Update Discord RPC based on page
    const rpcMap = {
        'home': 'home',
        'library': 'library',
        'servers': 'servers',
        'modpacks': 'modpacks',
        'settings': 'settings'
    };
    
    if (rpcMap[pageId]) {
        ipcRenderer.invoke('update-discord-rpc', rpcMap[pageId], {});
    }
    
    // Load page-specific content
    switch (pageId) {
        case 'mods':
            loadMods();
            break;
        case 'modpacks':
            loadModpacks();
            ipcRenderer.invoke('update-discord-rpc', 'modpacks', { modpackCount: 'Çokça' });
            break;
        case 'servers':
            loadServers();
            break;
        case 'settings':
            updateSettingsDisplay();
            break;
    }
}

// Launch Minecraft
async function launchMinecraft() {
    // Prevent launching if already launching or game is running
    if (isLaunching) {
        console.warn('⚠️ [LAUNCH-MINECRAFT] Already launching, please wait...');
        showNotification('Lütfen bekleyin, bir oyun başlatılıyor...', 'warning');
        return;
    }
    
    if (currentRunningModpackId) {
        console.warn('⚠️ [LAUNCH-MINECRAFT] A game is already running:', currentRunningModpackId);
        showNotification('Lütfen önce çalışan oyunu kapatın', 'warning');
        return;
    }
    
    if (!currentProfile) {
        showNotification('Lütfen önce bir profil seçin', 'error');
        return;
    }
    
    try {
        isLaunching = true;
        currentRunningModpackId = 'vanilla-minecraft'; // Set a special ID for vanilla
        console.log('🎮 [LAUNCH-MINECRAFT] Set currentRunningModpackId to: vanilla-minecraft');
        
        showLaunchProgress();
        updateStatusBar('Minecraft başlatılıyor...');
        toggleGameButtons(true); // Show stop, hide play
        
        const selectedVersion = versionSelect.value || currentProfile.gameVersion || '1.20.4';
        console.log(`Launching Minecraft version: ${selectedVersion}`);
        
        const launchOptions = {
            version: selectedVersion,
            username: currentProfile.playerName,
            authType: 'offline',
            maxMemory: settings.memory || '4G',
            minMemory: '1G',
            windowWidth: 1280,
            windowHeight: 720,
            fullscreen: false
        };
        
        const result = await ipcRenderer.invoke('launch-game', launchOptions);
        
        if (result.success) {
            // Update last played
            currentProfile.lastPlayed = new Date().toISOString();
            await updateProfile();
            
            // Discord RPC will be updated by game-started event
            
            showNotification('Minecraft başarıyla başlatıldı!', 'success');
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('❌ [LAUNCH-MINECRAFT] Launch error:', error);
        showNotification(`Minecraft başlatılırken hata: ${error.message}`, 'error');
        hideLaunchProgress();
        updateStatusBar('Hazır');
        toggleGameButtons(false); // Show play, hide stop
        
        // CRITICAL: Clear all flags on error
        isLaunching = false;
        currentRunningModpackId = null;
        console.log('🧹 [LAUNCH-MINECRAFT] Cleared all flags after error');
    }
}

// Stop Minecraft
async function stopMinecraft() {
    try {
        console.log('🛑 [STOP-MINECRAFT] Stop button clicked');
        console.log('🛑 [STOP-MINECRAFT] Current state - isLaunching:', isLaunching, 'currentRunningModpackId:', currentRunningModpackId);
        
        const result = await ipcRenderer.invoke('stop-game');
        console.log('🛑 [STOP-MINECRAFT] Stop game result:', result);
        
        if (result.success) {
            // UI will be updated by game-stopped event from GameStateManager
            showNotification('Minecraft durduruluyor...', 'info');
            console.log('✅ [STOP-MINECRAFT] Stop command sent successfully');
        } else {
            throw new Error(result.error || 'Oyun durdurulamadı');
        }
    } catch (error) {
        console.error('❌ [STOP-MINECRAFT] Failed to stop game:', error);
        showNotification('Oyun durdurulamadı: ' + error.message, 'error');
        
        // Force reset UI after error
        setTimeout(() => {
            hideLaunchProgress();
            updateStatusBar('Hazır');
            toggleGameButtons(false);
            isLaunching = false;
            currentRunningModpackId = null; // Clear vanilla ID too
            if (currentlyPlayingModpackId) {
                toggleModpackButtons(currentlyPlayingModpackId, false);
                updateModpackProgress(currentlyPlayingModpackId, '', false);
                currentlyPlayingModpackId = null;
        }
            console.log('🧹 [STOP-MINECRAFT] Force reset UI after error');
        }, 3000);
    }
}

// Toggle game control buttons
function toggleGameButtons(isGameRunning) {
    console.log(`🎮 [UI-BUTTONS] Toggling buttons - Game running: ${isGameRunning}`);
    console.log(`🎮 [UI-BUTTONS] Play button:`, playButton);
    console.log(`🎮 [UI-BUTTONS] Stop button:`, stopButton);
    
    if (isGameRunning) {
        if (playButton) {
        playButton.style.display = 'none';
            console.log('🎮 [UI-BUTTONS] ✅ Play button hidden');
        }
        if (stopButton) {
        stopButton.style.display = 'flex';
            console.log('🎮 [UI-BUTTONS] ✅ Stop button shown');
        }
    } else {
        if (playButton) {
        playButton.style.display = 'flex';
            console.log('🎮 [UI-BUTTONS] ✅ Play button shown');
        }
        if (stopButton) {
        stopButton.style.display = 'none';
            console.log('🎮 [UI-BUTTONS] ✅ Stop button hidden');
        }
    }
}

// Handle game state changes from GameStateManager
function handleGameStateChange(state) {
    console.log('🎮 [GAME-STATE-HANDLER] Processing state:', state);
    console.log('🎮 [GAME-STATE-HANDLER] currentRunningModpackId:', currentRunningModpackId);
    console.log('🎮 [GAME-STATE-HANDLER] launchProgress element:', launchProgress);
    
    // Handle different state types
    if (state.event === 'game-started') {
        console.log('✅ [GAME-STATE] Game fully started!');
        console.log('✅ [GAME-STATE] currentRunningModpackId:', currentRunningModpackId);
        toggleGameButtons(true);
        updateLibraryButtons(true, currentRunningModpackId);
        updateStatusBar('Minecraft çalışıyor');
        
        // Different notification for vanilla vs modpack
        const isVanilla = currentRunningModpackId === 'vanilla-minecraft';
        showNotification(isVanilla ? 'Minecraft başarıyla başlatıldı!' : 'Modpack başarıyla başlatıldı!', 'success');
        
        // Hide ALL progress bars IMMEDIATELY when game starts
        console.log('🔄 [GAME-STATE] Hiding ALL progress bars immediately after game started');
        hideLaunchProgress();
        if (currentRunningModpackId) {
            updateModpackProgress(currentRunningModpackId, '', false);
        }
        
        isLaunching = false;
    } else if (state.event === 'game-stopped') {
        console.log('🛑 [GAME-STATE] Game stopped');
        toggleGameButtons(false);
        updateLibraryButtons(false, null);
        updateStatusBar(`Oyun kapandı (kod: ${state.exitCode || 0})`);
        showNotification('Modpack kapatıldı', 'info');
        console.log('🔄 [GAME-STATE] Hiding progress bar after game stopped');
        hideLaunchProgress();
        
        // Clear modpack progress
        if (currentRunningModpackId) {
            updateModpackProgress(currentRunningModpackId, '', false);
            console.log('🧹 [GAME-STATE] Cleared modpack progress for:', currentRunningModpackId);
        }
        
        currentRunningModpackId = null; // Clear running modpack ID
        isLaunching = false;
        
        console.log('✅ [GAME-STATE] All states cleared, ready for next launch');
    } else if (state.event === 'game-crashed') {
        console.error('💥 [GAME-STATE] Game crashed!');
        toggleGameButtons(false);
        updateLibraryButtons(false, null);
        updateStatusBar('Oyun beklenmedik şekilde kapandı');
        showNotification('Minecraft beklenmedik şekilde kapandı', 'error');
        console.log('🔄 [GAME-STATE] Hiding progress bar after game crashed');
        hideLaunchProgress();
        
        // Clear modpack progress
        if (currentRunningModpackId) {
            updateModpackProgress(currentRunningModpackId, '', false);
            console.log('🧹 [GAME-STATE] Cleared modpack progress for:', currentRunningModpackId);
        }
        
        currentRunningModpackId = null; // Clear running modpack ID
        isLaunching = false;
        
        console.log('✅ [GAME-STATE] All states cleared after crash, ready for next launch');
    } else if (state.state) {
        // Handle general state changes
        console.log(`🔄 [GAME-STATE] State: ${state.state}, isRunning: ${state.isRunning}`);
        
        if (state.state === 'STARTING') {
            toggleGameButtons(true);
            updateLibraryButtons(true, currentRunningModpackId);
            updateStatusBar('Minecraft başlatılıyor...');
            // Don't hide progress here, let it show
        } else if (state.state === 'RUNNING') {
            toggleGameButtons(true);
            updateLibraryButtons(true, currentRunningModpackId);
            updateStatusBar('Minecraft çalışıyor');
            // Hide ALL progress bars IMMEDIATELY when state is RUNNING
            console.log('🔄 [GAME-STATE] Hiding ALL progress bars immediately after state RUNNING');
            hideLaunchProgress();
            if (currentRunningModpackId) {
                updateModpackProgress(currentRunningModpackId, '', false);
            }
        } else if (state.state === 'IDLE') {
            toggleGameButtons(false);
            updateLibraryButtons(false, null);
            updateStatusBar('Hazır');
            console.log('🔄 [GAME-STATE] Hiding progress bar after state IDLE');
            hideLaunchProgress();
            
            // Clear modpack progress
            if (currentRunningModpackId) {
                updateModpackProgress(currentRunningModpackId, '', false);
                console.log('🧹 [GAME-STATE] Cleared modpack progress for:', currentRunningModpackId);
            }
            
            currentRunningModpackId = null; // Clear running modpack ID
            
            console.log('✅ [GAME-STATE] All states cleared (IDLE), ready for next launch');
        }
    }
}

// Update library buttons based on game state
function updateLibraryButtons(isGameRunning, runningModpackId = null) {
    console.log('📚 [LIBRARY-BUTTONS] Updating library buttons - Game running:', isGameRunning, 'Modpack ID:', runningModpackId);
    
    // Find all play and stop buttons in library
    const playButtons = document.querySelectorAll('.library-action-btn.play');
    const stopButtons = document.querySelectorAll('.library-action-btn.stop');
    
    if (isGameRunning && runningModpackId) {
        // Only show stop button for the running modpack
        playButtons.forEach(btn => {
            const modpackId = btn.id.replace('playBtn_', '');
            if (modpackId === runningModpackId) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'flex';
            }
        });
        
        stopButtons.forEach(btn => {
            const modpackId = btn.id.replace('stopBtn_', '');
            if (modpackId === runningModpackId) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        });
        
        console.log(`📚 [LIBRARY-BUTTONS] Showing stop button only for modpack: ${runningModpackId}`);
    } else {
        // Show all play buttons, hide all stop buttons
        playButtons.forEach(btn => btn.style.display = 'flex');
        stopButtons.forEach(btn => btn.style.display = 'none');
        console.log(`📚 [LIBRARY-BUTTONS] Showing all play buttons`);
    }
}

// Initialize buttons on page load
document.addEventListener('DOMContentLoaded', () => {
    toggleGameButtons(false); // Start with play button visible
});

// Generate offline UUID
function generateOfflineUUID(username) {
    // Simple UUID generation for offline mode
    const hash = username.toLowerCase();
    return `offline-${hash}-${Date.now()}`;
}

// Show launch progress
function showLaunchProgress() {
    launchProgress.style.display = 'block';
    playButton.disabled = true;
    playButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>BAŞLATILIYOR...</span>';
}

// Update launch progress
function updateLaunchProgress(progress) {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    console.log('📊 [PROGRESS-UPDATE] Elements found:', {
        progressFill: !!progressFill,
        progressText: !!progressText,
        launchProgress: !!launchProgress
    });
    
    if (progressFill && progressText) {
        let displayText = '';
        
        if (progress.current && progress.total) {
            // Show percentage progress
            const percentage = Math.round((progress.current / progress.total) * 100);
        progressFill.style.width = `${percentage}%`;
            displayText = `${progress.task || 'İndiriliyor'}: ${progress.current}/${progress.total} (${percentage}%)`;
        } else if (progress.task) {
            // Show task description
            displayText = progress.task;
            
            // Filter and clean message
            if (progress.message) {
                let cleanMessage = progress.message;
                
                // Remove sensitive data
                cleanMessage = cleanMessage.replace(/--accessToken[\s\S]*?(?=\s--|$)/g, '');
                cleanMessage = cleanMessage.replace(/--uuid[\s\S]*?(?=\s--|$)/g, '');
                cleanMessage = cleanMessage.replace(/clientId[\s\S]*?(?=\s|$)/g, '');
                
                // Truncate long messages
                if (cleanMessage.length > 80) {
                    cleanMessage = cleanMessage.substring(0, 80) + '...';
                }
                
                // Only add message if it's meaningful and short
                if (cleanMessage.trim() && 
                    !cleanMessage.includes('java') && 
                    !cleanMessage.includes('.jar') &&
                    !cleanMessage.includes('library.path') &&
                    cleanMessage.length < 100) {
                    displayText += ` - ${cleanMessage.trim()}`;
                }
            }
        } else if (progress.message) {
            // Show just message (filtered)
            displayText = progress.message.substring(0, 60);
        } else {
            displayText = 'Başlatılıyor...';
        }
        
        progressText.textContent = displayText;
        
        // Update status bar with shorter version
        const shortStatus = displayText.length > 50 ? 
            displayText.substring(0, 50) + '...' : displayText;
        updateStatusBar(shortStatus);
    }
}

// Hide launch progress
function hideLaunchProgress() {
    console.log('🔄 [PROGRESS] hideLaunchProgress called');
    
    // Try multiple ways to find and hide the progress element
    const progressElement = launchProgress || document.getElementById('launchProgress') || document.querySelector('.launch-progress');
    
    if (progressElement) {
        progressElement.style.display = 'none';
        progressElement.style.visibility = 'hidden';
        progressElement.style.opacity = '0';
        console.log('🔄 [PROGRESS] Progress element hidden:', progressElement);
    } else {
        console.warn('⚠️ [PROGRESS] Could not find progress element!');
    }
    
    if (playButton) {
    playButton.disabled = false;
    playButton.innerHTML = '<i class="fas fa-play"></i><span>OYNA</span>';
    }
    
    // Reset progress bar
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    if (progressFill) {
        progressFill.style.width = '0%';
        console.log('🔄 [PROGRESS] Progress fill reset to 0%');
    }
    if (progressText) {
        progressText.textContent = '';
        console.log('🔄 [PROGRESS] Progress text cleared');
    }
    
    console.log('✅ [PROGRESS] Launch progress hidden and reset complete');
}

// Load mods
async function loadMods() {
    const modsGrid = document.getElementById('modsGrid');
    if (!modsGrid) return;
    
    try {
        // Get installed mods
        const installedResult = await ipcRenderer.invoke('get-installed-mods');
        let installedMods = [];
        
        if (installedResult.success) {
            installedMods = installedResult.mods;
        }
        
        // Search for popular mods
        const searchResult = await ipcRenderer.invoke('search-mods', 'popular', '1.20.4', 'forge', 10);
        let availableMods = [];
        
        if (searchResult.success) {
            availableMods = searchResult.mods;
        }
        
        // Combine installed and available mods
        const allMods = [
            ...installedMods.map(mod => ({
                ...mod,
            installed: true,
                source: 'local'
            })),
            ...availableMods.map(mod => ({
                ...mod,
            installed: false,
                source: 'remote'
            }))
    ];
    
    modsGrid.innerHTML = '';
    
        if (allMods.length === 0) {
            modsGrid.innerHTML = '<p style="text-align: center; color: #cccccc;">Mod bulunamadı</p>';
            return;
        }
        
        allMods.forEach(mod => {
        const modCard = createModCard(mod);
        modsGrid.appendChild(modCard);
    });
        
    } catch (error) {
        console.error('Modlar yüklenirken hata:', error);
        modsGrid.innerHTML = '<p style="text-align: center; color: #ff6b6b;">Modlar yüklenirken hata oluştu</p>';
    }
}

// Create mod card
function createModCard(mod) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    card.innerHTML = `
        <div class="mod-info">
            <h3>${mod.name || 'Bilinmeyen Mod'}</h3>
            <p>${mod.description || 'Açıklama yok'}</p>
            <div class="mod-meta">
                <span class="mod-version">v${mod.version || '1.0.0'}</span>
                <span class="mod-category">${mod.categories?.[0] || mod.category || 'Genel'}</span>
                ${mod.downloads ? `<span class="mod-downloads">${formatDownloads(mod.downloads)} indirme</span>` : ''}
            </div>
        </div>
        <div class="mod-actions">
            <button class="btn-${mod.installed ? 'secondary' : 'primary'}" 
                    onclick="toggleMod('${mod.id || mod.name}', ${mod.installed}, '${mod.name}')">
                ${mod.installed ? 'Kaldır' : 'Yükle'}
            </button>
        </div>
    `;
    
    // Add mod card styles
    const style = document.createElement('style');
    style.textContent = `
        .mod-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s ease;
        }
        .mod-card:hover {
            background: rgba(252, 148, 45, 0.1);
            border-color: rgba(252, 148, 45, 0.3);
        }
        .mod-info h3 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .mod-info p {
            color: #cccccc;
            margin-bottom: 12px;
        }
        .mod-meta {
            display: flex;
            gap: 12px;
        }
        .mod-version, .mod-category {
            padding: 4px 8px;
            border-radius: 4px;
            background: rgba(252, 148, 45, 0.2);
            color: #FC942D;
            font-size: 12px;
            font-weight: 500;
        }
    `;
    
    if (!document.querySelector('style[data-mod-cards]')) {
        style.setAttribute('data-mod-cards', 'true');
        document.head.appendChild(style);
    }
    
    return card;
}

// Load modpacks
async function loadModpacks() {
    const modpacksGrid = document.getElementById('modpacksGrid');
    if (!modpacksGrid) return;
    
    try {
        showLoading(true, 'Modpackler yükleniyor...');
          const result = await ipcRenderer.invoke('get-popular-modpacks', null, 20);
          
          // Load featured modpacks from website backend
          let creators = [];
          try {
              const backendRes = await fetch('https://api.blocksmithslauncher.com/api/modpacks/grouped');
              if (backendRes.ok) {
                  const data = await backendRes.json();
                  if (data.success && data.creators && data.creators.length > 0) {
                      creators = data.creators.map(creator => ({
                          name: creator.name,
                          title: `${creator.name} – Seri Mod Paketleri`,
                          avatar: `https://mc-heads.net/avatar/${creator.name}/32`,
                          modpacks: creator.modpacks.map(mp => {
                              console.log('[MODPACK-MAP] Processing:', mp.name, 'mrpackUrl:', mp.mrpackUrl);
                              return {
                                  ...mp,
                                  slug: mp.slug,
                                  name: mp.name,
                                  description: mp.description,
                                  iconUrl: mp.iconUrl || null,
                                  mrpack_url: mp.mrpackUrl || null, // Backend already provides full URL
                                  author: creator.name,
                                  downloads: mp.downloads || 0,
                                  loaders: [mp.modloader],
                                  exclusive: true,
                                  versions: [mp.minecraftVersion]
                              };
                          })
                      }));
                      console.log('Loaded featured modpacks from backend:', creators);
                  }
              }
          } catch (e) {
              console.warn('Failed to load featured modpacks from backend:', e);
          }
        
        if (result.success && result.modpacks.length > 0) {
            modpacksGrid.innerHTML = '';
            
            // Render creator sections stacked vertically (supports 3+ items)
            const gridContainer = document.getElementById('modpacksGrid');
            function appendCreatorSection(section) {
                if (!section || !section.modpacks || section.modpacks.length === 0) return;
                const header = document.createElement('div');
                header.style.cssText = 'grid-column:1/-1;margin:12px 4px 8px;color:#ddd;font-size:14px;display:flex;align-items:center;gap:10px;';
                const avatar = section.avatar || (section.name && `https://mc-heads.net/avatar/${encodeURIComponent(section.name)}/32`);
                header.innerHTML = `
                    <img src="${avatar}" alt="${section.name}" width="24" height="24" style="border-radius:4px;object-fit:cover;"> 
                    <span>${section.title || section.name + ' – Seri Mod Paketleri'}</span>
                `;
                gridContainer.appendChild(header);
                // Create a full-width row for this creator to avoid interleaving with general grid
                const row = document.createElement('div');
                row.style.cssText = 'grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:8px;';
                section.modpacks.forEach(mp => {
                    mp.iconUrl = mp.iconUrl || mp.icon_url; // Backend provides full URL
                    mp.isLocal = !!mp.localPath; // Mark as local modpack
                    const card = createModpackCard(mp);
                    row.appendChild(card);
                });
                gridContainer.appendChild(row);
            }

            if (creators.length === 0) {
                // Try to fetch from backend
                try {
                    const backendRes = await fetch('https://api.blocksmithslauncher.com/api/modpacks/grouped');
                    if (backendRes.ok) {
                        const data = await backendRes.json();
                        if (data.success && data.creators && data.creators.length > 0) {
                            data.creators.forEach(appendCreatorSection);
                        } else {
                            // Fallback empty state
                            console.log('No creator modpacks available');
                        }
                    }
                } catch (err) {
                    console.warn('Failed to fetch creator modpacks:', err);
                }
            } else {
                creators.forEach(appendCreatorSection);
            }

            // Add "Modrinth Mod Paketleri" header
            if (result.modpacks.length > 0) {
                const modrinthHeader = document.createElement('div');
                modrinthHeader.style.cssText = 'grid-column:1/-1;margin:32px 4px 16px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);color:#fff;font-size:20px;font-weight:700;display:flex;align-items:center;gap:12px;';
                modrinthHeader.innerHTML = `
                    <i class="fas fa-cube" style="color:#FC942D;"></i>
                    <span>Modrinth Mod Paketleri</span>
                `;
                gridContainer.appendChild(modrinthHeader);
            }

            // Then render normal list (below creator rows)
            result.modpacks.forEach(modpack => {
                // Convert icon_url to iconUrl for consistency
                modpack.iconUrl = modpack.icon_url || modpack.iconUrl;
                const modpackCard = createModpackCard(modpack);
                modpacksGrid.appendChild(modpackCard);
            });
        } else {
            modpacksGrid.innerHTML = '<p style="text-align: center; color: #cccccc;">Modpack bulunamadı</p>';
        }
    } catch (error) {
        console.error('Modpackler yüklenirken hata:', error);
        modpacksGrid.innerHTML = '<p style="text-align: center; color: #ff6b6b;">Modpackler yüklenirken hata oluştu</p>';
    } finally {
        showLoading(false);
    }
}

// Create modpack card
function createModpackCard(modpack) {
    const card = document.createElement('div');
    const isLocal = !!modpack.isLocal || !!modpack.localPath;
    // Check if this is a featured modpack from backend (has exclusive flag and mrpack_url/slug)
    const isCreatorFeatured = isLocal || !!modpack.exclusive || !!modpack.mrpack_url || (modpack.slug && modpack.slug !== modpack.id);
    const isExclusive = isCreatorFeatured;
    const showVersions = !isCreatorFeatured && !isLocal;
    card.className = 'modpack-card';
    card.style.position = 'relative';
    card.innerHTML = `
        <div class="modpack-image">
            ${modpack.iconUrl ? 
                `<img src="${modpack.iconUrl}" alt="${modpack.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                ''
            }
            <div class="modpack-icon-fallback" ${modpack.iconUrl ? 'style="display: none;"' : ''}>
                <i class="fas fa-cube"></i>
            </div>
        </div>
        ${isExclusive ? `<div class="onlyon-badge" style="position:absolute;top:6px;right:6px;background:#ffb703;color:#121212;font-size:10px;font-weight:600;padding:3px 6px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.25);">Sadece Blocksmiths'te</div>` : ''}
        <div class="modpack-info">
            <h3>${modpack.name}</h3>
            <p>${modpack.description ? modpack.description.substring(0, 120) + '...' : 'Açıklama yok'}</p>
            <div class="modpack-meta">
                <span class="modpack-downloads">
                    <i class="fas fa-download"></i>
                    ${formatDownloads(modpack.downloads)}
                </span>
                <span class="modpack-author">
                    <i class="fas fa-user"></i>
                    ${modpack.author}
                </span>
            </div>
            ${createLoaderBadges(modpack)}
        </div>
        <div class="modpack-actions">
            ${showVersions ? `<button class=\"btn-secondary modpack-versions-btn\" onclick=\"showModpackVersions('${modpack.id}', '${modpack.name.replace(/'/g, "\\'")}')\"><i class=\"fas fa-list\"></i> Versiyonlar</button>` : ''}
            ${isLocal ? 
                `<button class="btn-primary" onclick="installLocalModpack('${modpack.localPath.replace(/\\/g, '\\\\')}', '${modpack.name.replace(/'/g, "\\'")}')" ><i class="fas fa-download"></i> Tek Tıkla Kur</button>` :
                isCreatorFeatured ? 
                    `<button class="btn-primary" onclick="importFeaturedMrpack('${modpack.slug}')"><i class="fas fa-download"></i> Tek Tıkla Kur</button>` :
                    `<button class="btn-primary modpack-install-btn" onclick="installModpackFromCard('${modpack.id}', '${modpack.name.replace(/'/g, "\\'")}')"><i class="fas fa-download"></i> Tek Tıkla Kur</button>`
            }
        </div>
    `;
    
    return card;
}

// Create loader badges for modpack cards
function createLoaderBadges(modpack) {
    if (!modpack.categories || modpack.categories.length === 0) {
        return '';
    }
    
    const loaders = [];
    const categories = modpack.categories;
    
    // Check for mod loaders in categories
    if (categories.includes('fabric')) loaders.push('fabric');
    if (categories.includes('forge')) loaders.push('forge');
    if (categories.includes('neoforge')) loaders.push('neoforge');
    if (categories.includes('quilt')) loaders.push('quilt');
    
    // If no loaders found, try to detect from description
    if (loaders.length === 0) {
        const description = (modpack.description || '').toLowerCase();
        if (description.includes('neoforge')) loaders.push('neoforge');
        else if (description.includes('forge')) loaders.push('forge');
        else if (description.includes('fabric')) loaders.push('fabric');
        else if (description.includes('quilt')) loaders.push('quilt');
    }
    
    if (loaders.length === 0) {
        return '';
    }
    
    const badgesHtml = loaders.map(loader => 
        `<span class="loader-badge ${loader}">${loader}</span>`
    ).join('');
    
    return `<div class="modpack-loaders">${badgesHtml}</div>`;
}

// Load servers - WITH CACHING
async function loadServers(forceRefresh = false) {
    const featuredWrap = document.getElementById('featuredServers');
    const serversGrid = document.getElementById('serversGrid');
    if (!featuredWrap || !serversGrid) return;
    
    const CACHE_KEY = 'servers-list';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Check cache first
    if (!forceRefresh) {
        const cached = cacheManager.get(CACHE_KEY);
        if (cached) {
            console.log('[SERVERS] Using cached data');
            renderServersList(cached);
            return cached;
        }
    }
    
    // Fetch servers from backend
    let servers = [];
    try {
        const backendRes = await fetch('https://api.blocksmithslauncher.com/api/servers');
        if (backendRes.ok) {
            const data = await backendRes.json();
            if (data.success && data.servers) {
                servers = data.servers.map(s => ({
                    name: s.name,
                    ip: s.ip,
                    description: s.description,
                    iconUrl: s.iconUrl,
                    tags: s.tags || [],
                    featured: s.featured,
                    highlight: s.highlight,
                    _id: s._id
                }));
                
                // Cache the result
                cacheManager.set(CACHE_KEY, servers, CACHE_TTL);
                console.log('[SERVERS] Data cached for 5 minutes');
            }
        }
    } catch (err) {
        console.warn('Failed to fetch servers from backend:', err);
    }

    // Always ensure Blocksmiths is present and highlighted
    const blocksmiths = servers.find(s => s.ip === 'mc.blocksmiths.net');
    if (!blocksmiths) {
        // If Blocksmiths is not in the list, add it
        servers.unshift({
            name: 'Blocksmiths Network',
            ip: 'mc.blocksmiths.net',
            description: 'En iyi Minecraft deneyimi için Blocksmiths Network! Survival, minigame ve daha fazlası ile dolu harika bir oyun ortamı.',
            iconUrl: 'https://api.mcsrvstat.us/icon/mc.blocksmiths.net',
            tags: ['minigame', 'survival'],
            featured: true,
            highlight: true
        });
    } else {
        // If Blocksmiths exists, ensure it's highlighted
        blocksmiths.highlight = true;
        blocksmiths.featured = true;
    }

    // Fetch real server status for each
    await Promise.all(servers.map(async (server) => {
        try {
            const res = await fetch(`https://api.mcsrvstat.us/3/${server.ip}`);
            const data = await res.json();
            if (data.online) {
                server.players = `${data.players?.online || 0}/${data.players?.max || 0}`;
                server.version = data.version || '1.20.4';
                server.ping = Math.floor(Math.random() * 30 + 20); // API doesn't return ping; simulate
            } else {
                server.players = '0/0';
                server.version = '?';
                server.ping = '—';
            }
        } catch (e) {
            server.players = '?/?';
            server.version = '?';
            server.ping = '—';
        }
    }));

    // Featured section (only featured/highlighted servers)
    featuredWrap.innerHTML = '';
    const featuredServers = servers.filter(s => s.featured || s.highlight);
    featuredServers.forEach(s => featuredWrap.appendChild(createServerCard(s, false)));

    // All servers grid (only non-featured servers)
    serversGrid.innerHTML = '';
    const nonFeaturedServers = servers.filter(s => !s.featured && !s.highlight);
    nonFeaturedServers.forEach(s => serversGrid.appendChild(createServerCard(s, false)));

    // Sidebar rotation
    setupSidebarServerRotation(servers.filter(s => s.featured));
}

// Create server item (website style)
function createServerCard(server, highlight = false) {
    const card = document.createElement('div');
    const isFeatured = server.featured || server.highlight || server.plan === 'featured';
    
    // Add featured class if needed
    card.className = isFeatured ? 'server-card featured' : 'server-card';
    
    const iconUrl = server.iconUrl || (server.ip ? `https://api.mcsrvstat.us/icon/${server.ip}` : null);
    const description = server.description || 'Bu sunucu için henüz bir açıklama eklenmemiş.';
    const isOnline = server.players !== '?/?';
    
    card.innerHTML = `
        <div class="server-card-header">
            <div class="server-card-icon">
                ${iconUrl ? `<img src="${iconUrl}" alt="${server.name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-server\\'></i>';">` : '<i class="fas fa-server"></i>'}
        </div>
            <div class="server-card-info">
                <div class="server-card-name">${server.name}</div>
                <div class="server-card-ip">${server.ip}</div>
            </div>
        </div>
        <div class="server-card-description">${description}</div>
        <div class="server-card-stats">
            <div class="server-stat ${isOnline ? 'online' : 'offline'}">
                <i class="fas fa-circle"></i>
                <span>${isOnline ? 'Online' : 'Offline'}</span>
            </div>
            ${isOnline ? `
                <div class="server-stat">
                    <i class="fas fa-users"></i>
                <span>${server.players}</span>
                </div>
                <div class="server-stat">
                    <i class="fas fa-bolt"></i>
                <span>${server.ping}ms</span>
            </div>
            ` : ''}
        </div>
        <div class="server-card-actions">
            <button class="btn-secondary" onclick="copyServerIP('${server.ip}', '${server._id || ''}')">
                <i class="fas fa-copy"></i>
                IP Kopyala
            </button>
            <button class="btn-primary" onclick="joinServer('${server.ip}')">
                <i class="fas fa-play"></i>
                Katıl
            </button>
        </div>
    `;
    return card;
}

function createServerTags(server) {
    const tags = server.tags || [];
    if (!tags.length) return '';
    const badgesHtml = tags.map(t => `<span class="loader-badge server-tag">${t}</span>`).join('');
    return `<div class="modpack-loaders">${badgesHtml}</div>`;
}

function setupSidebarServerRotation(featured) {
    const a = document.getElementById('sidebarServerA');
    const b = document.getElementById('sidebarServerB');
    if (!a || !b || !featured || featured.length === 0) return;
    
    function pickTwo() {
        const shuffled = [...featured].sort(() => Math.random() - 0.5);
        // Ensure we pick exactly 2 different servers
        const picked = [];
        const used = new Set();
        for (const server of shuffled) {
            if (!used.has(server.ip) && picked.length < 2) {
                picked.push(server);
                used.add(server.ip);
            }
        }
        return picked;
    }
    
    async function render() {
        const picked = pickTwo();
        a.innerHTML = '';
        b.innerHTML = '';
        
        // Fetch real-time status for sidebar servers
        for (let i = 0; i < picked.length; i++) {
            const server = picked[i];
            try {
                const startTime = Date.now();
                const res = await fetch(`https://api.mcsrvstat.us/3/${server.ip}`);
                const data = await res.json();
                const endTime = Date.now();
                const realPing = endTime - startTime;
                
                if (data.online) {
                    server.players = `${data.players?.online || 0}/${data.players?.max || 0}`;
                    // Use real ping from fetch timing (more accurate)
                    server.ping = realPing < 500 ? realPing : Math.floor(Math.random() * 30 + 20);
                } else {
                    server.players = '0/0';
                    server.ping = '—';
                }
                
                console.log(`[SIDEBAR] ${server.name}: ${server.players} players, ${server.ping}ms`);
            } catch (e) {
                console.error(`[SIDEBAR] Error fetching ${server.name}:`, e);
                server.players = '?/?';
                server.ping = '—';
            }
        }
        
        if (picked[0]) a.appendChild(createSidebarServerRow(picked[0]));
        if (picked[1]) b.appendChild(createSidebarServerRow(picked[1]));
    }
    
    // Initial render
    render();
    
    // Clear any existing timer
    if (window.__serverRotTimer) clearInterval(window.__serverRotTimer);
    
    // Auto-refresh every 30 seconds for real-time data
    window.__serverRotTimer = setInterval(render, 30 * 1000);
    
    console.log('[SIDEBAR] Server rotation started - updating every 30 seconds');
}

function createSidebarServerRow(server) {
    const row = document.createElement('div');
    const isFeatured = server.featured || server.highlight || server.plan === 'featured';
    
    // Add blocksmiths-server class if featured
    row.className = isFeatured ? 'server-item blocksmiths-server' : 'server-item';
    
    row.innerHTML = `
        <div class="server-info">
            <div class="server-name">${server.name}</div>
            <div class="server-ip">${server.ip}</div>
            <div class="server-status online"><i class="fas fa-circle"></i> <span>${server.ping}ms • ${server.players}</span></div>
        </div>
        <div class="server-actions">
            <button class="copy-ip-btn" onclick="copyServerIP('${server.ip}', '${server._id || ''}')" title="IP Kopyala"><i class="fas fa-copy"></i></button>
            <button class="join-server-btn" onclick="joinServer('${server.ip}')" title="Sunucuya Katıl"><i class="fas fa-play"></i></button>
        </div>
    `;
    return row;
}

async function copyServerIP(ip, serverId) {
    try {
        await navigator.clipboard.writeText(ip);
        
        // Track copy event if serverId is provided
        if (serverId) {
            try {
                await fetch(`https://api.blocksmithslauncher.com/api/servers/${serverId}/copy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err) {
                console.warn('Failed to track copy:', err);
            }
        }
        
        if (typeof showNotification === 'function') {
            showNotification(`${ip} kopyalandı`, 'success');
        }
    } catch (e) {
        console.error('IP kopyalanamadı:', e);
    }
}

// Update profile
async function updateProfile() {
    if (!currentProfile) return;
    
    try {
        await ipcRenderer.invoke('save-profile', currentProfile);
        updateProfileDisplay();
    } catch (error) {
        console.error('Profil güncellenirken hata:', error);
    }
}

// Save settings
async function saveSettings() {
    try {
        // Collect settings from form
        const gameDirectoryInput = document.getElementById('gameDirectory');
        const javaArgsInput = document.getElementById('javaArgs');
        const autoLoginCheckbox = document.getElementById('autoLogin');
        const languageSelect = document.getElementById('language');
        
        if (gameDirectoryInput) settings.gameDirectory = gameDirectoryInput.value;
        if (javaArgsInput) settings.javaArgs = javaArgsInput.value;
        // showAds option removed - ads are always enabled
        settings.showAds = true;
        if (autoLoginCheckbox) settings.autoLogin = autoLoginCheckbox.checked;
        if (languageSelect) settings.language = languageSelect.value;
        
        await ipcRenderer.invoke('save-settings', settings);
    } catch (error) {
        console.error('Ayarlar kaydedilirken hata:', error);
        showNotification('Ayarlar kaydedilirken hata oluştu', 'error');
    }
}

// Update status bar
function updateStatusBar(message = 'Hazır') {
    statusText.textContent = message;
}

// Load news
function loadNews() {
    const newsFeed = document.getElementById('newsFeed');
    if (!newsFeed) return;
    
    // Placeholder news
    const news = [
        {
            title: 'Yeni Güncelleme!',
            summary: 'BlockSmiths Launcher v1.0.0 yayınlandı. Yeni özellikler ve iyileştirmeler...',
            date: new Date().toLocaleDateString('tr-TR')
        },
        {
            title: 'Sunucu Etkinliği',
            summary: 'BlockSmiths Network\'te büyük etkinlik! Ödüller kazanın...',
            date: new Date(Date.now() - 86400000).toLocaleDateString('tr-TR')
        }
    ];
    
    newsFeed.innerHTML = '';
    
    news.forEach(item => {
        const newsItem = document.createElement('div');
        newsItem.className = 'news-item';
        newsItem.innerHTML = `
            <div class="news-title">${item.title}</div>
            <div class="news-summary">${item.summary}</div>
            <div class="news-date">${item.date}</div>
        `;
        newsFeed.appendChild(newsItem);
    });
}

// Load available Minecraft versions
async function loadAvailableVersions(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            updateStatusBar('Minecraft versiyonları yükleniyor...');
        }
        
        const result = await ipcRenderer.invoke('get-available-versions', forceRefresh);
        if (result.success) {
            const versionSelect = document.getElementById('versionSelect');
            if (versionSelect) {
                // Clear existing options
                versionSelect.innerHTML = '';
                
                const data = result.versions;
                
                // Add Latest Release
                if (data.latest && data.latest.release) {
                    const latestGroup = document.createElement('optgroup');
                    latestGroup.label = 'En Son Sürüm';
                    const latestOption = document.createElement('option');
                    latestOption.value = data.latest.release;
                    latestOption.textContent = `Minecraft ${data.latest.release} (En Son)`;
                    latestGroup.appendChild(latestOption);
                    versionSelect.appendChild(latestGroup);
                }
                
                // Add Release versions - ALL releases, not limited
                if (data.categorized && data.categorized.release.length > 0) {
                    const releaseGroup = document.createElement('optgroup');
                    releaseGroup.label = 'Yayın Sürümleri';
                    
                    // Show ALL release versions
                    data.categorized.release.forEach(version => {
                        if (version.id !== data.latest?.release) { // Skip latest as it's already added
                            const option = document.createElement('option');
                            option.value = version.id;
                            option.textContent = `Minecraft ${version.id}`;
                            releaseGroup.appendChild(option);
                        }
                    });
                    if (releaseGroup.children.length > 0) {
                        versionSelect.appendChild(releaseGroup);
                    }
                }
                
                // Add Snapshots - ALL snapshots
                if (data.categorized && data.categorized.snapshot.length > 0) {
                    const snapshotGroup = document.createElement('optgroup');
                    snapshotGroup.label = 'Geliştirme Sürümleri (Snapshot)';
                    
                    // Show ALL snapshots
                    data.categorized.snapshot.forEach(version => {
                        const option = document.createElement('option');
                        option.value = version.id;
                        option.textContent = `${version.id} (Snapshot)`;
                        snapshotGroup.appendChild(option);
                    });
                    versionSelect.appendChild(snapshotGroup);
                }
                
                // Add Old Beta versions - ALL betas
                if (data.categorized && data.categorized.old_beta.length > 0) {
                    const betaGroup = document.createElement('optgroup');
                    betaGroup.label = 'Eski Beta Sürümleri';
                    
                    // Show ALL beta versions
                    data.categorized.old_beta.forEach(version => {
                        const option = document.createElement('option');
                        option.value = version.id;
                        option.textContent = `${version.id} (Beta)`;
                        betaGroup.appendChild(option);
                    });
                    versionSelect.appendChild(betaGroup);
                }
                
                // Add Old Alpha versions - ALL alphas
                if (data.categorized && data.categorized.old_alpha.length > 0) {
                    const alphaGroup = document.createElement('optgroup');
                    alphaGroup.label = 'Eski Alpha Sürümleri';
                    
                    // Show ALL alpha versions
                    data.categorized.old_alpha.forEach(version => {
                        const option = document.createElement('option');
                        option.value = version.id;
                        option.textContent = `${version.id} (Alpha)`;
                        alphaGroup.appendChild(option);
                    });
                    versionSelect.appendChild(alphaGroup);
                }
                
                // Set default to latest release
                if (data.latest && data.latest.release) {
                    versionSelect.value = data.latest.release;
                }
                
                const totalVersions = Object.values(data.categorized || {}).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`Loaded ${totalVersions} Minecraft versions`);
                updateStatusBar(`${totalVersions} Minecraft versiyonu yüklendi`);
                
                // Auto-refresh versions every 30 minutes
                if (!window.versionRefreshInterval) {
                    window.versionRefreshInterval = setInterval(() => {
                        console.log('Auto-refreshing Minecraft versions...');
                        loadAvailableVersions(true);
                    }, 30 * 60 * 1000); // 30 minutes
                }
            }
        }
    } catch (error) {
        console.error('Versiyon listesi yüklenirken hata:', error);
        showNotification('Minecraft versiyonları yüklenemedi', 'error');
        updateStatusBar('Versiyon yükleme hatası');
    }
}

// Format download numbers
function formatDownloads(downloads) {
    if (downloads >= 1000000) {
        return (downloads / 1000000).toFixed(1) + 'M';
    } else if (downloads >= 1000) {
        return (downloads / 1000).toFixed(1) + 'K';
    }
    return downloads.toString();
}

// Utility functions
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add styles for notification
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 400px;
        }
        .notification-success { background: #4CAF50; }
        .notification-error { background: #F44336; }
        .notification-info { background: #2196F3; }
        .notification-warning { background: #FF9800; }
        .notification-content {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .notification.show {
            transform: translateX(0);
        }
    `;
    
    if (!document.querySelector('style[data-notifications]')) {
        style.setAttribute('data-notifications', 'true');
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Hide notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// Global functions for HTML onclick handlers
window.minimizeWindow = () => ipcRenderer.invoke('window-minimize');
window.maximizeWindow = () => ipcRenderer.invoke('window-maximize');
window.closeWindow = () => ipcRenderer.invoke('window-close');

window.switchProfile = async () => {
    try {
        // Notify main process and reload to profile selector
        await ipcRenderer.invoke('switch-profile');
        // Reload current window to profile selector
        window.location.replace('profile-selector.html');
    } catch (error) {
        console.error('Profile switch error:', error);
        // Fallback to direct navigation
        window.location.replace('profile-selector.html');
    }
};

window.openGameDirectory = async () => {
    try {
        // Get game directory from settings or launcher config
        let directory = settings.gameDirectory;
        
        // If no game directory set, use default launcher directory
        if (!directory) {
            const launcherDir = await ipcRenderer.invoke('get-launcher-directory');
            directory = launcherDir;
        }
        
    if (directory) {
            console.log('Opening game directory:', directory);
            await ipcRenderer.invoke('open-folder', directory);
            showNotification('Oyun klasörü açıldı', 'success');
        } else {
            showNotification('Oyun klasörü bulunamadı', 'error');
        }
    } catch (error) {
        console.error('Error opening game directory:', error);
        showNotification('Klasör açılamadı: ' + error.message, 'error');
    }
};

window.openWebsite = () => {
    ipcRenderer.invoke('open-external', 'https://blocksmiths.net');
};

window.selectGameDirectory = async () => {
    const directory = await ipcRenderer.invoke('select-directory');
    if (directory) {
        settings.gameDirectory = directory;
        document.getElementById('gameDirectory').value = directory;
        await saveSettings();
    }
};

window.installMod = async () => {
    const query = prompt('Yüklemek istediğiniz modun adını girin:');
    if (!query) return;
    
    try {
        showLoading(true);
        const result = await ipcRenderer.invoke('search-mods', query, '1.20.4', 'forge', 5);
        
        if (result.success && result.mods.length > 0) {
            const mod = result.mods[0]; // First result
            const downloadResult = await ipcRenderer.invoke('download-mod', mod.id, null, '1.20.4', 'forge');
            
            if (downloadResult.success) {
                showNotification(`${mod.name} başarıyla yüklendi!`, 'success');
                loadMods(); // Refresh mod list
            } else {
                throw new Error(downloadResult.error);
            }
        } else {
            showNotification('Mod bulunamadı', 'warning');
        }
    } catch (error) {
        console.error('Mod yükleme hatası:', error);
        showNotification(`Mod yükleme başarısız: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
};

// Browse modpacks (for modpacks page)
window.browseModpacks = async () => {
    // Switch to modpacks page
    switchPage('modpacks');
    loadModpacks();
};

// Install custom modpack from file
window.installCustomModpack = async () => {
    showNotification('Dosyadan modpack yükleme özelliği yakında eklenecek', 'info');
};

// Install modpack from card
window.installModpackFromCard = async (modpackId, modpackName, versionId = null) => {
    try {
        // Use progress bar instead of loading overlay
        updateLaunchProgress(`${modpackName} yükleniyor...`);
        
        const result = await ipcRenderer.invoke('install-modpack', modpackId, versionId, modpackName);
        
        if (result.success) {
            updateLaunchProgress(`${modpackName} başarıyla yüklendi!`);
            showNotification(`${modpackName} başarıyla yüklendi!`, 'success');
            
            // Clear progress after a moment
            setTimeout(() => {
                updateLaunchProgress('');
            }, 3000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Modpack yükleme hatası:', error);
        updateLaunchProgress(`Hata: ${error.message}`);
        showNotification(`${modpackName} yüklenemedi: ${error.message}`, 'error');
        
        // Clear error after a moment
        setTimeout(() => {
            updateLaunchProgress('');
        }, 5000);
    }
};

// Show modpack versions
window.showModpackVersions = async (modpackId, modpackName) => {
    try {
        console.log(`[DEBUG] showModpackVersions called with: ${modpackId}, ${modpackName}`);
        showLoading(true, 'Versiyonlar yükleniyor...');
        
        const result = await ipcRenderer.invoke('get-modpack-versions', modpackId);
        console.log('[DEBUG] get-modpack-versions result:', result);
        
        if (result.success && result.versions && result.versions.length > 0) {
            console.log(`[DEBUG] Showing modal with ${result.versions.length} versions`);
            showModpackVersionModal(modpackId, modpackName, result.versions);
        } else {
            console.log('[DEBUG] No versions found or result failed:', result);
            showNotification('Versiyon bulunamadı', 'warning');
        }
    } catch (error) {
        console.error('Versiyon listesi hatası:', error);
        showNotification(`Versiyonlar yüklenemedi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
};

// Show modpack version selection modal
function showModpackVersionModal(modpackId, modpackName, versions) {
    console.log(`[DEBUG] showModpackVersionModal called with ${versions.length} versions`);
    const modalHTML = `
        <div class="modal-overlay" id="versionModal">
            <div class="modal version-modal">
                <div class="modal-header">
                    <h2>${modpackName} - Versiyon Seçimi</h2>
                    <button class="close-modal" onclick="closeVersionModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="versions-list">
                        ${versions.slice(0, 15).map(version => `
                            <div class="version-item" onclick="installModpackVersion('${modpackId}', '${version.id}', '${modpackName.replace(/'/g, "\\'")}', '${version.version_number || version.name}')">
                                <div class="version-info">
                                    <h4>${version.version_number || version.name}</h4>
                                    <p>${version.changelog ? version.changelog.substring(0, 100) + '...' : 'Değişiklik notu yok'}</p>
                                    <div class="version-meta">
                                        <span><i class="fas fa-calendar"></i> ${new Date(version.date_published).toLocaleDateString('tr-TR')}</span>
                                        <span><i class="fas fa-download"></i> ${version.downloads || 0}</span>
                                        ${version.game_versions ? `<span><i class="fas fa-cube"></i> ${version.game_versions.join(', ')}</span>` : ''}
                                    </div>
                                </div>
                                <div class="version-actions">
                                    <button class="btn-primary" onclick="event.stopPropagation(); installModpackVersion('${modpackId}', '${version.id}', '${modpackName.replace(/'/g, "\\'")}', '${version.version_number || version.name}');">
                                        <i class="fas fa-download"></i>
                                        Yükle
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing modal first
    const existingModal = document.getElementById('versionModal');
    if (existingModal) {
        existingModal.remove();
        console.log('[DEBUG] Removed existing modal');
    }
    
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    const modalElement = modalDiv.firstElementChild;
    document.body.appendChild(modalElement);
    console.log('[DEBUG] Modal HTML added to DOM');
    console.log('[DEBUG] Modal element:', modalElement);
    
    // Force show modal immediately with styles
    modalElement.style.display = 'flex';
    modalElement.style.opacity = '0';
    modalElement.style.transform = 'scale(0.9)';
    modalElement.style.transition = 'all 0.3s ease';
    
    setTimeout(() => {
        const modal = document.getElementById('versionModal');
        if (modal) {
            modal.classList.add('active');
            modal.style.opacity = '1';
            modal.style.transform = 'scale(1)';
            console.log('[DEBUG] Modal activated with inline styles');
        } else {
            console.error('[DEBUG] Modal element not found in DOM!');
        }
    }, 50);
    
    // Add styles
    if (!document.querySelector('style[data-version-modal]')) {
        const style = document.createElement('style');
        style.setAttribute('data-version-modal', 'true');
        style.textContent = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            .modal-overlay.active {
                opacity: 1;
                visibility: visible;
            }
            .version-modal {
                max-width: 800px;
                max-height: 80vh;
                background: rgba(20, 20, 20, 0.98);
                border: 1px solid rgba(252, 148, 45, 0.3);
                border-radius: 16px;
                padding: 24px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            .modal-overlay.active .version-modal {
                transform: scale(1);
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 16px;
                border-bottom: 1px solid rgba(252, 148, 45, 0.2);
            }
            .modal-header h2 {
                color: #ffffff;
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                font-family: 'Inter', sans-serif;
            }
            .close-modal {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 8px;
                padding: 8px;
                cursor: pointer;
                color: #ffffff;
                font-size: 16px;
                transition: background 0.2s ease;
            }
            .close-modal:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .versions-list {
                max-height: 60vh;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .version-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(252, 148, 45, 0.2);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .version-item:hover {
                background: rgba(252, 148, 45, 0.1);
                border-color: rgba(252, 148, 45, 0.4);
                transform: translateY(-2px);
            }
            .version-info {
                flex: 1;
                min-width: 0;
            }
            .version-info h4 {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 4px;
                color: #FC942D;
                font-family: 'Inter', sans-serif;
            }
            .version-info p {
                font-size: 14px;
                color: #cccccc;
                margin-bottom: 8px;
                line-height: 1.4;
                font-family: 'Inter', sans-serif;
            }
            .version-meta {
                display: flex;
                gap: 16px;
                font-size: 12px;
                color: #888888;
                font-family: 'Inter', sans-serif;
            }
            .version-meta span {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .version-actions {
                flex-shrink: 0;
                margin-left: 16px;
            }
        `;
        document.head.appendChild(style);
    }
}

// Close version modal
window.closeVersionModal = () => {
    const modal = document.getElementById('versionModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
};

// Install specific modpack version
window.installModpackVersion = async (modpackId, versionId, modpackName, versionNumber) => {
    // Manual sidebar ID - accessible in both try and catch blocks
    const manualId = Date.now().toString();
    
    try {
        closeVersionModal();
        // Show and update progress bar
        showLaunchProgress();
        updateLaunchProgress(`${modpackName} v${versionNumber} yükleniyor...`);
        
        // Show progress in modpack card if it exists in library
        updateModpackProgress(modpackId, `v${versionNumber} yükleniyor...`, true);
        
        // Create temporary card in library if not exists
        createTemporaryLibraryCard(modpackId, modpackName, versionNumber);
        
        // Manual sidebar trigger as backup
        console.log('🔧 [MANUAL-SIDEBAR] Manually triggering sidebar for:', `${modpackName} v${versionNumber}`);
        addDownloadItem(manualId, `${modpackName} v${versionNumber}`, 'modpack');
        updateDownloadProgress(manualId, 5, 'Kurulum başlatılıyor...', 'downloading');
        
        // Set up progress tracking for this specific modpack
        window.currentModpackInstallation = {
            id: manualId,
            name: `${modpackName} v${versionNumber}`,
            startTime: Date.now()
        };
        console.log('📊 [INSTALL-TRACK] Set up tracking for:', window.currentModpackInstallation.name);
        
        const result = await ipcRenderer.invoke('install-modpack', modpackId, versionId, `${modpackName}-v${versionNumber}`);
        
        if (result.success) {
            updateLaunchProgress(`${modpackName} v${versionNumber} başarıyla yüklendi!`);
            showNotification(`${modpackName} v${versionNumber} başarıyla yüklendi!`, 'success');
            
            // Show success in modpack card
            updateModpackProgress(modpackId, `✅ v${versionNumber} yüklendi!`, true);
            
            // Manual sidebar completion - will auto-remove after 2 seconds
            updateDownloadProgress(manualId, 100, `✅ Kurulum tamamlandı!`, 'completed');
            
            // Clear installation tracking
            window.currentModpackInstallation = null;
            console.log('🧹 [INSTALL-CLEAR] Installation tracking cleared');
            
            // Clear progress after a moment
            setTimeout(() => {
                hideLaunchProgress();
                updateModpackProgress(modpackId, '', false);
                loadLibrary(); // Refresh library to show newly installed modpack
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Modpack yükleme hatası:', error);
        updateLaunchProgress(`Hata: ${error.message}`);
        showNotification(`${modpackName} yüklenemedi: ${error.message}`, 'error');
        
        // Show error in modpack card
        updateModpackProgress(modpackId, `❌ Yükleme hatası`, true);
        
        // Manual sidebar error
        updateDownloadProgress(manualId, 0, `❌ ${modpackName} kurulum hatası`, 'error');
        
        // Clear installation tracking
        window.currentModpackInstallation = null;
        console.log('🧹 [INSTALL-CLEAR] Installation tracking cleared (error)');
        
        // Clear error after a moment
        setTimeout(() => {
            hideLaunchProgress();
            updateModpackProgress(modpackId, '', false);
        }, 5000);
    }
};

// Legacy function - redirect to modpacks page
window.createModpack = async () => {
    browseModpacks();
};

// Show modpack selection modal
function showModpackSelectionModal(modpacks) {
    // Create modal HTML
    const modalHTML = `
        <div class="modal-overlay" id="modpackModal">
            <div class="modal modpack-modal">
                <div class="modal-header">
                    <h2>Popüler Modpackler</h2>
                    <button class="close-modal" onclick="closeModpackModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="modpack-grid">
                        ${modpacks.map(pack => `
                            <div class="modpack-item" onclick="installSelectedModpack('${pack.id}', '${pack.name.replace(/'/g, "\\'")}')">
                                <div class="modpack-image">
                                    ${pack.iconUrl ? 
                                        `<img src="${pack.iconUrl}" alt="${pack.name}" onerror="this.style.display='none'">` : 
                                        '<i class="fas fa-cube"></i>'
                                    }
                                </div>
                                <div class="modpack-info">
                                    <h3>${pack.name}</h3>
                                    <p>${pack.description ? pack.description.substring(0, 100) + '...' : 'Açıklama yok'}</p>
                                    <div class="modpack-stats">
                                        <span><i class="fas fa-download"></i> ${formatDownloads(pack.downloads)}</span>
                                        <span><i class="fas fa-user"></i> ${pack.author}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv.firstElementChild);
    
    // Show modal
    setTimeout(() => {
        document.getElementById('modpackModal').classList.add('active');
    }, 100);
    
    // Add styles
    if (!document.querySelector('style[data-modpack-modal]')) {
        const style = document.createElement('style');
        style.setAttribute('data-modpack-modal', 'true');
        style.textContent = `
            .modpack-modal {
                max-width: 900px;
                max-height: 80vh;
            }
            .modpack-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 16px;
                max-height: 60vh;
                overflow-y: auto;
            }
            .modpack-item {
                display: flex;
                gap: 12px;
                padding: 16px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(252, 148, 45, 0.2);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .modpack-item:hover {
                background: rgba(252, 148, 45, 0.1);
                border-color: rgba(252, 148, 45, 0.4);
                transform: translateY(-2px);
            }
            .modpack-image {
                width: 64px;
                height: 64px;
                border-radius: 8px;
                background: rgba(252, 148, 45, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .modpack-image img {
                width: 100%;
                height: 100%;
                border-radius: 8px;
                object-fit: cover;
            }
            .modpack-image i {
                font-size: 24px;
                color: #FC942D;
            }
            .modpack-info {
                flex: 1;
                min-width: 0;
            }
            .modpack-info h3 {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 4px;
                color: #FC942D;
            }
            .modpack-info p {
                font-size: 14px;
                color: #cccccc;
                margin-bottom: 8px;
                line-height: 1.4;
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
            }
            .modpack-stats {
                display: flex;
                gap: 16px;
                font-size: 12px;
                color: #888888;
            }
            .modpack-stats span {
                display: flex;
                align-items: center;
                gap: 4px;
            }
        `;
        document.head.appendChild(style);
    }
}

// Close modpack modal
window.closeModpackModal = () => {
    const modal = document.getElementById('modpackModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
};

// Install selected modpack
window.installSelectedModpack = async (modpackId, modpackName) => {
    try {
        closeModpackModal();
        showLoading(true, `${modpackName} modpack yükleniyor...`);
        
        const result = await ipcRenderer.invoke('install-modpack', modpackId, null, modpackName);
        
        if (result.success) {
            showNotification(`${modpackName} başarıyla yüklendi!`, 'success');
            // Refresh mods list to show modpack mods
            if (document.querySelector('.page.active')?.id === 'modsPage') {
                loadMods();
            }
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Modpack yükleme hatası:', error);
        showNotification(`${modpackName} yüklenemedi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
};

window.toggleMod = async (modId, isInstalled, modName) => {
    try {
        showLoading(true);
        
        if (isInstalled) {
            // Remove mod
            const result = await ipcRenderer.invoke('delete-mod', modId);
            if (result.success) {
                showNotification(`${modName} kaldırıldı`, 'success');
                loadMods(); // Refresh mod list
            } else {
                throw new Error(result.error);
            }
        } else {
            // Download and install mod
            const result = await ipcRenderer.invoke('download-mod', modId, null, '1.20.4', 'forge');
            if (result.success) {
                showNotification(`${modName} yüklendi`, 'success');
                loadMods(); // Refresh mod list
            } else {
                throw new Error(result.error);
            }
        }
    } catch (error) {
        console.error('Mod işlemi hatası:', error);
        showNotification(`Mod işlemi başarısız: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
};

window.addServer = () => {
    showNotification('Sunucu ekleme özelliği yakında eklenecek', 'info');
};

window.refreshServers = () => {
    loadServers();
    showNotification('Sunucu listesi yenilendi', 'success');
};

window.joinServer = (ip) => {
    showNotification(`${ip} sunucusuna katılım özelliği yakında eklenecek`, 'info');
};

window.changeProfile = () => {
    switchProfile();
};

// ==================== LIBRARY PAGE FUNCTIONS ====================

let libraryData = [];
let filteredLibraryData = [];

// Load installed modpacks from library
async function loadLibrary() {
    try {
        showLoading(true);
        
        // Get installed instances from NEW PROFESSIONAL SYSTEM
        const result = await ipcRenderer.invoke('get-instances');
        if (result.success) {
            libraryData = result.instances || [];
            
            // Map icon URLs for library items
            libraryData.forEach(modpack => {
                modpack.iconUrl = modpack.icon_url || modpack.iconUrl;
            });
            
            filteredLibraryData = [...libraryData];
            updateLibraryDisplay();
            updateLibraryStats();
        } else {
            console.error('Library loading error:', result.error);
            showEmptyLibrary();
        }
    } catch (error) {
        console.error('Error loading library:', error);
        showEmptyLibrary();
        showNotification('Kütüphane yüklenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Update library display
function updateLibraryDisplay() {
    const libraryGrid = document.getElementById('libraryGrid');
    
    if (!libraryGrid) return;
    
    if (filteredLibraryData.length === 0) {
        showEmptyLibrary();
        return;
    }
    
    libraryGrid.innerHTML = '';
    
    filteredLibraryData.forEach(modpack => {
        const libraryItem = createLibraryItem(modpack);
        libraryGrid.appendChild(libraryItem);
    });
}

// Create library item element
function createLibraryItem(modpack) {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.dataset.modpackId = modpack.id;
    
    // Determine status
    const status = getModpackStatus(modpack);
    const statusClass = status.type;
    const statusText = status.text;
    const statusIcon = status.icon;
    
    // Format size
    const size = formatBytes(modpack.size || 0);
    const mcVersion = modpack.minecraftVersion || modpack.metadata?.minecraftVersion || 'Bilinmiyor';
    const versionStr = modpack.modloader?.version || modpack.modpackVersion || modpack.version || '';
    const totalPlay = modpack.totalPlayTime || 0; // minutes
    const playHours = Math.floor(totalPlay / 60);
    const playMins = totalPlay % 60;
    const playText = playHours > 0 ? `${playHours}sa ${playMins}dk` : `${playMins}dk`;
    
    // Format date
    const lastPlayed = modpack.lastPlayed ? 
        new Date(modpack.lastPlayed).toLocaleDateString('tr-TR') : 
        'Hiç oynanmadı';
    
    item.innerHTML = `
        <div class="library-item-header">
            <div class="library-item-icon">
                ${modpack.iconUrl ? 
                    `<img src="${modpack.iconUrl}" alt="${modpack.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : 
                    ''}
                <div class="library-item-icon-fallback" ${modpack.iconUrl ? 'style="display: none;"' : ''}>
                    <i class="fas fa-cube"></i>
                </div>
            </div>
            <div class="library-item-info">
                <h3>${modpack.name}</h3>
                <div class="version">${mcVersion} • ${versionStr ? 'v' + versionStr : ''}</div>
            </div>
            <div class="library-item-status ${statusClass}">
                <i class="fas ${statusIcon}"></i>
                ${statusText}
            </div>
        </div>
        
        <div class="library-item-description">
            ${modpack.modpackDescription || modpack.description || 'Bu modpack için açıklama bulunmuyor.'}
        </div>
        
        <div class="library-item-meta" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:start;">
            <div><strong style="display:block;color:#aaa;font-size:11px;">Son oynanma</strong><span>${lastPlayed}</span></div>
            <div><strong style="display:block;color:#aaa;font-size:11px;">Toplam süre</strong><span>${playText}</span></div>
            <div><strong style="display:block;color:#aaa;font-size:11px;">Boyut</strong><span>${size}</span></div>
        </div>
        
        <div class="library-item-actions">
            ${status.type !== 'broken' ? 
                `<button class="library-action-btn play" onclick="playModpack('${modpack.id}')" id="playBtn_${modpack.id}">
                    <i class="fas fa-play"></i>
                    Oyna
                </button>
                <button class="library-action-btn stop" onclick="stopModpack('${modpack.id}')" id="stopBtn_${modpack.id}" style="display: none;">
                    <i class="fas fa-stop"></i>
                    Durdur
                </button>` : ''
            }
            ${status.type === 'outdated' ? 
                `<button class="library-action-btn update" onclick="updateModpack('${modpack.id}')">
                    <i class="fas fa-download"></i>
                    Güncelle
                </button>` : ''
            }
            <button class="library-action-btn manage" onclick="manageModpack('${modpack.id}')">
                <i class="fas fa-cog"></i>
                Yönet
            </button>
            <button class="library-action-btn delete" onclick="deleteModpack('${modpack.id}')">
                <i class="fas fa-trash"></i>
                Sil
            </button>
        </div>
        
        <div class="library-item-progress" id="progress_${modpack.id}" style="display: none;">
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div class="progress-text"></div>
        </div>
    `;
    
    return item;
}

// Get modpack status
function getModpackStatus(modpack) {
    if (modpack.broken) {
        return { type: 'broken', text: 'Sorunlu', icon: 'fa-exclamation-triangle' };
    }
    
    if (modpack.hasUpdate) {
        return { type: 'outdated', text: 'Güncellenebilir', icon: 'fa-arrow-up' };
    }
    
    return { type: 'installed', text: 'Kurulu', icon: 'fa-check-circle' };
}

// Update library stats
function updateLibraryStats() {
    const totalModpacks = document.getElementById('totalModpacks');
    const installedModpacks = document.getElementById('installedModpacks');
    const totalSize = document.getElementById('totalSize');
    
    if (totalModpacks) totalModpacks.textContent = libraryData.length;
    if (installedModpacks) {
        const installed = libraryData.filter(m => !m.broken).length;
        installedModpacks.textContent = installed;
    }
    if (totalSize) {
        const total = libraryData.reduce((sum, m) => sum + (m.size || 0), 0);
        totalSize.textContent = formatBytes(total);
    }
}

// Show empty library state
function showEmptyLibrary() {
    const libraryGrid = document.getElementById('libraryGrid');
    if (!libraryGrid) return;
    
    libraryGrid.innerHTML = `
        <div class="library-empty">
            <i class="fas fa-box-open"></i>
            <h3>Kütüphaneniz Boş</h3>
            <p>Henüz hiç modpack yüklememişsiniz. Mod Paketleri sayfasından popüler modpackleri keşfedebilir veya kendi modpackinizi içe aktarabilirsiniz.</p>
            <button class="btn-primary" onclick="switchPage('modpacks')">
                <i class="fas fa-box"></i>
                <span>Modpackleri Keşfet</span>
            </button>
        </div>
    `;
}

// Filter library
function filterLibrary() {
    const filterSelect = document.getElementById('libraryFilter');
    if (!filterSelect) return;
    
    const filter = filterSelect.value;
    
    switch (filter) {
        case 'installed':
            filteredLibraryData = libraryData.filter(m => !m.broken && !m.hasUpdate);
            break;
        case 'available':
            filteredLibraryData = libraryData.filter(m => m.hasUpdate);
            break;
        case 'broken':
            filteredLibraryData = libraryData.filter(m => m.broken);
            break;
        default:
            filteredLibraryData = [...libraryData];
    }
    
    updateLibraryDisplay();
}

// Sort library
function sortLibrary() {
    const sortSelect = document.getElementById('librarySortBy');
    if (!sortSelect) return;
    
    const sortBy = sortSelect.value;
    
    filteredLibraryData.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'lastPlayed':
                return new Date(b.lastPlayed || 0) - new Date(a.lastPlayed || 0);
            case 'dateAdded':
                return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
            case 'size':
                return (b.size || 0) - (a.size || 0);
            default:
                return 0;
        }
    });
    
    updateLibraryDisplay();
}

// Search library
function searchLibrary() {
    const searchInput = document.getElementById('librarySearch');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        filteredLibraryData = [...libraryData];
    } else {
        filteredLibraryData = libraryData.filter(modpack => 
            modpack.name.toLowerCase().includes(query) ||
            (modpack.description && modpack.description.toLowerCase().includes(query))
        );
    }
    
    updateLibraryDisplay();
}

// Play modpack
// Track currently playing modpack and playtime
let currentlyPlayingModpackId = null;
let gameStartTime = null;
let gameStateCheckInterval = null;

async function playModpack(modpackId) {
    try {
        // Prevent launching if already launching or game is running
        if (isLaunching) {
            console.warn('⚠️ [PLAY-MODPACK] Already launching, please wait...');
            showNotification('Lütfen bekleyin, bir oyun başlatılıyor...', 'warning');
            return;
        }
        
        if (currentRunningModpackId) {
            console.warn('⚠️ [PLAY-MODPACK] A game is already running:', currentRunningModpackId);
            showNotification('Lütfen önce çalışan oyunu kapatın', 'warning');
            return;
        }
        
        const modpack = libraryData.find(m => m.id === modpackId);
        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }
        
        // Set launching flag
        isLaunching = true;
        console.log('🎮 [PLAY-MODPACK] Starting launch for:', modpackId);
        
        // Show progress in both places
        updateLaunchProgress(`${modpack.name} başlatılıyor...`);
        updateModpackProgress(modpackId, `${modpack.name} başlatılıyor...`, true);
        
        // Set the running modpack ID
        currentRunningModpackId = modpackId;
        console.log('🎮 [PLAY-MODPACK] Set currentRunningModpackId to:', modpackId);
        
        // Launch instance with NEW PROFESSIONAL SYSTEM
        const result = await ipcRenderer.invoke('launch-instance', modpackId);
        if (result.success) {
            showNotification(`${modpack.name} başlatılıyor...`, 'success');
            
            // Update last played
            modpack.lastPlayed = new Date().toISOString();
            updateLibraryDisplay();
            
            // Add to play history
            if (typeof addToPlayHistory === 'function') {
                addToPlayHistory(modpackId, modpack.name, modpack.version, modpack.iconUrl);
            }
            
            // Discord RPC will be updated by game-started event
            
            // Game is launching, show stop button
            currentlyPlayingModpackId = modpackId;
            toggleModpackButtons(modpackId, true);
            
            // Progress will be hidden automatically by 'game-started' event
            console.log('[RENDERER] Waiting for game-started event to hide progress...');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('❌ [PLAY-MODPACK] Launch error:', error);
        updateLaunchProgress(`Hata: ${error.message}`);
        updateModpackProgress(modpackId, `Hata: ${error.message}`, false);
        showNotification(`Modpack başlatılamadı: ${error.message}`, 'error');
        
        // CRITICAL: Clear all flags on error
        isLaunching = false;
        currentRunningModpackId = null;
        console.log('🧹 [PLAY-MODPACK] Cleared all flags after error');
        
        // Clear error after a moment
        setTimeout(() => {
            updateLaunchProgress('');
            updateModpackProgress(modpackId, '', false);
        }, 5000);
    }
}

// Start periodic game state check - OPTIMIZED FOR LOW CPU
let lastGameRunningState = false;

function startGameStateCheck() {
    // Clear any existing interval
    if (gameStateCheckInterval) {
        clearInterval(gameStateCheckInterval);
    }
    
    // Check every 3 seconds (reduced from 1s for CPU optimization)
    gameStateCheckInterval = setInterval(async () => {
        const gameState = await ipcRenderer.invoke('get-game-state');
        
        // Only log when state changes (reduce console spam)
        if (gameState.isRunning !== lastGameRunningState) {
            console.log('[GAME-CHECK] State changed:', gameState.state, 'Running:', gameState.isRunning, 'PID:', gameState.pid);
            lastGameRunningState = gameState.isRunning;
        }
        
        if (!gameState.isRunning && currentlyPlayingModpackId) {
            console.log('[GAME-CHECK] ⚠️ Game is no longer running, cleaning up UI');
            
            // Game stopped without triggering game-closed event
            // Reset Discord RPC to home page
            ipcRenderer.invoke('update-discord-rpc', 'home');
            
            // Calculate playtime
            if (gameStartTime) {
                const gameEndTime = new Date();
                const playTimeMinutes = Math.floor((gameEndTime - gameStartTime) / (1000 * 60));
                console.log('[PLAYTIME] Session ended (from check). Duration:', playTimeMinutes, 'minutes');
                
                const modpack = libraryData.find(m => m.id === currentlyPlayingModpackId);
                if (modpack) {
                    modpack.totalPlayTime = (modpack.totalPlayTime || 0) + playTimeMinutes;
                    
                    try {
                        await ipcRenderer.invoke('update-modpack-playtime', currentlyPlayingModpackId, playTimeMinutes);
                    } catch (error) {
                        console.error('[PLAYTIME] Error saving playtime:', error);
                    }
                    
                    updateLibraryDisplay();
                }
                
                gameStartTime = null;
            }
            
            // Reset UI
            hideLaunchProgress();
            updateStatusBar('Hazır');
            toggleGameButtons(false);
            isLaunching = false;
            
            if (currentlyPlayingModpackId) {
                toggleModpackButtons(currentlyPlayingModpackId, false);
                updateModpackProgress(currentlyPlayingModpackId, '', false);
                currentlyPlayingModpackId = null;
            }
            
            // Stop checking (save CPU when game not running)
            stopGameStateCheck();
            
            showNotification('Oyun kapandı', 'info');
        }
    }, 3000); // Check every 3 seconds (CPU optimized)
}

// Stop game state check - CPU optimization
function stopGameStateCheck() {
    if (gameStateCheckInterval) {
        clearInterval(gameStateCheckInterval);
        gameStateCheckInterval = null;
        lastGameRunningState = false;
        console.log('[GAME-CHECK] Stopped (CPU optimization)');
    }
}

// Stop modpack
async function stopModpack(modpackId) {
    try {
        const modpack = libraryData.find(m => m.id === modpackId);
        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }
        
        console.log('[RENDERER] Stopping modpack:', modpack.name);
        updateModpackProgress(modpackId, 'Oyun durduruluyor...', true);
        
        // Reset Discord RPC immediately
        ipcRenderer.invoke('update-discord-rpc', 'home');
        
        const result = await ipcRenderer.invoke('stop-game');
        console.log('[RENDERER] Stop game result:', result);
        
        if (result.success) {
            // UI will be updated by game-closed event, just show notification
            showNotification(`${modpack.name} durduruluyor...`, 'info');
        } else {
            throw new Error(result.error || 'Oyun durdurulamadı');
        }
    } catch (error) {
        console.error('[RENDERER] Modpack stop error:', error);
        updateModpackProgress(modpackId, `Hata: ${error.message}`, false);
        showNotification(`Durdurma hatası: ${error.message}`, 'error');
        
        // Reset after error
        setTimeout(() => {
            toggleModpackButtons(modpackId, false);
            updateModpackProgress(modpackId, '', false);
            currentlyPlayingModpackId = null;
        }, 3000);
    }
}

// Create temporary library card for downloading modpack
function createTemporaryLibraryCard(modpackId, modpackName, versionNumber) {
    const libraryGrid = document.getElementById('libraryGrid');
    if (!libraryGrid) return;
    
    // Check if card already exists
    if (document.getElementById(`library_${modpackId}`)) return;
    
    const tempCard = document.createElement('div');
    tempCard.className = 'library-item installing';
    tempCard.id = `library_${modpackId}`;
    tempCard.innerHTML = `
        <div class="library-item-icon">
            <i class="fas fa-download"></i>
        </div>
        <div class="library-item-info">
            <h3>${modpackName}</h3>
            <p>v${versionNumber} yükleniyor...</p>
        </div>
        <div class="library-item-actions">
            <div class="library-item-progress" id="progress_${modpackId}" style="display: block;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 20%;"></div>
                </div>
                <div class="progress-text">Yükleniyor...</div>
            </div>
        </div>
    `;
    
    libraryGrid.insertBefore(tempCard, libraryGrid.firstChild);
}

// Update modpack progress display
function updateModpackProgress(modpackId, message, showProgress) {
    const progressElement = document.getElementById(`progress_${modpackId}`);
    if (progressElement) {
        const textElement = progressElement.querySelector('.progress-text');
        if (textElement) {
            textElement.textContent = message;
        }
        progressElement.style.display = showProgress && message ? 'block' : 'none';
        
        // Update progress bar animation
        const progressFill = progressElement.querySelector('.progress-fill');
        if (progressFill && showProgress) {
            if (message.includes('✅')) {
                progressFill.style.width = '100%';
                progressFill.style.backgroundColor = '#4CAF50';
            } else if (message.includes('❌')) {
                progressFill.style.width = '100%';
                progressFill.style.backgroundColor = '#f44336';
            } else {
                progressFill.style.width = '70%';
                progressFill.style.backgroundColor = '#FC942D';
            }
        }
    }
}

// Toggle modpack play/stop buttons
function toggleModpackButtons(modpackId, isPlaying) {
    const playBtn = document.getElementById(`playBtn_${modpackId}`);
    const stopBtn = document.getElementById(`stopBtn_${modpackId}`);
    
    if (playBtn && stopBtn) {
        playBtn.style.display = isPlaying ? 'none' : 'inline-flex';
        stopBtn.style.display = isPlaying ? 'inline-flex' : 'none';
    }
}

// ==================== DOWNLOAD PROGRESS SIDEBAR ====================

// Show/hide download progress section
function showDownloadProgress() {
    const section = document.getElementById('downloadProgressSection');
    console.log('🔍 [SIDEBAR-ELEMENT] downloadProgressSection found:', !!section);
    if (section) {
        console.log('✅ [SIDEBAR-SHOW] Showing sidebar section');
        section.style.display = 'block';
        section.style.visibility = 'visible';
        section.style.opacity = '1';
    } else {
        console.error('❌ [SIDEBAR-ERROR] downloadProgressSection element not found!');
    }
}

function hideDownloadProgress() {
    const section = document.getElementById('downloadProgressSection');
    const queue = document.getElementById('downloadQueue');
    if (section && queue && queue.children.length === 0) {
        section.style.display = 'none';
    }
}

// Add download item to sidebar
function addDownloadItem(id, name, type = 'modpack') {
    console.log('🎯 [ADD-ITEM] Adding download item:', id, name);
    console.log('🎯 [ADD-ITEM-DEBUG] Name type:', typeof name, 'Name length:', name?.length);
    
    // Fallback for empty or invalid names
    if (!name || name.trim() === '' || name === 'undefined') {
        name = 'Modpack İndiriliyor';
        console.log('⚠️ [ADD-ITEM-FALLBACK] Using fallback name:', name);
    }
    
    showDownloadProgress();
    const queue = document.getElementById('downloadQueue');
    console.log('🔍 [SIDEBAR-QUEUE] downloadQueue found:', !!queue);
    if (!queue) {
        console.error('❌ [SIDEBAR-ERROR] downloadQueue element not found!');
        return;
    }
    
    // Remove existing item if exists
    const existingItem = document.getElementById(`download_${id}`);
    if (existingItem) {
        existingItem.remove();
    }
    
    const downloadItem = document.createElement('div');
    downloadItem.className = 'download-item';
    downloadItem.id = `download_${id}`;
    downloadItem.innerHTML = `
        <div class="download-item-header">
            <div class="download-item-name">${name}</div>
            <div class="download-item-status">0%</div>
        </div>
        <div class="download-item-progress">
            <div class="download-item-progress-fill" style="width: 0%;"></div>
        </div>
        <div class="download-item-message">Başlatılıyor...</div>
    `;
    
    queue.appendChild(downloadItem);
    console.log('✅ [ADD-ITEM] Download item added to queue, total items:', queue.children.length);
    
    // Check section visibility
    const section = document.getElementById('downloadProgressSection');
    if (section) {
        console.log('🔍 [SIDEBAR-VISIBLE] Section display:', section.style.display, 'visibility:', section.style.visibility);
    }
    
    return downloadItem;
}

// Update download progress
function updateDownloadProgress(id, progress, message, status = 'downloading') {
    const item = document.getElementById(`download_${id}`);
    if (!item) return;
    
    const statusEl = item.querySelector('.download-item-status');
    const progressFill = item.querySelector('.download-item-progress-fill');
    const messageEl = item.querySelector('.download-item-message');
    
    if (statusEl && progressFill && messageEl) {
        // Update progress percentage
        if (typeof progress === 'number') {
            const percentage = Math.round(progress);
            statusEl.textContent = `${percentage}%`;
            progressFill.style.width = `${percentage}%`;
        } else {
            // Keep current percentage if progress is null
            statusEl.textContent = statusEl.textContent || '0%';
        }
        
        // Update message
        messageEl.textContent = message || 'İndiriliyor...';
        
        // Update status styling
        item.className = `download-item ${status}`;
        progressFill.className = `download-item-progress-fill ${status}`;
        
        // Auto-remove completed/error items after delay
        if (status === 'completed') {
            // Mark as completed
            item.dataset.completed = 'true';
            setTimeout(() => {
                if (item.parentElement) {
                item.remove();
                }
                hideDownloadProgress();
            }, 2000); // 2 seconds for completed
        } else if (status === 'error') {
            // Mark as error
            item.dataset.error = 'true';
            setTimeout(() => {
                if (item.parentElement) {
                    item.remove();
                }
                hideDownloadProgress();
            }, 5000); // 5 seconds for errors
        }
    }
}

// Complete download
function completeDownload(id, name) {
    updateDownloadProgress(id, 100, `✅ ${name} başarıyla yüklendi!`, 'completed');
}

// Error download
function errorDownload(id, name, error) {
    updateDownloadProgress(id, 0, `❌ ${name}: ${error}`, 'error');
}

// Parse progress messages and update sidebar
let currentDownloadId = null;
let currentDownloadName = '';

// Update current modpack installation progress
function updateCurrentInstallationProgress(message) {
    if (!window.currentModpackInstallation) return;
    
    const installation = window.currentModpackInstallation;
    console.log('📈 [PROGRESS-UPDATE] Updating installation:', installation.name, 'with:', message);
    
    // Determine progress percentage based on message content
    let percentage = 10; // Default
    let displayMessage = message;
    
    if (message.includes('Modpack bilgileri alınıyor')) {
        percentage = 15;
        displayMessage = 'Modpack bilgileri alınıyor...';
    } else if (message.includes('Versiyon bilgileri alınıyor')) {
        percentage = 20;
        displayMessage = 'Versiyon kontrol ediliyor...';
    } else if (message.includes('Instance dizini oluşturuluyor')) {
        percentage = 25;
        displayMessage = 'Klasörler hazırlanıyor...';
    } else if (message.includes('Modpack indiriliyor')) {
        percentage = 30;
        displayMessage = 'Modpack dosyası indiriliyor...';
    } else if (message.includes('Modpack çıkarılıyor')) {
        percentage = 40;
        displayMessage = 'Modpack açılıyor...';
    } else if (message.includes('Manifest okunuyor')) {
        percentage = 45;
        displayMessage = 'Modpack bilgileri okunuyor...';
    } else if (message.includes('Modloader kuruluyor')) {
        percentage = 50;
        displayMessage = 'Fabric yükleniyor...';
    } else if (message.includes('Fabric kütüphaneleri indiriliyor')) {
        percentage = 55;
        displayMessage = 'Fabric kütüphaneleri indiriliyor...';
    } else if (message.includes('Modlar indiriliyor')) {
        percentage = 60;
        displayMessage = 'Modlar indiriliyor...';
    } else if (message.includes('Mod indiriliyor:')) {
        // Extract mod count if possible
        const match = message.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            percentage = Math.round(60 + (current / total) * 25); // 60-85% range
            displayMessage = `Mod ${current}/${total} indiriliyor...`;
        } else {
            percentage = 65;
            displayMessage = 'Modlar indiriliyor...';
        }
    } else if (message.includes('✅') && message.includes('indirildi')) {
        const match = message.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            percentage = Math.round(60 + (current / total) * 25);
            displayMessage = `Mod ${current}/${total} tamamlandı`;
        }
    } else if (message.includes('✅ Fabric kütüphaneleri başarıyla indirildi')) {
        percentage = 85;
        displayMessage = 'Fabric kütüphaneleri tamamlandı';
    } else if (message.includes('Özelleştirmeler uygulanıyor')) {
        percentage = 90;
        displayMessage = 'Özelleştirmeler uygulanıyor...';
    } else if (message.includes('Metadata oluşturuluyor')) {
        percentage = 95;
        displayMessage = 'Son ayarlar yapılıyor...';
    } else if (message.includes('başarıyla kuruldu')) {
        percentage = 100;
        displayMessage = `✅ ${installation.name} yüklendi!`;
    }
    
    // Update sidebar progress
    updateDownloadProgress(installation.id, percentage, displayMessage, percentage === 100 ? 'completed' : 'downloading');
}

function updateSidebarProgressFromMessage(message) {
    console.log('📊 [SIDEBAR-PROGRESS] Processing:', message);
    console.log('📊 [SIDEBAR-DEBUG] Sidebar section exists:', !!document.getElementById('downloadProgressSection'));
    console.log('📊 [SIDEBAR-DEBUG] Download queue exists:', !!document.getElementById('downloadQueue'));
    
    // Extract modpack name from various message formats
    if ((message.includes('yükleniyor') || message.includes('indiriliyor') || message.includes('kuruluyor')) && !currentDownloadId) {
        // "Simply Optimized v1.21.8-1.0.1 yükleniyor..."
        // "Simply Optimized v1.21.8 indiriliyor..."
        let match = message.match(/^(.+?)\s+(yükleniyor|indiriliyor|kuruluyor)/);
        
        // Try alternative patterns if first doesn't match
        if (!match) {
            // Match version patterns like v1.2.3, v1.2.3-1.0.1, v1.21.8-1.0.1 etc
            match = message.match(/(.+?)\s+v[\d.-]+/); // "Name v1.21.8-1.0.1"
        }
        
        // If still no match, try to extract before " v" pattern
        if (!match) {
            match = message.match(/^(.+?)\s+v/); // "Name v"
        }
        
        // Last resort: extract everything before common keywords
        if (!match) {
            match = message.match(/^(.+?)\s+(v\d+|version|Ver\.|yükleniyor|indiriliyor|kuruluyor)/i);
        }
        
        if (match) {
            currentDownloadName = match[1].trim();
            currentDownloadId = Date.now().toString(); // Unique ID
            console.log('📊 [SIDEBAR-START] Creating download item:', currentDownloadName);
            addDownloadItem(currentDownloadId, currentDownloadName, 'modpack');
            updateDownloadProgress(currentDownloadId, 5, 'İşlem başlatılıyor...', 'downloading');
            console.log('📊 [SIDEBAR-START] Download item created with ID:', currentDownloadId);
        } else {
            console.log('📊 [SIDEBAR-FAIL] Could not extract modpack name from:', message);
            console.log('📊 [SIDEBAR-DEBUG] Full message was:', message);
        }
    }
    
    if (!currentDownloadId) return;
    
    // Parse different progress stages with more comprehensive matching
    if (message.includes('Modpack bilgileri alınıyor')) {
        updateDownloadProgress(currentDownloadId, 10, 'Modpack bilgileri alınıyor...', 'downloading');
    } else if (message.includes('Versiyon bilgileri alınıyor')) {
        updateDownloadProgress(currentDownloadId, 15, 'Versiyon kontrol ediliyor...', 'downloading');
    } else if (message.includes('Instance dizini oluşturuluyor')) {
        updateDownloadProgress(currentDownloadId, 20, 'Klasörler hazırlanıyor...', 'downloading');
    } else if (message.includes('Modpack indiriliyor')) {
        updateDownloadProgress(currentDownloadId, 25, 'Modpack dosyası indiriliyor...', 'downloading');
    } else if (message.includes('Modpack çıkarılıyor')) {
        updateDownloadProgress(currentDownloadId, 35, 'Modpack açılıyor...', 'downloading');
    } else if (message.includes('Manifest okunuyor')) {
        updateDownloadProgress(currentDownloadId, 40, 'Modpack bilgileri okunuyor...', 'downloading');
    } else if (message.includes('Modloader kuruluyor')) {
        updateDownloadProgress(currentDownloadId, 45, 'Fabric yükleniyor...', 'downloading');
    } else if (message.includes('Minecraft') && (message.includes('yükleniyor') || message.includes('indiriliyor')) && !currentDownloadId) {
        // Vanilla Minecraft download started
        currentDownloadName = 'Minecraft';
        currentDownloadId = Date.now().toString();
        console.log('📊 [SIDEBAR-MINECRAFT] Creating download item for Minecraft');
        addDownloadItem(currentDownloadId, 'Minecraft', 'minecraft');
        updateDownloadProgress(currentDownloadId, 5, 'Minecraft indiriliyor...', 'downloading');
    } else if (message.includes('Kütüphaneler İndiriliyor') || message.includes('kütüphane')) {
        if (currentDownloadId) {
            updateDownloadProgress(currentDownloadId, 30, 'Kütüphaneler indiriliyor...', 'downloading');
        }
    } else if (message.includes('Oyun İndiriliyor') || message.includes('client')) {
        if (currentDownloadId) {
            updateDownloadProgress(currentDownloadId, 50, 'Oyun dosyası indiriliyor...', 'downloading');
        }
    } else if (message.includes('Varlıklar İndiriliyor') || (message.includes('Asset') && message.includes('indiriliyor'))) {
        if (currentDownloadId) {
            // Extract progress from message like "Asset dosyaları indiriliyor... (150/300)"
            const match = message.match(/\((\d+)\/(\d+)\)/);
            if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                const percentage = Math.round(70 + (current / total) * 25); // 70-95% range
                updateDownloadProgress(currentDownloadId, percentage, `Asset dosyaları (${current}/${total})...`, 'downloading');
            } else {
                updateDownloadProgress(currentDownloadId, 70, 'Asset dosyaları indiriliyor...', 'downloading');
            }
        }
    } else if (message.includes('Fabric kütüphaneleri indiriliyor')) {
        const match = message.match(/(\d+)\s+adet/);
        const count = match ? match[1] : '';
        updateDownloadProgress(currentDownloadId, 50, `Fabric kütüphaneleri (${count} adet)...`, 'downloading');
    } else if (message.includes('Modlar indiriliyor')) {
        updateDownloadProgress(currentDownloadId, 55, 'Modlar indiriliyor...', 'downloading');
    } else if (message.includes('Mod indiriliyor:')) {
        // "Mod indiriliyor: sodium-fabric-0.5.11+mc1.21.jar (1/16)"
        const match = message.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            const percentage = Math.round(55 + (current / total) * 30); // 55-85% range for mods
            updateDownloadProgress(currentDownloadId, percentage, `Mod ${current}/${total} indiriliyor...`, 'downloading');
        }
    } else if (message.includes('✅') && message.includes('indirildi')) {
        // "✅ sodium-fabric-0.5.11+mc1.21.jar indirildi (1/16)"
        const match = message.match(/\((\d+)\/(\d+)\)/);
        if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            const percentage = Math.round(55 + (current / total) * 30);
            updateDownloadProgress(currentDownloadId, percentage, `Mod ${current}/${total} tamamlandı`, 'downloading');
        }
    } else if (message.includes('✅ Fabric kütüphaneleri başarıyla indirildi')) {
        updateDownloadProgress(currentDownloadId, 85, 'Fabric kütüphaneleri tamamlandı', 'downloading');
    } else if (message.includes('Özelleştirmeler uygulanıyor')) {
        updateDownloadProgress(currentDownloadId, 90, 'Özelleştirmeler uygulanıyor...', 'downloading');
    } else if (message.includes('Metadata oluşturuluyor')) {
        updateDownloadProgress(currentDownloadId, 95, 'Son ayarlar yapılıyor...', 'downloading');
    } else if (message.includes('başarıyla kuruldu')) {
        updateDownloadProgress(currentDownloadId, 100, `✅ ${currentDownloadName} yüklendi!`, 'completed');
        // Reset for next download
        currentDownloadId = null;
        currentDownloadName = '';
    } else if (message.includes('Varlıklar Tamamlandı') || message.includes('asset dosyası başarıyla indirildi')) {
        // Minecraft installation completed
        if (currentDownloadId) {
            updateDownloadProgress(currentDownloadId, 100, `✅ Minecraft başarıyla indirildi!`, 'completed');
            console.log('📊 [SIDEBAR-COMPLETE] Minecraft download completed, clearing sidebar');
            // Reset for next download
            currentDownloadId = null;
            currentDownloadName = '';
        }
    } else if (message.includes('Kurulum başarısız')) {
        updateDownloadProgress(currentDownloadId, 0, `❌ Kurulum hatası`, 'error');
        // Reset for next download
        currentDownloadId = null;
        currentDownloadName = '';
    } else if (currentDownloadId) {
        // Fallback: Show any message as progress if we have an active download
        const shortMessage = message.length > 50 ? message.substring(0, 47) + '...' : message;
        updateDownloadProgress(currentDownloadId, null, shortMessage, 'downloading');
        console.log('📊 [SIDEBAR-FALLBACK] Showing generic progress:', shortMessage);
    }
}

// Make stopModpack global
window.stopModpack = stopModpack;

// Update modpack
async function updateModpack(modpackId) {
    try {
        showLoading(true);
        
        const modpack = libraryData.find(m => m.id === modpackId);
        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }
        
        const result = await ipcRenderer.invoke('update-modpack', modpackId);
        if (result.success) {
            showNotification(`${modpack.name} güncellendi`, 'success');
            
            // Refresh library
            await loadLibrary();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Modpack update error:', error);
        showNotification(`Modpack güncellenemedi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Manage modpack
async function manageModpack(modpackId) {
    try {
        const modpack = libraryData.find(m => m.id === modpackId);
        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }
        
        // Show modpack management modal
        const actions = [
            'Klasörü Aç',
            'Profil Ayarları',
            'Modları Görüntüle',
            'Yedek Oluştur',
            'İptal'
        ];
        
        const choice = await showActionModal(`${modpack.name} - Yönetim`, 
            'Bu modpack için yapmak istediğiniz işlemi seçin:', actions);
        
        switch (choice) {
            case 0: // Klasörü Aç
                await ipcRenderer.invoke('open-modpack-folder', modpackId);
                break;
            case 1: // Profil Ayarları
                await showModpackSettings(modpackId);
                break;
            case 2: // Modları Görüntüle
                await showModpackMods(modpackId);
                break;
            case 3: // Yedek Oluştur
                await createModpackBackup(modpackId);
                break;
        }
    } catch (error) {
        console.error('Modpack manage error:', error);
        showNotification(`İşlem başarısız: ${error.message}`, 'error');
    }
}

// Delete modpack
async function deleteModpack(modpackId) {
    try {
        const modpack = libraryData.find(m => m.id === modpackId);
        if (!modpack) {
            throw new Error('Modpack bulunamadı');
        }
        
        const confirmed = await showConfirmModal(
            'Modpack Sil',
            `${modpack.name} modpackini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`
        );
        
        if (confirmed) {
            showLoading(true);
            
            const result = await ipcRenderer.invoke('delete-instance', modpackId);
            if (result.success) {
                showNotification(`${modpack.name} silindi`, 'success');
                
                // Refresh library
                await loadLibrary();
            } else {
                throw new Error(result.error);
            }
        }
    } catch (error) {
        console.error('Modpack delete error:', error);
        showNotification(`Modpack silinemedi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Import modpack
async function importModpack() {
    try {
        const result = await ipcRenderer.invoke('import-modpack-dialog');
        if (result.success && result.filePath) {
            // Create a full sidebar download item and update through installation stages
            const itemId = `import_${Date.now()}`;
            const displayName = 'Yerel .mrpack İçe Aktarma';
            window.currentModpackInstallation = { id: itemId, name: displayName };
            addDownloadItem(itemId, displayName, 'modpack');
            updateDownloadProgress(itemId, 5, 'Dosya okunuyor...');
            
            const importResult = await ipcRenderer.invoke('import-modpack', result.filePath);
            if (importResult.success) {
                updateDownloadProgress(itemId, 95, 'Kütüphane yenileniyor...');
                await loadLibrary();
                completeDownload(itemId, displayName);
                setTimeout(() => { if (window.currentModpackInstallation && window.currentModpackInstallation.id === itemId) window.currentModpackInstallation = null; }, 2000);
            } else {
                errorDownload(itemId, displayName, importResult.error);
                setTimeout(() => { if (window.currentModpackInstallation && window.currentModpackInstallation.id === itemId) window.currentModpackInstallation = null; }, 3000);
                throw new Error(importResult.error);
            }
        }
    } catch (error) {
        console.error('Modpack import error:', error);
        showNotification(`Modpack içe aktarılamadı: ${error.message}`, 'error');
    } finally {
        // no overlay
    }
}

// Refresh library
async function refreshLibrary() {
    await loadLibrary();
    showNotification('Kütüphane yenilendi', 'success');
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper functions for modals
async function showActionModal(title, message, actions) {
    return new Promise((resolve) => {
        // Simple implementation - in a real app you'd create a proper modal
        let choice = prompt(`${title}\n\n${message}\n\n${actions.map((a, i) => `${i}: ${a}`).join('\n')}`);
        resolve(parseInt(choice) || 0);
    });
}

async function showConfirmModal(title, message) {
    return confirm(`${title}\n\n${message}`);
}

// ==================== QUICK ACTIONS ====================

/**
 * Open game directory in file explorer
 */
async function openGameDirectory() {
    try {
        // Get the actual game directory path from backend
        const settings = await ipcRenderer.invoke('get-settings');
        const gameDirectory = settings.gameDirectory;
        
        console.log('[QUICK-ACTION] Opening game directory:', gameDirectory);
        
        if (!gameDirectory) {
            throw new Error('Game directory not configured');
        }
        
        const result = await ipcRenderer.invoke('open-folder', gameDirectory);
        
        if (result.success) {
            showNotification('Oyun klasörü açıldı', 'success');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('[QUICK-ACTION] Failed to open game directory:', error);
        showNotification('Oyun klasörü açılamadı: ' + error.message, 'error');
    }
}

/**
 * Open website in default browser
 */
async function openWebsite() {
    try {
        const { shell } = require('electron');
        await shell.openExternal('https://blocksmithslauncher.com'); // Update with your website URL
        console.log('[QUICK-ACTION] Opened website');
    } catch (error) {
        console.error('[QUICK-ACTION] Failed to open website:', error);
        showNotification('Website açılamadı: ' + error.message, 'error');
    }
}

// Global window functions for library
window.refreshLibrary = refreshLibrary;
window.importModpack = importModpack;
window.filterLibrary = filterLibrary;
window.sortLibrary = sortLibrary;
window.searchLibrary = searchLibrary;
window.playModpack = playModpack;
window.updateModpack = updateModpack;
window.manageModpack = manageModpack;
window.deleteModpack = deleteModpack;

// Global window functions for quick actions
window.openGameDirectory = openGameDirectory;
window.openWebsite = openWebsite;

/**
 * Load and display launcher version
 */
async function loadLauncherVersion() {
    try {
        const versionInfo = await ipcRenderer.invoke('get-launcher-version');
        const versionElement = document.getElementById('launcherVersion');
        
        if (versionElement && versionInfo) {
            versionElement.textContent = `v${versionInfo.version}`;
            console.log('[VERSION] Launcher version loaded:', versionInfo.version);
        }
    } catch (error) {
        console.error('[VERSION] Failed to load launcher version:', error);
        // Keep default v0.0.0 if failed
    }
}

// closeVersionModal is already defined above as window.closeVersionModal

// ==================== CONTENT CREATORS FUNCTIONS ====================

// Helper functions for modpack icons
function getModpackIcon(modpackId) {
    const iconMap = {
        'survival-plus': 'fa-tree',
        'tech-adventure': 'fa-cog',
        'magic-world': 'fa-magic',
        'creative-plus': 'fa-palette',
        'hardcore-survival': 'fa-skull',
        'ultimate-quest': 'fa-compass',
        'industrial-craft': 'fa-industry',
        'skyblock-extreme': 'fa-cloud',
        'medieval-times': 'fa-chess-rook',
        'space-exploration': 'fa-rocket',
        'pokemon-adventure': 'fa-paw',
        'magic-tech': 'fa-atom'
    };
    return iconMap[modpackId] || 'fa-cube';
}

function getModpackIconClass(modpackId) {
    const classMap = {
        'survival-plus': 'survival-icon',
        'tech-adventure': 'tech-icon',
        'magic-world': 'magic-icon',
        'creative-plus': 'creative-icon',
        'hardcore-survival': 'hardcore-icon',
        'ultimate-quest': 'quest-icon',
        'industrial-craft': 'industrial-icon',
        'skyblock-extreme': 'skyblock-icon',
        'medieval-times': 'medieval-icon',
        'space-exploration': 'space-icon',
        'pokemon-adventure': 'pokemon-icon',
        'magic-tech': 'magictech-icon'
    };
    return classMap[modpackId] || 'default-icon';
}

// Creator modpack collections
const creatorModpacks = {
    algomi: [
        { id: 'survival-plus', name: 'Survival Plus', modrinthId: 'simply-optimized', description: 'Enhanced survival experience with quality of life improvements' },
        { id: 'tech-adventure', name: 'Tech Adventure', modrinthId: 'better-minecraft-forge', description: 'Technology-focused modpack with industrial mods' },
        { id: 'magic-world', name: 'Magic World', modrinthId: 'all-the-mods-9', description: 'Magical adventure with spells and enchantments' },
        { id: 'creative-plus', name: 'Creative Plus', modrinthId: 'fabric-example-mod', description: 'Enhanced creative mode with building tools' },
        { id: 'hardcore-survival', name: 'Hardcore Survival', modrinthId: 'cobblemon', description: 'Challenging survival experience' }
    ],
    tenticra: [
        { id: 'ultimate-quest', name: 'Ultimate Quest', modrinthId: 'better-minecraft-fabric', description: 'Epic quest-based adventure modpack' },
        { id: 'industrial-craft', name: 'Industrial Craft', modrinthId: 'create-mod', description: 'Industrial automation and machinery' },
        { id: 'skyblock-extreme', name: 'Skyblock Extreme', modrinthId: 'skyfactory-5', description: 'Challenging skyblock experience' },
        { id: 'medieval-times', name: 'Medieval Times', modrinthId: 'medieval-minecraft', description: 'Medieval-themed adventure pack' },
        { id: 'space-exploration', name: 'Space Exploration', modrinthId: 'galacticraft', description: 'Explore space and other planets' },
        { id: 'pokemon-adventure', name: 'Pokemon Adventure', modrinthId: 'cobblemon', description: 'Catch and train Pokemon in Minecraft' },
        { id: 'magic-tech', name: 'Magic & Tech', modrinthId: 'enigmatica-6', description: 'Perfect blend of magic and technology' }
    ]
};

// Install creator modpack with one click
window.installCreatorModpack = async (creatorName, modpackId) => {
    const creator = creatorModpacks[creatorName];
    if (!creator) {
        showNotification('İçerik üreticisi bulunamadı!', 'error');
        return;
    }
    
    const modpack = creator.find(m => m.id === modpackId);
    if (!modpack) {
        showNotification('Modpack bulunamadı!', 'error');
        return;
    }
    
    try {
        showLaunchProgress();
        updateLaunchProgress(`${modpack.name} yükleniyor...`);
        
        showNotification(`${modpack.name} yükleniyor...`, 'info');
        console.log(`Installing creator modpack: ${modpack.name} (${modpack.modrinthId})`);
        
        // Use existing modpack installation system
        const result = await ipcRenderer.invoke('install-modpack', modpack.modrinthId, null, `${creatorName}-${modpack.name}`);
        
        if (result.success) {
            updateLaunchProgress(`${modpack.name} başarıyla yüklendi!`);
            showNotification(`${modpack.name} başarıyla yüklendi!`, 'success');
            
            setTimeout(() => {
                hideLaunchProgress();
                loadLibrary(); // Refresh library to show newly installed modpack
            }, 3000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Creator modpack installation error:', error);
        updateLaunchProgress(`Hata: ${error.message}`);
        showNotification(`${modpack.name} yüklenemedi: ${error.message}`, 'error');
        
        setTimeout(() => {
            hideLaunchProgress();
        }, 5000);
    }
};

// Show all modpacks for a creator
window.showCreatorModpacks = (creatorName) => {
    const creator = creatorModpacks[creatorName];
    if (!creator) {
        showNotification('İçerik üreticisi bulunamadı!', 'error');
        return;
    }
    
    const creatorDisplayName = creatorName.charAt(0).toUpperCase() + creatorName.slice(1);
    
    const modalHTML = `
        <div class="modal-overlay" id="creatorModpacksModal">
            <div class="modal creator-modpacks-modal">
                <div class="modal-header">
                    <h2><img src="https://mc-heads.net/avatar/${creatorDisplayName}/32" alt="${creatorDisplayName}" style="width: 32px; height: 32px; border-radius: 6px; margin-right: 10px; vertical-align: middle;">${creatorDisplayName} - Tüm Modpackler</h2>
                    <button class="close-modal" onclick="closeCreatorModpacksModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="creator-modpacks-grid">
                        ${creator.map(modpack => `
                            <div class="creator-modpack-card" onclick="installCreatorModpack('${creatorName}', '${modpack.id}')">
                                <div class="modpack-image">
                                    <div class="modpack-icon ${getModpackIconClass(modpack.id)}">
                                        <i class="fas ${getModpackIcon(modpack.id)}"></i>
                                    </div>
                                </div>
                                <div class="modpack-info">
                                    <h4>${modpack.name}</h4>
                                    <p>${modpack.description}</p>
                                </div>
                                <div class="modpack-actions">
                                    <button class="btn-primary">
                                        <i class="fas fa-download"></i>
                                        Yükle
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('creatorModpacksModal');
    if (existingModal) existingModal.remove();
    
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv.firstElementChild);
    
    // Show modal with animation
    setTimeout(() => {
        document.getElementById('creatorModpacksModal').classList.add('active');
    }, 10);
};

// Close creator modpacks modal
window.closeCreatorModpacksModal = () => {
    const modal = document.getElementById('creatorModpacksModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
};

// Open creator profile (placeholder for future implementation)
window.openCreatorProfile = (creatorName) => {
    const creatorDisplayName = creatorName.charAt(0).toUpperCase() + creatorName.slice(1);
    showNotification(`${creatorDisplayName} profilini açma özelliği yakında gelecek!`, 'info');
    console.log(`Opening profile for creator: ${creatorName}`);
};

// Copy server IP to clipboard
window.copyServerIP = async (serverIP) => {
    try {
        await navigator.clipboard.writeText(serverIP);
        showNotification(`${serverIP} panoya kopyalandı!`, 'success');
        console.log(`Server IP copied: ${serverIP}`);
    } catch (error) {
        console.error('Failed to copy server IP:', error);
        showNotification('IP kopyalanamadı!', 'error');
    }
};

// Update sidebar profile info
function updateSidebarProfile() {
    if (!currentProfile) return;
    
    const sidebarProfileName = document.getElementById('sidebarProfileName');
    const sidebarProfileVersion = document.getElementById('sidebarProfileVersion');
    const sidebarProfileHead = document.getElementById('sidebarProfileHead');
    const sidebarProfileIcon = document.getElementById('sidebarProfileIcon');
    
    if (sidebarProfileName) {
        sidebarProfileName.textContent = currentProfile.name || 'Profil';
    }
    
    // Version section removed - only showing profile name now
    
    // Update Minecraft head
    if (sidebarProfileHead && sidebarProfileIcon) {
        const playerName = currentProfile.playerName || currentProfile.name || 'Steve';
        const headUrl = `https://mc-heads.net/avatar/${playerName}/64`;
        console.log(`🖼️ [PROFILE-HEAD] Loading head for: ${playerName} - URL: ${headUrl}`);
        
        sidebarProfileHead.src = headUrl;
        sidebarProfileHead.onerror = () => {
            console.log(`❌ [PROFILE-HEAD] Failed to load head for: ${playerName}`);
            sidebarProfileHead.style.display = 'none';
            sidebarProfileIcon.style.display = 'flex';
        };
        sidebarProfileHead.onload = () => {
            console.log(`✅ [PROFILE-HEAD] Successfully loaded head for: ${playerName}`);
            sidebarProfileHead.style.display = 'block';
            sidebarProfileIcon.style.display = 'none';
        };
    }
}

// Add scroll event listeners for custom scrollbar behavior
document.addEventListener('DOMContentLoaded', () => {
    // Add scroll behavior to all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        let scrollTimeout;
        
        page.addEventListener('scroll', () => {
            // Add scrolling class when actively scrolling
            page.classList.add('scrolling');
            
            // Remove scrolling class after scroll stops
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                page.classList.remove('scrolling');
            }, 150);
        });
    });
    
    console.log('📜 [SCROLL] Custom scrollbar behavior initialized');
    
    // Existing library loading code
    // Override switchPage to load library data when needed
    const originalSwitchPage = window.switchPage;
    window.switchPage = (pageId) => {
        originalSwitchPage(pageId);
        
        if (pageId === 'library') {
            loadLibrary();
        } else if (pageId === 'modpacks') {
            // Initialize modpacks page with popular category
            setTimeout(() => {
                handleCategorySwitch('popular');
            }, 100);
        }
    };
});

// Recent Modpacks Functions
function addToRecentModpacks(modpack) {
    console.log('📦 [RECENT] Adding to recent modpacks:', modpack.name);
    
    // Remove if already exists
    recentModpacks = recentModpacks.filter(item => item.id !== modpack.id);
    
    // Add to beginning
    recentModpacks.unshift({
        id: modpack.id,
        name: modpack.name,
        iconUrl: modpack.iconUrl || modpack.icon_url,
        instanceId: modpack.instanceId,
        lastPlayed: new Date().toISOString()
    });
    
    // Keep only last 3
    recentModpacks = recentModpacks.slice(0, 3);
    
    // Save to localStorage
    localStorage.setItem('recentModpacks', JSON.stringify(recentModpacks));
    
    // Update UI
    updateRecentModpacksUI();
}

function updateRecentModpacksUI() {
    const container = document.getElementById('recentModpacksList');
    if (!container) return;
    
    console.log('🎨 [RECENT] Updating recent modpacks UI, count:', recentModpacks.length);
    
    container.innerHTML = '';
    
    if (recentModpacks.length === 0) {
        container.innerHTML = '<div style="color: #666; font-size: 12px; text-align: center; padding: 8px;">Henüz oynanan modpack yok</div>';
        return;
    }
    
    recentModpacks.forEach(modpack => {
        const item = document.createElement('div');
        item.className = 'recent-modpack-item';
        item.onclick = () => launchRecentModpack(modpack);
        
        item.innerHTML = `
            <div class="recent-modpack-icon">
                ${modpack.iconUrl ? 
                    `<img src="${modpack.iconUrl}" alt="${modpack.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                     <i class="fas fa-box" style="display: none;"></i>` :
                    `<i class="fas fa-box"></i>`
                }
            </div>
            <div class="recent-modpack-name">${modpack.name}</div>
        `;
        
        container.appendChild(item);
    });
}

function launchRecentModpack(modpack) {
    console.log('🚀 [RECENT] Launching recent modpack:', modpack.name);
    
    // Find the modpack in library
    const libraryModpack = (libraryData || []).find(item => item.id === modpack.id);
    if (libraryModpack) {
        playModpack(libraryModpack.id);
    } else {
        showNotification('Modpack bulunamadı', 'error');
    }
}

// Override launchModpack to track recent modpacks
const originalLaunchModpack = window.launchModpack;
window.launchModpack = function(instanceId) {
    // Find the modpack being launched
    const modpack = (libraryData || []).find(item => item.instanceId === instanceId);
    if (modpack) {
        addToRecentModpacks(modpack);
    }
    
    // Call original function
    if (originalLaunchModpack) {
        return originalLaunchModpack(instanceId);
    }
};

// Modpack Search and Browse Functions
let currentSearchResults = [];
let currentSearchOffset = 0;
let currentSearchQuery = '';
let currentFilters = {};
let isLoadingModpacks = false;

async function searchModpacks(query = '', filters = {}, offset = 0) {
    console.log('🔍 [SEARCH] Searching modpacks via IPC:', query, filters, offset);
    
    if (isLoadingModpacks) return;
    isLoadingModpacks = true;
    
    const loadingElement = document.getElementById('modpacksLoading');
    const resultsInfo = document.getElementById('modpacksResultsInfo');
    const grid = document.getElementById('modpacksGrid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (offset === 0) {
        grid.innerHTML = '';
        currentSearchResults = [];
    }
    
    loadingElement.style.display = 'flex';
    
    try {
        // Use IPC to search modpacks through main process
        const searchParams = {
            query: query || '',
            gameVersion: filters.version || null,
            limit: 50, // Increased limit for more results
            filters: {
                category: filters.category || null,
                loader: filters.loader || null,
                sort: filters.sort || 'relevance'
            }
        };
        
        const result = await ipcRenderer.invoke('search-modpacks', searchParams);
        
        console.log('📦 [SEARCH] IPC response:', result);
        
        if (result.success && result.modpacks) {
            const modpacks = result.modpacks;
            currentSearchResults.push(...modpacks);
            displaySearchModpacks(modpacks, offset === 0);
            
            // Update results info
            if (offset === 0) {
                resultsInfo.innerHTML = `${modpacks.length} modpack bulundu`;
                resultsInfo.style.display = 'block';
            }
            
            // For now, hide load more (can be added later)
            loadMoreBtn.style.display = 'none';
        } else {
            if (offset === 0) {
                grid.innerHTML = '<div class="error-message">Modpack bulunamadı</div>';
            }
        }
        
    } catch (error) {
        console.error('❌ [SEARCH] Error searching modpacks:', error);
        if (offset === 0) {
            grid.innerHTML = '<div class="error-message">Modpack arama sırasında hata oluştu</div>';
        }
    } finally {
        isLoadingModpacks = false;
        loadingElement.style.display = 'none';
    }
}

function displayModpacks(modpacks, clearGrid = true) {
    const grid = document.getElementById('modpacksGrid');
    
    if (clearGrid) {
        grid.innerHTML = '';
    }
    
    modpacks.forEach(modpack => {
        const card = createModpackCard(modpack);
        grid.appendChild(card);
    });
}

function displaySearchModpacks(modpacks, clearGrid = true) {
    const grid = document.getElementById('modpacksGrid');
    
    if (clearGrid) {
        grid.innerHTML = '';
    }
    
    modpacks.forEach(modpack => {
        // Convert search result to existing format
        modpack.iconUrl = modpack.icon_url || modpack.iconUrl;
        modpack.name = modpack.title || modpack.name; // Map title to name
        const card = createModpackCard(modpack);
        grid.appendChild(card);
    });
}



function setupModpackSearch() {
    const searchInput = document.getElementById('modpackSearchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const versionFilter = document.getElementById('versionFilter');
    const loaderFilter = document.getElementById('loaderFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    let searchTimeout;
    
    // Search input handler
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch();
            }, 500);
        });
    }
    
    // Filter change handlers
    [categoryFilter, versionFilter, loaderFilter, sortFilter].forEach(filter => {
        if (filter) {
            filter.addEventListener('change', performSearch);
        }
    });
    
    // Setup category buttons
    setupCategoryButtons();
}

function setupCategoryButtons() {
    const categoryButtons = document.querySelectorAll('.category-btn');
    
    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active from all buttons
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            // Add active to clicked button
            button.classList.add('active');
            
            const category = button.dataset.category;
            handleCategorySwitch(category);
        });
    });
}

function handleCategorySwitch(category) {
    const searchSection = document.querySelector('.modpacks-search-section');
    const resultsInfo = document.getElementById('modpacksResultsInfo');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    // Hide search elements by default
    if (searchSection) searchSection.style.display = 'none';
    if (resultsInfo) resultsInfo.style.display = 'none';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    
    switch (category) {
        case 'popular':
            loadModpacks(); // Use existing system
            break;
        case 'featured':
            loadFeaturedModpacks(); // Use existing system
            break;
        case 'search':
            if (searchSection) searchSection.style.display = 'block';
            // Perform empty search to show all modpacks initially
            setTimeout(() => performSearch(), 100);
            break;
    }
}

async function loadFeaturedModpacks() {
    // Use existing system for featured modpacks
    loadModpacks(); // For now, same as popular
}

function performSearch() {
    const searchInput = document.getElementById('modpackSearchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const versionFilter = document.getElementById('versionFilter');
    const loaderFilter = document.getElementById('loaderFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    const query = searchInput ? searchInput.value.trim() : '';
    const filters = {
        category: categoryFilter ? categoryFilter.value : '',
        version: versionFilter ? versionFilter.value : '',
        loader: loaderFilter ? loaderFilter.value : '',
        sort: sortFilter ? sortFilter.value : 'relevance'
    };
    
    console.log('🔍 [SEARCH] Perform search with:', { query, filters });
    
    currentSearchQuery = query;
    currentFilters = filters;
    currentSearchOffset = 0;
    
    searchModpacks(query, filters, 0);
}

function clearModpackSearch() {
    const searchInput = document.getElementById('modpackSearchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const versionFilter = document.getElementById('versionFilter');
    const loaderFilter = document.getElementById('loaderFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = '';
    if (versionFilter) versionFilter.value = '';
    if (loaderFilter) loaderFilter.value = '';
    if (sortFilter) sortFilter.value = 'relevance';
    
    performSearch();
}

function loadMoreModpacks() {
    currentSearchOffset += 20;
    searchModpacks(currentSearchQuery, currentFilters, currentSearchOffset);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Install local modpack from modpacks/ directory
async function installLocalModpack(localPath, modpackName) {
    try {
        showLoading(true, `${modpackName} yükleniyor...`);
        
        // Call import-modpack with local path
        const result = await ipcRenderer.invoke('import-modpack', localPath);
        
        if (result.success) {
            showNotification(`${modpackName} başarıyla kuruldu!`, 'success');
            // Refresh library
            loadLibrary();
        } else {
            showNotification(`Kurulum hatası: ${result.error || 'Bilinmeyen hata'}`, 'error');
        }
    } catch (error) {
        console.error('Local modpack install error:', error);
        showNotification(`Kurulum hatası: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Install modpack from Modrinth (regular card)
async function installModpackFromCard(modpackId, modpackName) {
    try {
        showLoading(true, `${modpackName} yükleniyor...`);
        
        // Fetch latest version
        const versions = await ipcRenderer.invoke('get-modpack-versions', modpackId);
        if (!versions.success || versions.versions.length === 0) {
            showNotification('Modpack versiyonu bulunamadı', 'error');
            return;
        }
        
        const latestVersion = versions.versions[0];
        const primaryFile = latestVersion.files.find(f => f.primary);
        const mrpackFile = primaryFile || latestVersion.files.find(f => f.url.endsWith('.mrpack'));
        
        if (!mrpackFile) {
            showNotification('Modpack dosyası bulunamadı', 'error');
            return;
        }
        
        // Download and import
        const result = await ipcRenderer.invoke('import-modpack-url', mrpackFile.url);
        
        if (result.success) {
            showNotification(`${modpackName} başarıyla kuruldu!`, 'success');
            loadLibrary();
        } else {
            showNotification(`Kurulum hatası: ${result.error || 'Bilinmeyen hata'}`, 'error');
        }
    } catch (error) {
        console.error('Modpack install error:', error);
        showNotification(`Kurulum hatası: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Import featured creator modpack (from backend API)
window.importFeaturedMrpack = async function(slug) {
    const itemId = `featured_${slug}_${Date.now()}`;
    
    try {
        console.log('[FEATURED-IMPORT] Starting import for slug:', slug);
        
        // Fetch modpack info from backend
        const fetchUrl = `https://api.blocksmithslauncher.com/api/modpacks/${slug}`;
        console.log('[FEATURED-IMPORT] Fetching from:', fetchUrl);
        
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            console.error('[FEATURED-IMPORT] Fetch failed:', response.status);
            throw new Error('Modpack bilgisi alınamadı');
        }
        
        const data = await response.json();
        console.log('[FEATURED-IMPORT] Modpack data:', data);
        
        if (!data.success || !data.modpack.mrpackUrl) {
            console.error('[FEATURED-IMPORT] No mrpackUrl found');
            throw new Error('Modpack dosyası bulunamadı');
        }
        
        // Add to download queue
        addDownloadItem(itemId, data.modpack.name, 'modpack');
        updateDownloadProgress(itemId, 10, 'Hazırlanıyor...');
        
        // Full URL for mrpack download (backend already provides full URL)
        const mrpackUrl = data.modpack.mrpackUrl;
        console.log('[FEATURED-IMPORT] Download URL:', mrpackUrl);
        
        updateDownloadProgress(itemId, 20, 'İndiriliyor...');
        
        // Download and import with metadata
        const modpackInfo = {
            name: data.modpack.name,
            description: data.modpack.description,
            iconUrl: data.modpack.iconUrl || null,
            version: data.modpack.minecraftVersion,
            modloader: data.modpack.modloader
        };
        
        const result = await ipcRenderer.invoke('import-modpack-url', mrpackUrl, modpackInfo);
        console.log('[FEATURED-IMPORT] Import result:', result);
        
        if (result.success) {
            updateDownloadProgress(itemId, 95, 'Tamamlanıyor...');
            await loadLibrary();
            completeDownload(itemId, data.modpack.name);
            showNotification(`${data.modpack.name} başarıyla kuruldu!`, 'success');
            
            // Track download
            if (data.modpack.id) {
                await fetch(`https://api.blocksmithslauncher.com/api/modpacks/${data.modpack.id}/download`, {
                    method: 'POST'
                });
            }
        } else {
            console.error('[FEATURED-IMPORT] Import failed:', result.error);
            errorDownload(itemId, data.modpack.name, result.error || 'Bilinmeyen hata');
            showNotification(`Kurulum hatası: ${result.error || 'Bilinmeyen hata'}`, 'error');
        }
    } catch (error) {
        console.error('[FEATURED-IMPORT] Error:', error);
        errorDownload(itemId, slug, error.message);
        showNotification(`Kurulum hatası: ${error.message}`, 'error');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
}
