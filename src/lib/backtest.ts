// filepath: /Users/johnjohn/my-ai-app/src/lib/backtest.ts

/**
 * Portfolio Backtesting and Advanced Analytics
 * 
 * This module provides functions for:
 * - Historical portfolio simulation
 * - Rebalancing strategies
 * - Performance metrics calculation
 * - Stress testing
 * 
 * =============================================================================
 * HOW THIS WORKS - DETAILED EXPLANATION:
 * =============================================================================
 * 
 * The backtest engine simulates how a portfolio would have performed historically.
 * Think of it like a time machine that invests $10,000 and tracks it day-by-day.
 * 
 * KEY CONCEPTS:
 * 
 * 1. PORTFOLIO VALUE TRACKING
 *    - Start with $10,000 cash
 *    - Buy shares of each asset based on target weights
 *    - Each day: Portfolio Value = Σ(shares × current_price)
 * 
 * 2. REBALANCING
 *    - Over time, some assets grow faster than others
 *    - Weights drift away from targets
 *    - Periodically (quarterly): sell everything, buy back at target weights
 *    - This is how institutional portfolios maintain risk balance
 * 
 * 3. TRANSACTION COSTS
 *    - Real trading has costs (0.1% in our model)
 *    - Each rebalance: deduct cost from each trade
 *    - This makes backtest more realistic
 * 
 * 4. RETURN CALCULATION
 *    - Daily return = (today_value - yesterday_value) / yesterday_value
 *    - Annualized = compound these daily returns over a year
 *    - Formula: (1 + total_return)^(1/years) - 1
 * 
 * 5. VOLATILITY (RISK)
 *    - Standard deviation of daily returns
 *    - Annualized by multiplying by √252 (trading days/year)
 *    - Higher vol = more unpredictable returns
 * 
 * 6. SHARPE RATIO
 *    - Return per unit of risk
 *    - Formula: Annual Return / Annual Volatility
 *    - Higher is better (more reward for the risk taken)
 * 
 * 7. MAX DRAWDOWN
 *    - Worst peak-to-trough decline
 *    - Track running maximum value
 *    - At each point: drawdown = (peak - current) / peak
 *    - Max DD = worst of all drawdowns
 * 
 * =============================================================================
 */

export interface RebalanceEvent {
  date: string;
  portfolioValue: number;
  volatility?: number;
  sharpe?: number;
  quarterlyReturn?: number;
  changes: {
    ticker: string;
    beforeWeight: number;
    afterWeight: number;
    drift: number;
  }[];
}

export interface BacktestResult {
  portfolioValues: number[];
  returns: number[];
  dates: string[];
  finalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPeriod: { start: string; end: string };
  rebalanceCount: number;
  rebalanceDates?: RebalanceEvent[];
}

export interface RebalanceConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  transactionCost: number; // as decimal, e.g., 0.001 = 0.1%
}

/**
 * Run a historical backtest of a portfolio
 * 
 * HOW THIS FUNCTION WORKS (Step-by-Step):
 * ========================================
 * 
 * INPUTS:
 * - pricesMap: Historical prices for each asset (e.g., SPY: [100, 101, 102...])
 * - dates: Dates for each price point
 * - weights: Target allocation (e.g., [0.25, 0.25, 0.25, 0.25] = 25% each)
 * - tickers: Asset symbols (e.g., ["SPY", "LQD", "IEF", "DBC"])
 * - rebalanceConfig: How often to rebalance + transaction costs
 * - initialValue: Starting amount ($10,000 default)
 * 
 * STEP 1: INITIALIZE PORTFOLIO
 * - Take $10,000
 * - For each asset: buy shares = (target_allocation × $10,000) / price
 * - Example: 25% of $10,000 = $2,500. If SPY = $100, buy 25 shares
 * 
 * STEP 2: SIMULATE EACH DAY
 * - Calculate portfolio value = sum of (shares × current_price)
 * - Calculate daily return = (today - yesterday) / yesterday
 * - Store values for later analysis
 * 
 * STEP 3: REBALANCE (when triggered)
 * - Check if it's time to rebalance (quarterly, monthly, etc.)
 * - Sell everything → convert to cash
 * - Apply transaction costs (0.1% per trade)
 * - Buy back assets at target weights
 * - This keeps portfolio balanced over time
 * 
 * STEP 4: CALCULATE FINAL METRICS
 * - Total return: (final_value - initial_value) / initial_value
 * - Annualized return: convert to per-year basis
 * - Volatility: how much daily returns varied
 * - Sharpe: risk-adjusted return
 * - Max drawdown: worst decline from peak
 * 
 * WHY WE DO THIS:
 * - Proves the strategy works with real historical data
 * - Shows realistic performance including costs
 * - Measures both return AND risk
 * 
 * EXAMPLE OUTPUT:
 * Started with $10,000 → Ended with $12,500
 * That's 25% total return over 5 years
 * = 4.5% annualized return
 * Volatility was 11%, so Sharpe = 4.5/11 = 0.41
 */
