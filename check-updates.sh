#!/bin/bash

echo "🔍 Checking for outdated packages..."
echo ""

# Check for outdated packages
echo "=== OUTDATED PACKAGES ==="
npm outdated

echo ""
echo "=== CHECKING SPECIFIC PACKAGES ==="

# Check Next.js version
echo "Next.js:"
npm list next

# Check React version
echo ""
echo "React:"
npm list react react-dom

# Check Clerk version
echo ""
echo "Clerk:"
npm list @clerk/nextjs

# Check other key packages
echo ""
echo "Recharts:"
npm list recharts

echo ""
echo "OpenAI:"
npm list openai

echo ""
echo "=== RECOMMENDATIONS ==="
echo ""
echo "To update all packages to latest compatible versions:"
echo "  npm update"
echo ""
echo "To update a specific package:"
echo "  npm install package-name@latest"
echo ""
echo "To update major versions (be careful!):"
echo "  npm install package-name@latest"
echo ""
echo "To check for security vulnerabilities:"
echo "  npm audit"
echo "  npm audit fix"