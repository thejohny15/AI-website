"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { listPortfolios, removePortfolio, type Portfolio, createPortfolio } from "@/lib/portfolioStore"; // <-- add remove
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  useEffect(() => {
    if (isLoaded && userId) {
      const allPortfolios = listPortfolios(userId);
      setPortfolios(allPortfolios);
    }
  }, [isLoaded, userId]);

  const sorted = useMemo(
    () => [...portfolios]
      .filter(p => p.proposalHoldings && p.proposalHoldings.length > 0)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [portfolios]
  );

  function handleCreatePortfolio() {
    if (!userId) return;
    
    const newPortfolio = createPortfolio(userId, { name: `Portfolio ${portfolios.length + 1}` });
    setPortfolios(listPortfolios(userId));
    router.push(`/portfolio/setup?pid=${newPortfolio.id}`);
  }

  function handleDeletePortfolio(id: string) {
    if (!userId) return;
    const ok = confirm("Delete this portfolio? This cannot be undone.");
    if (!ok) return;
    removePortfolio(userId, id);
    setPortfolios(listPortfolios(userId));
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-3">
            My Portfolios
          </h1>
          <p className="text-lg text-slate-200 font-medium">
            Manage your investment portfolios and track performance
          </p>
        </div>

        {/* Create New Portfolio Button */}
        <div className="mb-6 text-center">
          <button
            onClick={handleCreatePortfolio}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
          >
            + Create New Portfolio
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-slate-600/50 bg-slate-800/60 p-12 backdrop-blur-xl shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-3">
              No portfolios yet
            </h2>
            <p className="text-slate-200 mb-6">
              Create your first portfolio to get started with portfolio analysis
            </p>
            <button
              onClick={handleCreatePortfolio}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
            >
              + Create New Portfolio
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sorted.map((portfolio) => (
              <div
                key={portfolio.id}
                className="rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl hover:border-slate-500/60 hover:bg-slate-800/70 transition-all flex flex-col"
              >
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {portfolio.name}
                  </h3>
                  <p className="text-sm text-slate-300 mb-3">
                    Created {new Date(portfolio.createdAt).toLocaleDateString()}
                  </p>

                  {/* Portfolio Status */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                      ✓ Analysis Complete
                    </span>
                    <span className="text-sm text-slate-300">
                      {portfolio.proposalHoldings?.length || 0} assets
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-auto">
                  <Link
                    href={`/dashboard/${portfolio.id}`}
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-2 text-sm font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
                  >
                    View Details
                  </Link>
                  <button
                    onClick={() => handleDeletePortfolio(portfolio.id)}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-700/50 border border-slate-600/50 text-red-300 px-4 py-2 text-sm font-semibold hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
