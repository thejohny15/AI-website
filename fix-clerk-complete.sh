#!/bin/bash

echo "🔧 FIXING CLERK AUTHENTICATION ISSUES..."
echo ""

# Stop any running dev server
echo "1. Stopping development server..."
pkill -f "next dev" 2>/dev/null || true

# Clear all caches
echo "2. Clearing caches..."
rm -rf .next/
rm -rf node_modules/.cache/
rm -rf .turbo/

# Check current Clerk versions
echo "3. Checking current Clerk packages..."
npm ls @clerk/nextjs 2>/dev/null || echo "   @clerk/nextjs: not installed"
npm ls @clerk/shared 2>/dev/null || echo "   @clerk/shared: not installed" 
npm ls @clerk/clerk-react 2>/dev/null || echo "   @clerk/clerk-react: not installed"

# Remove all Clerk packages to avoid conflicts
echo "4. Removing existing Clerk packages..."
npm uninstall @clerk/nextjs @clerk/shared @clerk/clerk-react @clerk/types 2>/dev/null || true

# Install latest Clerk
echo "5. Installing latest Clerk..."
npm install @clerk/nextjs@latest

# Update Next.js and React if needed
echo "6. Updating core dependencies..."
npm update next react react-dom

# Clear package-lock issues
echo "7. Fixing package-lock..."
rm -f package-lock.json
npm install

echo ""
echo "✅ CLERK FIX COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Add your Clerk keys to .env.local:"
echo "   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key"
echo "   CLERK_SECRET_KEY=sk_test_your_secret"
echo ""
echo "2. Start the dev server:"
echo "   npm run dev"
echo ""
echo "3. Visit: http://localhost:3000"