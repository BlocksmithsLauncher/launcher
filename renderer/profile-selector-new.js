const { ipcRenderer } = require('electron');

// DOM Elements
const profilesGrid = document.getElementById('profilesGrid');
const createProfileModal = document.getElementById('createProfileModal');
const createProfileForm = document.getElementById('createProfileForm');
const loadingOverlay = document.getElementById('loadingOverlay');

// Global Variables
let profiles = [];

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
    
    // Profilleri ekle
    profiles.forEach(profile => {
        const profileCard = createProfileCard(profile);
        profilesGrid.appendChild(profileCard);
    });
    
    // Maksimum 3 profil kontrolü - daha azsa "Yeni Profil" kartı ekle
    if (profiles.length < 3) {
        const addProfileCard = createAddProfileCard();
        profilesGrid.appendChild(addProfileCard);
    }
}

// Create "Add Profile" card element
function createAddProfileCard() {
    const card = document.createElement('div');
    card.className = 'add-profile-card';
    card.onclick = showCreateProfileModal;
    
    const content = document.createElement('div');
    content.className = 'add-profile-content';
    
    const icon = document.createElement('i');
    icon.className = 'fas fa-plus';
    
    const text = document.createElement('span');
    text.textContent = 'Yeni Profil';
    
    content.appendChild(icon);
    content.appendChild(text);
    card.appendChild(content);
    
    return card;
}

// Create profile card element
function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.onclick = () => selectProfile(profile.id);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'profile-delete-btn';
    deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
    deleteBtn.title = 'Profili Sil';
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); // Prevent card click
        deleteProfile(profile.id, profile.playerName);
    };
    
    // Minecraft skin kafası kullan
    const avatarElement = window.minecraftUtils.createProfileAvatar(profile.playerName || profile.name, 48);
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'profile-name';
    nameDiv.textContent = profile.playerName || profile.name; // Sadece oyuncu adı göster
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'profile-info';
    infoDiv.textContent = 'Offline Profil'; // Basit bilgi
    
    card.appendChild(deleteBtn);
    card.appendChild(avatarElement);
    card.appendChild(nameDiv);
    card.appendChild(infoDiv);
    
    return card;
}

// Select profile and navigate to main launcher
async function selectProfile(profileId) {
    try {
        showLoading(true, 'Profil seçiliyor...');
        
        const result = await ipcRenderer.invoke('select-profile', profileId);
        
        if (result.success) {
            // Ana launcher sayfasına geç (replace to avoid navigation issues)
            window.location.replace('index.html');
        } else {
            showNotification('Profil seçilemedi: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Profil seçilirken hata:', error);
        showNotification('Profil seçilirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Show create profile modal
function showCreateProfileModal() {
    createProfileModal.classList.add('active');
    // Focus'u biraz geciktir ki modal tamamen açılsın
    setTimeout(() => {
        const input = document.getElementById('playerName');
        if (input) {
            input.focus();
            input.select(); // Varsa eski metni seç
        }
    }, 100);
}

// Hide create profile modal
function hideCreateProfileModal() {
    createProfileModal.classList.remove('active');
    createProfileForm.reset();
}

// Setup event listeners
function setupEventListeners() {
    // Create profile form
    if (createProfileForm) {
        createProfileForm.addEventListener('submit', handleCreateProfile);
    }
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', hideCreateProfileModal);
    });
    
    // Modal overlay click to close
    if (createProfileModal) {
        createProfileModal.addEventListener('click', (e) => {
            if (e.target === createProfileModal) {
                hideCreateProfileModal();
            }
        });
    }
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && createProfileModal && createProfileModal.classList.contains('active')) {
            hideCreateProfileModal();
        }
    });
    
    // Input field event listeners
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) {
        // Real-time validation
        playerNameInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const isValid = window.minecraftUtils.validatePlayerName(value);
            
            if (value.length > 0) {
                if (isValid) {
                    e.target.style.borderColor = '#28a745';
                } else {
                    e.target.style.borderColor = '#dc3545';
                }
            } else {
                e.target.style.borderColor = 'rgba(252, 148, 45, 0.2)';
            }
        });
        
        // Clear validation on focus
        playerNameInput.addEventListener('focus', (e) => {
            e.target.style.borderColor = '#FC942D';
        });
    }
}

// Handle create profile form submission
async function handleCreateProfile(e) {
    e.preventDefault();
    
    const formData = new FormData(createProfileForm);
    const playerName = formData.get('playerName').trim();
    
    // Oyuncu adını doğrula
    if (!window.minecraftUtils.validatePlayerName(playerName)) {
        showNotification('Oyuncu adı 3-16 karakter olmalı ve sadece harf, rakam, alt çizgi içermeli', 'error');
        return;
    }
    
    // Aynı isimde profil var mı kontrol et
    if (profiles.some(p => p.playerName === playerName)) {
        showNotification('Bu oyuncu adı ile zaten bir profil mevcut', 'error');
        return;
    }
    
    // Maksimum 3 profil kontrolü
    if (profiles.length >= 3) {
        showNotification('Maksimum 3 profil oluşturabilirsiniz', 'error');
        return;
    }
    
    try {
        showLoading(true, 'Profil oluşturuluyor...');
        
        const profileData = {
            name: playerName, // Profil adı = oyuncu adı
            playerName: playerName,
            avatar: 'minecraft_head', // Özel işaret
            authType: 'offline'
        };
        
        const result = await ipcRenderer.invoke('create-profile', profileData);
        
        if (result.success) {
            hideCreateProfileModal();
            await loadProfiles(); // Profilleri yeniden yükle
            showNotification(`${playerName} profili başarıyla oluşturuldu!`, 'success');
        } else {
            showNotification('Profil oluşturulamadı: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Profil oluşturulurken hata:', error);
        showNotification('Profil oluşturulurken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

// Window controls
function minimizeWindow() {
    ipcRenderer.invoke('minimize-window');
}

function closeWindow() {
    ipcRenderer.invoke('close-window');
}

// Show loading overlay
function showLoading(show, message = 'Yükleniyor...') {
    if (show) {
        document.querySelector('.loading-spinner p').textContent = message;
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
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 8px;
        padding: 16px 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        max-width: 400px;
        animation: slideIn 0.3s ease forwards;
        border-left: 4px solid ${getNotificationColor(type)};
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <i class="fas fa-${getNotificationIcon(type)}" style="color: ${getNotificationColor(type)};"></i>
            <span style="color: #212529; font-weight: 500;">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: #6c757d; cursor: pointer; margin-left: auto;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Delete profile
async function deleteProfile(profileId, playerName) {
    if (!confirm(`"${playerName}" profilini silmek istediğinizden emin misiniz?`)) {
        return;
    }
    
    try {
        showLoading(true, 'Profil siliniyor...');
        
        const result = await ipcRenderer.invoke('delete-profile', profileId);
        
        if (result.success) {
            await loadProfiles(); // Profilleri yeniden yükle
            showNotification(`${playerName} profili silindi`, 'success');
        } else {
            showNotification('Profil silinemedi: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Profil silinirken hata:', error);
        showNotification('Profil silinirken hata oluştu', 'error');
    } finally {
        showLoading(false);
    }
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'success': return '#28a745';
        case 'error': return '#dc3545';
        case 'warning': return '#ffc107';
        default: return '#17a2b8';
    }
}

// CSS animasyonları ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
