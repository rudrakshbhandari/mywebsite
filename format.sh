#!/bin/bash

# Format script for portfolio website
# This script ensures consistent formatting across all files

echo "🎨 Formatting portfolio website files..."

# Format HTML files
echo "📄 Formatting HTML files..."
prettier --write "*.html"

# Format CSS files  
echo "🎨 Formatting CSS files..."
prettier --write "css/*.css"

# Format SCSS files
echo "🎨 Formatting SCSS files..."
prettier --write "scss/**/*.scss"

# Format JavaScript files
echo "⚡ Formatting JavaScript files..."
prettier --write "js/*.js"

echo "✅ Formatting complete!"
echo ""
echo "💡 Tip: Run 'git diff' to see what changed, then commit your changes."