export function runBacktest(
  pricesMap: Map<string, number[]>, // ticker -> price array
  dates: string[],
  weights: number[],
  tickers: string[],
  rebalanceConfig: RebalanceConfig,
  initialValue: number = 10000
): BacktestResult {
  const n = dates.length;
  const portfolioValues: number[] = [initialValue];
  const returns: number[] = [];
  
  // Initialize positions (number of shares for each asset)
  // 
  // WHAT'S HAPPENING HERE:
  // We're buying our initial positions on Day 1
  // 
  // Example with $10,000 and 4 assets at 25% each:
  // - Asset 1 (SPY @ $100): Buy 25% × $10,000 / $100 = 25 shares
  // - Asset 2 (LQD @ $50):  Buy 25% × $10,000 / $50  = 50 shares
  // - Asset 3 (IEF @ $75):  Buy 25% × $10,000 / $75  = 33.33 shares
  // - Asset 4 (DBC @ $20):  Buy 25% × $10,000 / $20  = 125 shares
  // 
  // These share counts remain constant until we rebalance
  let cashValue = initialValue;
  const shares = weights.map((w, i) => {
    const ticker = tickers[i];
    const prices = pricesMap.get(ticker)!;
    const targetValue = initialValue * w;  // Dollar amount to invest
    const numShares = targetValue / prices[0];  // Shares = dollars / price
    cashValue -= targetValue;
    return numShares;
  });
  
  let rebalanceCount = 0;
  let lastRebalanceDate = dates[0];
  const rebalanceEvents: RebalanceEvent[] = [];
  
  // Simulate each day
  // 
  // WHAT'S HAPPENING IN THIS LOOP:
  // We're going day-by-day through history, tracking portfolio value
  // 
  // FOR EACH DAY:
  // 1. Calculate portfolio value using current prices
  // 2. Calculate return vs yesterday
  // 3. Check if it's time to rebalance
  // 
  // Example Day 50:
  // - SPY is now $105 (was $100)
  // - We own 25 shares → worth $2,625 (was $2,500)
  // - Do this for all assets, sum them up
  // - Portfolio value = $10,450
  // - Daily return = ($10,450 - $10,400) / $10,400 = 0.48%
  for (let t = 1; t < n; t++) {
    // Calculate current portfolio value
    // Sum up: shares × current_price for each asset
    let portfolioValue = cashValue;
    tickers.forEach((ticker, i) => {
      const prices = pricesMap.get(ticker)!;
      portfolioValue += shares[i] * prices[t];
    });
    
    portfolioValues.push(portfolioValue);
    
    // Calculate return (percentage change from yesterday)
    const dailyReturn = (portfolioValue - portfolioValues[t - 1]) / portfolioValues[t - 1];
    returns.push(dailyReturn);
    
    // Check if we need to rebalance
    // REBALANCING LOGIC:
    // - If quarterly: happens every ~60 trading days
    // - Purpose: weights drift over time (winners grow, losers shrink)
    // - Rebalancing brings them back to targets
    // 
    // Example: Started 25/25/25/25, but now 30/20/25/25
    // Rebalance → sell some of the 30% asset, buy more of the 20%
    if (shouldRebalance(dates[t], lastRebalanceDate, rebalanceConfig.frequency)) {
      // REBALANCING PROCESS:
      
      // Calculate current weights before rebalancing
      const currentWeights = tickers.map((ticker, i) => {
        const prices = pricesMap.get(ticker)!;
        const assetValue = shares[i] * prices[t];
        return (assetValue / portfolioValue) * 100;
      });
      
      // Calculate rolling volatility and Sharpe at this point
      // Use last 252 days (1 year) of returns for stable metrics
      const rollingWindow = Math.min(252, returns.length);
      const recentReturns = returns.slice(-rollingWindow);
      const meanReturn = recentReturns.reduce((sum, r) => sum + r, 0) / recentReturns.length;
      const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / recentReturns.length;
      const rollingVol = Math.sqrt(variance * 252) * 100; // Annualized
      const annualizedMeanReturn = meanReturn * 252 * 100;
      const rollingSharpe = rollingVol > 0 ? annualizedMeanReturn / rollingVol : 0;
      
      // Calculate quarterly return (last ~60 trading days)
      const quarterWindow = Math.min(60, portfolioValues.length);
      const quarterStartValue = portfolioValues[portfolioValues.length - quarterWindow];
      const quarterEndValue = portfolioValue;
      const quarterlyReturn = ((quarterEndValue - quarterStartValue) / quarterStartValue) * 100;
      
      // Step 1: Sell everything, convert to cash
      cashValue = portfolioValue;
      
      // Step 2: Buy back at target weights
      // Apply transaction costs (realistic fee for trading)
      tickers.forEach((ticker, i) => {
        const prices = pricesMap.get(ticker)!;
        const targetValue = portfolioValue * weights[i];  // Target dollar amount
        const cost = targetValue * rebalanceConfig.transactionCost;  // Trading fee
        shares[i] = (targetValue - cost) / prices[t];  // New share count
        cashValue -= targetValue;
      });
      
      // Record rebalance event
      rebalanceEvents.push({
        date: dates[t],
        portfolioValue: parseFloat(portfolioValue.toFixed(2)),
        volatility: parseFloat(rollingVol.toFixed(2)),
        sharpe: parseFloat(rollingSharpe.toFixed(2)),
        quarterlyReturn: parseFloat(quarterlyReturn.toFixed(2)),
        changes: tickers.map((ticker, i) => ({
          ticker,
          beforeWeight: parseFloat(currentWeights[i].toFixed(2)),
          afterWeight: parseFloat((weights[i] * 100).toFixed(2)),
          drift: parseFloat((currentWeights[i] - weights[i] * 100).toFixed(2)),
        })),
      });
      
      rebalanceCount++;
      lastRebalanceDate = dates[t];
    }
  }
  
  // Calculate metrics
  // 
  // FINAL PERFORMANCE CALCULATIONS:
  // Now that we've simulated the entire history, let's measure performance
  
  // 1. TOTAL RETURN
  // Simple percentage gain: (end - start) / start
  // Example: $10,000 → $12,500 = 25% total return
  const finalValue = portfolioValues[portfolioValues.length - 1];
  const totalReturn = (finalValue - initialValue) / initialValue;
  
  // 2. ANNUALIZED RETURN
  // Convert total return to "per year" basis
  // Formula: (1 + total)^(1/years) - 1
  // 
  // Example: 25% over 5 years
  // = (1.25)^(1/5) - 1 = 0.0456 = 4.56% per year
  // 
  // Why? Compound interest: $10k × 1.0456^5 = $12.5k
  const years = n / 252;  // 252 = trading days per year
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1;
  
  // 3. VOLATILITY (Risk Measure)
  // Standard deviation of returns
  // Measures how much returns bounce around
  // 
  // Steps:
  // a) Calculate average (mean) return
  // b) For each return: (return - mean)²
  // c) Average those squared differences = variance
  // d) Square root of variance = standard deviation
  // e) Annualize by × √252
  // 
  // Example: Daily returns vary by 0.7%
  // Annualized = 0.7% × √252 = 11.1%
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const annualizedVolatility = Math.sqrt(variance * 252);
  
  // 4. SHARPE RATIO
  // Return per unit of risk
  // = Annual Return / Annual Volatility
  // 
  // Example: 4.5% return, 11% volatility
  // Sharpe = 4.5 / 11 = 0.41
  // 
  // Interpretation:
  // > 1.0 = Excellent
  // 0.5-1.0 = Good
  // < 0.5 = Poor
  // 
  // (Assuming 0% risk-free rate for simplicity)
  const sharpeRatio = annualizedReturn / annualizedVolatility;
  
  // 5. MAX DRAWDOWN
  // Worst peak-to-trough decline
  // Tells you: "What's the biggest loss I would have experienced?"
  // 
  // Example: Portfolio hits $11,000, then drops to $9,000
  // Max DD = ($11k - $9k) / $11k = 18.2%
  const { maxDD, peakIndex, troughIndex } = calculateDrawdownFromValues(portfolioValues);
  
  return {
    portfolioValues,
    returns,
    dates,
    finalValue,
    totalReturn: totalReturn * 100,
    annualizedReturn: annualizedReturn * 100,
    annualizedVolatility: annualizedVolatility * 100,
    sharpeRatio,
    maxDrawdown: maxDD,
    maxDrawdownPeriod: {
      start: dates[peakIndex],
      end: dates[troughIndex],
    },
    rebalanceCount,
    rebalanceDates: rebalanceEvents,
  };
}

