"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getPortfolio, updatePortfolio, type Holding } from "@/lib/portfolioStore";

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

export default function AiFullPage() {
  const pid = useSearchParams().get("pid");
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";

  const [summary, setSummary] = useState<any>("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch only once Clerk is ready and we have both pid & userId
  useEffect(() => {
    if (!pid || !isLoaded || !userId) return;

    const p = getPortfolio(userId, pid);
    if (!p) { router.replace("/dashboard"); return; }

    let cancelled = false;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const res = await fetch("/api/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portfolio: p }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setSummary(data.summary);
        setHoldings(data.holdings);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to generate proposal. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pid, isLoaded, userId, router]);

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
                    <th className="py-2">Weight</th>
                    <th className="py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.symbol} className="border-t border-white/10">
                      <td className="py-2 font-semibold">{h.symbol}</td>
                      <td className="py-2">{h.weight}%</td>
                      <td className="py-2 text-white/80">{h.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      const p = getPortfolio(userId, pid);
                      if (!p) { router.replace("/dashboard"); return; }
                      const res = await fetch("/api/propose", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ portfolio: p }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                      setSummary(data.summary);
                      setHoldings(data.holdings);
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

