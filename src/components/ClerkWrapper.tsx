"use client";
import { useEffect, useState } from 'react';
import { ClerkProvider } from '@clerk/nextjs';

export default function ClerkWrapper({ children }: { children: React.ReactNode }) {
  const [clerkLoaded, setClerkLoaded] = useState(false);
  const [clerkError, setClerkError] = useState(false);

  useEffect(() => {
    // Set a timeout to detect if Clerk fails to load
    const timeout = setTimeout(() => {
      if (!clerkLoaded) {
        console.warn('Clerk failed to load, falling back to demo mode');
        setClerkError(true);
      }
    }, 10000); // 10 second timeout

    // Cleanup timeout if component unmounts
    return () => clearTimeout(timeout);
  }, [clerkLoaded]);

  if (clerkError) {
    // Fallback: render without Clerk if it fails to load
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0f172a]">
        <div className="fixed top-4 right-4 bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm">
          ⚠️ Authentication temporarily unavailable
        </div>
        {children}
      </div>
    );
  }

  return (
    <ClerkProvider
      appearance={{ baseTheme: undefined }}
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0f172a]">
        {children}
      </div>
    </ClerkProvider>
  );
}