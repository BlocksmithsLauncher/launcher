const RPC = require('discord-rpc');

const CLIENT_ID = '1423946222783434913'; // Buraya Discord Application ID gelecek

class DiscordRPCManager {
    constructor() {
        this.client = null;
        this.connected = false;
        this.currentActivity = null;
        this.startTimestamp = Date.now();
    }

    async connect() {
        if (this.connected) return;

        try {
            this.client = new RPC.Client({ transport: 'ipc' });

            this.client.on('ready', () => {
                console.log('[DISCORD RPC] Connected to Discord');
                this.connected = true;
                this.updateActivity('home');
            });

            await this.client.login({ clientId: CLIENT_ID });
        } catch (error) {
            console.error('[DISCORD RPC] Failed to connect:', error.message);
            this.connected = false;
        }
    }

    disconnect() {
        if (this.client && this.connected) {
            this.client.destroy();
            this.connected = false;
            console.log('[DISCORD RPC] Disconnected');
        }
    }

    /**
     * Update Discord presence
     * @param {string} type - 'home', 'library', 'servers', 'modpacks', 'playing', 'settings'
     * @param {object} data - Additional data (modpack name, server ip, etc.)
     */
    updateActivity(type, data = {}) {
        if (!this.connected || !this.client) return;

        let activity = {
            largeImageKey: 'blocksmiths_logo',
            largeImageText: 'Blocksmiths Launcher',
            instance: false,
        };

        switch (type) {
            case 'home':
                activity.details = 'Ana Sayfada';
                activity.state = 'Launcher\'ı Keşfediyor';
                activity.smallImageKey = 'home_icon';
                activity.smallImageText = 'Ana Sayfa';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'library':
                activity.details = 'Kütüphanede';
                activity.state = 'Mod Paketlerine Göz Atıyor';
                activity.smallImageKey = 'library_icon';
                activity.smallImageText = 'Kütüphane';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'servers':
                activity.details = 'Sunucuları İnceliyor';
                activity.state = `${data.serverCount || 'Birçok'} Sunucu Listelenmiş`;
                activity.smallImageKey = 'server_icon';
                activity.smallImageText = 'Sunucular';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'modpacks':
                activity.details = 'Mod Paketlerine Bakıyor';
                activity.state = `${data.modpackCount || 'Birçok'} Paket Mevcut`;
                activity.smallImageKey = 'modpack_icon';
                activity.smallImageText = 'Mod Paketleri';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'playing':
                if (!data.modpackName) {
                    activity.details = 'Minecraft Oynuyor';
                    activity.state = data.version || 'Bilinmeyen Versiyon';
                } else {
                    activity.details = `${data.modpackName} Oynuyor`;
                    activity.state = `${data.version || 'Minecraft'}`;
                    activity.largeImageKey = data.iconUrl ? 'modpack_custom' : 'minecraft_icon';
                    activity.largeImageText = data.modpackName;
                }
                activity.smallImageKey = 'playing_icon';
                activity.smallImageText = 'Oyunda';
                activity.startTimestamp = data.startTimestamp || Date.now();
                
                // Buttons (optional)
                if (data.serverIp) {
                    activity.buttons = [
                        { label: 'Sunucuya Katıl', url: `https://blocksmithslauncher.com/servers` }
                    ];
                }
                break;

            case 'settings':
                activity.details = 'Ayarlarda';
                activity.state = 'Launcher Ayarlarını Düzenliyor';
                activity.smallImageKey = 'settings_icon';
                activity.smallImageText = 'Ayarlar';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'profile':
                activity.details = 'Profil Seçiyor';
                activity.state = data.profileName || 'Profil Yönetimi';
                activity.smallImageKey = 'profile_icon';
                activity.smallImageText = 'Profil';
                activity.startTimestamp = this.startTimestamp;
                break;

            case 'downloading':
                activity.details = 'İndiriyor';
                activity.state = data.itemName || 'Dosya İndiriliyor';
                activity.smallImageKey = 'download_icon';
                activity.smallImageText = `${data.progress || 0}%`;
                activity.startTimestamp = this.startTimestamp;
                break;

            default:
                activity.details = 'Blocksmiths Launcher';
                activity.state = 'Launcher Kullanıyor';
                activity.startTimestamp = this.startTimestamp;
        }

        // Store current activity
        this.currentActivity = { type, data };

        // Update Discord
        this.client.setActivity(activity).catch(error => {
            console.error('[DISCORD RPC] Failed to update activity:', error.message);
        });
    }

    /**
     * Update playing status with detailed info
     */
    setPlayingStatus(modpackData) {
        this.updateActivity('playing', {
            modpackName: modpackData.name,
            version: modpackData.minecraftVersion,
            iconUrl: modpackData.iconUrl,
            startTimestamp: modpackData.startTime || Date.now(),
            serverIp: modpackData.serverIp
        });
    }

    /**
     * Update download progress
     */
    setDownloadProgress(itemName, progress) {
        this.updateActivity('downloading', {
            itemName,
            progress: Math.round(progress)
        });
    }

    /**
     * Clear activity (show nothing)
     */
    clearActivity() {
        if (this.connected && this.client) {
            this.client.clearActivity().catch(error => {
                console.error('[DISCORD RPC] Failed to clear activity:', error.message);
            });
        }
    }

    /**
     * Get current activity
     */
    getCurrentActivity() {
        return this.currentActivity;
    }
}

// Singleton instance
const discordRPC = new DiscordRPCManager();

module.exports = discordRPC;

