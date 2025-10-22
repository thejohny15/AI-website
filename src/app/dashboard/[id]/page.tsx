"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState, useMemo } from "react";
import {
  getPortfolio,
  updatePortfolio,            // ← use this to persist currentHoldings
  type Portfolio,
  type Holding,
} from "@/lib/portfolioStore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Small table cell helpers to keep markup tidy.
 */
function Th({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-sm text-gray-900 ${className}`}>
      {children}
    </td>
  );
}

/** Local type for a user-owned position (persisted in Portfolio.currentHoldings). */
type UserPosition = { symbol: string; shares: number; buyPrice: number; buyDate: string; note?: string };

export default function PortfolioDetail() {
  const params = useParams();
  const router = useRouter();
  // Auth / routing
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";
  const pid = typeof params.id === "string" ? params.id : "";

  // State
  const [p, setP] = useState<Portfolio & { currentHoldings?: UserPosition[] }>();
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [historicalPrices, setHistoricalPrices] = useState<Record<string, Array<{date: string, price: number}>>>({});

  // Form state (must be before any early returns)
  const [sym, setSym] = useState("");
  const [buy, setBuy] = useState("");
  const [shares, setShares] = useState("");
  const [buyDate, setBuyDate] = useState("");

  // Load portfolio
  useEffect(() => {
    if (!isLoaded || !userId || !pid) return;
    setP(getPortfolio(userId, pid) as any);
  }, [isLoaded, userId, pid]);

  // Fetch quotes for proposal + current holdings with auto-refresh
  useEffect(() => {
    const propSyms = (p?.proposalHoldings ?? []).map((h) => String(h.symbol).trim());
    const userSyms = (p?.currentHoldings ?? []).map((h) => String(h.symbol).trim());
    const all = Array.from(new Set([...propSyms, ...userSyms])).filter(Boolean);
    if (all.length === 0) return;

    const fetchQuotes = async () => {
      try {
        setQuotesLoading(true);
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: all }),
        });
        const data = await res.json();
        setQuotes(data?.quotes || {});
      } finally {
        setQuotesLoading(false);
      }
    };

    // Initial fetch
    fetchQuotes();

    // Set up auto-refresh every 60 seconds
    const interval = setInterval(fetchQuotes, 60000);

    // Cleanup interval on unmount or dependency change
    return () => clearInterval(interval);
  }, [p?.proposalHoldings, p?.currentHoldings]);



  // Proposal stats
  const proposalMove = useMemo(() => {
    if (!p?.proposalHoldings?.length) return null;
    let covered = 0;
    let sum = 0;
    for (const h of p.proposalHoldings) {
      const w = (h.weight ?? 0) / 100;
      const cp = quotes[h.symbol]?.changePercent;
      if (w > 0 && typeof cp === "number") {
        sum += w * (cp / 100);
        covered += w;
      }
    }
    if (covered === 0) return null;
    return { pct: sum * 100, coveragePct: covered * 100 };
  }, [p?.proposalHoldings, quotes]);

  const totalWeight = useMemo(
    () => (p?.proposalHoldings ?? []).reduce((a, h) => a + (h.weight || 0), 0),
    [p]
  );

  // Current holdings helpers
  const positions: UserPosition[] = p?.currentHoldings ?? [];

  // Fetch historical prices for chart data
  useEffect(() => {
    if (!positions.length) return;
    
    const symbols = positions.map(pos => pos.symbol);
    const earliestDate = positions.reduce((earliest, pos) => {
      const posDate = new Date(pos.buyDate || new Date());
      return posDate < earliest ? posDate : earliest;
    }, new Date());
    
    const startDate = earliestDate.toISOString().slice(0, 10);
    
    // Add SPY for S&P 500 benchmark comparison
    const allSymbols = [...symbols, 'SPY'];
    
    (async () => {
      try {
        const res = await fetch("/api/historical-quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            symbols: allSymbols,
            startDate: startDate
          }),
        });
        const data = await res.json();
        setHistoricalPrices(data?.historicalPrices || {});
      } catch (e) {
        console.log("Error fetching historical prices:", e);
      }
    })();
  }, [positions]);

  function saveCurrentHoldings(next: UserPosition[]) {
    if (!userId || !p) return;
    updatePortfolio(userId, p.id, { currentHoldings: next } as any);
    setP((prev) => (prev ? { ...prev, currentHoldings: next } : prev));
  }

  function addPosition() {
    const s = sym.trim().toUpperCase();
    const b = Number(buy);
    const q = Number(shares);
    const d = buyDate || new Date().toISOString().slice(0, 10); // Default to today if empty
    if (!s || !Number.isFinite(b) || !Number.isFinite(q) || b <= 0 || q <= 0) return;
    const next = [...positions.filter((x) => x.symbol !== s), { symbol: s, buyPrice: b, shares: q, buyDate: d }];
    saveCurrentHoldings(next);
    setSym(""); setBuy(""); setShares(""); setBuyDate("");
  }

  function removePosition(s: string) {
    saveCurrentHoldings(positions.filter((x) => x.symbol !== s));
  }

  // Current totals (must be before early returns)
  const currentTotals = useMemo(() => {
    let totalValue = 0;
    let pricedCount = 0;
    for (const pos of positions) {
      const price = quotes[pos.symbol]?.price;
      if (typeof price === "number") {
        totalValue += price * (pos.shares ?? 0);
        pricedCount++;
      }
    }
    return { totalValue, pricedCount, count: positions.length };
  }, [positions, quotes]);

  // Generate portfolio value chart data with proper financial tracking
  const chartData = useMemo(() => {
    if (!positions.length || Object.keys(historicalPrices).length === 0) return [];
    
    // Initial cash is the portfolio's approximate value (committed cash amount)
    const initialCash = p?.approximateValue || 0;
    if (initialCash <= 0) return [];
    
    // Get all unique dates from historical data and trade dates
    const allDates = new Set<string>();
    Object.values(historicalPrices).forEach(priceArray => {
      priceArray.forEach(item => allDates.add(item.date));
    });
    
    // Add trade dates
    positions.forEach(pos => {
      if (pos.buyDate) {
        allDates.add(pos.buyDate);
        // Also add the day before the first trade to show the initial state
        const dayBefore = new Date(pos.buyDate);
        dayBefore.setDate(dayBefore.getDate() - 1);
        allDates.add(dayBefore.toISOString().slice(0, 10));
      }
    });
    
    // Convert to sorted array
    const dates = Array.from(allDates).sort();
    
    // Track running cash balance and positions
    let cashBalance = initialCash;
    const activePositions = new Map<string, {shares: number, symbol: string}>();
    
    // Calculate portfolio value for each date
    return dates.map((date, index) => {
      const currentDate = new Date(date);
      
      // Process any trades that occurred on this date
      positions.forEach(pos => {
        const tradeDate = new Date(pos.buyDate || '');
        if (tradeDate.toDateString() === currentDate.toDateString()) {
          // Execute buy trade (assume $0 fees for now - can be added later)
          const tradeCost = pos.buyPrice * pos.shares;
          cashBalance -= tradeCost;
          
          // Add or update position
          const existingPos = activePositions.get(pos.symbol);
          if (existingPos) {
            existingPos.shares += pos.shares;
          } else {
            activePositions.set(pos.symbol, {shares: pos.shares, symbol: pos.symbol});
          }
        }
      });
      
      // Calculate market value of all active positions
      let marketValue = 0;
      activePositions.forEach((position, symbol) => {
        const symbolPrices = historicalPrices[symbol] || [];
        let price = null;
        
        // Try to find exact date match first
        const exactMatch = symbolPrices.find(p => p.date === date);
        if (exactMatch) {
          price = exactMatch.price;
        } else {
          // Find the closest date before or on this date (carry forward last known price)
          const validPrices = symbolPrices.filter(p => p.date <= date).sort((a, b) => b.date.localeCompare(a.date));
          if (validPrices.length > 0) {
            price = validPrices[0].price;
          } else {
            // If no historical data available yet, find the position's buy price
            const pos = positions.find(p => p.symbol === symbol && new Date(p.buyDate || '') <= currentDate);
            price = pos?.buyPrice || 0;
          }
        }
        
        if (price && price > 0) {
          marketValue += price * position.shares;
        }
      });
      
      // Portfolio value = cash + market value of positions
      const portfolioValue = cashBalance + marketValue;
      
      // Calculate return vs initial cash
      const returnPct = initialCash > 0 ? ((portfolioValue / initialCash) - 1) * 100 : 0;
      
      // Calculate S&P 500 return from the same starting period
      let spyReturnPct = 0;
      const spyPrices = historicalPrices['SPY'] || [];
      if (spyPrices.length > 0) {
        // Find SPY price on this date (or carry forward)
        let currentSpyPrice = null;
        const exactSpyMatch = spyPrices.find(p => p.date === date);
        if (exactSpyMatch) {
          currentSpyPrice = exactSpyMatch.price;
        } else {
          const validSpyPrices = spyPrices.filter(p => p.date <= date).sort((a, b) => b.date.localeCompare(a.date));
          if (validSpyPrices.length > 0) {
            currentSpyPrice = validSpyPrices[0].price;
          }
        }
        
        // Find the earliest SPY price (baseline for return calculation)
        const earliestSpyPrice = spyPrices.find(p => p.date >= dates[0])?.price || spyPrices[0]?.price;
        
        if (currentSpyPrice && earliestSpyPrice) {
          spyReturnPct = ((currentSpyPrice / earliestSpyPrice) - 1) * 100;
        }
      }
      
      return {
        date,
        value: Math.round(portfolioValue * 100) / 100,
        returnPct: Math.round(returnPct * 100) / 100,
        spyReturnPct: Math.round(spyReturnPct * 100) / 100,
        cashBalance: Math.round(cashBalance * 100) / 100,
        marketValue: Math.round(marketValue * 100) / 100,
        formattedDate: new Date(date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      };
    }).filter(item => item.value > 0);
  }, [positions, historicalPrices, p?.approximateValue]);

  // Early returns AFTER all hooks
  if (!isLoaded) return null;
  if (!p) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-2xl border bg-white p-6">
          <p className="mb-4">Portfolio not found.</p>
          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:shadow">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const hasProposal = Array.isArray(p.proposalHoldings) && p.proposalHoldings.length > 0;
  const summary = p.proposalSummary;
  const isRiskBudgeting = typeof summary === "object" && summary?.methodology === "Equal Risk Contribution (ERC)";

  // Render
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#EAF2FF] via-[#B8F2FF] to-[#DDE7FF] py-10">
      <div className="mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 mb-4"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">{p?.name || "Portfolio"}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-600">
            <span>{p.riskTolerance}</span>
            <span>•</span>
            <span>{p.timeHorizon}</span>
            <span>•</span>
            <span>{p.currency}</span>
            {isRiskBudgeting && (
              <>
                <span>•</span>
                <span className="text-emerald-700 font-semibold">Risk Budgeting</span>
              </>
            )}
          </div>
        </div>

        {!hasProposal ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">No proposal yet</h2>
            <p className="mt-1 text-sm text-zinc-600">Generate a portfolio allocation to see it here.</p>
            <Link
              href={`/portfolio/setup?pid=${pid}`}
              className="mt-4 inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:shadow-md"
            >
              Generate Portfolio
            </Link>
          </div>
        ) : (
          <>
            {/* Summary Section */}
            {summary && (
              <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-zinc-900 mb-4">
                  {isRiskBudgeting ? "Risk Budgeting Analysis" : "Portfolio Summary"}
                </h2>
                
                {isRiskBudgeting ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricBox label="Methodology" value={summary.methodology} />
                    <MetricBox label="Portfolio Volatility" value={summary.portfolioVolatility} />
                    <MetricBox label="Sharpe Ratio" value={summary.sharpeRatio} />
                    <MetricBox label="Expected Return" value={summary.expectedReturn} />
                    <MetricBox label="Max Drawdown" value={summary.maxDrawdown} />
                    <MetricBox 
                      label="Optimization Status" 
                      value={summary.optimization?.converged ? `Converged (${summary.optimization.iterations} iter)` : "Completed"} 
                    />
                    <MetricBox label="Data As Of" value={summary.dataAsOf} />
                  </div>
                ) : typeof summary === "string" ? (
                  <p className="text-zinc-700 leading-relaxed">{summary}</p>
                ) : (
                  <div className="space-y-4 text-zinc-700">
                    {summary["Economic Thesis"] && (
                      <div>
                        <h3 className="font-semibold">Economic Thesis</h3>
                        <p>{summary["Economic Thesis"]}</p>
                      </div>
                    )}
                    {summary["Portfolio Logic"] && (
                      <div>
                        <h3 className="font-semibold">Portfolio Logic</h3>
                        <p>{summary["Portfolio Logic"]}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Holdings Table */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-900 mb-4">Holdings</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-zinc-600 border-b border-zinc-200">
                      <th className="py-3 pr-6">Symbol</th>
                      <th className="py-3 pr-6 text-right">Weight</th>
                      <th className="py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.proposalHoldings?.map((h) => (
                      <tr key={h.symbol} className="border-b border-zinc-100">
                        <td className="py-3 pr-6 font-semibold text-zinc-900">{h.symbol}</td>
                        <td className="py-3 pr-6 text-right font-semibold text-zinc-900">
                          {h.weight.toFixed(2)}%
                        </td>
                        <td className="py-3 text-sm text-zinc-600">{h.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs text-zinc-600 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-lg font-bold text-zinc-900">{value}</div>
    </div>
  );
}


/* =========================
   Small UI components
   ========================= */
function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const toneColors = {
    neutral: "bg-white/90 border-gray-200",
    ok: "bg-emerald-50 border-emerald-200",
    warn: "bg-amber-50 border-amber-200",
    bad: "bg-rose-50 border-rose-200",
  };
  
  return (
    <div className={`rounded-lg border p-4 ${toneColors[tone]}`}>
      <div className="text-gray-600 text-sm mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

/**
 * Empty state for when there is no proposal yet.
 */
function EmptyHoldings({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed p-4">
      <p className="text-sm text-zinc-600">No holdings yet.</p>
      <Link href={`/portfolio/setup?pid=${id}`} className="rounded-xl border px-4 py-2 text-sm hover:shadow">
        Choose an option
      </Link>
    </div>
  );
}

/**
 * Renders the structured summary (string or object with sections).
 */
function SummaryBlock({ summary }: { summary: any }) {
  if (!summary) return <p className="text-gray-500 italic">No summary available.</p>;
  
  if (typeof summary === "string") {
    return (
      <div className="prose prose-sm max-w-none text-gray-900">
        <p className="whitespace-pre-wrap">{summary}</p>
      </div>
    );
  }

  // If it's an object with sections
  return (
    <div className="space-y-4 text-gray-900">
      {Object.entries(summary).map(([key, value]) => (
        <div key={key}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </h3>
          <p className="text-gray-800 whitespace-pre-wrap">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

/* =========================
   Formatting / utilities
   ========================= */
function formatNumber(n?: number) {
  if (!Number.isFinite(n as number)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(n as number);
}
function formatPct(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(+n).toFixed(2)}%`;
}
function formatMoney(n?: number | null, ccy?: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return (n as number).toFixed(2);
  }
}
function formatMoneyColored(n?: number | null, ccy?: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  const tone = (n as number) > 0 ? "text-emerald-600" : (n as number) < 0 ? "text-rose-600" : "text-zinc-600";
  const sign = (n as number) > 0 ? "+" : "";
  return <span className={tone}>{sign}{formatMoney(n, ccy)}</span>;
}
function formatChange(pct?: number | null) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  const tone = pct > 0 ? "text-emerald-600" : pct < 0 ? "text-rose-600" : "text-zinc-600";
  return <span className={tone}>{`${sign}${pct.toFixed(2)}%`}</span>;
}
/**
 * Export proposed holdings as CSV (Symbol, Weight, Note).
 */
function downloadCSV(rows: Holding[], name: string) {
  const header = ["Symbol", "Weight", "Note"];
  const data = rows.map((r) => [r.symbol, r.weight, r.note ?? ""]);
  const csv =
    [header, ...data]
      .map((r) =>
        r.map((x) => {
          const s = String(x ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      )
      .join("\n") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_")}_holdings.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
