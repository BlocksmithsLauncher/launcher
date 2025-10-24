#!/bin/bash

# Blocksmiths Launcher - macOS Build Script
# This script builds all macOS packages (DMG, PKG, ZIP)

set -e

echo "🚀 Building Blocksmiths Launcher for macOS..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ Error: This script must be run on macOS."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Build all macOS targets
echo "🔨 Building macOS packages..."

# DMG
echo "  💿 Building DMG..."
npm run build:mac-dmg

# PKG
echo "  📦 Building PKG..."
npm run build:mac-pkg

# ZIP
echo "  📦 Building ZIP..."
npm run build:mac-zip

echo "✅ macOS build complete!"
echo "📁 Output directory: dist/"
echo ""
echo "Available packages:"
ls -la dist/ | grep -E "\.(dmg|pkg|zip)$"
