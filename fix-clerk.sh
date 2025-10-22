#!/bin/bash
# Clerk Fix Script

echo "=== Checking Clerk packages ==="
npm ls @clerk/shared 2>/dev/null || echo "No @clerk/shared found"
npm ls @clerk/nextjs 2>/dev/null || echo "No @clerk/nextjs found"

echo ""
echo "=== Cleaning up Clerk packages ==="
npm uninstall @clerk/nextjs @clerk/shared @clerk/clerk-react

echo ""
echo "=== Reinstalling Clerk ==="
npm install @clerk/nextjs@latest

echo ""
echo "=== Clearing Next.js cache ==="
rm -rf .next
rm -rf node_modules/.cache

echo ""
echo "=== Done! Now restart your dev server ==="
echo "Run: npm run dev"