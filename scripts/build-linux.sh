#!/bin/bash

# Blocksmiths Launcher - Linux Build Script
# This script builds all Linux packages (AppImage, DEB, RPM, Pacman, Tar.gz)

set -e

echo "🚀 Building Blocksmiths Launcher for Linux..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Build all Linux targets
echo "🔨 Building Linux packages..."

# AppImage
echo "  📱 Building AppImage..."
npm run build:linux-appimage

# DEB packages
echo "  📦 Building DEB packages..."
npm run build:linux-deb

# RPM packages
echo "  📦 Building RPM packages..."
npm run build:linux-rpm

# Pacman packages (Arch Linux)
echo "  📦 Building Pacman packages..."
npm run build:linux-pacman

# Tar.gz archives
echo "  📦 Building Tar.gz archives..."
npm run build:linux-tar

echo "✅ Linux build complete!"
echo "📁 Output directory: dist/"
echo ""
echo "Available packages:"
ls -la dist/ | grep -E "\.(AppImage|deb|rpm|tar\.gz)$"
