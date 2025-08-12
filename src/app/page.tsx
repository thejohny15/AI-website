// app/page.tsx
"use client";
import RotatingHeadline from "@/components/RotatingHeadline";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-sm font-semibold tracking-wide/5 opacity-90">AI Portfolio Creator</div>
        <nav className="flex items-center gap-3">
          <a href="#how-it-works" className="hidden sm:inline text-white/80 hover:text-white transition">How it works</a>
          <a href="#features" className="hidden sm:inline text-white/80 hover:text-white transition">Features</a>

          <SignedOut>
            <SignInButton mode="modal">
              <button
                className="focus-ring rounded-xl border border-white/60 bg-white/10 px-4 py-2 font-semibold backdrop-blur transition hover:bg-white/20"
                aria-label="Sign in or sign up"
              >
                Sign In
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-20">
        <div className="mx-auto grid max-w-4xl place-items-center text-center">
          <RotatingHeadline
            items={[
              "Welcome to Your AI Portfolio Creator",
              "Let AI set up your portfolio with your economic view",
              "Give your AI the wheel — and let it explain its market thesis",
            ]}
          />

          <p className="mt-4 max-w-2xl text-white/90 text-base">
            Build and explain your investment portfolio with AI. You choose the thesis and risk; your AI handles the setup and narrates the logic.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#how-it-works"
              className="focus-ring inline-flex items-center justify-center rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/20"
            >
              See how it works
            </a>

            <SignedOut>
              <SignInButton mode="modal">
                <button className="focus-ring inline-flex items-center justify-center rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95">
                  Get started
                </button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <a
                href="/dashboard"
                className="focus-ring inline-flex items-center justify-center rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95"
              >
                Go to dashboard
              </a>
            </SignedIn>
          </div>
        </div>
      </section>

      {/* (rest of your sections unchanged) */}
      {/* How it works, Features, Footer */}
    </main>
  );
}
