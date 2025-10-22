"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useUser } from "@clerk/nextjs";
import { updatePortfolio, getPortfolio } from "@/lib/portfolioStore";

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
    { id: "emerging", name: "Emerging Markets", ticker: "EEM", enabled: false, description: "EM Equities", category: "Equity" },
    
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
        lookbackPeriod: lookbackPeriod
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
        optimization: {
          converged: results.optimization?.converged,
          iterations: results.optimization?.iterations,
        },
        customBudgets: useCustomBudgets ? customBudgets : undefined,
        volatilityTargeting: results.volatilityTargeting || undefined,
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
    <main className="min-h-screen bg-gradient-to-br from-[var(--bg-start)] to-[var(--bg-end)] text-white p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-extrabold">Risk Budgeting Portfolio</h1>
        <p className="mt-2 text-white/90">
          Institutional-grade multi-asset allocation using quantitative risk management
        </p>

        {/* Quick Strategy Presets */}
        <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <h2 className="text-lg font-semibold mb-4">Quick Start: Choose a Strategy</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Conservative */}
            <button
              onClick={() => {
                // Select conservative assets
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['sovereign', 'treasury-short', 'corporate', 'tips'].includes(a.id)
                })));
                // Don't force target volatility - let natural allocation work
                setUseVolatilityTarget(false);
              }}
              className="rounded-xl border-2 border-white/30 bg-white/5 p-4 text-left hover:bg-white/10 hover:border-emerald-400/50 transition group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🛡️</span>
                <span className="font-bold text-lg">Conservative</span>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Capital preservation focused. Low volatility, stable income.
              </p>
              <div className="space-y-1 text-xs text-white/60">
                <div>• 100% Fixed Income</div>
                <div>• Government & Corporate Bonds</div>
                <div>• Natural allocation (no leverage)</div>
                <div>• Best for: Retirees, risk-averse</div>
              </div>
            </button>

            {/* Balanced */}
            <button
              onClick={() => {
                // Select balanced assets
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['equities', 'corporate', 'sovereign', 'commodities'].includes(a.id)
                })));
                // Don't force target volatility - let natural allocation work
                setUseVolatilityTarget(false);
              }}
              className="rounded-xl border-2 border-white/30 bg-white/5 p-4 text-left hover:bg-white/10 hover:border-blue-400/50 transition group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⚖️</span>
                <span className="font-bold text-lg">Balanced</span>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Classic diversified approach. Growth with downside protection.
              </p>
              <div className="space-y-1 text-xs text-white/60">
                <div>• Stocks, Bonds & Commodities</div>
                <div>• Risk-balanced allocation</div>
                <div>• Natural allocation (no leverage)</div>
                <div>• Best for: Long-term investors</div>
              </div>
            </button>

            {/* Aggressive */}
            <button
              onClick={() => {
                // Select aggressive assets
                setAssetClasses(prev => prev.map(a => ({
                  ...a,
                  enabled: ['equities', 'smallcap', 'intl', 'emerging', 'reits', 'commodities'].includes(a.id)
                })));
                // Don't force target volatility - let natural allocation work
                setUseVolatilityTarget(false);
              }}
              className="rounded-xl border-2 border-white/30 bg-white/5 p-4 text-left hover:bg-white/10 hover:border-rose-400/50 transition group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🚀</span>
                <span className="font-bold text-lg">Aggressive</span>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Maximum growth potential. Higher risk, higher returns.
              </p>
              <div className="space-y-1 text-xs text-white/60">
                <div>• 100% Global Equities</div>
                <div>• US, International & Emerging</div>
                <div>• Natural allocation (no leverage)</div>
                <div>• Best for: Young, growth-focused</div>
              </div>
            </button>
          </div>
        </div>

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
        <div className="mt-8 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold mb-4">Select Asset Classes</h2>
          <p className="text-sm text-white/80 mb-4">
            Choose at least 2 asset classes. Each will contribute equally to portfolio risk.
            Start with the 4 core assets (already selected) or customize your allocation.
          </p>
          
          {/* Category-based selection */}
          {["Equity", "Fixed Income", "Alternatives"].map((category) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wide mb-3">
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
                          ? "border-white/40 bg-white/10"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={asset.enabled}
                        onChange={() => toggleAsset(asset.id)}
                        className="mt-1 h-5 w-5 rounded"
                      />
                      <div className="flex-1">
                        <div className="font-semibold">{asset.name}</div>
                        <div className="text-sm text-white/70">
                          {asset.ticker} • {asset.description}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          ))}
          
          {/* Quick actions */}
          <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap gap-2">
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ ...a, enabled: true })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
            >
              Select All
            </button>
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ ...a, enabled: false })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
            >
              Deselect All
            </button>
            <button
              onClick={() => setAssetClasses(prev => prev.map(a => ({ 
                ...a, 
                enabled: a.id === "equities" || a.id === "corporate" || a.id === "sovereign" || a.id === "commodities" 
              })))}
              className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
            >
              Reset to Core 4
            </button>
            <span className="ml-auto text-sm text-white/70 self-center">
              {assetClasses.filter(a => a.enabled).length} selected
            </span>
          </div>
        </div>

        {/* Volatility Targeting Section */}
        <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Analysis Time Period</h2>
              <p className="text-sm text-white/80 mt-1">
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
                    : 'border-white/20 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-semibold text-base mb-1">{period.label}</div>
                <div className="text-xs text-white/70">{period.description}</div>
                <div className="text-xs text-white/50 mt-1">{period.days}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-300/30 bg-blue-500/10 p-3">
            <div className="flex items-start gap-2 text-xs text-blue-100">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p>
                <strong>Tip:</strong> Shorter periods (1y) capture recent market conditions. 
                Longer periods (3y, 5y) provide more stable estimates but may include outdated correlations.
                {lookbackPeriod === '1y' && ' Good balance of recency and statistical reliability.'}
                {lookbackPeriod === '3y' && ' Captures full market cycle with recent regime.'}
                {lookbackPeriod === '5y' && ' Most statistically robust, includes multiple market environments.'}
              </p>
            </div>
          </div>
        </div>

        {/* Volatility Targeting Section */}
        <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Volatility Target</h2>
              <p className="text-sm text-white/80 mt-1">
                {useVolatilityTarget 
                  ? "Portfolio will be scaled to achieve your target volatility level"
                  : "Portfolio uses natural volatility from optimization (default)"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-white/90">Target Vol</span>
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
              <div className="rounded-xl border border-white/20 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Target Annual Volatility</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      step="0.5"
                      value={targetVolatility || 10}
                      onChange={(e) => setTargetVolatility(parseFloat(e.target.value) || 10)}
                      className="w-20 rounded-lg border border-white/30 bg-white/90 text-[var(--bg-end)] px-2 py-1 text-right outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <span className="text-white/90">%</span>
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

              <div className="rounded-xl border border-blue-300/30 bg-blue-500/10 p-3">
                <div className="flex items-start gap-2 text-xs text-blue-100">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p>
                    Volatility targeting scales portfolio exposure (via leverage or cash) to achieve your desired volatility level. 
                    The risk budgeting remains unchanged, but position sizes are adjusted proportionally.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom Risk Budgets Section */}
        <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Risk Budget Allocation</h2>
              <p className="text-sm text-white/80 mt-1">
                {useCustomBudgets 
                  ? "Specify how much risk each asset should contribute (must sum to 100%)"
                  : "Using equal risk contribution (default)"}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-white/90">Custom</span>
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
                <div className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                  Preset Strategies
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={distributeEvenly}
                    className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
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
                    className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
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
                    className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
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
                    className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
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
                    className="text-sm px-3 py-1.5 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 transition"
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
            className="rounded-xl bg-white text-[var(--bg-end)] px-6 py-3 font-semibold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
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

            {/* Key Metrics */}
            <div className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Portfolio Metrics</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {lookbackPeriod === '1y' && '1 Year'}
                    {lookbackPeriod === '3y' && '3 Years'}
                    {lookbackPeriod === '5y' && '5 Years'}
                  </span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Data
                  </span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Portfolio Volatility"
                  value={`${results.metrics.portfolioVolatility}%`}
                />
                <MetricCard
                  label="Sharpe Ratio"
                  value={results.metrics.sharpeRatio}
                />
                <MetricCard
                  label="Expected Return"
                  value={`${results.metrics.expectedReturn}%`}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={`${results.metrics.maxDrawdown}%`}
                />
              </div>
              <p className="mt-4 text-xs text-white/60">
                Based on 5-year historical data as of {results.asOf}
                {results.optimization && (
                  <> • Optimization {results.optimization.converged ? 'converged' : 'completed'} in {results.optimization.iterations} iterations</>
                )}
              </p>
            </div>

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
                    <MetricCard label="Total Return" value={`${results.analytics.backtest.totalReturn}%`} />
                    <MetricCard label="Ann. Return" value={`${results.analytics.backtest.annualizedReturn}%`} />
                    <MetricCard label="Ann. Volatility" value={`${results.analytics.backtest.annualizedVolatility}%`} />
                    <MetricCard label="Sharpe Ratio" value={results.analytics.backtest.sharpeRatio} />
                    <MetricCard label="Max Drawdown" value={`${results.analytics.backtest.maxDrawdown}%`} />
                    <MetricCard label="Rebalances" value={results.analytics.backtest.rebalanceCount.toString()} />
                    <MetricCard label="Final Value" value={`$${results.analytics.backtest.finalValue}`} />
                    <MetricCard label="Initial Value" value="$10,000" />
                  </div>
                  
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
                                      parseFloat(change.drift) > 0 ? 'text-red-400' : 'text-emerald-400'
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
                  <h3 className="text-xl font-semibold mb-4">Stress Testing</h3>
                  
                  {/* Worst Historical Period */}
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

                  {/* Volatility Shock Scenario */}
                  <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-4">
                    <h4 className="font-semibold text-amber-200 mb-3">{results.analytics.stressTest.volatilityShock.scenario}</h4>
                    <p className="text-sm text-amber-100 mb-3">
                      If market volatility doubled, here's how portfolio weights would adjust:
                    </p>
                    <div className="space-y-2">
                      {results.analytics.stressTest.volatilityShock.newWeights.map((w: any) => (
                        <div key={w.ticker} className="flex justify-between text-sm">
                          <span className="font-medium">{w.ticker}</span>
                          <span>
                            {w.weight}% 
                            <span className={parseFloat(w.change) > 0 ? "text-emerald-300" : "text-rose-300"}>
                              {" "}({parseFloat(w.change) > 0 ? "+" : ""}{w.change}%)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
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
  const colors = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", 
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#84cc16", "#a855f7", "#eab308",
    "#6366f1", "#22d3ee"
  ];
  
  let currentAngle = 0;
  const segments = weights.map((w, i) => {
    const percentage = parseFloat(w.weight);
    const angle = (percentage / 100) * total;
    const segment = {
      ...w,
      percentage,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: colors[i % colors.length],
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
                style={{ backgroundColor: colors[i % colors.length] }}
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
  // Example: 1,250 points → sample every 12 → 104 points
  const sampleRate = Math.ceil(values.length / 100);
  const sampledValues = values.filter((_, i) => i % sampleRate === 0);
  const sampledDates = dates.filter((_, i) => i % sampleRate === 0);
  
  // Calculate chart bounds with padding
  // Padding makes the chart look nicer (not touching edges)
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const padding = range * 0.1;  // 10% padding top and bottom
  
  const height = 200;
  const width = 800;
  
  // Create SVG path
  // 
  // COORDINATE MAPPING:
  // Transform portfolio values into SVG coordinates
  // 
  // X-axis (Time): 
  //   - First point (i=0) → x=0 (left edge)
  //   - Last point (i=99) → x=800 (right edge)
  //   - Formula: x = (index / total) × width
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
    const x = (i / (sampledValues.length - 1)) * width;
    const y = height - ((value - minValue + padding) / (range + 2 * padding)) * height;
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
            x1={0}
            y1={height * ratio}
            x2={width}
            y2={height * ratio}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}
        
        {/* 
          AREA UNDER CURVE
          Purpose: Visual appeal, makes growth more obvious
          Implementation: 
          - Take the line path
          - Add line to bottom-right (L width, height)
          - Add line to bottom-left (L 0, height)
          - Close path (Z)
          - Fill with gradient (green fading to transparent)
        */}
        <path
          d={`${pathData} L ${width} ${height} L 0 ${height} Z`}
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
      
      {/* 
        INVISIBLE INTERACTION OVERLAY
        Purpose: Captures mouse movement to enable hover functionality
        
        Why separate SVG?
        - Main SVG has the visual elements
        - This SVG is purely for interaction
        - Positioned absolutely on top
        
        Mouse tracking logic:
        1. Get mouse X position relative to chart
        2. Convert to 0-800 range (SVG coordinates)
        3. Find closest data point: x / width × total_points
        4. Update hoveredIndex state
        5. This triggers re-render with tooltip and hover point
        
        Example:
        - Mouse at 400px on 800px wide chart
        - X ratio = 400/800 = 0.5 (halfway)
        - With 100 points: 0.5 × 100 = point 50
        - Show tooltip for 50th data point
        
        Mouse leave: Clear hoveredIndex, hide tooltip
      */}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute top-0 left-0"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * width;
          const closestIndex = Math.round((x / width) * (points.length - 1));
          setHoveredIndex(Math.max(0, Math.min(points.length - 1, closestIndex)));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <rect width={width} height={height} fill="transparent" />
      </svg>
      
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
  const colors = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", 
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#84cc16", "#a855f7", "#eab308",
    "#6366f1", "#22d3ee"
  ];

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
                  backgroundColor: colors[i % colors.length]
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
