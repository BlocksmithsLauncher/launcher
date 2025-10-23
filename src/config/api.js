// Launcher API Configuration
const API_BASE_URL = process.env.API_URL || 'https://api.blocksmithslauncher.com';

const API_ENDPOINTS = {
    // Launcher
    CHECK_UPDATE: `${API_BASE_URL}/api/launcher/check-update`,
    DOWNLOAD_UPDATE: `${API_BASE_URL}/api/launcher/download`,
    MODPACKS: `${API_BASE_URL}/api/launcher/modpacks`,
    
    // Servers
    SERVERS: `${API_BASE_URL}/api/servers`,
    
    // Banners
    BANNERS: `${API_BASE_URL}/api/banners`,
    
    // Stats
    STATS: `${API_BASE_URL}/api/auth/stats`,
};

module.exports = {
    API_BASE_URL,
    API_ENDPOINTS
};

