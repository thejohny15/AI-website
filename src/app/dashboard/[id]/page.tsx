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
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart";
import PortfolioPerformanceSinceCreation from "@/components/PortfolioPerformanceSinceCreation";

/** Local type for a user-owned position (persisted in Portfolio.currentHoldings). */
type UserPosition = { symbol: string; shares: number; buyPrice: number; buyDate: string; note?: string };

export default function PortfolioDetail() {
  const params = useParams();
  // Auth / routing
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";
  const pid = typeof params.id === "string" ? params.id : "";

  // State
  const [p, setP] = useState<Portfolio & { currentHoldings?: UserPosition[] }>();
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [historicalRebalancingData, setHistoricalRebalancingData] = useState<any[]>([]);
  const [loadingRebalancing, setLoadingRebalancing] = useState(false);
  const [sinceCreationRebalancingData, setSinceCreationRebalancingData] = useState<any[]>([]);
  const [loadingSinceCreation, setLoadingSinceCreation] = useState(false);

  // Load portfolio
  useEffect(() => {
    if (!isLoaded || !userId || !pid) return;
    setP(getPortfolio(userId, pid) as any);
  }, [isLoaded, userId, pid]);

  // Fetch quotes for proposal + current holdings with auto-refresh
  useEffect(() => {
    const propSyms = (p?.proposalHoldings ?? []).map((h) => String(h.symbol).trim());
    const all = Array.from(new Set([...propSyms])).filter(Boolean);
    if (all.length === 0) return;

    const fetchQuotes = async () => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: all }),
        });
        const data = await res.json();
        setQuotes(data?.quotes || {});
      } catch (error) {
        console.error('Error fetching quotes:', error);
      }
    };

    // Initial fetch
    fetchQuotes();

    // Set up auto-refresh every 60 seconds
    const interval = setInterval(fetchQuotes, 60000);

    // Cleanup interval on unmount or dependency change
    return () => clearInterval(interval);
  }, [p?.proposalHoldings]);



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

  // Fetch actual rebalancing data from Yahoo Finance
  useEffect(() => {
    if (!p || !p.proposalHoldings || !p.proposalSummary) return;
    
    async function fetchRebalancingData() {
      setLoadingRebalancing(true);
      try {
        const lookback = p!.proposalSummary?.lookbackPeriod || '5y';
        const today = new Date();
        const startDate = new Date();
        
        switch(lookback) {
          case '1y':
            startDate.setFullYear(today.getFullYear() - 1);
            break;
          case '3y':
            startDate.setFullYear(today.getFullYear() - 3);
            break;
          case '5y':
          default:
            startDate.setFullYear(today.getFullYear() - 5);
            break;
        }
        
        const symbols = p!.proposalHoldings!.map(h => h.symbol);
        const weights = p!.proposalHoldings!.map(h => h.weight);
        
        const response = await fetch('/api/rebalancing-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols,
            weights,
            startDate: startDate.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
          })
        });
        
        if (!response.ok) throw new Error('Failed to fetch rebalancing data');
        
        const data = await response.json();
        setHistoricalRebalancingData(data.rebalancingData || []);
      } catch (error) {
        console.error('Error fetching rebalancing data:', error);
      } finally {
        setLoadingRebalancing(false);
      }
    }
    
    fetchRebalancingData();
  }, [p?.id]);

  // Fetch rebalancing data since portfolio creation
  useEffect(() => {
    if (!p || !p.proposalHoldings) return;
    
    async function fetchSinceCreationData() {
      setLoadingSinceCreation(true);
      try {
        const symbols = p!.proposalHoldings!.map(h => h.symbol);
        const weights = p!.proposalHoldings!.map(h => h.weight);
        
        const response = await fetch('/api/rebalancing-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols,
            weights,
            startDate: new Date(p!.createdAt).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
          })
        });
        
        if (!response.ok) throw new Error('Failed to fetch since creation data');
        
        const data = await response.json();
        setSinceCreationRebalancingData(data.rebalancingData || []);
      } catch (error) {
        console.error('Error fetching since creation data:', error);
      } finally {
        setLoadingSinceCreation(false);
      }
    }
    
    fetchSinceCreationData();
  }, [p?.id]);

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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg">
              {p.name}
            </h1>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-600/50 bg-slate-700/50 px-5 py-3 font-semibold backdrop-blur transition hover:bg-slate-600/60"
            >
              ← Back to Dashboard
            </Link>
          </div>
          <p className="text-lg text-slate-200 font-medium">
            Created {new Date(p.createdAt).toLocaleDateString()}
          </p>
        </div>

        {/* Portfolio Summary */}
        {p.proposalSummary && (
          <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-4">Portfolio Summary</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isRiskBudgeting ? (
                <>
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
                </>
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
          </div>
        )}

        {/* Portfolio Holdings */}
        {p.proposalHoldings && p.proposalHoldings.length > 0 && (
          <>
            {/* Historical Performance Chart */}
            <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Historical Performance</h2>
              <PortfolioPerformanceChart 
                holdings={p.proposalHoldings} 
                lookbackPeriod={p.proposalSummary?.lookbackPeriod || '5y'} 
                createdAt={new Date(p.createdAt).toISOString()}
                rebalancingDates={(() => {
                  // Generate quarterly rebalancing for the entire historical period
                  const dates: string[] = [];
                  const lookback = p.proposalSummary?.lookbackPeriod || '5y';
                  const today = new Date();
                  const startDate = new Date();
                  
                  // Calculate start date based on lookback period
                  switch(lookback) {
                    case '1y':
                      startDate.setFullYear(today.getFullYear() - 1);
                      break;
                    case '3y':
                      startDate.setFullYear(today.getFullYear() - 3);
                      break;
                    case '5y':
                    default:
                      startDate.setFullYear(today.getFullYear() - 5);
                      break;
                  }
                  
                  // Generate quarterly rebalancing dates from start to today
                  let currentDate = new Date(startDate);
                  currentDate.setMonth(Math.ceil((currentDate.getMonth() + 1) / 3) * 3);
                  currentDate.setDate(1);
                  
                  while (currentDate <= today) {
                    dates.push(currentDate.toISOString());
                    currentDate.setMonth(currentDate.getMonth() + 3);
                  }
                  
                  return dates;
                })()}
              />

              {/* Historical Rebalancing Timeline - Directly under chart */}
              {loadingRebalancing ? (
                <div className="mt-6 pt-6 border-t border-slate-600/30 text-center">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-purple-500"></div>
                  <p className="text-sm text-slate-300 mt-2">Loading rebalancing data...</p>
                </div>
              ) : historicalRebalancingData.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-600/30">
                  <h4 className="font-semibold text-white mb-3">Rebalancing Timeline</h4>
                  <p className="text-sm text-slate-300 mb-4">
                    Portfolio was rebalanced {historicalRebalancingData.length} times (quarterly) to maintain risk balance. 
                    Each rebalance incurred 0.1% transaction costs.
                  </p>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {historicalRebalancingData.map((rebalance, idx) => (
                      <div key={idx} className="rounded-lg bg-slate-700/30 border border-slate-500/30 p-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-white">
                            Rebalance #{idx + 1} - {new Date(rebalance.date).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: '2-digit' 
                            })}
                          </span>
                          <span className="text-xs text-slate-400">
                            Portfolio: ${rebalance.portfolioValue}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {/* Column 1 & 2: Weight Changes */}
                          <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1">
                            {rebalance.weightChanges.slice(0, 4).map((change: any, hIdx: number) => (
                              <div key={hIdx} className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-300 font-medium min-w-[45px]">{change.symbol}:</span>
                                <span className="text-slate-100">
                                  {change.beforeWeight}% → {change.afterWeight}%
                                </span>
                                <span className={`text-xs font-bold ${
                                  parseFloat(change.drift) > 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  ({parseFloat(change.drift) > 0 ? '+' : ''}{change.drift}%)
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          {/* Column 3: Portfolio Metrics */}
                          <div className="border-l border-slate-600/30 pl-4 space-y-1">
                            <div className="text-xs">
                              <span className="text-slate-400">Qtr Return:</span>{' '}
                              <span className={`font-semibold ${
                                parseFloat(rebalance.qtrReturn) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {parseFloat(rebalance.qtrReturn) > 0 ? '+' : ''}{rebalance.qtrReturn}%
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-slate-400">Vol:</span>{' '}
                              <span className="text-slate-100 font-semibold">{rebalance.vol}%</span>
                            </div>
                            <div className="text-xs">
                              <span className="text-slate-400">Sharpe:</span>{' '}
                              <span className="text-slate-100 font-semibold">{rebalance.sharpe}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Performance Since Creation Chart */}
            <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Performance Since Portfolio Creation</h2>
              <PortfolioPerformanceSinceCreation 
                holdings={p.proposalHoldings} 
                createdAt={new Date(p.createdAt).toISOString()}
                rebalancingDates={(() => {
                  // Generate quarterly rebalancing since creation for this chart
                  const dates: string[] = [];
                  const startDate = new Date(p.createdAt);
                  const today = new Date();
                  let currentDate = new Date(startDate);
                  currentDate.setMonth(Math.ceil((currentDate.getMonth() + 1) / 3) * 3);
                  currentDate.setDate(1);
                  while (currentDate <= today) {
                    dates.push(currentDate.toISOString());
                    currentDate.setMonth(currentDate.getMonth() + 3);
                  }
                  return dates;
                })()}
                rebalancingFrequency={p.rebalancingFrequency || 'quarterly'}
              />
            </div>

            {/* Portfolio Rebalancing Timeline (Since Creation) */}
            {loadingSinceCreation ? (
              <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-purple-500"></div>
                <p className="text-sm text-slate-300 mt-2">Loading portfolio rebalancing data...</p>
              </div>
            ) : sinceCreationRebalancingData.length > 0 && (
              <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-4">Portfolio Rebalancing Timeline (Since Creation)</h2>
                <p className="text-slate-300 mb-4">
                  Portfolio has been rebalanced {sinceCreationRebalancingData.length} times (quarterly) since creation using real historical data.
                </p>
                <div className="space-y-4">
                  {sinceCreationRebalancingData.map((rebalance, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-500/30 bg-slate-700/30 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            Rebalance #{idx + 1} - {new Date(rebalance.date).toLocaleDateString('en-US', { 
                              year: 'numeric', month: 'short', day: '2-digit' 
                            })}
                          </h3>
                          <span className="text-slate-400 text-sm">
                            {Math.floor((Date.now() - new Date(rebalance.date).getTime()) / (1000 * 60 * 60 * 24))} days ago
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">Portfolio Value</div>
                          <div className="text-xl font-bold text-white">${rebalance.portfolioValue}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {rebalance.weightChanges.slice(0, 4).map((change: any, hIdx: number) => (
                          <div key={hIdx} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                            <span className="text-white font-semibold">{change.symbol}:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300">{change.beforeWeight}%</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-white font-semibold">{change.afterWeight}%</span>
                              <span className={`text-xs font-semibold ${parseFloat(change.drift) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({parseFloat(change.drift) >= 0 ? '+' : ''}{change.drift}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-600/30">
                        <div>
                          <div className="text-xs text-slate-400">Qtr Return</div>
                          <div className={`text-lg font-bold ${parseFloat(rebalance.qtrReturn) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {parseFloat(rebalance.qtrReturn) >= 0 ? '+' : ''}{rebalance.qtrReturn}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Volatility</div>
                          <div className="text-lg font-bold text-white">{rebalance.vol}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Sharpe Ratio</div>
                          <div className="text-lg font-bold text-white">{rebalance.sharpe}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Holdings Table */}
            <div className="rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Portfolio Holdings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-200 border-b border-slate-600/30">
                    <th className="py-3 pr-6 font-semibold">Symbol</th>
                    <th className="py-3 pr-6 text-right font-semibold">Weight</th>
                    <th className="py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {p.proposalHoldings.map((h, i) => (
                    <tr key={i} className="border-b border-slate-600/20">
                      <td className="py-3 pr-6 font-semibold text-white">{h.symbol}</td>
                      <td className="py-3 pr-6 text-right font-semibold text-white">{h.weight}%</td>
                      <td className="py-3 text-slate-300 text-sm">{h.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {!p.proposalHoldings || p.proposalHoldings.length === 0 && (
          <div className="rounded-2xl border border-slate-600/50 bg-slate-800/60 p-12 backdrop-blur-xl shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-white mb-3">
              No Analysis Yet
            </h2>
            <p className="text-slate-200 mb-6">
              This portfolio hasn't been analyzed yet
            </p>
            <Link
              href={`/portfolio/setup?pid=${p.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
            >
              Start Analysis
            </Link>
          </div>
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
