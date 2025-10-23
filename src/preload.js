const { contextBridge, ipcRenderer } = require('electron');

// Renderer process için güvenli API'ler
contextBridge.exposeInMainWorld('electronAPI', {
    // Pencere kontrolü
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    
    // Profil yönetimi
    createProfile: (profileData) => ipcRenderer.invoke('create-profile', profileData),
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    selectProfile: (profileId) => ipcRenderer.invoke('select-profile', profileId),
    deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', profileId),
    updateProfile: (profileId, profileData) => ipcRenderer.invoke('update-profile', profileId, profileData),
    
    // Ayarlar
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // Minecraft Launcher
    launchGame: (options) => ipcRenderer.invoke('launch-game', options),
    stopGame: () => ipcRenderer.invoke('stop-game'),
    forceKillGame: () => ipcRenderer.invoke('force-kill-game'),
    getGameState: () => ipcRenderer.invoke('get-game-state'),
    getAvailableVersions: () => ipcRenderer.invoke('get-available-versions'),
    getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions'),
    installVersion: (version) => ipcRenderer.invoke('install-version', version),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    authenticateMicrosoft: () => ipcRenderer.invoke('authenticate-microsoft'),
    
    // Mod Management
    searchMods: (query, gameVersion, modLoader, limit) => ipcRenderer.invoke('search-mods', query, gameVersion, modLoader, limit),
    downloadMod: (modId, version, gameVersion, modLoader) => ipcRenderer.invoke('download-mod', modId, version, gameVersion, modLoader),
    getInstalledMods: () => ipcRenderer.invoke('get-installed-mods'),
    deleteMod: (modPath) => ipcRenderer.invoke('delete-mod', modPath),
    installModpack: (modpackUrl, name) => ipcRenderer.invoke('install-modpack', modpackUrl, name),
    getPopularModpacks: (gameVersion, limit) => ipcRenderer.invoke('get-popular-modpacks', gameVersion, limit),
    installModLoader: (version, gameVersion, loaderType) => ipcRenderer.invoke('install-mod-loader', version, gameVersion, loaderType),
    
    // Dosya sistemi
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    
    // Event listeners
    onLaunchProgress: (callback) => {
        ipcRenderer.on('launch-progress', (event, progress) => callback(progress));
    },
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },
    onUpdateDownloadProgress: (callback) => {
        ipcRenderer.on('update-download-progress', (event, progress) => callback(progress));
    },
    onGameClosed: (callback) => {
        ipcRenderer.on('game-closed', (event, code) => callback(code));
    },
    onLaunchError: (callback) => {
        ipcRenderer.on('launch-error', (event, error) => callback(error));
    },
    onGameStateChanged: (callback) => {
        ipcRenderer.on('game-state-changed', (event, state) => callback(state));
    },

    // Send events
    send: (channel, data) => {
        const validChannels = ['banner-click'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    
    // Event listener cleanup
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

console.log('Preload script loaded successfully');
