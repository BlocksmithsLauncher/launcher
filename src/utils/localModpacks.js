const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Local Featured Modpacks Manager
 * Reads .mrpack files from modpacks/ directory
 */

class LocalModpacksManager {
    constructor() {
        // modpacks/ directory is in project root
        this.modpacksDir = path.join(__dirname, '..', '..', '..', 'modpacks');
    }

    /**
     * Scan modpacks directory and return creator sections
     */
    async getCreatorModpacks() {
        const creators = [];

        try {
            if (!await fs.pathExists(this.modpacksDir)) {
                console.warn('[LOCAL-MODPACKS] Modpacks directory not found:', this.modpacksDir);
                return creators;
            }

            // Read creator directories (Algomi, Tenticra, etc.)
            const creatorDirs = await fs.readdir(this.modpacksDir);

            for (const creatorName of creatorDirs) {
                const creatorPath = path.join(this.modpacksDir, creatorName);
                const stat = await fs.stat(creatorPath);

                if (!stat.isDirectory()) continue;

                const modpacks = [];
                const mrpackFiles = await fs.readdir(creatorPath);

                for (const file of mrpackFiles) {
                    if (!file.endsWith('.mrpack')) continue;

                    const mrpackPath = path.join(creatorPath, file);
                    try {
                        const modpackInfo = await this.readMrpackInfo(mrpackPath);
                        if (modpackInfo) {
                            modpacks.push({
                                ...modpackInfo,
                                localPath: mrpackPath,
                                isLocal: true
                            });
                        }
                    } catch (err) {
                        console.error(`[LOCAL-MODPACKS] Failed to read ${file}:`, err);
                    }
                }

                if (modpacks.length > 0) {
                    creators.push({
                        name: creatorName,
                        slug: creatorName.toLowerCase(),
                        avatar: this.getCreatorAvatar(creatorName),
                        modpacks
                    });
                }
            }

            console.log(`[LOCAL-MODPACKS] Loaded ${creators.length} creators with modpacks`);
            return creators;

        } catch (error) {
            console.error('[LOCAL-MODPACKS] Error scanning modpacks:', error);
            return creators;
        }
    }

    /**
     * Read .mrpack file and extract metadata
     */
    async readMrpackInfo(mrpackPath) {
        try {
            const zip = new AdmZip(mrpackPath);
            const manifestEntry = zip.getEntry('modrinth.index.json');

            if (!manifestEntry) {
                console.warn(`[LOCAL-MODPACKS] No modrinth.index.json in ${path.basename(mrpackPath)}`);
                return null;
            }

            const manifestContent = manifestEntry.getData().toString('utf8');
            const manifest = JSON.parse(manifestContent);

            // Extract icon if exists
            let iconBase64 = null;
            if (manifest.files) {
                const iconFile = manifest.files.find(f => 
                    f.path && (f.path.includes('icon.png') || f.path.includes('pack.png'))
                );
                if (iconFile && iconFile.path) {
                    const iconEntry = zip.getEntry(iconFile.path);
                    if (iconEntry) {
                        const iconBuffer = iconEntry.getData();
                        iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
                    }
                }
            }

            // Check overrides for icon
            if (!iconBase64) {
                const overridesIcon = zip.getEntry('overrides/icon.png');
                if (overridesIcon) {
                    const iconBuffer = overridesIcon.getData();
                    iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
                }
            }

            return {
                name: manifest.name || path.basename(mrpackPath, '.mrpack'),
                slug: this.slugify(manifest.name || path.basename(mrpackPath, '.mrpack')),
                description: manifest.summary || 'Özel mod paketi',
                iconUrl: iconBase64 || 'assets/images/default-modpack.png',
                version: manifest.versionId || '1.0.0',
                minecraftVersion: manifest.dependencies?.minecraft || 'Unknown',
                modloader: this.detectModloader(manifest),
                downloads: 0,
                tags: ['featured', 'local'],
                files: manifest.files || []
            };
        } catch (error) {
            console.error(`[LOCAL-MODPACKS] Error reading ${mrpackPath}:`, error);
            return null;
        }
    }

    /**
     * Detect modloader from manifest dependencies
     */
    detectModloader(manifest) {
        const deps = manifest.dependencies || {};
        if (deps['fabric-loader']) return 'fabric';
        if (deps['forge']) return 'forge';
        if (deps['neoforge']) return 'neoforge';
        if (deps['quilt-loader']) return 'quilt';
        return 'unknown';
    }

    /**
     * Get creator avatar path
     */
    getCreatorAvatar(creatorName) {
        const avatarMap = {
            'Algomi': 'assets/images/avatars/algomi.png',
            'Tenticra': 'assets/images/avatars/tenticra.png'
        };
        return avatarMap[creatorName] || 'assets/images/avatars/default.png';
    }

    /**
     * Create URL-friendly slug
     */
    slugify(text) {
        return text
            .toLowerCase()
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ı/g, 'i')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
}

module.exports = new LocalModpacksManager();