/**
 * Check if rebalancing should occur
 */
function shouldRebalance(
  currentDate: string,
  lastRebalanceDate: string,
  frequency: RebalanceConfig['frequency']
): boolean {
  const current = new Date(currentDate);
  const last = new Date(lastRebalanceDate);
  
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return current.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return current.getMonth() !== last.getMonth() || current.getFullYear() !== last.getFullYear();
    case 'quarterly':
      return Math.floor(current.getMonth() / 3) !== Math.floor(last.getMonth() / 3) || current.getFullYear() !== last.getFullYear();
    case 'annually':
      return current.getFullYear() !== last.getFullYear();
    default:
      return false;
  }
}

/**
 * Calculate max drawdown from portfolio value series
 */
function calculateDrawdownFromValues(values: number[]): {
  maxDD: number;
  peakIndex: number;
  troughIndex: number;
} {
  let maxDD = 0;
  let peak = values[0];
  let peakIndex = 0;
  let maxDDPeakIndex = 0;
  let maxDDTroughIndex = 0;
  
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIndex = i;
    }
    
    const drawdown = (peak - values[i]) / peak;
    
    if (drawdown > maxDD) {
      maxDD = drawdown;
      maxDDPeakIndex = peakIndex;
      maxDDTroughIndex = i;
    }
  }
  
  return {
    maxDD: maxDD * 100,
    peakIndex: maxDDPeakIndex,
    troughIndex: maxDDTroughIndex,
  };
}

