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

      {/* Features */}
      <section id="features" className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose AI Portfolio?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered Analysis</h3>
              <p className="text-white/70">Advanced algorithms analyze market conditions and economic indicators to create optimal portfolios.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-Time Tracking</h3>
              <p className="text-white/70">Monitor your portfolio performance with live market data and comprehensive analytics.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-600/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Risk Management</h3>
              <p className="text-white/70">Built-in risk assessment and diversification strategies to protect your investments.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="px-6 py-16 bg-black/20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
              <h3 className="text-lg font-semibold mb-2">Answer Questions</h3>
              <p className="text-white/70">Tell us about your financial goals, risk tolerance, and investment timeline.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
              <h3 className="text-lg font-semibold mb-2">AI Analysis</h3>
              <p className="text-white/70">Our AI analyzes market conditions and creates a personalized portfolio recommendation.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
              <h3 className="text-lg font-semibold mb-2">Track & Optimize</h3>
              <p className="text-white/70">Monitor performance and receive ongoing recommendations to optimize your investments.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start Investing Smarter?</h2>
        <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
          Join thousands of investors who are already using AI to build better portfolios.
        </p>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-lg font-semibold">
              Get Started Today
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <a
            href="/dashboard"
            className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-lg font-semibold inline-block"
          >
            Go to Dashboard
          </a>
        </SignedIn>
      </section>
    </main>
  );
}
