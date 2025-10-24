#!/bin/bash

# Blocksmiths Launcher - Universal Build Script
# This script builds packages for all platforms

set -e

echo "🚀 Building Blocksmiths Launcher for all platforms..."

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

# Detect platform and build accordingly
case "$OSTYPE" in
    "darwin"*)
        echo "🍎 Detected macOS - Building macOS packages..."
        npm run build:mac-all
        ;;
    "linux-gnu"*)
        echo "🐧 Detected Linux - Building Linux packages..."
        npm run build:linux-all
        ;;
    "msys"|"win32"|"cygwin")
        echo "🪟 Detected Windows - Building Windows packages..."
        npm run build:win
        ;;
    *)
        echo "❓ Unknown platform: $OSTYPE"
        echo "Building all platforms..."
        npm run build:all
        ;;
esac

echo "✅ Build complete!"
echo "📁 Output directory: dist/"
echo ""
echo "Available packages:"
ls -la dist/
