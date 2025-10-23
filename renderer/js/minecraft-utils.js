// Minecraft Utilities
window.minecraftUtils = {
    // Minecraft oyuncu adı doğrulaması
    validatePlayerName: function(playerName) {
        if (!playerName || typeof playerName !== 'string') {
            return false;
        }
        
        // 3-16 karakter, sadece harf, rakam ve alt çizgi
        const regex = /^[a-zA-Z0-9_]{3,16}$/;
        return regex.test(playerName);
    },

    // Minecraft skin kafası oluştur
    createProfileAvatar: function(playerName, size = 64) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'profile-avatar';
        avatarDiv.style.width = size + 'px';
        avatarDiv.style.height = size + 'px';
        
        // Minecraft skin URL'si (Minotar servisi kullan)
        const skinUrl = `https://minotar.net/helm/${encodeURIComponent(playerName)}/${size}.png`;
        
        const img = document.createElement('img');
        img.src = skinUrl;
        img.alt = playerName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '12px';
        img.style.objectFit = 'cover';
        
        // Fallback icon eğer resim yüklenmezse
        img.onerror = function() {
            avatarDiv.innerHTML = '<i class="fas fa-user" style="font-size: ' + (size * 0.4) + 'px; color: #FC942D;"></i>';
        };
        
        avatarDiv.appendChild(img);
        return avatarDiv;
    },

    // UUID oluştur (offline mod için)
    generateOfflineUUID: function(username) {
        // Basit UUID oluşturma (offline mod için)
        const hash = this.simpleHash(username.toLowerCase());
        const uuid = [
            hash.substr(0, 8),
            hash.substr(8, 4),
            '3' + hash.substr(12, 3), // Version 3 UUID
            ((parseInt(hash.substr(16, 1), 16) & 0x3) | 0x8).toString(16) + hash.substr(17, 3),
            hash.substr(20, 12)
        ].join('-');
        return uuid;
    },

    // Basit hash fonksiyonu
    simpleHash: function(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString(16).padStart(32, '0');
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer'a çevir
        }
        
        return Math.abs(hash).toString(16).padStart(32, '0');
    },

    // Minecraft versiyonlarını formatla
    formatVersion: function(version) {
        if (typeof version === 'string') {
            return `Minecraft ${version}`;
        }
        return version.id ? `Minecraft ${version.id}` : 'Bilinmeyen Versiyon';
    },

    // Oyun durumunu kontrol et
    getGameStatus: function() {
        // Bu fonksiyon daha sonra genişletilebilir
        return {
            isRunning: false,
            version: null,
            profile: null
        };
    }
};