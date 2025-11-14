"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useUser } from "@clerk/nextjs";
import { updatePortfolio, getPortfolio } from "@/lib/portfolioStore";
import { CHART_COLORS, InfoIcon, SectionCard, StrategyCard, InfoBox } from "@/components/ui/portfolio-components";

function RiskBudgetingPageContent() {
  const pid = useSearchParams().get("pid");
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? "";

  // Asset classes with their ETF tickers
  const [assetClasses, setAssetClasses] = useState([
    // Core Asset Classes
    { id: "equities", name: "US Equities", ticker: "SPY", enabled: true, description: "S&P 500 Index", category: "Equity" },
    { id: "corporate", name: "Corporate Bonds", ticker: "LQD", enabled: true, description: "Investment Grade", category: "Fixed Income" },
    { id: "sovereign", name: "Sovereign Bonds", ticker: "IEF", enabled: true, description: "7-10 Year Treasury", category: "Fixed Income" },
    { id: "commodities", name: "Commodities", ticker: "DBC", enabled: true, description: "Broad Commodity Index", category: "Alternatives" },
    
    // Additional Equity
    { id: "smallcap", name: "US Small Cap", ticker: "IWM", enabled: false, description: "Russell 2000", category: "Equity" },
    { id: "intl", name: "International Equities", ticker: "EFA", enabled: false, description: "Developed Markets ex-US", category: "Equity" },
    
    // Additional Fixed Income
    { id: "treasury-short", name: "Short-Term Treasuries", ticker: "SHY", enabled: false, description: "1-3 Year Treasury", category: "Fixed Income" },
    { id: "treasury-long", name: "Long-Term Treasuries", ticker: "TLT", enabled: false, description: "20+ Year Treasury", category: "Fixed Income" },
    { id: "highyield", name: "High Yield Bonds", ticker: "HYG", enabled: false, description: "Corporate Junk Bonds", category: "Fixed Income" },
    { id: "tips", name: "TIPS", ticker: "TIP", enabled: false, description: "Inflation-Protected", category: "Fixed Income" },
    
    // Alternatives
    { id: "reits", name: "Real Estate", ticker: "VNQ", enabled: false, description: "US REITs", category: "Alternatives" },
    { id: "gold", name: "Gold", ticker: "GLD", enabled: false, description: "Physical Gold", category: "Alternatives" },
    { id: "energy", name: "Energy", ticker: "XLE", enabled: false, description: "Energy Sector", category: "Alternatives" },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [useCustomBudgets, setUseCustomBudgets] = useState(false);
  const [customBudgets, setCustomBudgets] = useState<Record<string, number>>({});
  const [targetVolatility, setTargetVolatility] = useState<number | null>(null);
  const [useVolatilityTarget, setUseVolatilityTarget] = useState(false);
  const [lookbackPeriod, setLookbackPeriod] = useState<'3m' | '1y' | '3y' | '5y'>('5y');
  const [includeDividends, setIncludeDividends] = useState(true);

  function toggleAsset(id: string) {
    setAssetClasses(prev =>
      prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)
    );
  }

  function updateCustomBudget(id: string, value: number) {
    setCustomBudgets(prev => ({ ...prev, [id]: value }));
  }

  function distributeEvenly() {
    const enabled = assetClasses.filter(a => a.enabled);
    const equalBudget = 100 / enabled.length;
    const newBudgets: Record<string, number> = {};
    enabled.forEach(a => {
      newBudgets[a.id] = parseFloat(equalBudget.toFixed(2));
    });
    setCustomBudgets(newBudgets);
  }

  async function handleGenerate() {
    console.log("=== HANDLE GENERATE CALLED ===");
    setError(null);
    setResults(null); // Clear previous results
    
    const enabled = assetClasses.filter(a => a.enabled);
    console.log("Enabled assets:", enabled);
    
    if (enabled.length < 2) {
      setError("Please select at least 2 asset classes");
      return;
    }

    // Validate custom budgets if enabled
    if (useCustomBudgets) {
      const budgetSum = enabled.reduce((sum, a) => sum + (customBudgets[a.id] || 0), 0);
      if (Math.abs(budgetSum - 100) > 0.01) {
        setError(`Risk budgets must sum to 100%. Current sum: ${budgetSum.toFixed(2)}%`);
        return;
      }
    }

    try {
      setLoading(true);
      
      const payload = { 
        assetClasses: enabled.map(a => ({ ticker: a.ticker, name: a.name })),
        customBudgets: useCustomBudgets 
          ? enabled.map(a => customBudgets[a.id] || 0)
          : undefined,
        targetVolatility: useVolatilityTarget && targetVolatility 
          ? targetVolatility / 100 // Convert to decimal
          : undefined,
        lookbackPeriod: lookbackPeriod,
        includeDividends: includeDividends
      };
      
      console.log("Calling API with payload:", payload);
      
      // Call the risk budgeting API
      const res = await fetch("/api/risk-budgeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      console.log("API response status:", res.status);
      console.log("API response headers:", res.headers);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error("API error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${res.status}` };
        }
        console.error("API error:", errorData);
        throw new Error(errorData.error || `Server error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log("=== API RESPONSE DATA ===", data);
      setResults(data);
    } catch (e: any) {
      console.error("=== ERROR IN HANDLE GENERATE ===", e);
      setError(e.message || "Failed to generate portfolio");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!pid || !userId || !results) return;

    try {
      setSaving(true);

      // Convert results to holdings format compatible with portfolio store
      const holdings = results.weights.map((w: any) => ({
        symbol: w.ticker,
        weight: parseFloat(w.weight),
        note: `${w.name} • Risk Contribution: ${w.riskContribution}%`,
      }));

      // Create a summary object with risk budgeting details
      const summary = {
        methodology: useCustomBudgets ? "Custom Risk Budgeting" : "Equal Risk Contribution (ERC)",
        portfolioVolatility: `${results.metrics.portfolioVolatility}%`,
        sharpeRatio: results.metrics.sharpeRatio,
        expectedReturn: `${results.metrics.expectedReturn}%`,
        maxDrawdown: `${results.metrics.maxDrawdown}%`,
        dataAsOf: results.asOf,
        lookbackPeriod: lookbackPeriod,
        optimization: {
          converged: results.optimization?.converged,
          iterations: results.optimization?.iterations,
        },
        customBudgets: useCustomBudgets ? customBudgets : undefined,
        volatilityTargeting: results.volatilityTargeting || undefined,
        correlationMatrix: results.correlationMatrix || undefined,
        avgCorrelation: results.avgCorrelation || undefined,
      };

      // Update the portfolio with the risk budgeting results
      updatePortfolio(userId, pid, {
        proposalHoldings: holdings,
        proposalSummary: summary,
      });

      // Navigate to dashboard detail page
      router.push(`/dashboard/${pid}`);
    } catch (e: any) {
      console.error("Error saving portfolio:", e);
      setError(e.message || "Failed to save portfolio");
    } finally {
      setSaving(false);
    }
  }

  if (!pid) {
    if (typeof window !== "undefined") router.replace("/dashboard");
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-3">Risk Budgeting Portfolio</h1>
        <p className="text-lg text-slate-200 font-medium">
          Institutional-grade multi-asset allocation using quantitative risk management
        </p>

        {/* Quick Strategy Presets */}
        <SectionCard className="mt-8">
          <h2 className="text-xl font-bold mb-5 text-white">Quick Start: Choose a Strategy</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <StrategyCard
              icon="🛡️"
              title="Conservative"
              description="Capital preservation focused. Low volatility, stable income."
              features={[
                "100% Fixed Income",
                "Government & Corporate Bonds",
                "Natural allocation (no leverage)",
                "Best for: Retirees, risk-averse"
              ]}
              borderColor="emerald"
              onClick={() => {
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['sovereign', 'treasury-short', 'corporate', 'tips'].includes(a.id)
                })));
                setUseVolatilityTarget(false);
              }}
            />
            <StrategyCard
              icon="⚖️"
              title="Balanced"
              description="Classic diversified approach. Growth with downside protection."
              features={[
                "Stocks, Bonds & Commodities",
                "Risk-balanced allocation",
                "Natural allocation (no leverage)",
                "Best for: Long-term investors"
              ]}
              borderColor="blue"
              onClick={() => {
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['equities', 'corporate', 'sovereign', 'commodities'].includes(a.id)
                })));
                setUseVolatilityTarget(false);
              }}
            />
            <StrategyCard
              icon="🚀"
              title="Aggressive"
              description="Maximum growth potential. Higher risk, higher returns."
              features={[
                "100% Global Equities",
                "US, International & Emerging",
                "Natural allocation (no leverage)",
                "Best for: Young, growth-focused"
              ]}
              borderColor="rose"
              onClick={() => {
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['equities', 'smallcap', 'intl', 'reits', 'commodities'].includes(a.id)
                })));
                setUseVolatilityTarget(false);
              }}
            />
          </div>
        </SectionCard>

        {/* Strategy Summary Badge */}
        {(useCustomBudgets || useVolatilityTarget) && (
          <div className="mt-4 inline-flex flex-wrap gap-2">
            {useCustomBudgets && (
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 border border-blue-500/30 text-sm font-medium">
                🎯 Custom Risk Budgets
              </span>
            )}
            {useVolatilityTarget && targetVolatility && (
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30 text-sm font-medium">
                📊 Target Vol: {targetVolatility}%
              </span>
            )}
          </div>
        )}

        {/* Asset Class Selection */}
        <SectionCard className="mt-8">
          <h2 className="text-xl font-bold mb-4 text-white">Select Asset Classes</h2>
          <p className="text-sm text-slate-200 mb-4">
            Choose at least 2 asset classes. Each will contribute equally to portfolio risk.
            Start with the 4 core assets (already selected) or customize your allocation.
          </p>
          
          {/* Category-based selection */}
          {["Equity", "Fixed Income", "Alternatives"].map((category) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
                {category}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assetClasses
                  .filter((a) => a.category === category)
                  .map((asset) => (
                    <label
                      key={asset.id}
                      className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                        asset.enabled
                          ? "border-slate-400/60 bg-slate-700/50"
                          : "border-slate-600/40 bg-slate-800/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={asset.enabled}
                        onChange={() => toggleAsset(asset.id)}
                        className="mt-1 h-5 w-5 rounded"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-white">{asset.name}</div>
                        <div className="text-sm text-slate-300">
                          {asset.ticker} • {asset.description}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          ))}
          
          {/* Quick actions */}
          <div className="mt-4 pt-4 border-t border-slate-600/30 flex flex-wrap gap-2">
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ ...a, enabled: true })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
            >
              Select All
            </button>
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ ...a, enabled: false })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
            >
              Deselect All
            </button>
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ 
                ...a, 
                enabled: a.id === "equities" || a.id === "corporate" || a.id === "sovereign" || a.id === "commodities" 
              })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
            >
              Reset to Core 4
            </button>
            <span className="ml-auto text-sm text-slate-200 self-center font-medium">
              {assetClasses.filter(a => a.enabled).length} selected
            </span>
          </div>
        </SectionCard>

        {/* Return Calculation Toggle */}
        <SectionCard className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Return Calculation</h2>
              <p className="text-sm text-slate-200 mt-1">
                {includeDividends 
                  ? "Including dividend yields in all return calculations (automatically reinvested, recommended)"
                  : "Price returns only (excludes dividend income)"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-slate-200">Include Dividends</span>
              <input
                type="checkbox"
                checked={includeDividends}
                onChange={(e) => setIncludeDividends(e.target.checked)}
                className="h-5 w-5 rounded"
              />
            </label>
          </div>

          <InfoBox variant="emerald">
            <p>
              <strong>Dividends Matter:</strong> ETFs like SPY (~1.5% yield), LQD (~3-4% yield), and TLT (~2-3% yield) 
              pay regular dividends. Dividends are automatically reinvested to buy additional shares. 
              Over 5 years, this can add 10-20% to total returns. 
              {includeDividends 
                ? " ✓ We're including them for accurate performance measurement."
                : " ⚠️ Excluding dividends will underestimate true returns."}
            </p>
          </InfoBox>
        </SectionCard>

        {/* Volatility Targeting Section */}
        <div className="mt-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Analysis Time Period</h2>
              <p className="text-sm text-slate-200 mt-1">
                Historical data lookback for all calculations (returns, volatility, correlations, max drawdown)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: '1y', label: 'Last Year', description: '1 year', days: '~252 days' },
              { value: '3y', label: 'Last 3 Years', description: '3 years', days: '~756 days' },
              { value: '5y', label: 'Last 5 Years', description: '5 years', days: '~1,260 days' },
            ].map((period) => (
              <button
                key={period.value}
                onClick={() => setLookbackPeriod(period.value as any)}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  lookbackPeriod === period.value
                    ? 'border-emerald-400 bg-emerald-500/20'
                    : 'border-slate-600/40 bg-slate-800/40 hover:bg-slate-700/50'
                }`}
              >
                <div className="font-semibold text-base mb-1">{period.label}</div>
                <div className="text-xs text-slate-300">{period.description}</div>
                <div className="text-xs text-slate-400 mt-1">{period.days}</div>
              </button>
            ))}
          </div>

          <InfoBox variant="blue">
            <p>
              <strong>Tip:</strong> Shorter periods (1y) capture recent market conditions. 
              Longer periods (3y, 5y) provide more stable estimates but may include outdated correlations.
              {lookbackPeriod === '1y' && ' Good balance of recency and statistical reliability.'}
              {lookbackPeriod === '3y' && ' Captures full market cycle with recent regime.'}
              {lookbackPeriod === '5y' && ' Most statistically robust, includes multiple market environments.'}
            </p>
          </InfoBox>
        </div>

        {/* Volatility Targeting Section */}
        <div className="mt-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Volatility Target</h2>
              <p className="text-sm text-slate-200 mt-1">
                {useVolatilityTarget 
                  ? "Portfolio will be scaled to achieve your target volatility level"
                  : "Portfolio uses natural volatility from optimization (default)"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-slate-200">Target Vol</span>
              <input
                type="checkbox"
                checked={useVolatilityTarget}
                onChange={(e) => {
                  setUseVolatilityTarget(e.target.checked);
                  if (e.target.checked && !targetVolatility) {
                    setTargetVolatility(10); // Default to 10% volatility
                  }
                }}
                className="h-5 w-5 rounded"
              />
            </label>
          </div>

          {useVolatilityTarget && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-500/30 bg-slate-700/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-white">Target Annual Volatility</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      step="0.5"
                      value={targetVolatility || 10}
                      onChange={(e) => setTargetVolatility(parseFloat(e.target.value) || 10)}
                      className="w-20 rounded-lg border border-slate-400 bg-white text-slate-900 px-2 py-1 text-right outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <span className="text-slate-200">%</span>
                  </div>
                </div>
                
                {/* Volatility slider */}
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="0.5"
                  value={targetVolatility || 10}
                  onChange={(e) => setTargetVolatility(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/20"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${((targetVolatility || 10) / 50) * 100}%, rgba(255,255,255,0.2) ${((targetVolatility || 10) / 50) * 100}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
                
                {/* Volatility guidance */}
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-white/70">
                  <div className="text-center">
                    <div className="font-semibold text-emerald-300">5-8%</div>
                    <div>Conservative</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-blue-300">8-12%</div>
                    <div>Moderate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-amber-300">12-18%</div>
                    <div>Growth</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-rose-300">18%+</div>
                    <div>Aggressive</div>
                  </div>
                </div>
              </div>

              <InfoBox variant="blue">
                <p>
                  Volatility targeting scales portfolio exposure (via leverage or cash) to achieve your desired volatility level. 
                  The risk budgeting remains unchanged, but position sizes are adjusted proportionally.
                </p>
              </InfoBox>
            </div>
          )}
        </div>

        {/* Custom Risk Budgets Section */}
        <div className="mt-6 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Risk Budget Allocation</h2>
              <p className="text-sm text-slate-200 mt-1">
                {useCustomBudgets 
                  ? "Specify how much risk each asset should contribute (must sum to 100%)"
                  : "Using equal risk contribution (default)"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-slate-200">Custom</span>
              <input
                type="checkbox"
                checked={useCustomBudgets}
                onChange={(e) => {
                  setUseCustomBudgets(e.target.checked);
                  if (e.target.checked) {
                    distributeEvenly(); // Initialize with equal budgets
                  }
                }}
                className="h-5 w-5 rounded"
              />
            </label>
          </div>

          {useCustomBudgets && (
            <div className="space-y-4">
              {/* Budget inputs */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assetClasses
                  .filter(a => a.enabled)
                  .map((asset) => {
                    const budget = customBudgets[asset.id] || 0;
                    return (
                      <div key={asset.id} className="rounded-xl border border-white/20 bg-white/5 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{asset.ticker}</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={budget}
                            onChange={(e) => updateCustomBudget(asset.id, parseFloat(e.target.value) || 0)}
                            className="w-20 rounded-lg border border-white/30 bg-white/90 text-[var(--bg-end)] px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-white/30"
                          />
                          <span className="text-sm text-white/70">%</span>
                        </div>
                        {/* Visual bar */}
                        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-400 transition-all"
                            style={{ width: `${Math.min(budget, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Sum indicator */}
              <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/5 p-4">
                <span className="font-semibold">Total Risk Budget</span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${
                    Math.abs(assetClasses.filter(a => a.enabled).reduce((sum, a) => sum + (customBudgets[a.id] || 0), 0) - 100) < 0.01
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}>
                    {assetClasses.filter(a => a.enabled).reduce((sum, a) => sum + (customBudgets[a.id] || 0), 0).toFixed(2)}%
                  </span>
                  {Math.abs(assetClasses.filter(a => a.enabled).reduce((sum, a) => sum + (customBudgets[a.id] || 0), 0) - 100) < 0.01 ? (
                    <svg className="w-5 h-5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Quick presets */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-white uppercase tracking-wide">
                  Preset Strategies
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={distributeEvenly}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
                  >
                    📊 Equal (Default)
                  </button>
                  <button
                    onClick={() => {
                      const enabled = assetClasses.filter(a => a.enabled);
                      const newBudgets: Record<string, number> = {};
                      // Conservative: Low equity risk, high bonds
                      enabled.forEach(a => {
                        if (a.category === "Equity") newBudgets[a.id] = 20;
                        else if (a.category === "Fixed Income") newBudgets[a.id] = 70;
                        else newBudgets[a.id] = 10;
                      });
                      const sum = Object.values(newBudgets).reduce((s, v) => s + v, 0);
                      Object.keys(newBudgets).forEach(k => {
                        newBudgets[k] = parseFloat(((newBudgets[k] / sum) * 100).toFixed(2));
                      });
                      setCustomBudgets(newBudgets);
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
                  >
                    🛡️ Conservative Pension
                  </button>
                  <button
                    onClick={() => {
                      const enabled = assetClasses.filter(a => a.enabled);
                      const newBudgets: Record<string, number> = {};
                      enabled.forEach(a => {
                        if (a.category === "Equity") newBudgets[a.id] = 40;
                        else if (a.category === "Fixed Income") newBudgets[a.id] = 40;
                        else newBudgets[a.id] = 20;
                      });
                      const sum = Object.values(newBudgets).reduce((s, v) => s + v, 0);
                      Object.keys(newBudgets).forEach(k => {
                        newBudgets[k] = parseFloat(((newBudgets[k] / sum) * 100).toFixed(2));
                      });
                      setCustomBudgets(newBudgets);
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
                  >
                    ⚖️ Balanced (60/40)
                  </button>
                  <button
                    onClick={() => {
                      const enabled = assetClasses.filter(a => a.enabled);
                      const newBudgets: Record<string, number> = {};
                      // All-Weather: Diversified across all risk factors
                      enabled.forEach(a => {
                        if (a.id === "equities") newBudgets[a.id] = 30;
                        else if (a.id === "treasury-long" || a.id === "sovereign") newBudgets[a.id] = 40;
                        else if (a.id === "commodities") newBudgets[a.id] = 15;
                        else if (a.id === "gold") newBudgets[a.id] = 15;
                        else if (a.category === "Equity") newBudgets[a.id] = 30;
                        else if (a.category === "Fixed Income") newBudgets[a.id] = 40;
                        else newBudgets[a.id] = 15;
                      });
                      const sum = Object.values(newBudgets).reduce((s, v) => s + v, 0);
                      Object.keys(newBudgets).forEach(k => {
                        newBudgets[k] = parseFloat(((newBudgets[k] / sum) * 100).toFixed(2));
                      });
                      setCustomBudgets(newBudgets);
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
                  >
                    🌍 All-Weather
                  </button>
                  <button
                    onClick={() => {
                      const enabled = assetClasses.filter(a => a.enabled);
                      const newBudgets: Record<string, number> = {};
                      enabled.forEach(a => {
                        if (a.category === "Equity") newBudgets[a.id] = 60;
                        else if (a.category === "Fixed Income") newBudgets[a.id] = 25;
                        else newBudgets[a.id] = 15;
                      });
                      const sum = Object.values(newBudgets).reduce((s, v) => s + v, 0);
                      Object.keys(newBudgets).forEach(k => {
                        newBudgets[k] = parseFloat(((newBudgets[k] / sum) * 100).toFixed(2));
                      });
                      setCustomBudgets(newBudgets);
                    }}
                    className="text-sm px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/60 transition"
                  >
                    🚀 Aggressive Growth
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-6 py-3 font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Calculating..." : "Generate Portfolio"}
          </button>
          
          {error && (
            <p className="text-sm text-red-300">{error}</p>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-8 backdrop-blur text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Optimizing Portfolio...</h3>
            <p className="text-sm text-white/80">
              Fetching 5 years of historical data and calculating Equal Risk Contribution allocation
            </p>
          </div>
        )}

        {/* Results Section */}
        {results && (
          <div className="mt-8 space-y-6 animate-fadeIn">
            {/* Visual Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Allocation Pie Chart */}
              <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold mb-4">Portfolio Allocation</h2>
                <AllocationPieChart weights={results.weights} />
              </div>

              {/* Risk Contribution Bar Chart */}
              <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold mb-4">Risk Contributions</h2>
                <RiskContributionChart weights={results.weights} />
              </div>
            </div>

            {/* Volatility Targeting Info */}
            {results.volatilityTargeting && (
              <div className="rounded-2xl border border-purple-300/30 bg-purple-500/10 p-5 backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="text-purple-300 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-purple-200 mb-2">Volatility Targeting Active</h3>
                    <div className="grid gap-2 text-sm text-purple-100">
                      <div className="flex justify-between">
                        <span>Natural Portfolio Volatility:</span>
                        <span className="font-semibold">{results.volatilityTargeting.naturalVolatility}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Target Volatility:</span>
                        <span className="font-semibold text-purple-200">{results.volatilityTargeting.targetVolatility}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Scaling Factor:</span>
                        <span className="font-semibold">{results.volatilityTargeting.scalingFactor}x</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Position Sizing:</span>
                        <span className="font-semibold">{results.volatilityTargeting.leverage}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* Allocation Table */}
            <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Optimal Allocation</h2>
                <span className="text-sm text-white/70">
                  {results.weights.length} asset{results.weights.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {/* Comparison Insight */}
              <div className="mb-4 rounded-xl border border-blue-300/30 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-300 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 text-sm text-blue-100">
                    <strong>Notice:</strong> Weights are unequal, but risk contributions are equal. 
                    Lower-volatility assets get higher weights to contribute the same risk as higher-volatility assets.
                    {results.volatilityTargeting && parseFloat(results.volatilityTargeting.scalingFactor) > 1 && (
                      <span className="block mt-2">
                        <strong>Leverage:</strong> Weights sum to {results.weights.reduce((sum: number, w: any) => sum + parseFloat(w.weight), 0).toFixed(0)}% due to volatility targeting (requires {results.volatilityTargeting.leverage}).
                      </span>
                    )}
                    {results.volatilityTargeting && parseFloat(results.volatilityTargeting.scalingFactor) < 1 && (
                      <span className="block mt-2">
                        <strong>Cash Buffer:</strong> Weights sum to {results.weights.reduce((sum: number, w: any) => sum + parseFloat(w.weight), 0).toFixed(0)}% with {results.volatilityTargeting.leverage} to reduce volatility.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-white/80 border-b border-white/20">
                      <th className="py-3 pr-6">Asset Class</th>
                      <th className="py-3 pr-6">Ticker</th>
                      <th className="py-3 pr-6 text-right">Weight</th>
                      <th className="py-3 text-right">Risk Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.weights.map((item: any) => (
                      <tr key={item.ticker} className="border-b border-white/10">
                        <td className="py-3 pr-6 font-semibold">{item.name}</td>
                        <td className="py-3 pr-6 text-white/80">{item.ticker}</td>
                        <td className="py-3 pr-6 text-right font-semibold">{item.weight}%</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 rounded-full bg-white/20 w-20">
                              <div
                                className="h-full rounded-full bg-emerald-400"
                                style={{ width: `${item.riskContribution}%` }}
                              />
                            </div>
                            <span className="font-semibold">{item.riskContribution}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-6 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-emerald-300 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-emerald-200">
                      <strong>{useCustomBudgets ? "Custom Risk Budget achieved:" : "Equal Risk Contribution achieved:"}</strong>{" "}
                      {useCustomBudgets 
                        ? "Each asset contributes to portfolio risk according to your specified targets, optimizing weights to achieve the desired risk profile."
                        : `Each asset contributes equally (${(100 / results.weights.length).toFixed(2)}% ± 0.5%) to total portfolio risk, maximizing diversification while respecting each asset's risk characteristics.`
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Analytics Section */}
            {results.analytics && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold mt-8">📊 Advanced Analytics</h2>
                
                {/* Historical Backtest */}
                <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                  <h3 className="text-xl font-semibold mb-4">Historical Performance</h3>
                  
                  {/* Performance Chart */}
                  <div className="mb-6">
                    <PerformanceChart 
                      values={results.analytics.backtest.portfolioValues} 
                      dates={results.analytics.backtest.dates}
                    />
                  </div>
                  
                  {/* Backtest Metrics */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard 
                      label={results.includeDividends ? "Total Return (with dividends)" : "Total Return (price only)"} 
                      value={`${results.analytics.backtest.totalReturn}%`} 
                    />
                    <MetricCard label="Ann. Return" value={`${results.analytics.backtest.annualizedReturn}%`} />
                    <MetricCard label="Ann. Volatility" value={`${results.analytics.backtest.annualizedVolatility}%`} />
                    <MetricCard label="Sharpe Ratio" value={results.analytics.backtest.sharpeRatio} />
                    <MetricCard label="Max Drawdown" value={`${results.analytics.backtest.maxDrawdown}%`} />
                    <MetricCard label="Rebalances" value={results.analytics.backtest.rebalanceCount.toString()} />
                    <MetricCard 
                      label="Final Value" 
                      value={`$${results.analytics.backtest.finalValue}`} 
                    />
                    <MetricCard label="Initial Value" value="$10,000" />
                  </div>
                  
                  {/* Dividend Cash Info */}
                  {results.analytics.backtest.dividendCash && results.analytics.backtest.dividendCash > 0 && (
                    <div className="mt-4 p-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm font-semibold text-emerald-100">
                            {results.includeDividends 
                              ? "💰 Dividends Received & Reinvested:" 
                              : "💵 Dividend Cash Generated (sitting idle):"}
                          </span>
                        </div>
                        <span className="text-lg font-bold text-emerald-50">
                          ${results.analytics.backtest.dividendCash.toFixed(2)}
                        </span>
                      </div>
                      {results.includeDividends && (
                        <p className="text-xs text-emerald-200/80 mt-2">
                          These dividends were automatically reinvested to buy additional shares, compounding your returns over time.
                        </p>
                      )}
                      {!results.includeDividends && (
                        <p className="text-xs text-emerald-200/80 mt-2">
                          ⚠️ This cash is not included in the portfolio value above. Enable dividend reinvestment to see the full impact!
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Comparison: With vs Without Reinvestment (when OFF) */}
                  {!results.includeDividends && results.analytics.backtest.shadowPortfolioValue && (
                    <div className="mt-4 p-5 rounded-xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10">
                      <h4 className="text-base font-bold text-amber-100 mb-3 flex items-center gap-2">
                        <span>⚡</span> Opportunity Cost Analysis
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {/* Current Strategy (No Reinvestment) */}
                        <div className="rounded-lg bg-slate-800/60 p-4 border border-slate-600/40">
                          <div className="text-xs text-slate-300 mb-1">❌ Without Reinvestment</div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs text-slate-400">Portfolio Value:</div>
                              <div className="text-xl font-bold text-white">${results.analytics.backtest.finalValue}</div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">+ Cash (sitting idle):</div>
                              <div className="text-lg font-semibold text-slate-200">
                                ${results.analytics.backtest.dividendCash.toFixed(2)}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-slate-600/50">
                              <div className="text-xs text-slate-400">Total Value:</div>
                              <div className="text-2xl font-bold text-amber-200">
                                ${(parseFloat(results.analytics.backtest.finalValue) + results.analytics.backtest.dividendCash).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-400">Total Return:</div>
                              <div className="text-lg font-semibold text-slate-200">
                                {((parseFloat(results.analytics.backtest.finalValue) + results.analytics.backtest.dividendCash - 10000) / 10000 * 100).toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* With Reinvestment (Shadow Portfolio) */}
                        <div className="rounded-lg bg-emerald-900/40 p-4 border-2 border-emerald-400/50 shadow-lg">
                          <div className="text-xs text-emerald-200 mb-1 flex items-center gap-1.5">
                            <span>✅ With Reinvestment</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/30 border border-emerald-400/40">Recommended</span>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs text-emerald-300/80">Portfolio Value:</div>
                              <div className="text-xl font-bold text-emerald-50">
                                ${results.analytics.backtest.shadowPortfolioValue.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-emerald-300/80">Dividends reinvested:</div>
                              <div className="text-lg font-semibold text-emerald-100">
                                ${results.analytics.backtest.dividendCashIfReinvested?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-emerald-500/30">
                              <div className="text-xs text-emerald-300/80">Total Value:</div>
                              <div className="text-2xl font-bold text-emerald-50">
                                ${results.analytics.backtest.shadowPortfolioValue.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-emerald-300/80">Total Return:</div>
                              <div className="text-lg font-semibold text-emerald-100">
                                {results.analytics.backtest.shadowTotalReturn?.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Impact Summary */}
                      <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-400/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-red-200">
                            {(results.analytics.backtest.shadowPortfolioValue - (parseFloat(results.analytics.backtest.finalValue) + results.analytics.backtest.dividendCash)) > 0 
                              ? "💸 You're Missing Out:" 
                              : "⚠️ Interesting Market Dynamic:"}
                          </span>
                          <span className="text-xl font-bold text-red-100">
                            ${Math.abs(results.analytics.backtest.shadowPortfolioValue - (parseFloat(results.analytics.backtest.finalValue) + results.analytics.backtest.dividendCash)).toFixed(2)}
                          </span>
                        </div>
                        {(results.analytics.backtest.shadowPortfolioValue - (parseFloat(results.analytics.backtest.finalValue) + results.analytics.backtest.dividendCash)) > 0 ? (
                          <p className="text-xs text-red-200/70 mt-1">
                            By not reinvesting dividends, you're leaving money on the table due to lost compounding.
                          </p>
                        ) : (
                          <div className="text-xs text-amber-200/90 mt-2 space-y-1">
                            <p className="font-semibold">
                              📊 Sequence-of-Returns Risk: In this backtest period, holding cash actually preserved more value.
                            </p>
                            <p>
                              When prices declined after dividend payments, reinvesting bought shares that subsequently lost value. 
                              This is typical in bear markets (like 2022&apos;s bond decline). Over longer periods and full market cycles, 
                              DRIP typically wins due to compounding, but timing matters!
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 text-sm text-white/70">
                    Worst Period: {results.analytics.backtest.maxDrawdownPeriod.start} to {results.analytics.backtest.maxDrawdownPeriod.end} ({results.analytics.backtest.maxDrawdown}% decline)
                  </div>
                  
                  {/* Rebalancing Timeline */}
                  {results.analytics.backtest.rebalanceDates && results.analytics.backtest.rebalanceDates.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/20">
                      <h4 className="font-semibold mb-3">Rebalancing Timeline</h4>
                      <p className="text-sm text-white/70 mb-4">
                        Portfolio was rebalanced {results.analytics.backtest.rebalanceCount} times (quarterly) to maintain risk balance. 
                        Each rebalance incurred 0.1% transaction costs.
                      </p>
                      <div className="max-h-60 overflow-y-auto space-y-2">
                        {results.analytics.backtest.rebalanceDates.map((rebalance: any, idx: number) => (
                          <div key={idx} className="rounded-lg bg-white/5 border border-white/10 p-3">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold">
                                Rebalance #{idx + 1} - {rebalance.date}
                              </span>
                              <span className="text-xs text-white/60">
                                Portfolio: ${rebalance.portfolioValue}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              {/* Column 1 & 2: Weight Changes */}
                              <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1">
                                {rebalance.changes && rebalance.changes.map((change: any, i: number) => (
                                  <div key={i} className="flex items-center gap-1.5 text-xs">
                                    <span className="text-white/70 font-medium min-w-[45px]">{change.ticker}:</span>
                                    <span className="text-white/90">
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
                              <div className="border-l border-white/20 pl-4 space-y-1">
                                {rebalance.quarterlyReturn !== undefined && (
                                  <div className="text-xs">
                                    <span className="text-white/60">Qtr Return:</span>{' '}
                                    <span className={`font-semibold ${
                                      parseFloat(rebalance.quarterlyReturn) >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                      {parseFloat(rebalance.quarterlyReturn) > 0 ? '+' : ''}{rebalance.quarterlyReturn}%
                                    </span>
                                  </div>
                                )}
                                {rebalance.volatility && (
                                  <div className="text-xs">
                                    <span className="text-white/60">Vol:</span>{' '}
                                    <span className="text-white/90 font-semibold">{rebalance.volatility}%</span>
                                  </div>
                                )}
                                {rebalance.sharpe && (
                                  <div className="text-xs">
                                    <span className="text-white/60">Sharpe:</span>{' '}
                                    <span className="text-white/90 font-semibold">{rebalance.sharpe}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Strategy Comparison */}
                <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                  <h3 className="text-xl font-semibold mb-4">Strategy Comparison</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-white/80 border-b border-white/20">
                          <th className="py-3 pr-6">Strategy</th>
                          <th className="py-3 pr-6 text-right">Return</th>
                          <th className="py-3 pr-6 text-right">Volatility</th>
                          <th className="py-3 pr-6 text-right">Sharpe</th>
                          <th className="py-3 text-right">Max DD</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-white/10 bg-emerald-500/10">
                          <td className="py-3 pr-6 font-semibold">Risk Budgeting</td>
                          <td className="py-3 pr-6 text-right font-semibold">{results.analytics.comparison.riskBudgeting.return}%</td>
                          <td className="py-3 pr-6 text-right">{results.analytics.comparison.riskBudgeting.volatility}%</td>
                          <td className="py-3 pr-6 text-right">{results.analytics.comparison.riskBudgeting.sharpe}</td>
                          <td className="py-3 text-right">{results.analytics.comparison.riskBudgeting.maxDrawdown}%</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 pr-6">Equal Weight</td>
                          <td className="py-3 pr-6 text-right">{results.analytics.comparison.equalWeight.return}%</td>
                          <td className="py-3 pr-6 text-right">{results.analytics.comparison.equalWeight.volatility}%</td>
                          <td className="py-3 pr-6 text-right">{results.analytics.comparison.equalWeight.sharpe}</td>
                          <td className="py-3 text-right">{results.analytics.comparison.equalWeight.maxDrawdown}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stress Testing */}
                <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
                  <h3 className="text-xl font-semibold mb-4">Stress Testing & Risk Analysis</h3>
                  
                  {/* Worst Historical Period */}
                  {results.analytics.stressTest?.worstPeriod && (
                    <div className="mb-6 rounded-xl border border-rose-300/30 bg-rose-500/10 p-4">
                      <h4 className="font-semibold text-rose-200 mb-2">Worst 30-Day Period</h4>
                      <div className="grid gap-2 text-sm text-rose-100">
                        <div className="flex justify-between">
                          <span>Period:</span>
                          <span className="font-semibold">
                            {results.analytics.stressTest.worstPeriod.start} to {results.analytics.stressTest.worstPeriod.end}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Loss:</span>
                          <span className="font-semibold">{results.analytics.stressTest.worstPeriod.loss}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Correlation Matrix */}
                  {results.correlationMatrix && (
                    <div className="rounded-xl border border-blue-300/30 bg-blue-500/10 p-4">
                      <h4 className="font-semibold text-blue-200 mb-3">Asset Correlation Matrix</h4>
                      <p className="text-xs text-blue-100 mb-2">
                        Shows how assets move together. Lower correlations = better diversification.
                      </p>
                      <div className="mb-3 rounded-lg border border-purple-300/30 bg-purple-500/10 p-2">
                        <p className="text-xs text-purple-200">
                          <strong>Note:</strong> Correlations calculated using price returns only (excluding dividends). 
                          This provides a more accurate measure of how assets move together, as dividends are predictable 
                          scheduled payments, not market volatility.
                        </p>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className="p-2 text-left text-blue-200/80">Asset</th>
                              {results.weights.map((w: any) => (
                                <th key={w.ticker} className="p-2 text-center text-blue-200/80 font-medium">
                                  {w.ticker}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {results.correlationMatrix.map((row: number[], i: number) => (
                              <tr key={i} className="border-t border-blue-300/20">
                                <td className="p-2 font-medium text-blue-100">
                                  {results.weights[i].ticker}
                                </td>
                                {row.map((corr: number, j: number) => (
                                  <td
                                    key={j}
                                    className="p-2 text-center font-semibold"
                                    style={{
                                      backgroundColor: corr > 0 
                                        ? `rgba(239, 68, 68, ${0.3 + Math.abs(corr) * 0.7})` // Red for positive (max 100%)
                                        : `rgba(34, 197, 94, ${0.3 + Math.abs(corr) * 0.7})`, // Green for negative (max 100%)
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
                      
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-3 rounded" style={{background: 'rgba(34, 197, 94, 1)'}}></div>
                            <span className="text-blue-100">Negative (diversifies)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-3 rounded" style={{background: 'rgba(239, 68, 68, 1)'}}></div>
                            <span className="text-blue-100">Positive (moves together)</span>
                          </div>
                        </div>
                        <span className="text-blue-100 font-semibold">
                          Avg Correlation: {results.avgCorrelation}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Regenerate
              </button>
              <button
                disabled={saving || !userId || !isLoaded}
                onClick={handleSave}
                className="rounded-xl bg-white text-[var(--bg-end)] px-5 py-3 font-semibold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save to Dashboard"}
              </button>
              {results.analytics && (
                <button
                  onClick={() => {
                    const reportData = JSON.stringify(results, null, 2);
                    const blob = new Blob([reportData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `risk-budgeting-report-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur hover:bg-white/20"
                >
                  📥 Download Report
                </button>
              )}
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-8">
          <Link
            href={`/portfolio/setup?pid=${pid}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/70 bg-white/10 px-5 py-3 font-semibold backdrop-blur transition hover:bg-white/20"
          >
            Back to Options
          </Link>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/5 p-4">
      <div className="text-sm text-white/70">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

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
            <div className="text-xs font-semibold">{segments[hoveredIndex].ticker}</div>
            <div className="text-lg font-bold">{segments[hoveredIndex].percentage.toFixed(1)}%</div>
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
              <span className="font-medium">{w.ticker}</span>
            </div>
            <span className="text-white/80">{w.weight}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Performance Chart Component
 * 
 * HOW THIS CHART WORKS:
 * =====================
 * Displays portfolio value over time as an interactive line chart

 * 
 * INPUT DATA:
 * - values: Array of portfolio values [10000, 10050, 10100, ...]
 * - dates: Corresponding dates ["2019-01-01", "2019-01-02", ...]
 * 
 * RENDERING PROCESS:
 * 
 * 1. DATA SAMPLING
 *    - 5 years of daily data = ~1,250 points
 *    - Too many to render smoothly
 *    - Solution: Sample every Nth point (e.g., every 12th day)
 *    - Result: ~100 points for smooth rendering
 * 
 * 2. COORDINATE CALCULATION
 *    - Map portfolio values to Y coordinates
 *    - Map time progression to X coordinates
 *    - Formula: y = height - (value - min) / range × height
 *    - This flips Y axis (SVG origin is top-left)
 * 
 * 3. SVG PATH GENERATION
 *    - Create path string: "M x1,y1 L x2,y2 L x3,y3..."
 *    - M = Move to (start)
 *    - L = Line to (subsequent points)
 * 
 * 4. VISUAL ELEMENTS
 *    - Grid lines: horizontal reference lines
 *    - Gradient fill: area under curve for visual appeal
 *    - Line stroke: main chart line
 *    - Hover point: circle that follows mouse
 *    - Tooltip: shows exact value and date
 * 
 * 5. INTERACTION
 *    - Invisible overlay captures mouse movement
 *    - Calculate closest data point to mouse
 *    - Show tooltip at that point
 *    - Smooth hover experience
 * 
 * WHY SVG INSTEAD OF CANVAS?
 * - Scalable (looks good at any size)
 * - Easy to add interactive elements
 * - CSS styling works naturally
 * - Accessibility-friendly
 */
function PerformanceChart({ values, dates }: { values: number[]; dates: string[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Sample data points for display (show every Nth point to avoid overcrowding)
  // With wider chart (1200px), we can show more points for smoother line
  // Example: 1,250 points → sample every 5 → 250 points
  const sampleRate = Math.ceil(values.length / 250);
  const sampledValues = values.filter((_, i) => i % sampleRate === 0);
  const sampledDates = dates.filter((_, i) => i % sampleRate === 0);
  
  // Calculate chart bounds with padding
  // Padding makes the chart look nicer (not touching edges)
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding = range * 0.1;
  
  const height = 350;
  const width = 1200;
  const topMargin = 60;
  const bottomMargin = 20;
  const leftMargin = 20;
  const rightMargin = 20;
  const chartWidth = width - leftMargin - rightMargin;
  const chartHeight = height - topMargin - bottomMargin;
  
  // Create SVG path
  // 
  // COORDINATE MAPPING:
  // Transform portfolio values into SVG coordinates
  // 
  // X-axis (Time): 
  //   - First point (i=0) → x=leftMargin (left edge with padding)
  //   - Last point (i=99) → x=width-rightMargin (right edge with padding)
  //   - Formula: x = leftMargin + (index / total) × chartWidth
  // 
  // Y-axis (Portfolio Value):
  //   - Flip coordinate system (SVG y=0 is top, but we want high values at top)
  //   - Normalize value to 0-1 range: (value - min) / range
  //   - Scale to height and flip: height - (normalized × height)
  //   - Example: $12,000 portfolio
  //     - Min = $9,500, Max = $12,500, Range = $3,000
  //     - Normalized = ($12,000 - $9,500) / $3,000 = 0.833
  //     - Y = 200 - (0.833 × 200) = 33 pixels from top
  const points = sampledValues.map((value, i) => {
    const x = leftMargin + (i / (sampledValues.length - 1)) * chartWidth;
    const normalizedValue = (value - minValue + padding) / (range + 2 * padding);
    const y = topMargin + chartHeight * (1 - normalizedValue);
    return { x, y, value, date: sampledDates[i] };
  });
  
  // Create SVG path string
  // Format: "M x1,y1 L x2,y2 L x3,y3..."
  // M = MoveTo (start of path)
  // L = LineTo (draw line to next point)
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  return (
    <div className="relative">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* 
          GRID LINES
          Purpose: Visual reference, makes it easier to read values
          Implementation: 5 horizontal lines at 0%, 25%, 50%, 75%, 100%
        */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={leftMargin}
            y1={topMargin + chartHeight * ratio}
            x2={width - rightMargin}
            y2={topMargin + chartHeight * ratio}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}
        
        {/* 
          AREA UNDER CURVE
          Purpose: Visual appeal, makes growth more obvious
          Implementation: 
          - Take the line path
          - Add line to bottom-right (L width-rightMargin, topMargin+chartHeight)
          - Add line to bottom-left (L leftMargin, topMargin+chartHeight)
          - Close path (Z)
          - Fill with gradient (green fading to transparent)
        */}
        <path
          d={`${pathData} L ${width - rightMargin} ${topMargin + chartHeight} L ${leftMargin} ${topMargin + chartHeight} Z`}
          fill="url(#gradient)"
          opacity="0.3"
        />
        
        {/* 
          MAIN LINE
          Purpose: Shows portfolio value over time
          Styling: 
          - Green color (#10b981 = emerald)
          - 2px width for visibility
          - Rounded caps/joins for smooth appearance
        */}
        <path
          d={pathData}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* 
          GRADIENT DEFINITION
          Purpose: Makes area fill fade from green at top to transparent at bottom
          This creates a beautiful "glow" effect under the line
        */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* 
          HOVER POINT
          Purpose: Shows exactly which point user is hovering over
          Only rendered when hoveredIndex is set (not null)
          Styled as circle with white outline for visibility
        */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <circle
            cx={points[hoveredIndex].x}
            cy={points[hoveredIndex].y}
            r="4"
            fill="#10b981"
            stroke="white"
            strokeWidth="2"
          />
        )}
      </svg>
      
      {/* 
        HOVER TOOLTIP
        Purpose: Shows exact portfolio value and date on hover
        
        Positioning:
        - left: Follows X position of hovered point
        - top: Follows Y position of hovered point
        - transform: Shifts tooltip to center it above the point
          - translate(-50%, -120%) = center horizontally, position above
        
        Styling:
        - Semi-transparent black background
        - White text for contrast
        - pointer-events-none = doesn't block mouse interaction
        
        Content:
        - Portfolio value (e.g., "$10,245.67")
        - Date (e.g., "2020-03-15")
      */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <div
          className="absolute bg-black/80 text-white px-3 py-2 rounded-lg text-sm pointer-events-none"
          style={{
            left: `${(points[hoveredIndex].x / width) * 100}%`,
            top: `${(points[hoveredIndex].y / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}
        >
          <div className="font-semibold">${points[hoveredIndex].value.toFixed(2)}</div>
          <div className="text-xs text-white/70">{points[hoveredIndex].date}</div>
        </div>
      )}
      
      {/* Invisible hover overlay */}
      <div
        className="absolute inset-0"
        style={{ cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const relativeX = (x / rect.width) * width;
          
          // Account for left margin and map to data points
          const chartX = relativeX - leftMargin;
          const normalizedX = Math.max(0, Math.min(1, chartX / chartWidth));
          const closestIndex = Math.round(normalizedX * (points.length - 1));
          
          setHoveredIndex(Math.max(0, Math.min(points.length - 1, closestIndex)));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      />
      
      {/* Y-axis labels */}
      <div className="mt-2 flex justify-between text-xs text-white/70">
        <span>${minValue.toFixed(0)}</span>
        <span className="text-center">Portfolio Value Over Time</span>
        <span>${maxValue.toFixed(0)}</span>
      </div>
    </div>
  );
}

function RiskContributionChart({ weights }: { weights: any[] }) {
  const maxRC = Math.max(...weights.map((w: any) => parseFloat(w.riskContribution)));

  return (
    <div className="space-y-3">
      {weights.map((w, i) => {
        const rc = parseFloat(w.riskContribution);
        const barWidth = (rc / maxRC) * 100;
        
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{w.ticker}</span>
              <span className="text-white/80">{w.riskContribution}%</span>
            </div>
            <div className="h-6 w-full rounded-lg bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                style={{ 
                  width: `${barWidth}%`,
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length]
                }}
              >
                {barWidth > 20 && (
                  <span className="text-xs font-semibold text-white">
                    {w.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      
      <div className="mt-4 pt-4 border-t border-white/20">
        <p className="text-xs text-white/70 text-center">
          Each bar represents the asset's contribution to total portfolio risk.
          {(() => {
            const rcs = weights.map((w: any) => parseFloat(w.riskContribution));
            const maxDiff = Math.max(...rcs) - Math.min(...rcs);
            return maxDiff < 1 
              ? " Equal heights = Equal Risk Contribution ✓"
              : " Custom risk budgets achieved ✓";
          })()}
        </p>
      </div>
    </div>
  );
}

export default function RiskBudgetingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    }>
      <RiskBudgetingPageContent />
    </Suspense>
  );
}