/**
 * Run stress test: scale volatility
 * 
 * STRESS TESTING EXPLAINED:
 * =========================
 * This simulates "what if volatility doubled?"
 * 
 * HOW IT WORKS:
 * - Take the covariance matrix (measures asset volatilities & correlations)
 * - Multiply all values by scaleFactor (e.g., 2 = double volatility)
 * - Re-optimize portfolio with this stressed covariance matrix
 * - Compare new weights vs original weights
 * 
 * WHY WE DO THIS:
 * - Tests portfolio resilience in extreme scenarios
 * - Shows how allocation would change in crisis
 * - Helps understand risk exposure
 * 
 * EXAMPLE:
 * Normal volatility: 10%
 * 2x stress: 20% volatility
 * Result: Portfolio shifts toward safer assets (bonds ↑, stocks ↓)
 * 
 * REAL-WORLD CONTEXT:
 * - March 2020 (COVID): volatility spiked 3-4x
 * - 2008 Crisis: volatility doubled
 * - This test shows you'd be prepared
 */
export function stressTestVolatility(
  covMatrix: number[][],
  scaleFactor: number
): number[][] {
  return covMatrix.map(row => row.map(val => val * scaleFactor));
}

/**
 * Find worst period in historical data
 * 
 * CRISIS DETECTION EXPLAINED:
 * ===========================
 * This finds the worst 30-day period in your backtest
 * 
 * HOW IT WORKS:
 * - Use a sliding window of N days (default 30)
 * - For each possible window:
 *   - Calculate loss = (end_value - start_value) / start_value
 *   - Track the worst loss
 * - Return the dates and magnitude of worst period
 * 
 * WHY WE DO THIS:
 * - Identifies your portfolio's behavior during crises
 * - Shows realistic "worst case" based on history
 * - More meaningful than theoretical scenarios
 * 
 * EXAMPLE FINDINGS:
 * "Worst 30 days: Feb 19, 2020 to March 23, 2020
 *  Portfolio loss: -18.3%
 *  This was during COVID market crash"
 * 
 * USES:
 * - Risk assessment: "Could I handle an 18% loss?"
 * - Compare to benchmarks: "S&P 500 was down 34% same period"
 * - Stress test: "How would 2x that loss affect me?"
 */
