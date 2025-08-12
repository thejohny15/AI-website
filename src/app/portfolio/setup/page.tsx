// app/portfolio/setup/page.tsx
"use client";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function PortfolioSetupOptions() {
  const params = useSearchParams();
  const pid = params.get("pid");
  const router = useRouter();

  if (!pid) {
    // If no pid, bounce to dashboard
    if (typeof window !== "undefined") router.replace("/dashboard");
    return null;
  }

  const card =
    "rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur hover:bg-white/20 transition";

  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-extrabold">Choose how to proceed</h1>
        <p className="mt-2 text-white/90">
          Pick the path you prefer to construct your first portfolio.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Option 1 */}
          <Link href={`/portfolio/ai-full?pid=${pid}`} className={card}>
            <h3 className="font-semibold">Option 1 — AI builds it all</h3>
            <p className="mt-1 text-white/80 text-sm">
              Let the AI create the full portfolio and explain its decisions and thesis.
            </p>
          </Link>

          {/* Option 2 */}
          <Link href={`/portfolio/path?pid=${pid}`} className={card}>
            <h3 className="font-semibold">Option 2 — Pick a macro path</h3>
            <p className="mt-1 text-white/80 text-sm">
              AI summarizes current conditions and plausible futures. You select a path, then it builds accordingly.
            </p>
          </Link>

          {/* Option 3 */}
          <Link href={`/portfolio/custom?pid=${pid}`} className={card}>
            <h3 className="font-semibold">Option 3 — You set the scenario</h3>
            <p className="mt-1 text-white/80 text-sm">
              Define your own assumptions about the economy, and the AI constructs a portfolio for that scenario.
            </p>
          </Link>
        </div>

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/20"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
