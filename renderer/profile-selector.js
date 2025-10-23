const { ipcRenderer } = require('electron');

// DOM Elements
const profilesGrid = document.getElementById('profilesGrid');
const createProfileModal = document.getElementById('createProfileModal');
const createProfileForm = document.getElementById('createProfileForm');
const loadingOverlay = document.getElementById('loadingOverlay');

// Global Variables
let profiles = [];
let selectedAvatar = 'steve';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadProfiles();
    setupEventListeners();
});

// Load profiles from main process
async function loadProfiles() {
    try {
        showLoading(true);
        const profilesData = await ipcRenderer.invoke('get-profiles');
        profiles = profilesData.profiles || [];
        renderProfiles();
    } catch (error) {
        console.error('Profiller yüklenirken hata:', error);
        showNotification('Profiller yüklenirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Render profiles in grid
function renderProfiles() {
    profilesGrid.innerHTML = '';
    
    profiles.forEach(profile => {
        const profileCard = createProfileCard(profile);
        profilesGrid.appendChild(profileCard);
    });
}

// Create profile card element
function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.onclick = () => selectProfile(profile.id);
    
    const avatar = profile.avatar || 'steve';
    const avatarSrc = avatar.startsWith('data:') ? avatar : `../assets/images/avatars/${avatar}.png`;
    
    card.innerHTML = `
        <div class="profile-avatar">
            ${avatar === 'steve' || avatar === 'alex' || avatar.startsWith('data:') 
                ? `<img src="${avatarSrc}" alt="${profile.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <i class="fas fa-user" style="display: none;"></i>`
                : '<i class="fas fa-user"></i>'
            }
        </div>
        <div class="profile-name">${profile.name}</div>
        <div class="profile-info">
            ${profile.playerName}<br>
            <small>v${profile.gameVersion}</small>
        </div>
    `;
    
    return card;
}

// Setup event listeners
function setupEventListeners() {
    // Form submission
    createProfileForm.addEventListener('submit', handleCreateProfile);
    
    // Avatar selection
    document.querySelectorAll('.avatar-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedAvatar = option.dataset.avatar;
            
            if (selectedAvatar === 'custom') {
                selectCustomAvatar();
            }
        });
    });
    
    // Modal close on overlay click
    createProfileModal.addEventListener('click', (e) => {
        if (e.target === createProfileModal) {
            hideCreateProfileModal();
        }
    });
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideCreateProfileModal();
        }
    });
}

// Handle create profile form submission
async function handleCreateProfile(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const profileName = document.getElementById('profileName').value.trim();
    const playerName = document.getElementById('playerName').value.trim();
    const gameVersion = document.getElementById('gameVersion').value;
    
    // Validation
    if (!profileName || !playerName) {
        showNotification('Lütfen tüm alanları doldurun', 'error');
        return;
    }
    
    if (profiles.length >= 3) {
        showNotification('Maksimum 3 profil oluşturabilirsiniz', 'error');
        return;
    }
    
    // Check if profile name already exists
    if (profiles.some(p => p.name.toLowerCase() === profileName.toLowerCase())) {
        showNotification('Bu profil adı zaten kullanılıyor', 'error');
        return;
    }
    
    // Check if player name already exists
    if (profiles.some(p => p.playerName.toLowerCase() === playerName.toLowerCase())) {
        showNotification('Bu oyuncu adı zaten kullanılıyor', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        const newProfile = {
            id: generateProfileId(),
            name: profileName,
            playerName: playerName,
            gameVersion: gameVersion,
            avatar: selectedAvatar,
            createdAt: new Date().toISOString(),
            lastPlayed: null,
            settings: {
                memory: '2G',
                javaArgs: '',
                gameDirectory: null
            }
        };
        
        const result = await ipcRenderer.invoke('save-profile', newProfile);
        
        if (result.success) {
            profiles.push(newProfile);
            renderProfiles();
            hideCreateProfileModal();
            resetCreateProfileForm();
            showNotification('Profil başarıyla oluşturuldu', 'success');
        } else {
            showNotification(result.error || 'Profil oluşturulurken hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Profil oluşturulurken hata:', error);
        showNotification('Profil oluşturulurken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Select profile and continue to main app
async function selectProfile(profileId) {
    try {
        showLoading(true);
        
        const result = await ipcRenderer.invoke('select-profile', profileId);
        
        if (!result.success) {
            showNotification(result.error || 'Profil seçilirken hata oluştu', 'error');
            showLoading(false);
        }
        // If successful, main process will close this window and open main window
    } catch (error) {
        console.error('Profil seçilirken hata:', error);
        showNotification('Profil seçilirken hata oluştu', 'error');
        showLoading(false);
    }
}

// Show create profile modal
function showCreateProfileModal() {
    createProfileModal.classList.add('active');
    document.getElementById('profileName').focus();
}

// Hide create profile modal
function hideCreateProfileModal() {
    createProfileModal.classList.remove('active');
    resetCreateProfileForm();
}

// Reset create profile form
function resetCreateProfileForm() {
    createProfileForm.reset();
    document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('.avatar-option[data-avatar="steve"]').classList.add('selected');
    selectedAvatar = 'steve';
}

// Select custom avatar
function selectCustomAvatar() {
    // This would open a file dialog in a real implementation
    // For now, we'll just show a placeholder
    showNotification('Özel avatar özelliği yakında eklenecek', 'info');
}

// Generate unique profile ID
function generateProfileId() {
    return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Show/hide loading overlay
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

// Show notification
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
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// Get notification icon based on type
function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// Window controls
function minimizeWindow() {
    ipcRenderer.invoke('window-minimize');
}

function closeWindow() {
    ipcRenderer.invoke('window-close');
}

// Handle window controls
document.addEventListener('keydown', (e) => {
    // Alt + F4 to close
    if (e.altKey && e.key === 'F4') {
        closeWindow();
    }
});