export function findWorstPeriod(
  portfolioValues: number[],
  dates: string[],
  windowDays: number = 30
): {
  startIndex: number;
  endIndex: number;
  loss: number;
  startDate: string;
  endDate: string;
} {
  let worstLoss = 0;
  let worstStart = 0;
  let worstEnd = 0;
  
  for (let i = 0; i < portfolioValues.length - windowDays; i++) {
    const startValue = portfolioValues[i];
    const endValue = portfolioValues[i + windowDays];
    const loss = (endValue - startValue) / startValue;
    
    if (loss < worstLoss) {
      worstLoss = loss;
      worstStart = i;
      worstEnd = i + windowDays;
    }
  }
  
  return {
    startIndex: worstStart,
    endIndex: worstEnd,
    loss: worstLoss * 100,
    startDate: dates[worstStart],
    endDate: dates[worstEnd],
  };
}

/**
 * Calculate strategy comparison
 * 
 * STRATEGY COMPARISON EXPLAINED:
 * ==============================
 * Compare your optimized portfolio against simpler alternatives
 * 
 * STRATEGIES WE COMPARE:
 * 
 * 1. RISK BUDGETING (Your Strategy)
 *    - Uses equal risk contribution optimization
 *    - Scientifically balances risk across assets
 *    - Adapts to each asset's volatility
 *    Example weights: [35%, 28%, 22%, 15%]
 * 
 * 2. EQUAL WEIGHT (Naive Diversification)
 *    - Simple: divide money equally
 *    - Ignores risk differences between assets
 *    - 1/N rule: if 4 assets, each gets 25%
 *    Example weights: [25%, 25%, 25%, 25%]
 * 
 * WHY COMPARE?
 * - Proves risk budgeting adds value
 * - Shows improvement in risk-adjusted returns
 * - Demonstrates benefit of sophisticated allocation
 * 
 * WHAT TO LOOK FOR:
 * - Risk Budgeting should have BETTER Sharpe Ratio
 * - Lower max drawdown (less crisis pain)
 * - Similar or better returns with less risk
 * 
 * EXAMPLE RESULTS:
 * Strategy        | Return | Vol  | Sharpe | Max DD
 * Risk Budgeting  | 8.2%   | 11%  | 0.75   | -15%
 * Equal Weight    | 7.5%   | 13%  | 0.58   | -19%
 * 
 * Interpretation: Risk budgeting delivers:
 * - Higher return (+0.7%)
 * - Lower risk (-2% volatility)
 * - Better Sharpe (+0.17)
 * - Smaller drawdowns (-4%)
 */
export function compareStrategies(
  pricesMap: Map<string, number[]>,
  dates: string[],
  tickers: string[],
  riskBudgetWeights: number[],
  rebalanceConfig: RebalanceConfig
): {
  riskBudgeting: BacktestResult;
  equalWeight: BacktestResult;
  marketCap?: BacktestResult;
} {
  // Risk Budgeting strategy (your optimized weights)
  const riskBudgeting = runBacktest(pricesMap, dates, riskBudgetWeights, tickers, rebalanceConfig);
  
  // Equal Weight strategy (naive 1/N allocation)
  // Simply divide money equally: 1/N for N assets
  const equalWeights = Array(tickers.length).fill(1 / tickers.length);
  const equalWeight = runBacktest(pricesMap, dates, equalWeights, tickers, rebalanceConfig);
  
  // Could add more strategies here:
  // - 60/40 (60% stocks, 40% bonds)
  // - Market cap weighted
  // - Minimum variance
  // - etc.
  
  return {
    riskBudgeting,
    equalWeight,
  };
}
