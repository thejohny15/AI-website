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
            endDate: new Date().toISOString().split('T')[0],
            includeCorrelations: true // Request correlation data
          })
        });
        
        if (!response.ok) throw new Error('Failed to fetch since creation data');
        
        const data = await response.json();
        console.log('Rebalancing data received:', data); // Debug log
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

        {/* Dividend Information */}
        {p.proposalSummary && (
          <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Return Calculation</h2>
                <p className="text-sm text-slate-300 mt-1">
                  All returns include dividend yields (automatically reinvested)
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-100">
                <strong>Dividends Matter:</strong> ETFs like SPY (~1.5% yield), LQD (~3-4% yield), and TLT (~2-3% yield) 
                pay regular dividends. Dividends are automatically reinvested to buy additional shares. 
                Over 5 years, this can add 10-20% to total returns. All performance charts and metrics on this page 
                include dividend reinvestment for accurate performance measurement.
              </p>
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

            {/* Opportunity Cost Analysis */}
            <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Dividend Reinvestment Analysis</h2>
              
              {sinceCreationRebalancingData.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mb-4">
                    <svg className="w-16 h-16 mx-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Analysis Pending</h3>
                  <p className="text-slate-300 mb-4">
                    Dividend analysis will be available after the first quarterly rebalance
                  </p>
                  <p className="text-sm text-slate-400">
                    Your portfolio rebalances quarterly. The first rebalance will occur on the first day of the next quarter,
                    at which point you will see detailed dividend reinvestment analysis and comparison data.
                  </p>
                </div>
              ) : (
                <>
                  {sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].dividendCash ? (
                <div className="mb-6 p-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-semibold text-emerald-100">
                        💰 Total Dividends Received & Reinvested:
                      </span>
                    </div>
                    <span className="text-lg font-bold text-emerald-50">
                      ${sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].dividendCash?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-200/80 mt-2">
                    These dividends were automatically reinvested to buy additional shares, compounding your returns over time.
                  </p>
                </div>
                ) : (
                  <p className="text-slate-400 mb-4">No dividend data available yet</p>
                )}

                {/* Comparison: With vs Without Reinvestment */}
                {sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue && (
                  <div className="p-5 rounded-xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10">
                    <h4 className="text-base font-bold text-amber-100 mb-3 flex items-center gap-2">
                      <span>⚡</span> Opportunity Cost Analysis
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Current Strategy (With Reinvestment) */}
                      <div className="rounded-lg bg-emerald-900/40 p-4 border-2 border-emerald-400/50 shadow-lg">
                        <div className="text-xs text-emerald-200 mb-1 flex items-center gap-1.5">
                          <span>✅ With Reinvestment</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/30 border border-emerald-400/40">Current</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-emerald-300/80">Portfolio Value:</div>
                            <div className="text-xl font-bold text-emerald-50">
                              ${parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue).toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-emerald-300/80">Dividends reinvested:</div>
                            <div className="text-lg font-semibold text-emerald-100">
                              ${sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].dividendCash?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-emerald-500/30">
                            <div className="text-xs text-emerald-300/80">Total Value:</div>
                            <div className="text-2xl font-bold text-emerald-50">
                              ${parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue).toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-emerald-300/80">Total Return:</div>
                            <div className="text-lg font-semibold text-emerald-100">
                              {((parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue) - 10000) / 10000 * 100).toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Without Reinvestment (Shadow Portfolio) */}
                      <div className="rounded-lg bg-slate-800/60 p-4 border border-slate-600/40">
                        <div className="text-xs text-slate-300 mb-1">❌ Without Reinvestment</div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-slate-400">Portfolio Value:</div>
                            <div className="text-xl font-bold text-white">
                              ${(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue - sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowDividendCash).toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400">+ Cash (sitting idle):</div>
                            <div className="text-lg font-semibold text-slate-200">
                              ${sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowDividendCash?.toFixed(2) || '0.00'}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-slate-600/50">
                            <div className="text-xs text-slate-400">Total Value:</div>
                            <div className="text-2xl font-bold text-amber-200">
                              ${sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue?.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400">Total Return:</div>
                            <div className="text-lg font-semibold text-slate-200">
                              {((sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue - 10000) / 10000 * 100).toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Impact Summary */}
                    <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-400/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-red-200">
                          {(parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue) - sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue) > 0 
                            ? "✅ Benefit of Reinvestment:" 
                            : "⚠️ Market Timing Effect:"}
                        </span>
                        <span className="text-xl font-bold text-red-100">
                          ${Math.abs(parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue) - sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue).toFixed(2)}
                        </span>
                      </div>
                      {(parseFloat(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue) - sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].shadowPortfolioValue) > 0 ? (
                        <p className="text-xs text-emerald-200/80 mt-1">
                          Dividend reinvestment added value through compounding returns.
                        </p>
                      ) : (
                        <div className="text-xs text-amber-200/90 mt-2 space-y-1">
                          <p className="font-semibold">
                            📊 Sequence-of-Returns Risk: In this period, holding cash actually preserved more value.
                          </p>
                          <p>
                            When prices declined after dividend payments, reinvesting bought shares that subsequently lost value. 
                            This is typical in bear markets. Over longer periods and full market cycles, 
                            reinvestment typically wins due to compounding, but timing matters!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
              )}
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

            {/* Portfolio Allocation Pie Chart */}
            <div className="mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Current Portfolio Allocation</h2>
              {sinceCreationRebalancingData.length > 0 ? (
                <>
                  <p className="text-sm text-slate-300 mb-4">
                    As of {new Date(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].date).toLocaleDateString()} (last rebalance)
                  </p>
                  <AllocationPieChart weights={sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].weightChanges.map((wc: any) => ({
                    ticker: wc.symbol,
                    name: wc.symbol,
                    weight: wc.afterWeight,
                    riskContribution: wc.afterWeight
                  }))} />
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-300 mb-4">Target allocation (no rebalancing data yet)</p>
                  <AllocationPieChart weights={p.proposalHoldings.map(h => ({
                    ticker: h.symbol,
                    name: h.symbol,
                    weight: h.weight.toString(),
                    riskContribution: h.weight.toString()
                  }))} />
                </>
              )}
            </div>

            {/* Holdings Table */}
            <div className="rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-4">Current Portfolio Holdings</h2>
              {sinceCreationRebalancingData.length > 0 && (
                <p className="text-sm text-slate-300 mb-4">
                  As of {new Date(sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].date).toLocaleDateString()} • 
                  Portfolio Value: ${sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].portfolioValue}
                </p>
              )}
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
                  {(sinceCreationRebalancingData.length > 0 
                    ? sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1].weightChanges.map((wc: any) => ({
                        symbol: wc.symbol,
                        weight: parseFloat(wc.afterWeight),
                        note: `Drift: ${wc.drift}% • Rebalanced from ${wc.beforeWeight}%`
                      }))
                    : p.proposalHoldings
                  ).map((h: any, i: number) => (
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

            {/* Correlation Matrix */}
            {p.proposalSummary && (
              <div className="mt-8 mb-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-4">Asset Correlation Matrix</h2>
                <p className="text-sm text-slate-300 mb-4">
                  Shows how assets move together. Lower correlations = better diversification.
                </p>
                <div className="mb-4 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3">
                  <p className="text-xs text-purple-200">
                    <strong>Note:</strong> Correlations calculated using price returns only (excluding dividends). 
                    This provides a more accurate measure of how assets move together, as dividends are predictable 
                    scheduled payments, not market volatility.
                  </p>
                </div>
                
                {loadingSinceCreation ? (
                  <div className="text-center py-8">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-purple-500"></div>
                    <p className="text-sm text-slate-300 mt-2">Loading correlation data...</p>
                  </div>
                ) : (() => {
                  const hasRebalanceData = sinceCreationRebalancingData.length > 0;
                  const lastRebalance = hasRebalanceData ? sinceCreationRebalancingData[sinceCreationRebalancingData.length - 1] : null;
                  const hasRebalanceCorr = lastRebalance?.correlationMatrix;
                  const hasSummaryCorr = p.proposalSummary?.correlationMatrix;
                  
                  console.log('Correlation Debug:', {
                    hasRebalanceData,
                    lastRebalance,
                    hasRebalanceCorr,
                    hasSummaryCorr,
                    proposalSummary: p.proposalSummary
                  });
                  
                  if (hasRebalanceCorr) {
                    return (
                      <>
                        <p className="text-sm text-slate-300 mb-4">
                          Updated at last rebalance: {new Date(lastRebalance.date).toLocaleDateString()}
                        </p>
                        <CorrelationMatrixDisplay 
                          holdings={p.proposalHoldings} 
                          correlationMatrix={lastRebalance.correlationMatrix}
                          avgCorrelation={lastRebalance.avgCorrelation}
                        />
                      </>
                    );
                  } else if (hasSummaryCorr) {
                    return (
                      <>
                        <p className="text-sm text-slate-300 mb-4">
                          Initial correlation matrix from portfolio creation ({p.proposalSummary.lookbackPeriod || '5y'} lookback)
                        </p>
                        <CorrelationMatrixDisplay 
                          holdings={p.proposalHoldings} 
                          correlationMatrix={p.proposalSummary.correlationMatrix}
                          avgCorrelation={p.proposalSummary.avgCorrelation || "N/A"}
                        />
                      </>
                    );
                  } else {
                    return (
                      <div className="text-center py-8 text-slate-400">
                        <p>Correlation data will be available after the first rebalancing period</p>
                        <p className="text-xs mt-2">Debug: No correlation matrix found in rebalance or summary data</p>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
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

function CorrelationMatrixDisplay({ holdings, correlationMatrix, avgCorrelation }: { holdings: any[], correlationMatrix: number[][], avgCorrelation: string }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left text-slate-200">Asset</th>
              {holdings.map((h) => (
                <th key={h.symbol} className="p-2 text-center text-slate-200 font-medium">
                  {h.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlationMatrix.map((row: number[], i: number) => (
              <tr key={i} className="border-t border-slate-600/30">
                <td className="p-2 font-medium text-white">
                  {holdings[i].symbol}
                </td>
                {row.map((corr: number, j: number) => (
                  <td
                    key={j}
                    className="p-2 text-center font-semibold"
                    style={{
                      backgroundColor: corr > 0 
                        ? `rgba(239, 68, 68, ${0.3 + Math.abs(corr) * 0.7})` // Red for positive
                        : `rgba(34, 197, 94, ${0.3 + Math.abs(corr) * 0.7})`, // Green for negative
                      color: Math.abs(corr) > 0.3 ? 'white' : 'rgba(255,255,255,0.95)'
                    }}
                  >
                    {corr.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-3 rounded" style={{background: 'rgba(34, 197, 94, 1)'}}></div>
            <span className="text-slate-300">Negative (diversifies)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-3 rounded" style={{background: 'rgba(239, 68, 68, 1)'}}></div>
            <span className="text-slate-300">Positive (moves together)</span>
          </div>
        </div>
        {avgCorrelation && (
          <span className="text-slate-200 font-semibold">
            Avg Correlation: {avgCorrelation}
          </span>
        )}
      </div>
    </>
  );
}

const CHART_COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
];

function AllocationPieChart({ weights }: { weights: any[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = 360; // degrees in circle
  
  let currentAngle = 0;
  const segments = weights.map((w, i) => {
    const percentage = parseFloat(w.weight);
    const angle = (percentage / 100) * total;
    const segment = {
      ...w,
      percentage,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
    currentAngle += angle;
    return segment;
  });

  const radius = 80;
  const centerX = 100;
  const centerY = 100;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="200" height="200" viewBox="0 0 200 200" className="mb-4">
          {segments.map((segment, i) => {
            const startAngle = (segment.startAngle - 90) * (Math.PI / 180);
            const endAngle = (segment.endAngle - 90) * (Math.PI / 180);
            
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);
            
            const largeArc = segment.endAngle - segment.startAngle > 180 ? 1 : 0;
            
            const pathData = [
              `M ${centerX} ${centerY}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
              'Z'
            ].join(' ');
            
            return (
              <path
                key={i}
                d={pathData}
                fill={segment.color}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
                className="transition-all cursor-pointer"
                style={{
                  opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.4,
                  transform: hoveredIndex === i ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: '100px 100px',
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>
        
        {/* Center label */}
        {hoveredIndex !== null && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <div className="text-xs font-semibold text-white">{segments[hoveredIndex].ticker}</div>
            <div className="text-lg font-bold text-white">{segments[hoveredIndex].percentage.toFixed(1)}%</div>
          </div>
        )}
      </div>
      
      <div className="w-full space-y-2">
        {weights.map((w, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between text-sm transition-opacity cursor-pointer"
            style={{ opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.5 }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="font-medium text-white">{w.ticker}</span>
            </div>
            <span className="text-slate-300">{w.weight}%</span>
          </div>
        ))}
      </div>
    </div>
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
