"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getPortfolio, updatePortfolio, type Holding, type Portfolio } from "@/lib/portfolioStore";

function SummaryBlock({ summary }: { summary: any }) {
  if (!summary) return null;
  if (typeof summary === "string") {
    return <p className="mt-2 text-white/90 leading-relaxed">{summary}</p>;
  }
  const et = summary["Economic Thesis"];
  const shaped = summary["How Your Answers Shaped This"];
  const logic = summary["Portfolio Logic"];
  const tradeoffs = summary["Key Trade-offs"];
  return (
    <div className="mt-2 text-white/90 leading-relaxed space-y-4">
      {et && (
        <section>
          <h3 className="font-semibold">Economic Thesis</h3>
          <p>{et}</p>
        </section>
      )}
      {shaped && (
        <section>
          <h3 className="font-semibold">How Your Answers Shaped This</h3>
          {Array.isArray(shaped) ? (
            <ul className="list-disc pl-5">
              {shaped.map((x: any, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p>{shaped}</p>
          )}
        </section>
      )}
      {logic && (
        <section>
          <h3 className="font-semibold">Portfolio Logic</h3>
          <p>{logic}</p>
        </section>
      )}
      {tradeoffs && (
        <section>
          <h3 className="font-semibold">Key Trade-offs</h3>
          {Array.isArray(tradeoffs) ? (
            <ul className="list-disc pl-5">
              {tradeoffs.map((x: any, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <p>{tradeoffs}</p>
          )}
        </section>
      )}
    </div>
  );
}

function AiFullPageContent() {
  const pid = useSearchParams().get("pid");
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";

  const [summary, setSummary] = useState<any>("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch only once Clerk is ready and we have both pid & userId
  useEffect(() => {
    if (!pid || !isLoaded || !userId) return;

    const p: Portfolio | undefined = getPortfolio(userId, pid);
    if (!p) { router.replace("/dashboard"); return; }
    
    setPortfolio(p);

    let cancelled = false;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        // Ensure portfolio has required fields for API
        const portfolioForAPI = {
          ...p,
          approximateValue: p.approximateValue || 10000 // Default value if missing
        };
        
        const res = await fetch("/api/portfolio-proposal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolio: portfolioForAPI }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setSummary(data.summary);
        setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to generate proposal. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pid, isLoaded, userId, router]);

  // Fetch quotes for daily performance calculation
  useEffect(() => {
    if (!holdings.length) return;

    const symbols = holdings.map(h => h.symbol);
    if (symbols.length === 0) return;

    const fetchQuotes = async () => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols }),
        });
        const data = await res.json();
        setQuotes(data.quotes || {});
      } catch (e) {
        // Silently fail - quotes are optional
      }
    };

    // Initial fetch
    fetchQuotes();

    // Set up auto-refresh every 60 seconds
    const interval = setInterval(fetchQuotes, 60000);

    return () => clearInterval(interval);
  }, [holdings]);

  function acceptDraft() {
    if (!pid || !userId) return;
    updatePortfolio(userId, pid, { proposalHoldings: holdings, proposalSummary: summary });
    router.push(`/dashboard/${pid}`); // go to the detail page
  }

  if (!pid) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-extrabold">AI — Proposed Portfolio</h1>
        <p className="mt-2 text-white/90">Draft generated from your answers. You can chat, regenerate, or accept.</p>

        {loading ? (
          <p className="mt-8 text-white/80">Generating…</p>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
            <p className="text-red-200">{error}</p>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
              <h2 className="font-semibold">Why this portfolio?</h2>
              <SummaryBlock summary={summary} />
            </div>

            <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur overflow-x-auto">
              <table className="w-full text-left text-white/90">
                <thead>
                  <tr className="text-white/80">
                    <th className="py-2">Symbol</th>
                    <th className="py-2 pl-6">Weight</th>
                    <th className="py-2 pl-6 text-right">Shares</th>
                    <th className="py-2 pl-6 text-right">Amount</th>
                    <th className="py-2 pl-8">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(holdings) && holdings.map((h) => (
                    <tr key={h.symbol} className="border-t border-white/10">
                      <td className="py-2 font-semibold">{h.symbol}</td>
                      <td className="py-2 pl-6">{h.weight.toFixed(2)}%</td>
                      <td className="py-2 pl-6 text-right font-semibold">
                        {h.recommendedShares ? h.recommendedShares.toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pl-6 text-right font-semibold">
                        {h.investmentAmount ? `$${h.investmentAmount.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2 pl-8 text-white/80">{h.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Cash allocation summary */}
              {Array.isArray(holdings) && holdings.some(h => h.investmentAmount) && (
                <div className="mt-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur p-4">
                  <h3 className="mb-3 font-semibold text-white">Cash Allocation Summary</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm text-white/90">
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-wide text-white/70">Available Cash</div>
                      <div className="mt-1 text-lg font-bold text-white">
                        ${portfolio?.approximateValue?.toLocaleString() || '0'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-wide text-white/70">To Invest</div>
                      <div className="mt-1 text-lg font-bold text-emerald-300">
                        ${holdings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-wide text-white/70">Cash Buffer</div>
                      <div className="mt-1 text-lg font-bold text-white">
                        ${((portfolio?.approximateValue || 0) - holdings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0)).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-wide text-white/70">Today's Performance</div>
                      <div className="mt-1 text-lg font-bold">
                        {(() => {
                          // Calculate portfolio performance based on current vs estimated prices
                          let estimatedValue = 0;
                          let currentValue = 0;
                          let hasData = false;

                          holdings.forEach(h => {
                            if (h.recommendedShares && h.estimatedPrice) {
                              estimatedValue += h.recommendedShares * h.estimatedPrice;
                              const currentPrice = quotes[h.symbol]?.price;
                              if (currentPrice) {
                                currentValue += h.recommendedShares * currentPrice;
                                hasData = true;
                              } else {
                                currentValue += h.recommendedShares * h.estimatedPrice; // fallback
                              }
                            }
                          });

                          if (!hasData || estimatedValue === 0) return <span className="text-white/60">—</span>;
                          
                          const dailyChange = currentValue - estimatedValue;
                          const dailyChangePercent = (dailyChange / estimatedValue) * 100;
                          const isPositive = dailyChange >= 0;
                          
                          return (
                            <span className={isPositive ? "text-emerald-300" : "text-rose-300"}>
                              {isPositive ? "+" : ""}{dailyChangePercent.toFixed(2)}%
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  // regenerate using current questionnaire
                  if (!pid || !userId) return;
                  // trigger effect by toggling isLoaded? easier: just re-run the fetch inline
                  // (same logic as in effect, but without state race)
                  (async () => {
                    try {
                      setError(null);
                      setLoading(true);
                      const p: Portfolio | undefined = getPortfolio(userId, pid);
                      if (!p) { router.replace("/dashboard"); return; }
                      // Ensure portfolio has required fields for API
                      const portfolioForAPI = {
                        ...p,
                        approximateValue: p.approximateValue || 10000 // Default value if missing
                      };
                      
                      const res = await fetch("/api/portfolio-proposal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ portfolio: portfolioForAPI }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                      setSummary(data.summary);
                      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
                    } catch (e: any) {
                      setError(e.message || "Failed to generate proposal. Please try again.");
                    } finally {
                      setLoading(false);
                    }
                  })();
                }}
                className="rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20"
              >
                Regenerate
              </button>

              <Link
                href={`/chat?pid=${pid}`}
                className="rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20"
              >
                Continue chatting with AI
              </Link>

              <button
                onClick={acceptDraft}
                className="rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95"
              >
                Save to dashboard
              </button>
            </div>
          </>
        )}

        <div className="mt-8">
          <Link
            href={`/portfolio/setup?pid=${pid}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/20"
          >
            Back to options
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AiFullPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading...</div>}>
      <AiFullPageContent />
    </Suspense>
  );
}

