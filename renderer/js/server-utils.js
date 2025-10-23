// Server Utilities
class ServerUtils {
    constructor() {
        this.servers = [
            {
                name: 'BlockSmiths Network',
                ip: 'mc.blocksmiths.net',
                port: 25565,
                status: 'online',
                players: 127,
                maxPlayers: 500,
                version: '1.20.4',
                featured: true
            },
            {
                name: 'Hypixel',
                ip: 'mc.hypixel.net',
                port: 25565,
                status: 'online',
                players: 45231,
                maxPlayers: 100000,
                version: '1.8-1.20',
                featured: false
            },
            {
                name: 'MinePlex',
                ip: 'us.mineplex.com',
                port: 25565,
                status: 'online',
                players: 8452,
                maxPlayers: 20000,
                version: '1.8-1.19',
                featured: false
            }
        ];
    }

    // Sunucuya bağlan
    async joinServer(serverIp) {
        try {
            // Önce profil kontrolü
            const currentProfile = JSON.parse(localStorage.getItem('currentProfile') || 'null');
            if (!currentProfile) {
                window.launcherUtils.showNotification('Önce bir profil seçmelisiniz!', 'warning');
                return;
            }

            window.launcherUtils.showLaunchProgress('Sunucuya bağlanılıyor...', 0);

            // Minecraft'ı sunucu ile başlat
            const launchOptions = {
                version: '1.20.4', // En uyumlu versiyon
                username: currentProfile.playerName || currentProfile.name,
                authType: 'offline',
                maxMemory: '4G',
                minMemory: '1G',
                windowWidth: 1280,
                windowHeight: 720,
                fullscreen: false,
                server: {
                    ip: serverIp,
                    port: 25565
                }
            };

            const result = await window.electronAPI.launchGame(launchOptions);
            
            if (result.success) {
                window.launcherUtils.showNotification(`${serverIp} sunucusuna bağlanılıyor!`, 'success');
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Server join failed:', error);
            window.launcherUtils.showNotification(`Sunucuya bağlanılamadı: ${error.message}`, 'error');
            window.launcherUtils.hideLaunchProgress();
        }
    }

    // Sunucu durumunu kontrol et
    async checkServerStatus(serverIp, port = 25565) {
        try {
            // Bu gerçek bir ping implementasyonu değil, demo amaçlı
            // Gerçek implementasyon için minecraft-server-util gibi kütüphane kullanılabilir
            
            const response = await fetch(`https://api.mcsrvstat.us/2/${serverIp}:${port}`);
            const data = await response.json();
            
            if (data.online) {
                return {
                    online: true,
                    players: data.players.online,
                    maxPlayers: data.players.max,
                    version: data.version,
                    motd: data.motd?.clean?.join(' ') || ''
                };
            } else {
                return {
                    online: false,
                    players: 0,
                    maxPlayers: 0,
                    version: 'Unknown',
                    motd: ''
                };
            }
        } catch (error) {
            console.error('Server status check failed:', error);
            return {
                online: false,
                players: 0,
                maxPlayers: 0,
                version: 'Unknown',
                motd: 'Status check failed'
            };
        }
    }

    // Sunucu listesini güncelle
    async updateServerList() {
        const serverElements = document.querySelectorAll('.server-item');
        
        for (let i = 0; i < serverElements.length; i++) {
            const serverElement = serverElements[i];
            const server = this.servers[i];
            
            if (server) {
                try {
                    const status = await this.checkServerStatus(server.ip, server.port);
                    
                    const statusElement = serverElement.querySelector('.server-status');
                    const statusSpan = statusElement.querySelector('span');
                    
                    if (status.online) {
                        statusElement.className = 'server-status online';
                        statusSpan.textContent = `Online - ${status.players.toLocaleString()} oyuncu`;
                    } else {
                        statusElement.className = 'server-status offline';
                        statusSpan.textContent = 'Offline';
                    }
                } catch (error) {
                    console.error(`Failed to update status for ${server.name}:`, error);
                }
            }
        }
    }

    // Sunucu ekle (gelecekte kullanılabilir)
    addCustomServer(name, ip, port = 25565) {
        const newServer = {
            name: name,
            ip: ip,
            port: port,
            status: 'unknown',
            players: 0,
            maxPlayers: 0,
            version: 'Unknown',
            featured: false,
            custom: true
        };
        
        this.servers.push(newServer);
        this.saveCustomServers();
    }

    // Özel sunucuları kaydet
    saveCustomServers() {
        const customServers = this.servers.filter(server => server.custom);
        localStorage.setItem('customServers', JSON.stringify(customServers));
    }

    // Özel sunucuları yükle
    loadCustomServers() {
        try {
            const customServers = JSON.parse(localStorage.getItem('customServers') || '[]');
            this.servers = [...this.servers.filter(server => !server.custom), ...customServers];
        } catch (error) {
            console.error('Failed to load custom servers:', error);
        }
    }

    // Sunucu favorileri
    toggleServerFavorite(serverIp) {
        const favorites = JSON.parse(localStorage.getItem('favoriteServers') || '[]');
        const index = favorites.indexOf(serverIp);
        
        if (index === -1) {
            favorites.push(serverIp);
        } else {
            favorites.splice(index, 1);
        }
        
        localStorage.setItem('favoriteServers', JSON.stringify(favorites));
        return index === -1; // true if added, false if removed
    }

    // Sunucu geçmişi
    addToServerHistory(serverIp) {
        const history = JSON.parse(localStorage.getItem('serverHistory') || '[]');
        
        // Varsa çıkar ve başa ekle
        const index = history.indexOf(serverIp);
        if (index !== -1) {
            history.splice(index, 1);
        }
        
        history.unshift(serverIp);
        
        // Maksimum 10 sunucu tut
        if (history.length > 10) {
            history.splice(10);
        }
        
        localStorage.setItem('serverHistory', JSON.stringify(history));
    }

    // Server ping
    async pingServer(serverIp, port = 25565) {
        const startTime = Date.now();
        
        try {
            const status = await this.checkServerStatus(serverIp, port);
            const endTime = Date.now();
            const ping = endTime - startTime;
            
            return {
                ping: ping,
                online: status.online
            };
        } catch (error) {
            return {
                ping: -1,
                online: false
            };
        }
    }
}

// Global server utils instance
window.serverUtils = new ServerUtils();

// Sayfa yüklendiğinde sunucu durumlarını güncelle
document.addEventListener('DOMContentLoaded', () => {
    // Özel sunucuları yükle
    window.serverUtils.loadCustomServers();
    
    // 5 saniye sonra sunucu durumlarını güncelle
    setTimeout(() => {
        window.serverUtils.updateServerList();
    }, 5000);
    
    // Her 30 saniyede bir güncelle
    setInterval(() => {
        window.serverUtils.updateServerList();
    }, 30000);
});

// Global join server function
function joinServer(serverIp) {
    window.serverUtils.joinServer(serverIp);
}
